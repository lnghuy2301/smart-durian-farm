import { Injectable } from '@nestjs/common';
import { TelemetryRecord } from './telemetry.types';

export const TELEMETRY_READING_LIMIT = 10000;

@Injectable()
export class TelemetryStore {
  private readonly records = new Map<string, TelemetryRecord>();

  append(records: TelemetryRecord[]): void {
    // Map giữ thứ tự insert: FIFO theo thứ tự server ghi, kể cả timestamp trùng/clock điều chỉnh.
    // Không shift mảng 10k phần tử hoặc giữ latest cache ngoài FIFO làm tăng bộ nhớ không giới hạn.
    for (const record of records) {
      this.records.set(record._id, structuredClone(record));
      if (this.records.size > TELEMETRY_READING_LIMIT) {
        this.records.delete(this.records.keys().next().value!);
      }
    }
  }

  newestFirst(): TelemetryRecord[] {
    return structuredClone([...this.records.values()].reverse());
  }
}
