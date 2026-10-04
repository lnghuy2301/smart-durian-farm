import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { CreateCooperativeDto } from '../users/users.dto';
import { CooperativeListDto, CooperativeOtpDto, CooperativePageDto, EmptyCooperativeActionDto,
  ManagerCooperativeUpdateDto, UpdateCooperativeDto } from './cooperatives.dto';
import { CooperativesService } from './cooperatives.service';

@ApiTags('cooperatives-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('cooperatives')
export class CooperativesController {
  constructor(@Inject(CooperativesService) private readonly cooperatives: CooperativesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: CooperativeListDto) { return this.cooperatives.list(req.user!.id, query); }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.cooperatives.get(req.user!.id, id); }

  @Post()
  create(@Req() req: AuthRequest, @Body() body: CreateCooperativeDto) { return this.cooperatives.create(req.user!.id, body); }

  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateCooperativeDto) {
    return this.cooperatives.update(req.user!.id, id, body);
  }

  @Post(':id/update-requests')
  request(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: ManagerCooperativeUpdateDto) {
    return this.cooperatives.createUpdateRequest(req.user!.id, id, body);
  }
}

@ApiTags('cooperative-update-requests-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('cooperative-update-requests')
export class CooperativeUpdateRequestsController {
  constructor(@Inject(CooperativesService) private readonly cooperatives: CooperativesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: CooperativePageDto) { return this.cooperatives.listRequests(req.user!.id, query); }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.cooperatives.getRequest(req.user!.id, id); }

  @Post(':id/email/resend')
  resendEmail(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyCooperativeActionDto) {
    void body;
    return this.cooperatives.resendEmail(req.user!.id, id);
  }

  @Post(':id/email/verify')
  verifyEmail(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: CooperativeOtpDto) {
    return this.cooperatives.verifyEmail(req.user!.id, id, body.otp);
  }

  @Post(':id/sms/send')
  sendSms(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyCooperativeActionDto) {
    void body;
    return this.cooperatives.sendSms(req.user!.id, id);
  }

  @Post(':id/sms/verify')
  verifySms(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: CooperativeOtpDto) {
    return this.cooperatives.verifySms(req.user!.id, id, body.otp);
  }

  @Patch(':id/cancel')
  cancel(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyCooperativeActionDto) {
    void body;
    return this.cooperatives.cancel(req.user!.id, id);
  }

  @Get(':id/test-sms')
  testSms(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.cooperatives.testSms(req.user!.id, id); }
}

@ApiTags('cooperative-notifications-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('cooperative-notifications')
export class CooperativeNotificationsController {
  constructor(@Inject(CooperativesService) private readonly cooperatives: CooperativesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: CooperativePageDto) { return this.cooperatives.listNotifications(req.user!.id, query); }
}
