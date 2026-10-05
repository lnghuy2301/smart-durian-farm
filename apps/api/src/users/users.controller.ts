import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { AdminGuard } from './admin.guard';
import { ApproveManagerDto, RejectManagerDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users-admin-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard, AdminGuard)
@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get('pending-managers')
  pending(@Req() request: AuthRequest) { return this.users.pendingManagers(request.user!.id); }

  @Get('cooperatives')
  cooperatives(@Req() request: AuthRequest) { return this.users.listCooperatives(request.user!.id); }

  @Patch(':id/approve')
  approve(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: ApproveManagerDto) {
    return this.users.approve(request.user!.id, id, body);
  }

  @Patch(':id/reject')
  reject(@Req() request: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: RejectManagerDto) {
    // DTO rỗng vẫn cần được kiểm tra để từ chối các field không thuộc thao tác duyệt.
    void body;
    return this.users.reject(request.user!.id, id);
  }
}
