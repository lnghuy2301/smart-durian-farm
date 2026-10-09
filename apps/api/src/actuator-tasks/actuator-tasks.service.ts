import { ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException,
  OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { MockUserStore } from '../auth/mock-user.store';
import { AssignmentsService } from '../assignments/assignments.service';
import { MockZoneAssignmentStore } from '../assignments/mock-zone-assignment.store';
import { assignmentActive } from '../assignments/assignment-policy';
import { DevicesService } from '../devices/devices.service';
import { ActuatorsService } from '../actuators/actuators.service';
import { FarmsService } from '../farms/farms.service';
import { ZonesService } from '../zones/zones.service';
import { BrokerState, MqttTransport } from '../mqtt/mqtt.transport';
import { buildControlPublication } from '../mqtt/mqtt.protocol';
import { ACTUATOR_TASKS_CONFIG, ActuatorTasksConfig } from './actuator-tasks.config';
import { TaskPageDto } from './actuator-tasks.dto';
import { AcknowledgedMode, ActuatorTask, ControlOperation, TaskOperation, TaskStep } from './actuator-tasks.types';

export const ACTUATOR_TASK_LIMIT = 5000;
const RECIPE = [{ capability: 2, purpose: 'shared' }, { capability: 3, purpose: 'watering' }, { capability: 4, purpose: 'spraying' }] as const;
interface Run { deviceId: string; actorId: string; current: ActuatorTask; start?: ActuatorTask; index: number }
interface Wait { run: Run; step: TaskStep; deadline: number; timer: NodeJS.Timeout; published: boolean; ackAt?: string }

@Injectable()
export class ActuatorTasksService implements OnModuleDestroy {
  private readonly tasks = new Map<string, ActuatorTask>();
  private readonly runs = new Map<string, Run>();
  private readonly modes = new Map<string, AcknowledgedMode>();
  private readonly waits = new Map<number, Wait>();
  // Numeric IDs không tái dùng trong process kể cả journal eviction. Random boot namespace giảm va chạm restart;
  // không tuyên bố unique bền vững trước khi có DB allocator/constraints.
  private nextId = randomInt(1, 2 ** 48);
  private ready = false;
  private closing = false;
  constructor(
    @Inject(ACTUATOR_TASKS_CONFIG) private readonly config: ActuatorTasksConfig,
    @Inject(MqttTransport) private readonly transport: MqttTransport,
    @Inject(DevicesService) private readonly devices: DevicesService,
    @Inject(ActuatorsService) private readonly actuators: ActuatorsService,
    @Inject(MockUserStore) private readonly users: MockUserStore,
    @Inject(FarmsService) private readonly farms: FarmsService,
    @Inject(ZonesService) private readonly zones: ZonesService,
    @Inject(AssignmentsService) private readonly assignments: AssignmentsService,
    @Inject(MockZoneAssignmentStore) private readonly assignmentStore: MockZoneAssignmentStore,
  ) {}

  command(actorId: string, deviceId: string, operation: ControlOperation) {
    this.requireController(actorId, deviceId);
    if (!this.ready || this.closing) { throw new ServiceUnavailableException('MQTT receiver chưa sẵn sàng; không xếp lệnh offline'); }
    if (!['Watering', 'Spraying', 'Stop'].includes(operation)) { throw new ConflictException('Thao tác không hợp lệ'); }
    const previous = this.runs.get(deviceId);
    if (previous && operation !== 'Stop') { throw new ConflictException('Device đang có thao tác; chờ hoặc gửi Dừng'); }
    if (previous?.current.response_payload.operation === 'Stop' || previous?.current.response_payload.operation === 'RecoveryStop') {
      throw new ConflictException('Device đang Dừng; không tạo lệnh Dừng trùng');
    }
    const mode = this.modes.get(deviceId) ?? 'Unknown';
    if (operation !== 'Stop') {
      this.requireStart(actorId, deviceId, operation);
      if (mode === 'Watering' || mode === 'Spraying') { throw new ConflictException('Phải Dừng trước khi Bật lại/chuyển tưới–phun'); }
    }
    this.requireRecipe(deviceId);
    // Capacity kiểm tra trước khi hủy run đang chạy. Journal chỉ eviction terminal, không mất pending/control lock.
    const reset = operation !== 'Stop' && mode === 'Unknown';
    this.makeRoom(reset ? 2 : 1);
    if (previous) { this.cancel(previous, 'CANCELLED_BY_STOP'); }
    const caps = operation === 'Stop' ? this.stopCapabilities(previous ? 'Unknown' : mode) : operation === 'Watering' ? [3, 2] : [4, 2];
    const task = this.newTask(deviceId, operation, caps, operation === 'Stop' ? 0 : 1);
    let current = task;
    if (reset) {
      current = this.newTask(deviceId, 'Reset', [2, 3, 4], 0, task._id);
      task.response_payload.reset_task_id = current._id;
    }
    const run: Run = { deviceId, actorId, current, start: reset ? task : undefined, index: 0 };
    this.runs.set(deviceId, run);
    this.modes.set(deviceId, 'Unknown');
    // HTTP trả snapshot Pending/202 ngay, không giữ request 20–50s. Không có await trước lock/commit RAM.
    const result = { task: structuredClone(task), status_url: `/api/actuator-tasks/${task._id}`,
      state_url: `/api/actuator-tasks/devices/${deviceId}/state` };
    queueMicrotask(() => this.sendNext(run));
    return result;
  }

  get(actorId: string, id: string) {
    const task = this.tasks.get(id);
    if (!task || !this.visible(actorId, task)) { throw new NotFoundException('Không tìm thấy task trong phạm vi truy cập'); }
    return structuredClone(task);
  }
  list(actorId: string, deviceId: string, page: TaskPageDto) {
    this.devices.get(actorId, deviceId);
    const items = [...this.tasks.values()].reverse().filter((task) => task.device_id === deviceId
      && (!page.status || task.status === page.status) && this.visible(actorId, task));
    return { items: structuredClone(items.slice(page.offset, page.offset + page.limit)), total: items.length,
      limit: page.limit, offset: page.offset, storage: { mode: 'Memory', capacity_tasks: ACTUATOR_TASK_LIMIT, eviction: 'OldestTerminal' } };
  }
  state(actorId: string, deviceId: string) {
    this.devices.get(actorId, deviceId);
    const current = this.runs.get(deviceId)?.current;
    const mode = this.modes.get(deviceId) ?? 'Unknown';
    return { device_id: deviceId, acknowledged_mode: mode, physical_state: 'Unknown', confirmation_kind: 'CommandReceipt',
      busy: !!current, active_task_id: current && this.visible(actorId, current) ? current._id : null,
      reset_required: mode === 'Unknown', broker_ready: this.ready, ack_timeout_ms: this.config.ackTimeoutMs };
  }

  // Chỉ MqttService/fake adapter gọi. Scope Device + ID + action, không đếm ACK hoặc suy theo thứ tự packet.
  receiveAck(deviceId: string, taskId: number, action: 0 | 1, now = Date.now()): string | null {
    const wait = this.waits.get(taskId);
    if (!wait) { return 'ACK_NOT_WAITING'; }
    if (wait.run.deviceId !== deviceId) { return 'ACK_DEVICE_MISMATCH'; }
    if (wait.step.action !== action) { return 'ACK_ACTION_MISMATCH'; }
    if (now >= wait.deadline) { this.fail(wait.run, 'ACK_TIMEOUT'); return 'ACK_EXPIRED'; }
    if (wait.ackAt) { return 'ACK_DUPLICATE'; }
    wait.ackAt = new Date(now).toISOString();
    // Có thể nhận ACK trước callback publish. Giữ ACK rồi chờ transport success; publish lỗi không được Confirmed.
    if (wait.published) { this.acknowledge(wait); }
    return null;
  }
  brokerChanged(state: BrokerState): void {
    const wasReady = this.ready;
    this.ready = state.enabled && state.connected && state.subscribed;
    if (wasReady && !this.ready) {
      for (const deviceId of this.modes.keys()) { this.modes.set(deviceId, 'Unknown'); }
      for (const run of [...this.runs.values()]) { this.fail(run, 'MQTT_DISCONNECTED'); }
    }
  }
  onModuleDestroy(): void {
    this.closing = true; this.ready = false;
    for (const run of [...this.runs.values()]) { this.cancel(run, 'BACKEND_SHUTDOWN'); }
  }

  private sendNext(run: Run): void {
    if (!this.live(run)) { return; }
    if (run.index >= run.current.response_payload.steps.length) { this.complete(run); return; }
    const step = run.current.response_payload.steps[run.index];
    try {
      if (!this.ready || this.closing) { throw new Error('MQTT_UNAVAILABLE'); }
      this.requireRecipe(run.deviceId);
      if (step.action === 1) { this.requireStart(run.actorId, run.deviceId, run.current.response_payload.operation as ControlOperation); }
      const device = this.devices.getRecord(run.deviceId);
      const publication = buildControlPublication(device.station_id,
        [{ taskId: step.task_id, taskingCapabilityId: step.tasking_capability_id }], step.action);
      const sentAt = new Date(Date.now()).toISOString();
      step.status = 'WaitingAck'; step.sent_at = sentAt; run.current.sent_at ??= sentAt;
      const wait: Wait = { run, step, published: false, deadline: Date.parse(sentAt) + this.config.ackTimeoutMs,
        timer: setTimeout(() => this.fail(run, 'ACK_TIMEOUT'), this.config.ackTimeoutMs) };
      wait.timer.unref();
      this.waits.set(step.task_id, wait);
      this.transport.publish(publication.topic, publication.payload).then(() => {
        if (this.waits.get(step.task_id) !== wait || !this.live(run)) { return; }
        wait.published = true;
        if (wait.ackAt) { this.acknowledge(wait); }
      }).catch(() => { if (this.waits.get(step.task_id) === wait) { this.fail(run, 'MQTT_PUBLISH_FAILED'); } });
    } catch { this.fail(run, this.ready ? 'CONTEXT_UNAVAILABLE' : 'MQTT_UNAVAILABLE'); }
  }
  private acknowledge(wait: Wait): void {
    if (!this.live(wait.run) || this.waits.get(wait.step.task_id) !== wait) { return; }
    clearTimeout(wait.timer); this.waits.delete(wait.step.task_id);
    wait.step.status = 'Acknowledged'; wait.step.ack_received_at = wait.ackAt!;
    wait.step.ack = { taskId: wait.step.task_id, status: 'ACK', action: wait.step.action };
    ++wait.run.index;
    // Không gửi từ sâu trong callback receiver; run identity chặn bước ON chưa gửi sau khi người dùng Dừng.
    queueMicrotask(() => this.sendNext(wait.run));
  }
  private complete(run: Run): void {
    const task = run.current;
    task.status = 'Confirmed'; task.confirmed_at = task.response_payload.steps.at(-1)!.ack_received_at;
    if (task.response_payload.operation === 'Reset' && run.start) {
      this.modes.set(run.deviceId, 'Off');
      run.current = run.start; run.start = undefined; run.index = 0;
      this.modes.set(run.deviceId, 'Unknown');
      this.sendNext(run); return;
    }
    this.modes.set(run.deviceId, task.response_payload.operation === 'Watering' ? 'Watering'
      : task.response_payload.operation === 'Spraying' ? 'Spraying' : 'Off');
    this.runs.delete(run.deviceId);
  }
  private fail(run: Run, code: string): void {
    if (!this.live(run)) { return; }
    const failed = run.current;
    this.clearWait(run);
    this.markFailed(failed, code);
    if (run.start) { this.markFailed(run.start, 'RESET_FAILED'); }
    this.runs.delete(run.deviceId); this.modes.set(run.deviceId, 'Unknown');
    if (failed.response_payload.operation !== 'Watering' && failed.response_payload.operation !== 'Spraying') { return; }
    // Recovery là bản ghi riêng để không che lỗi Start. OFF không phụ thuộc quyền của tác giả sau khi mất assignment.
    this.makeRoom(1);
    const recovery = this.newTask(run.deviceId, 'RecoveryStop', [2, 3, 4], 0, failed._id);
    failed.response_payload.recovery_task_id = recovery._id;
    const next: Run = { ...run, current: recovery, start: undefined, index: 0 };
    this.runs.set(run.deviceId, next);
    this.sendNext(next);
  }
  private cancel(run: Run, code: string): void {
    this.clearWait(run); this.markFailed(run.current, code);
    if (run.start) { this.markFailed(run.start, code); }
    this.runs.delete(run.deviceId); this.modes.set(run.deviceId, 'Unknown');
  }
  private clearWait(run: Run): void {
    for (const [id, wait] of this.waits) { if (wait.run === run) { clearTimeout(wait.timer); this.waits.delete(id); } }
  }
  private markFailed(task: ActuatorTask, code: string): void {
    if (task.status !== 'Pending') { return; }
    task.status = 'Failed'; task.error_message = code;
    for (const step of task.response_payload.steps) {
      if (step.status === 'WaitingAck') { step.status = 'Failed'; }
      else if (step.status === 'Queued') { step.status = 'Cancelled'; }
    }
  }
  private live(run: Run): boolean { return this.runs.get(run.deviceId) === run && run.current.status === 'Pending'; }
  private requireController(actorId: string, deviceId: string): void {
    const device = this.devices.get(actorId, deviceId);
    const actor = this.users.findById(actorId)!;
    if (actor.role !== 'Farmer') { throw new ForbiddenException('Chỉ chủ Farmer hoặc Farmer đang phụ trách được điều khiển'); }
    const farm = this.farms.getRecord(this.zones.getRecord(device.zone_id).farm_id);
    if (actor.id !== farm.owner_id) { this.assignments.assertCanWork(actorId, device.zone_id); }
  }
  private requireStart(actorId: string, deviceId: string, operation: ControlOperation): void {
    this.requireController(actorId, deviceId);
    if (this.devices.getRecord(deviceId).status !== 'Active') { throw new ConflictException('Device phải Active để Bật'); }
    for (const id of [2, operation === 'Watering' ? 3 : 4]) {
      if (this.actuators.getRecordByCapability(deviceId, id).status !== 'Active') { throw new ConflictException('Actuator phải Active để Bật'); }
    }
  }
  private requireRecipe(deviceId: string): void {
    for (const entry of RECIPE) {
      if (this.actuators.getRecordByCapability(deviceId, entry.capability).purpose !== entry.purpose) {
        throw new ConflictException('Bộ demo cần capability2/shared,3/watering,4/spraying');
      }
    }
  }
  private stopCapabilities(mode: AcknowledgedMode): number[] {
    return mode === 'Watering' ? [2, 3] : mode === 'Spraying' ? [2, 4] : [2, 3, 4];
  }
  private visible(actorId: string, task: ActuatorTask): boolean {
    try {
      const device = this.devices.get(actorId, task.device_id);
      const actor = this.users.findById(actorId)!;
      const farm = this.farms.getRecord(this.zones.getRecord(device.zone_id).farm_id);
      if (actor.role !== 'Farmer' || actorId === farm.owner_id) { return true; }
      const current = this.assignmentStore.list().find(({ assignment }) => assignment.user_id === actorId
        && assignment.zone_id === device.zone_id && assignmentActive(assignment));
      if (!current) { return false; }
      const created = Date.parse(task.created_at), assignment = current.assignment;
      return created >= Date.parse(assignment.start_date) && (assignment.end_date === null || created < Date.parse(assignment.end_date));
    } catch (error) { if (error instanceof NotFoundException) { return false; } throw error; }
  }
  private makeRoom(count: number): void {
    // Devices capped at 1000; each owns at most 2 Pending records (Start + Reset).
    // Capacity 5000 therefore reserves room for recovery; terminal records may be evicted.
    const need = Math.max(0, this.tasks.size + count - ACTUATOR_TASK_LIMIT);
    const removable = [...this.tasks.values()].filter((task) => task.status !== 'Pending').slice(0, need);
    if (removable.length < need) { throw new HttpException('Task journal đầy Pending', HttpStatus.TOO_MANY_REQUESTS); }
    for (const task of removable) { this.tasks.delete(task._id); }
  }
  private newTask(deviceId: string, operation: TaskOperation, caps: number[], action: 0 | 1, parent: string | null = null): ActuatorTask {
    const steps: TaskStep[] = caps.map((id) => ({ task_id: this.hardwareId(), tasking_capability_id: id, action,
      status: 'Queued', sent_at: null, ack_received_at: null, ack: null }));
    const task: ActuatorTask = { _id: new ObjectId().toHexString(), device_id: deviceId, command_id: this.hardwareId(),
      targets: steps.map(({ task_id, tasking_capability_id }) => ({ task_id, tasking_capability_id })),
      tasking_parameters: { actionType: 'control', action }, status: 'Pending', created_at: new Date(Date.now()).toISOString(),
      sent_at: null, confirmed_at: null, error_message: null, response_payload: { operation, confirmation_kind: 'CommandReceipt',
        parent_task_id: parent, reset_task_id: null, recovery_task_id: null, steps } };
    this.tasks.set(task._id, task); return task;
  }
  private hardwareId(): number {
    if (!Number.isSafeInteger(this.nextId + 1)) { throw new ServiceUnavailableException('Numeric task ID exhausted'); }
    return ++this.nextId;
  }
}
