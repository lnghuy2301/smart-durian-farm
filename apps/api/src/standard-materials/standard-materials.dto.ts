import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddStandardMaterialDto {
  @ApiProperty({ description: 'UUID vật tư đã tạo trong danh mục Materials' })
  @IsUUID('4')
  material_id!: string;
}
