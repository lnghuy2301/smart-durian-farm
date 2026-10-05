import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { EmptyFarmActionDto, FarmPageDto, FarmRequestListDto, RejectFarmRequestDto } from '../farms/farms.dto';
import { CreateTreeDto, TreeCodeParamDto, TreeListDto, UpdateTreeDto } from './trees.dto';
import { TreesService } from './trees.service';

@ApiTags('trees-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('trees')
export class TreesController {
  constructor(@Inject(TreesService) private readonly trees: TreesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: TreeListDto) { return this.trees.list(req.user!.id, query); }

  @Get('by-code/:treeCode')
  byCode(@Req() req: AuthRequest, @Param() params: TreeCodeParamDto) { return this.trees.getByCode(req.user!.id, params.treeCode); }

  @Get(':id/history')
  history(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query() query: FarmPageDto) {
    return this.trees.history(req.user!.id, id, query);
  }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.trees.get(req.user!.id, id); }

  @Post()
  create(@Req() req: AuthRequest, @Body() body: CreateTreeDto) { return this.trees.create(req.user!.id, body); }

  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateTreeDto) {
    return this.trees.update(req.user!.id, id, body);
  }

  @Post('requests')
  createRequest(@Req() req: AuthRequest, @Body() body: CreateTreeDto) { return this.trees.createRequest(req.user!.id, body); }

  @Post(':id/update-requests')
  updateRequest(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: UpdateTreeDto) {
    return this.trees.updateRequest(req.user!.id, id, body);
  }
}

@ApiTags('tree-requests-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('tree-requests')
export class TreeRequestsController {
  constructor(@Inject(TreesService) private readonly trees: TreesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: FarmRequestListDto) { return this.trees.listRequests(req.user!.id, query); }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.trees.getRequest(req.user!.id, id); }

  @Patch(':id/approve')
  approve(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: EmptyFarmActionDto) {
    void body;
    return this.trees.approve(req.user!.id, id);
  }

  @Patch(':id/reject')
  reject(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: RejectFarmRequestDto) {
    return this.trees.reject(req.user!.id, id, body.reason);
  }
}
