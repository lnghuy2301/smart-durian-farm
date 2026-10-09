import { randomUUID } from 'node:crypto';
import { connect, IClientOptions, MqttClient } from 'mqtt';
import { MqttConfig } from './mqtt.config';
import { MQTT_RETURN_TOPIC } from './mqtt.protocol';

export interface BrokerState {
  enabled: boolean;
  connected: boolean;
  subscribed: boolean;
  last_error: 'CONNECTION_FAILED' | 'SUBSCRIPTION_FAILED' | 'PUBLISH_FAILED' | null;
}
export interface TransportHandlers {
  message: (topic: string, payload: Buffer, retained: boolean) => void;
  state: (state: BrokerState) => void;
}
export abstract class MqttTransport {
  abstract start(handlers: TransportHandlers): void;
  abstract stop(): Promise<void>;
  // Internal adapter only. Caller must implement authorization and pump/valve safety before using it.
  abstract publish(topic: string, payload: string): Promise<{ status: 'TransportAccepted' }>;
}
export type MqttClientFactory = (options: IClientOptions) => MqttClient;

export class MqttJsTransport extends MqttTransport {
  private client?: MqttClient;
  private handlers?: TransportHandlers;
  private epoch = 0;
  private subscriptionTimer?: NodeJS.Timeout;
  private state: BrokerState;
  constructor(private readonly config: MqttConfig, private readonly factory: MqttClientFactory = (options) => connect(options)) {
    super();
    this.state = { enabled: config.enabled, connected: false, subscribed: false, last_error: null };
  }
  start(handlers: TransportHandlers): void {
    if (this.handlers) { return; }
    this.handlers = handlers;
    this.emitState();
    if (!this.config.enabled) { return; }
    try {
      const client = this.factory({ host: this.config.host, port: this.config.port, protocol: this.config.tls ? 'mqtts' : 'mqtt',
        username: this.config.username, password: this.config.password, clientId: `smart-durian-${randomUUID()}`,
        manualConnect: true, clean: true, protocolVersion: 4, reconnectPeriod: this.config.reconnectMs,
        connectTimeout: this.config.connectTimeoutMs, resubscribe: false, queueQoSZero: false, rejectUnauthorized: true });
      this.client = client;
      client.on('connect', () => {
        if (this.client !== client) { return; }
        clearTimeout(this.subscriptionTimer);
        const epoch = ++this.epoch;
        this.state = { ...this.state, connected: true, subscribed: false, last_error: null };
        this.emitState();
        this.subscriptionTimer = setTimeout(() => {
          if (this.client !== client || epoch !== this.epoch) { return; }
          ++this.epoch;
          this.state.subscribed = false; this.state.last_error = 'SUBSCRIPTION_FAILED'; this.emitState();
          client.stream.destroy();
        }, this.config.connectTimeoutMs);
        this.subscriptionTimer.unref();
        client.subscribe(MQTT_RETURN_TOPIC, { qos: 1 }, (error, granted) => {
          // Ignore a late SUBACK from an old connection after reconnect/shutdown.
          if (this.client !== client || epoch !== this.epoch) { return; }
          clearTimeout(this.subscriptionTimer);
          const accepted = !error && granted?.some((grant) => grant.topic === MQTT_RETURN_TOPIC && grant.qos !== 128);
          this.state.subscribed = !!accepted;
          this.state.last_error = accepted ? null : 'SUBSCRIPTION_FAILED';
          this.emitState();
          // Force a fresh session on denial/timeout; no commands can be published without return subscription.
          if (!accepted) { client.stream.destroy(); }
        });
      });
      const disconnected = () => {
        if (this.client !== client) { return; }
        clearTimeout(this.subscriptionTimer);
        ++this.epoch;
        this.state.connected = false; this.state.subscribed = false; this.emitState();
      };
      client.on('close', disconnected);
      client.on('offline', disconnected);
      client.on('error', () => {
        if (this.client === client) { this.state.last_error = 'CONNECTION_FAILED'; this.emitState(); }
      });
      client.on('message', (topic, payload, packet) => {
        if (this.client === client && this.state.connected && this.state.subscribed) { this.handlers?.message(topic, payload, !!packet.retain); }
      });
      client.connect();
    } catch {
      this.state.last_error = 'CONNECTION_FAILED'; this.emitState();
    }
  }
  async publish(topic: string, payload: string): Promise<{ status: 'TransportAccepted' }> {
    const client = this.client;
    if (!client || !client.connected || !this.state.subscribed) { throw new Error('MQTT_UNAVAILABLE'); }
    if (!/^subscribe\/station\/[A-Za-z0-9_-]{1,50}$/.test(topic)) { throw new Error('INVALID_COMMAND_TOPIC'); }
    const epoch = this.epoch;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new Error('timeout')), this.config.connectTimeoutMs);
      const finish = (error?: Error | null) => {
        if (settled) { return; }
        settled = true; clearTimeout(timer);
        if (error || epoch !== this.epoch || this.client !== client || !client.connected) {
          this.state.last_error = 'PUBLISH_FAILED'; this.emitState(); reject(new Error('MQTT_PUBLISH_FAILED')); return;
        }
        resolve({ status: 'TransportAccepted' });
      };
      // QoS 0 + queueQoSZero=false + retain=false: never enqueue offline/replay old relay commands on reconnect.
      // This callback only describes transport write, never device ACK or physical actuator state.
      try { client.publish(topic, payload, { qos: 0, retain: false }, finish); }
      catch { finish(new Error('publish')); }
    });
  }
  async stop(): Promise<void> {
    const client = this.client;
    clearTimeout(this.subscriptionTimer);
    this.client = undefined; ++this.epoch;
    this.state.connected = false; this.state.subscribed = false; this.emitState();
    this.handlers = undefined;
    if (client) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { client.stream?.destroy(); resolve(); }, this.config.connectTimeoutMs);
        const done = () => { clearTimeout(timer); resolve(); };
        try { client.end(true, {}, done); } catch { client.stream?.destroy(); done(); }
      });
    }
  }
  private emitState(): void { this.handlers?.state({ ...this.state }); }
}
