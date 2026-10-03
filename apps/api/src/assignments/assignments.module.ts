import { DynamicModule, Module } from '@nestjs/common';
import { AssignmentRequestsController, AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({})
export class AssignmentsModule {
  static forMock(authModule: DynamicModule, farmsModule: DynamicModule, zonesModule: DynamicModule): DynamicModule {
    // Store phân công nằm trong ZonesModule để đọc quyền Zone mà không tạo dependency cycle giữa services.
    return { module: AssignmentsModule, imports: [authModule, farmsModule, zonesModule],
      controllers: [AssignmentsController, AssignmentRequestsController], providers: [AssignmentsService], exports: [AssignmentsService] };
  }
}
