import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';
import { Environment } from '../config/environment';

export interface Readiness {
  status: 'ok' | 'unavailable';
  databases: { postgres: 'up' | 'down'; mongodb: 'up' | 'down' };
}

export class DatabaseService implements OnApplicationShutdown {
  readonly postgres: Pool;
  readonly mongo: MongoClient;
  private readonly logger = new Logger(DatabaseService.name);
  private readonly timeoutMs: number;

  constructor(config: Environment['database']) {
    // Dùng chung pool cho các request; giới hạn timeout để mất DB không treo API vô hạn.
    this.timeoutMs = config.timeoutMs;
    this.postgres = new Pool({
      connectionString: config.postgresUrl,
      max: 10,
      connectionTimeoutMillis: config.timeoutMs,
      statement_timeout: config.timeoutMs,
      query_timeout: config.timeoutMs,
      idleTimeoutMillis: 10000,
    });
    this.postgres.on('error', () => this.logger.warn('PostgreSQL idle connection failed'));
    this.mongo = new MongoClient(config.mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: config.timeoutMs,
      connectTimeoutMS: config.timeoutMs,
      socketTimeoutMS: config.timeoutMs,
      waitQueueTimeoutMS: config.timeoutMs,
    });
  }

  async readiness(): Promise<Readiness> {
    // Kiểm tra cả hai DB độc lập; một DB lỗi vẫn phải thu được trạng thái của DB còn lại.
    const [postgres, mongodb] = await Promise.allSettled([
      this.postgres.query('SELECT 1'),
      this.mongo.db().command({ ping: 1 }, { timeoutMS: this.timeoutMs }),
    ]);
    const databases: Readiness['databases'] = {
      postgres: postgres.status === 'fulfilled' ? 'up' : 'down',
      mongodb: mongodb.status === 'fulfilled' ? 'up' : 'down',
    };
    return {
      status: databases.postgres === 'up' && databases.mongodb === 'up' ? 'ok' : 'unavailable',
      databases,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    // Một client đóng lỗi không được ngăn client còn lại giải phóng kết nối.
    await Promise.allSettled([this.postgres.end(), this.mongo.close()]);
  }
}
