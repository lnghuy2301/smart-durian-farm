import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthRequest } from '../auth/auth.guard';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (user?.role !== 'Admin' || user.status !== 'Active') { throw new ForbiddenException('Chỉ Admin được truy cập'); }
    return true;
  }
}
