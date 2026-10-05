import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { EmptyFarmActionDto, FarmPageDto, FarmRequestListDto, RejectFarmRequestDto } from '../farms/farms.dto';
import { CreateDeviceDto, DeviceListDto, DeviceStationParamDto, UpdateDeviceDto } from './devices.dto';
import { DevicesService } from './devices.service';

@ApiTags('devices-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(@Inject(DevicesService) private readonly devices: DevicesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: DeviceListDto) { return this.devices.list(req.user!.id, query); }

  @Get('by-station/:stationId')
  byStation(@Req() req: AuthRequest, @Param() params: DeviceStationParamDto) {
    return this.devices.getByStationId(req.user!.id, params.stationId);
  }

  @Get(':id/history')
  history(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query() query: FarmPageDto) {
    return this.devices.history(req.user!.id, id, query);
  }

  @Get(':id/trees')
  trees(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query() query: FarmPageDto) {
    return this.devices.affectedTrees(req.user!.id, id, query);
  }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.devices.get(req.user!.id, id); }

  @Post()
  create(@Req() req: AuthRequest, @Body() body: CreateDeviceDto) { return this.devices.create(req.user!.id, body); }

  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateDeviceDto) {
    return this.devices.update(req.user!.id, id, body);
  }

  @Post('requests')
  createRequest(@Req() req: AuthRequest, @Body() body: CreateDeviceDto) { return this.devices.createRequest(req.user!.id, body); }

  @Post(':id/update-requests')
  updateRequest(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateDeviceDto) {
    return this.devices.updateRequest(req.user!.id, id, body);
  }
}

@ApiTags('device-requests-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('device-requests')
export class DeviceRequestsController {
  constructor(@Inject(DevicesService) private readonly devices: DevicesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: FarmRequestListDto) { return this.devices.listRequests(req.user!.id, query); }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.devices.getRequest(req.user!.id, id); }

  @Patch(':id/approve')
  approve(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyFarmActionDto) {
    void body;
    return this.devices.approve(req.user!.id, id);
  }

  @Patch(':id/reject')
  reject(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: RejectFarmRequestDto) {
    return this.devices.reject(req.user!.id, id, body.reason);
  }
}
