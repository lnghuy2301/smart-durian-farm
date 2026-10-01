import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseService, Readiness } from '../database/database.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'API liveness; does not check database readiness' })
  getHealth(): { status: string; service: string } {
    return { status: 'ok', service: 'smart-durian-api' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check PostgreSQL and MongoDB connectivity' })
  @ApiResponse({ status: 200, description: 'Both databases respond' })
  @ApiResponse({ status: 503, description: 'At least one database is unavailable; no credentials or raw errors returned' })
  async getReadiness(): Promise<Readiness> {
    const readiness = await this.database.readiness();
    if (readiness.status !== 'ok') { throw new ServiceUnavailableException(readiness); }
    return readiness;
  }
}
