// src/common/repositories/user.repository.ts
/**
 * User Repository — Abstracts User data access from Prisma
 */
import { prisma } from '../prisma';
import { logger } from '../services/logger.service';
import type { BaseRepository, PaginationOptions, PaginatedResult } from './base.repository';

export interface UserEntity {
  id: string;
  email: string;
  name: string;
  curp: string;
  dateOfBirth: Date | null;
  sex: string | null;
  phone: string | null;
  isActive: boolean;
  isVerified: boolean;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface CreateUserInput {
  email: string;
  name: string;
  curp: string;
  passwordHash: string;
  dateOfBirth?: Date;
  sex?: string;
  phone?: string;
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  dateOfBirth?: Date;
  sex?: string;
  isActive?: boolean;
  isVerified?: boolean;
  lastLoginAt?: Date;
  preferredLanguage?: string;
}

// Select fields to avoid exposing sensitive data by default
const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  curp: true,
  dateOfBirth: true,
  sex: true,
  phone: true,
  isActive: true,
  isVerified: true,
  mfaEnabled: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
} as const;

class UserRepository implements BaseRepository<UserEntity, CreateUserInput, UpdateUserInput> {
  async findById(id: string): Promise<UserEntity | null> {
    return prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT,
    });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return prisma.user.findUnique({
      where: { email },
      select: USER_SAFE_SELECT,
    });
  }

  async findByCurp(curp: string): Promise<UserEntity | null> {
    return prisma.user.findUnique({
      where: { curp },
      select: USER_SAFE_SELECT,
    });
  }

  /**
   * Find user with auth fields (for login). Only use in auth flow.
   */
  async findForAuth(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        ...USER_SAFE_SELECT,
        passwordHash: true,
        totpSecret: true,
        verificationToken: true,
        verificationExpires: true,
      },
    });
  }

  async findMany(options?: {
    pagination?: PaginationOptions;
    where?: any;
    orderBy?: any;
  }): Promise<PaginatedResult<UserEntity>> {
    const page = options?.pagination?.page || 1;
    const limit = options?.pagination?.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where: options?.where,
        orderBy: options?.orderBy || { createdAt: 'desc' },
        select: USER_SAFE_SELECT,
        skip,
        take: limit,
      }),
      prisma.user.count({ where: options?.where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: CreateUserInput): Promise<UserEntity> {
    const user = await prisma.user.create({
      data,
      select: USER_SAFE_SELECT,
    });
    logger.info('User created', { userId: user.id });
    return user;
  }

  async update(id: string, data: UpdateUserInput): Promise<UserEntity> {
    return prisma.user.update({
      where: { id },
      data,
      select: USER_SAFE_SELECT,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    logger.info('User soft-deleted', { userId: id });
  }

  async count(where?: any): Promise<number> {
    return prisma.user.count({ where });
  }
}

export const userRepository = new UserRepository();
