import { DynamicModule, Module } from '@nestjs/common';
import { ACTUATOR_TASKS_CONFIG, ActuatorTasksConfig } from './actuator-tasks.config';
import { ActuatorTasksController } from './actuator-tasks.controller';
import { ActuatorTasksService } from './actuator-tasks.service';

@Module({})
export class ActuatorTasksModule {
  static register(config: ActuatorTasksConfig, modules: DynamicModule[]): DynamicModule {
    return { module: ActuatorTasksModule, imports: modules, controllers: [ActuatorTasksController],
      providers: [{ provide: ACTUATOR_TASKS_CONFIG, useValue: config }, ActuatorTasksService], exports: [ActuatorTasksService] };
  }
}
