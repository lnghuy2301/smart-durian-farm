import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { MaterialListDto } from '../materials/materials.dto';
import { AdminGuard } from '../users/admin.guard';
import { AddStandardMaterialDto } from './standard-materials.dto';
import { StandardMaterialsService } from './standard-materials.service';

@ApiTags('standard-materials-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('standards/:standard_id/materials')
export class StandardMaterialsController {
  constructor(@Inject(StandardMaterialsService) private readonly links: StandardMaterialsService) {}

  @Get()
  list(@Param('standard_id', new ParseUUIDPipe({ version: '4' })) standardId: string, @Query() query: MaterialListDto) {
    return this.links.list(standardId, query);
  }

  @Post()
  @UseGuards(AdminGuard)
  add(@Param('standard_id', new ParseUUIDPipe({ version: '4' })) standardId: string, @Body() body: AddStandardMaterialDto) {
    return this.links.add(standardId, body.material_id);
  }

  @Delete(':material_id')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  remove(
    @Param('standard_id', new ParseUUIDPipe({ version: '4' })) standardId: string,
    @Param('material_id', new ParseUUIDPipe({ version: '4' })) materialId: string,
  ) {
    this.links.remove(standardId, materialId);
  }
}
