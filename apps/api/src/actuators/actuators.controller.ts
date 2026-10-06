import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { EmptyFarmActionDto, FarmPageDto, FarmRequestListDto, RejectFarmRequestDto } from '../farms/farms.dto';
import { CreateActuatorDto, ActuatorListDto, ActuatorCapabilityParamDto, UpdateActuatorDto } from './actuators.dto';
import { ActuatorsService } from './actuators.service';

@ApiTags('actuators-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('actuators')
export class ActuatorsController {
  constructor(@Inject(ActuatorsService) private readonly actuators: ActuatorsService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ActuatorListDto) { return this.actuators.list(req.user!.id, query); }

  @Get('by-capability/:deviceId/:capabilityId')
  byCapability(@Req() req: AuthRequest, @Param() params: ActuatorCapabilityParamDto) {
    return this.actuators.getByCapability(req.user!.id, params.deviceId, params.capabilityId);
  }

  @Get(':id/history')
  history(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query() query: FarmPageDto) {
    return this.actuators.history(req.user!.id, id, query);
  }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.actuators.get(req.user!.id, id); }

  @Post()
  create(@Req() req: AuthRequest, @Body() body: CreateActuatorDto) { return this.actuators.create(req.user!.id, body); }

  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateActuatorDto) {
    return this.actuators.update(req.user!.id, id, body);
  }

  @Post('requests')
  createRequest(@Req() req: AuthRequest, @Body() body: CreateActuatorDto) { return this.actuators.createRequest(req.user!.id, body); }

  @Post(':id/update-requests')
  updateRequest(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateActuatorDto) {
    return this.actuators.updateRequest(req.user!.id, id, body);
  }
}

@ApiTags('actuator-requests-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('actuator-requests')
export class ActuatorRequestsController {
  constructor(@Inject(ActuatorsService) private readonly actuators: ActuatorsService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: FarmRequestListDto) { return this.actuators.listRequests(req.user!.id, query); }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.actuators.getRequest(req.user!.id, id); }

  @Patch(':id/approve')
  approve(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyFarmActionDto) {
    void body;
    return this.actuators.approve(req.user!.id, id);
  }

  @Patch(':id/reject')
  reject(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: RejectFarmRequestDto) {
    return this.actuators.reject(req.user!.id, id, body.reason);
  }
}
