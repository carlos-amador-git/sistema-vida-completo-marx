// src/common/repositories/base.repository.ts
/**
 * Base Repository Pattern — Abstracts Prisma data access
 *
 * Provides a clean interface between business logic and persistence layer.
 * Benefits:
 * - Services don't depend directly on Prisma
 * - Easier to mock in tests
 * - Consistent error handling and logging
 * - Encapsulates query patterns (pagination, filtering, soft-delete)
 */

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BaseRepository<T, CreateInput, UpdateInput> {
  findById(id: string): Promise<T | null>;
  findMany(options?: { pagination?: PaginationOptions; where?: any; orderBy?: any }): Promise<PaginatedResult<T>>;
  create(data: CreateInput): Promise<T>;
  update(id: string, data: UpdateInput): Promise<T>;
  delete(id: string): Promise<void>;
  count(where?: any): Promise<number>;
}
