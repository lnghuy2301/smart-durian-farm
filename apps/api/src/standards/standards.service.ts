import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CatalogStatus } from '../catalog/catalog.dto';
import { CreateStandardDto, StandardListDto, UpdateStandardDto } from './standards.dto';

export interface FarmingStandard {
  id: string;
  code: string;
  name: string;
  description: string;
  certifying_body: string;
  status: CatalogStatus;
}

@Injectable()
export class StandardsService {
  private readonly standards = new Map<string, FarmingStandard>();

  create(input: CreateStandardDto): FarmingStandard {
    if (this.standards.size >= 1000) {
      throw new HttpException('Danh mục test đã đầy; restart để bắt đầu lại', HttpStatus.TOO_MANY_REQUESTS);
    }
    const standard: FarmingStandard = { ...input, id: randomUUID(), status: input.status ?? 'Active' };
    this.standards.set(standard.id, standard);
    return { ...standard };
  }

  list(query: StandardListDto) {
    const search = query.q?.toLocaleLowerCase('vi') ?? '';
    const matches = [...this.standards.values()].filter((standard) =>
      (!query.status || standard.status === query.status) &&
      (standard.name.toLocaleLowerCase('vi').includes(search) || standard.code.toLocaleLowerCase('vi').includes(search)));
    return {
      items: matches.slice(query.offset, query.offset + query.limit).map((standard) => ({ ...standard })),
      total: matches.length, limit: query.limit, offset: query.offset,
    };
  }

  get(id: string): FarmingStandard {
    const standard = this.standards.get(id);
    if (!standard) { throw new NotFoundException('Không tìm thấy tiêu chuẩn'); }
    return { ...standard };
  }

  update(id: string, input: UpdateStandardDto): FarmingStandard {
    const current = this.get(id);
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    if (Object.keys(changes).length === 0) { throw new BadRequestException('Cần ít nhất một field để cập nhật'); }
    const updated: FarmingStandard = { ...current, ...changes };
    this.standards.set(id, updated);
    return { ...updated };
  }
}
