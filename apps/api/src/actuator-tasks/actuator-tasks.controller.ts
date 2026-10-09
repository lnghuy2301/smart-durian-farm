import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { CreateControlDto, TaskIdParamDto, TaskPageDto } from './actuator-tasks.dto';
import { ActuatorTasksService } from './actuator-tasks.service';
import { acceptedSchema, listSchema, stateSchema, taskSchema } from './actuator-tasks.schema';

@ApiTags('actuator-tasks') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('actuator-tasks')
export class ActuatorTasksController {
  constructor(@Inject(ActuatorTasksService) private readonly tasks: ActuatorTasksService) {}
  @Post('devices/:deviceId/commands') @HttpCode(202)
  @ApiOperation({ summary: 'Farmer đang có quyền: Bật tưới/phun hoặc Dừng; trả Pending ngay, ACK chỉ là CommandReceipt' })
  @ApiAcceptedResponse({ description: 'Task Pending + status_url/state_url; theo dõi GET, không có manual confirm', schema: acceptedSchema })
  command(@Req() req: AuthRequest, @Param('deviceId', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: CreateControlDto) {
    return this.tasks.command(req.user!.id, id, body.operation);
  }
  @Get('devices/:deviceId/state')
  @ApiOkResponse({ schema: stateSchema })
  state(@Req() req: AuthRequest, @Param('deviceId', new ParseUUIDPipe({ version: '4' })) id: string) { return this.tasks.state(req.user!.id, id); }
  @Get('devices/:deviceId')
  @ApiOkResponse({ schema: listSchema })
  list(@Req() req: AuthRequest, @Param('deviceId', new ParseUUIDPipe({ version: '4' })) id: string, @Query() page: TaskPageDto) {
    return this.tasks.list(req.user!.id, id, page);
  }
  @Get(':id')
  @ApiOkResponse({ schema: taskSchema })
  get(@Req() req: AuthRequest, @Param() params: TaskIdParamDto) { return this.tasks.get(req.user!.id, params.id); }
}
