import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { CreateFarmRequestDto, EmptyFarmActionDto, FarmListDto, FarmPageDto, FarmRequestListDto, JoinCooperativeRequestDto, RejectFarmRequestDto, UpdateFarmRequestDto } from './farms.dto';
import { FarmsService } from './farms.service';

@ApiTags('farms-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('farms')
export class FarmsController {
  constructor(@Inject(FarmsService) private readonly farms: FarmsService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: FarmListDto) { return this.farms.list(request.user!.id, query); }

  @Get(':id')
  get(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.farms.get(request.user!.id, id);
  }

  @Post('requests')
  create(@Req() request: AuthRequest, @Body() body: CreateFarmRequestDto) { return this.farms.createRequest(request.user!.id, body); }

  @Post(':id/update-requests')
  update(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateFarmRequestDto) {
    return this.farms.updateRequest(request.user!.id, id, body);
  }

  @Post(':id/join-requests')
  join(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: JoinCooperativeRequestDto) {
    return this.farms.joinRequest(request.user!.id, id, body.cooperative_id);
  }

  @Post(':id/leave-requests')
  leave(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyFarmActionDto) {
    void body;
    return this.farms.leaveRequest(request.user!.id, id);
  }
}

@ApiTags('farm-requests-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('farm-requests')
export class FarmRequestsController {
  constructor(@Inject(FarmsService) private readonly farms: FarmsService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: FarmRequestListDto) { return this.farms.listRequests(request.user!.id, query); }

  @Get(':id')
  get(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.farms.getRequest(request.user!.id, id);
  }

  @Patch(':id/approve')
  approve(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyFarmActionDto) {
    void body;
    return this.farms.approve(request.user!.id, id);
  }

  @Patch(':id/reject')
  reject(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: RejectFarmRequestDto) {
    return this.farms.reject(request.user!.id, id, body.reason);
  }
}

@ApiTags('farm-access-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class FarmAccessController {
  constructor(@Inject(FarmsService) private readonly farms: FarmsService) {}

  @Get('farm-notifications')
  notifications(@Req() request: AuthRequest, @Query() query: FarmPageDto) { return this.farms.listNotifications(request.user!.id, query); }
}
