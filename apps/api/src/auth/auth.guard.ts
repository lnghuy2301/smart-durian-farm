import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

export interface AuthRequest {
  headers: { authorization?: string };
  user?: Awaited<ReturnType<AuthService['authenticate']>>;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match) { throw new UnauthorizedException('Thiếu Bearer token'); }
    request.user = await this.auth.authenticate(match[1]);
    return true;
  }
}
