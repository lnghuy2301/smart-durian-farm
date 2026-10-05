import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../users/admin.guard';
import { CreateStandardDto, StandardListDto, UpdateStandardDto } from './standards.dto';
import { StandardsService } from './standards.service';

@ApiTags('farming-standards-local-test')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('standards')
export class StandardsController {
  constructor(@Inject(StandardsService) private readonly standards: StandardsService) {}

  @Get()
  list(@Query() query: StandardListDto) { return this.standards.list(query); }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.standards.get(id); }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() body: CreateStandardDto) { return this.standards.create(body); }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateStandardDto) {
    return this.standards.update(id, body);
  }
}
