import { ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialListDto } from '../materials/materials.dto';
import { MaterialsService } from '../materials/materials.service';
import { StandardsService } from '../standards/standards.service';

@Injectable()
export class StandardMaterialsService {
  private readonly links = new Map<string, Set<string>>();
  private linkCount = 0;

  constructor(
    @Inject(StandardsService) private readonly standards: StandardsService,
    @Inject(MaterialsService) private readonly materials: MaterialsService,
  ) {}

  add(standardId: string, materialId: string) {
    this.standards.get(standardId);
    this.materials.get(materialId);
    const materialIds = this.links.get(standardId) ?? new Set<string>();
    if (materialIds.has(materialId)) { throw new ConflictException('Vật tư đã được gắn với tiêu chuẩn này'); }
    if (this.linkCount >= 10000) { throw new HttpException('Bộ nhớ liên kết test đã đầy', HttpStatus.TOO_MANY_REQUESTS); }
    // Kiểm tra và thêm đồng bộ: hai request không thể tạo trùng cặp FK.
    materialIds.add(materialId);
    this.links.set(standardId, materialIds);
    this.linkCount++;
    return { standard_id: standardId, material_id: materialId };
  }

  list(standardId: string, query: MaterialListDto) {
    this.standards.get(standardId);
    // Filter phạm vi được suy từ bridge phía server, không nhận danh sách ID tùy ý từ client.
    const materialIds = this.links.get(standardId) ?? new Set<string>();
    return { standard_id: standardId, ...this.materials.list(query, materialIds) };
  }

  remove(standardId: string, materialId: string): void {
    this.standards.get(standardId);
    this.materials.get(materialId);
    const materialIds = this.links.get(standardId);
    if (!materialIds?.delete(materialId)) { throw new NotFoundException('Không tìm thấy liên kết tiêu chuẩn–vật tư'); }
    this.linkCount--;
    if (materialIds.size === 0) { this.links.delete(standardId); }
    // Chỉ bỏ cấu hình bridge; không xóa vật tư/tiêu chuẩn hoặc ghi đè lịch sử canh tác.
  }
}
