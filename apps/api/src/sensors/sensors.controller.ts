import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { EmptyFarmActionDto, FarmPageDto, FarmRequestListDto, RejectFarmRequestDto } from '../farms/farms.dto';
import { CreateSensorDto, SensorListDto, SensorStreamParamDto, UpdateSensorDto } from './sensors.dto';
import { SensorsService } from './sensors.service';

@ApiTags('sensors-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('sensors')
export class SensorsController {
  constructor(@Inject(SensorsService) private readonly sensors: SensorsService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: SensorListDto) { return this.sensors.list(req.user!.id, query); }

  @Get('by-stream/:deviceId/:dataStreamId')
  byStream(@Req() req: AuthRequest, @Param() params: SensorStreamParamDto) {
    return this.sensors.getByStream(req.user!.id, params.deviceId, params.dataStreamId);
  }

  @Get(':id/history')
  history(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query() query: FarmPageDto) {
    return this.sensors.history(req.user!.id, id, query);
  }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.sensors.get(req.user!.id, id); }

  @Post()
  create(@Req() req: AuthRequest, @Body() body: CreateSensorDto) { return this.sensors.create(req.user!.id, body); }

  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateSensorDto) {
    return this.sensors.update(req.user!.id, id, body);
  }

  @Post('requests')
  createRequest(@Req() req: AuthRequest, @Body() body: CreateSensorDto) { return this.sensors.createRequest(req.user!.id, body); }

  @Post(':id/update-requests')
  updateRequest(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateSensorDto) {
    return this.sensors.updateRequest(req.user!.id, id, body);
  }
}

@ApiTags('sensor-requests-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('sensor-requests')
export class SensorRequestsController {
  constructor(@Inject(SensorsService) private readonly sensors: SensorsService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: FarmRequestListDto) { return this.sensors.listRequests(req.user!.id, query); }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.sensors.getRequest(req.user!.id, id); }

  @Patch(':id/approve')
  approve(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyFarmActionDto) {
    void body;
    return this.sensors.approve(req.user!.id, id);
  }

  @Patch(':id/reject')
  reject(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: RejectFarmRequestDto) {
    return this.sensors.reject(req.user!.id, id, body.reason);
  }
}
