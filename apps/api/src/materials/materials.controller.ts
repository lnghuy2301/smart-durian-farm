import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../users/admin.guard';
import { CreateMaterialDto, MaterialListDto, UpdateMaterialDto } from './materials.dto';
import { MaterialsService } from './materials.service';

@ApiTags('agricultural-materials-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('materials')
export class MaterialsController {
  constructor(@Inject(MaterialsService) private readonly materials: MaterialsService) {}

  @Get()
  list(@Query() query: MaterialListDto) { return this.materials.list(query); }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.materials.get(id); }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() body: CreateMaterialDto) { return this.materials.create(body); }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateMaterialDto) {
    return this.materials.update(id, body);
  }
}
