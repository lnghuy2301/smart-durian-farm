import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { FarmPageDto } from '../farms/farms.dto';
import { MqttService } from './mqtt.service';

@ApiTags('mqtt-communication') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('mqtt')
export class MqttController {
  constructor(@Inject(MqttService) private readonly mqtt: MqttService) {}
  @Get('status')
  @ApiOperation({ summary: 'Admin: trạng thái broker và bộ đếm chẩn đoán, không trả config/secrets' })
  status(@Req() req: AuthRequest) { return this.mqtt.brokerStatus(req.user!.id); }
  @Get('devices/:id/status')
  @ApiOperation({ summary: 'Quyền đọc Device hiện tại: connectivity tách khỏi trạng thái quản trị' })
  device(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.mqtt.deviceStatus(req.user!.id, id);
  }
  @Get('devices/:id/messages')
  @ApiOperation({ summary: 'Chẩn đoán RAM có giới hạn; không phải lịch sử telemetry bền vững' })
  messages(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query() page: FarmPageDto) {
    return this.mqtt.messages(req.user!.id, id, page);
  }
}
