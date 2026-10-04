import { DynamicModule, Module } from '@nestjs/common';
import { Environment } from './config/environment';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MaterialsModule } from './materials/materials.module';
import { StandardsModule } from './standards/standards.module';
import { StandardMaterialsModule } from './standard-materials/standard-materials.module';
import { FarmsModule } from './farms/farms.module';
import { ZonesModule } from './zones/zones.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { CooperativesModule } from './cooperatives/cooperatives.module';

@Module({})
export class AppModule {
  static register(config: Environment): DynamicModule {
    const imports: DynamicModule[] = [HealthModule.register(config.database)];
    if (config.auth) {
      // Dùng cùng instance dynamic module để JWT và user đăng ký được thấy ở mọi module.
      // Tạo AuthModule.forMock nhiều lần sẽ tạo các store bộ nhớ độc lập trong Nest 11.
      const authModule = AuthModule.forMock(config.auth);
      const usersModule = UsersModule.forMock(config.auth, authModule);
      const materialsModule = MaterialsModule.forMock(authModule);
      const standardsModule = StandardsModule.forMock(authModule);
      const farmsModule = FarmsModule.forMock(authModule, usersModule);
      const zonesModule = ZonesModule.forMock(authModule, farmsModule, standardsModule);
      imports.push(
        usersModule,
        materialsModule,
        standardsModule,
        StandardMaterialsModule.forMock(authModule, materialsModule, standardsModule),
        farmsModule,
        CooperativesModule.forMock(config.auth, authModule, usersModule, farmsModule),
        zonesModule,
        AssignmentsModule.forMock(authModule, farmsModule, zonesModule),
      );
    }
    return { module: AppModule, imports };
  }
}
