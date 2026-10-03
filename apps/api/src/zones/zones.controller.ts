import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { EmptyFarmActionDto, FarmRequestListDto, RejectFarmRequestDto } from '../farms/farms.dto';
import { CreateZoneDto, UpdateZoneDto, ZoneListDto } from './zones.dto';
import { ZonesService } from './zones.service';

@ApiTags('zones-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('zones')
export class ZonesController {
  constructor(@Inject(ZonesService) private readonly zones: ZonesService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: ZoneListDto) { return this.zones.list(request.user!.id, query); }

  @Get(':id')
  get(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.zones.get(request.user!.id, id); }

  @Post()
  create(@Req() request: AuthRequest, @Body() body: CreateZoneDto) { return this.zones.create(request.user!.id, body); }

  @Patch(':id')
  update(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateZoneDto) {
    return this.zones.update(request.user!.id, id, body);
  }

  @Post('requests')
  createRequest(@Req() request: AuthRequest, @Body() body: CreateZoneDto) { return this.zones.createRequest(request.user!.id, body); }

  @Post(':id/update-requests')
  updateRequest(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateZoneDto) {
    return this.zones.updateRequest(request.user!.id, id, body);
  }
}

@ApiTags('zone-requests-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('zone-requests')
export class ZoneRequestsController {
  constructor(@Inject(ZonesService) private readonly zones: ZonesService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: FarmRequestListDto) { return this.zones.listRequests(request.user!.id, query); }

  @Get(':id')
  get(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.zones.getRequest(request.user!.id, id); }

  @Patch(':id/approve')
  approve(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyFarmActionDto) {
    void body; return this.zones.approve(request.user!.id, id);
  }

  @Patch(':id/reject')
  reject(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: RejectFarmRequestDto) {
    return this.zones.reject(request.user!.id, id, body.reason);
  }
}
