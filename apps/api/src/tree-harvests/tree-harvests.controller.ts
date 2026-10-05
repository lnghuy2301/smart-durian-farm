import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { EmptyFarmActionDto, FarmPageDto, RejectFarmRequestDto } from '../farms/farms.dto';
import { CreateHarvestBackdateDto, CreateHarvestDto, HarvestCorrectionDto, HarvestListDto, HarvestRequestListDto, UpdateHarvestDto } from './tree-harvests.dto';
import { TreeHarvestsService } from './tree-harvests.service';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('tree-harvests-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('tree-harvests')
export class TreeHarvestsController {
  constructor(@Inject(TreeHarvestsService) private readonly harvests: TreeHarvestsService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: HarvestListDto) { return this.harvests.list(req.user!.id, query); }
  @Get(':id') get(@Req() req: AuthRequest, @Param('id', uuid()) id: string) { return this.harvests.get(req.user!.id, id); }
  @Post() create(@Req() req: AuthRequest, @Body() body: CreateHarvestDto) { return this.harvests.create(req.user!.id, body); }
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id', uuid()) id: string, @Body() body: UpdateHarvestDto) {
    return this.harvests.updateDraft(req.user!.id, id, body);
  }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id', uuid()) id: string) { return this.harvests.removeDraft(req.user!.id, id); }
  @Patch(':id/submit') submit(@Req() req: AuthRequest, @Param('id', uuid()) id: string, @Body() body: EmptyFarmActionDto) {
    void body; return this.harvests.submit(req.user!.id, id);
  }
  @Post(':id/correction-requests') correction(@Req() req: AuthRequest, @Param('id', uuid()) id: string, @Body() body: HarvestCorrectionDto) {
    return this.harvests.correction(req.user!.id, id, body);
  }
}

@ApiTags('harvest-requests-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('harvest-requests')
export class HarvestRequestsController {
  constructor(@Inject(TreeHarvestsService) private readonly harvests: TreeHarvestsService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: HarvestRequestListDto) { return this.harvests.listRequests(req.user!.id, query); }
  @Get(':id') get(@Req() req: AuthRequest, @Param('id', uuid()) id: string) { return this.harvests.getRequest(req.user!.id, id); }
  @Patch(':id/changes') prepare(@Req() req: AuthRequest, @Param('id', uuid()) id: string, @Body() body: UpdateHarvestDto) {
    return this.harvests.prepareCorrection(req.user!.id, id, body);
  }
  @Patch(':id/approve') approve(@Req() req: AuthRequest, @Param('id', uuid()) id: string, @Body() body: EmptyFarmActionDto) {
    void body; return this.harvests.approve(req.user!.id, id);
  }
  @Patch(':id/reject') reject(@Req() req: AuthRequest, @Param('id', uuid()) id: string, @Body() body: RejectFarmRequestDto) {
    return this.harvests.reject(req.user!.id, id, body.reason);
  }
}

@ApiTags('harvest-backdate-permissions-local-test') @ApiBearerAuth() @UseGuards(AuthGuard)
@Controller('harvest-backdate-permissions')
export class HarvestBackdateController {
  constructor(@Inject(TreeHarvestsService) private readonly harvests: TreeHarvestsService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: FarmPageDto) { return this.harvests.listBackdates(req.user!.id, query); }
  @Post() grant(@Req() req: AuthRequest, @Body() body: CreateHarvestBackdateDto) { return this.harvests.grantBackdate(req.user!.id, body); }
  @Patch(':id/revoke') revoke(@Req() req: AuthRequest, @Param('id', uuid()) id: string, @Body() body: EmptyFarmActionDto) {
    void body; return this.harvests.revokeBackdate(req.user!.id, id);
  }
}
