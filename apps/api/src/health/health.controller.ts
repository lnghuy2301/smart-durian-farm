import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'API liveness; does not check database readiness' })
  getHealth(): { status: string; service: string } {
    return { status: 'ok', service: 'smart-durian-api' };
  }
}
