import { DynamicModule, Module } from '@nestjs/common';
import { FarmAccessController, FarmRequestsController, FarmsController } from './farms.controller';
import { FarmsService } from './farms.service';

@Module({})
export class FarmsModule {
  static forMock(authModule: DynamicModule, usersModule: DynamicModule): DynamicModule {
    // Dùng đúng module USERS/Auth đã đăng ký trong AppModule để không tạo store HTX/user thứ hai.
    return {
      module: FarmsModule, imports: [authModule, usersModule],
      controllers: [FarmsController, FarmRequestsController, FarmAccessController],
      providers: [FarmsService], exports: [FarmsService],
    };
  }
}
