import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMongoId, ValidateIf } from 'class-validator';
import { FarmPageDto } from '../farms/farms.dto';
import { CONTROL_OPERATIONS, ControlOperation, TaskStatus } from './actuator-tasks.types';

export class CreateControlDto {
  @ApiProperty({ enum: CONTROL_OPERATIONS, description: 'Không nhận taskId, capability, thời gian hoặc ACK từ client' })
  @IsIn(CONTROL_OPERATIONS)
  operation!: ControlOperation;
}
export class TaskPageDto extends FarmPageDto {
  @ApiPropertyOptional({ enum: ['Pending', 'Confirmed', 'Failed'] })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(['Pending', 'Confirmed', 'Failed'])
  status?: TaskStatus;
}
export class TaskIdParamDto {
  @ApiProperty({ description: 'ACTUATOR_TASKS._id ObjectId hex, khác taskId numeric trên MQTT' })
  @IsMongoId()
  id!: string;
}
