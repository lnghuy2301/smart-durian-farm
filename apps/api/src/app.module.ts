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
import { TreesModule } from './trees/trees.module';
import { TreeHarvestsModule } from './tree-harvests/tree-harvests.module';
import { DevicesModule } from './devices/devices.module';
import { SensorsModule } from './sensors/sensors.module';
import { ActuatorsModule } from './actuators/actuators.module';
import { MqttModule } from './mqtt/mqtt.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { readMqttConfig } from './mqtt/mqtt.config';

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
      const treesModule = TreesModule.forMock(authModule, farmsModule, zonesModule);
      const devicesModule = DevicesModule.forMock(authModule, farmsModule, zonesModule, treesModule);
      const sensorsModule = SensorsModule.forMock(authModule, farmsModule, zonesModule, devicesModule);
      const actuatorsModule = ActuatorsModule.forMock(authModule, farmsModule, zonesModule, devicesModule);
      const telemetryModule = TelemetryModule.forMock(authModule, farmsModule, zonesModule, devicesModule, sensorsModule);
      imports.push(
        usersModule,
        materialsModule,
        standardsModule,
        StandardMaterialsModule.forMock(authModule, materialsModule, standardsModule),
        farmsModule,
        CooperativesModule.forMock(config.auth, authModule, usersModule, farmsModule),
        zonesModule,
        treesModule,
        devicesModule,
        sensorsModule,
        actuatorsModule,
        telemetryModule,
        MqttModule.register(config.mqtt ?? readMqttConfig({}), authModule, devicesModule, sensorsModule, telemetryModule),
        TreeHarvestsModule.forMock(authModule, usersModule, farmsModule, zonesModule, treesModule),
        AssignmentsModule.forMock(authModule, farmsModule, zonesModule),
      );
    }
    return { module: AppModule, imports };
  }
}
