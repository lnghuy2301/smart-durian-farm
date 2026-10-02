import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CatalogStatus, CreateMaterialDto, MaterialListDto, MaterialType, UpdateMaterialDto } from './materials.dto';

export interface AgriculturalMaterial {
  id: string;
  name: string;
  material_type: MaterialType;
  default_dosage: string;
  unit: string;
  quarantine_days: number;
  status: CatalogStatus;
}

@Injectable()
export class MaterialsService {
  private readonly materials = new Map<string, AgriculturalMaterial>();

  create(input: CreateMaterialDto): AgriculturalMaterial {
    if (this.materials.size >= 1000) {
      throw new HttpException('Danh mục test đã đầy; restart để bắt đầu lại', HttpStatus.TOO_MANY_REQUESTS);
    }
    const material: AgriculturalMaterial = { ...input, id: randomUUID(), status: input.status ?? 'Active' };
    this.materials.set(material.id, material);
    return { ...material };
  }

  list(query: MaterialListDto) {
    const search = query.q?.toLocaleLowerCase('vi') ?? '';
    const matches = [...this.materials.values()].filter((material) =>
      (!query.status || material.status === query.status) &&
      (!query.material_type || material.material_type === query.material_type) &&
      material.name.toLocaleLowerCase('vi').includes(search));
    return {
      items: matches.slice(query.offset, query.offset + query.limit).map((material) => ({ ...material })),
      total: matches.length, limit: query.limit, offset: query.offset,
    };
  }

  get(id: string): AgriculturalMaterial {
    const material = this.materials.get(id);
    if (!material) { throw new NotFoundException('Không tìm thấy vật tư'); }
    return { ...material };
  }

  update(id: string, input: UpdateMaterialDto): AgriculturalMaterial {
    const current = this.get(id);
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    if (Object.keys(changes).length === 0) { throw new BadRequestException('Cần ít nhất một field để cập nhật'); }
    // Ghi một bản mới đồng bộ; không trả reference để module khác vô tình sửa trực tiếp store.
    const updated: AgriculturalMaterial = { ...current, ...changes };
    this.materials.set(id, updated);
    return { ...updated };
  }
}
