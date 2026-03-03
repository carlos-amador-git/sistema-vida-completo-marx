// src/modules/admin/admin-auth.service.ts
import { logger } from '../../common/services/logger.service';
import { AdminRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../config';
import { DEFAULT_PERMISSIONS_BY_ROLE } from '../../common/guards/admin-roles.guard';
import { createHash } from 'crypto';

import { prisma } from '../../common/prisma';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface AdminTokenPayload {
  adminId: string;
  email: string;
  role: string;
  permissions: string[];
  isSuperAdmin: boolean;
  type: 'admin_access' | 'admin_refresh';
}

interface LoginResult {
  admin: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    permissions: string[];
    isSuperAdmin: boolean;
  };
  accessToken: string;
  refreshToken: string;
}

interface AdminAuditPayload {
  adminId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

export class AdminAuthService {
  /**
   * Inicia sesion de administrador
   */
  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const admin = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!admin) {
      throw { code: 'INVALID_CREDENTIALS', message: 'Credenciales invalidas', status: 401 };
    }

    // Verificar si esta bloqueado
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil(
        (admin.lockedUntil.getTime() - Date.now()) / (1000 * 60)
      );
      throw {
        code: 'ACCOUNT_LOCKED',
        message: `Cuenta bloqueada. Intente nuevamente en ${minutesRemaining} minutos.`,
        status: 403,
      };
    }

    // Verificar si esta activo
    if (!admin.isActive) {
      throw { code: 'ACCOUNT_INACTIVE', message: 'Cuenta desactivada', status: 403 };
    }

    // Verificar password
    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);

    if (!isPasswordValid) {
      // Incrementar intentos fallidos
      const newFailedAttempts = admin.failedAttempts + 1;
      const updateData: any = { failedAttempts: newFailedAttempts };

      if (newFailedAttempts >= config.admin.maxLoginAttempts) {
        updateData.lockedUntil = new Date(
          Date.now() + config.admin.lockoutDurationMinutes * 60 * 1000
        );
      }

      await prisma.adminUser.update({
        where: { id: admin.id },
        data: updateData,
      });

      // Registrar intento fallido
      await this.logAudit({
        adminId: admin.id,
        action: 'LOGIN_FAILED',
        resource: 'admin_auth',
        details: { attempt: newFailedAttempts },
        ipAddress,
        userAgent,
      });

      throw { code: 'INVALID_CREDENTIALS', message: 'Credenciales invalidas', status: 401 };
    }

    // Login exitoso - resetear intentos
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    // Generar tokens
    const adminSecret = config.jwt.adminSecret || config.jwt.secret;
    const permissions = admin.permissions.length > 0
      ? admin.permissions
      : DEFAULT_PERMISSIONS_BY_ROLE[admin.role as keyof typeof DEFAULT_PERMISSIONS_BY_ROLE] || [];

    const tokenPayload: AdminTokenPayload = {
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
      permissions,
      isSuperAdmin: admin.isSuperAdmin,
      type: 'admin_access',
    };

    const accessToken = jwt.sign(tokenPayload, adminSecret, {
      expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    });

    const refreshTokenPayload: AdminTokenPayload = {
      ...tokenPayload,
      type: 'admin_refresh',
    };

    const refreshToken = jwt.sign(refreshTokenPayload, adminSecret, {
      expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    });

    // Guardar sesion
    await prisma.adminSession.create({
      data: {
        adminId: admin.id,
        refreshToken: hashToken(refreshToken),
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
      },
    });

    // Registrar login exitoso
    await this.logAudit({
      adminId: admin.id,
      action: 'LOGIN_SUCCESS',
      resource: 'admin_auth',
      ipAddress,
      userAgent,
    });

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions,
        isSuperAdmin: admin.isSuperAdmin,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Cierra sesion de administrador
   */
  async logout(refreshToken: string, adminId: string): Promise<void> {
    const session = await prisma.adminSession.findUnique({
      where: { refreshToken: hashToken(refreshToken) },
    });

    if (session && session.adminId === adminId) {
      await prisma.adminSession.delete({
        where: { id: session.id },
      });

      await this.logAudit({
        adminId,
        action: 'LOGOUT',
        resource: 'admin_auth',
      });
    }
  }

  /**
   * Renueva tokens de acceso
   */
  async refreshTokens(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const adminSecret = config.jwt.adminSecret || config.jwt.secret;

    // Verificar token
    let payload: AdminTokenPayload;
    try {
      payload = jwt.verify(refreshToken, adminSecret) as AdminTokenPayload;
    } catch (error) {
      throw { code: 'INVALID_TOKEN', message: 'Token invalido', status: 401 };
    }

    if (payload.type !== 'admin_refresh') {
      throw { code: 'INVALID_TOKEN_TYPE', message: 'Token invalido', status: 401 };
    }

    // Verificar sesion existe
    const session = await prisma.adminSession.findUnique({
      where: { refreshToken: hashToken(refreshToken) },
      include: { admin: true },
    });

    if (!session) {
      throw { code: 'SESSION_NOT_FOUND', message: 'Sesion no encontrada', status: 401 };
    }

    if (session.expiresAt < new Date()) {
      await prisma.adminSession.delete({ where: { id: session.id } });
      throw { code: 'SESSION_EXPIRED', message: 'Sesion expirada', status: 401 };
    }

    // Verificar admin esta activo
    if (!session.admin.isActive) {
      throw { code: 'ACCOUNT_INACTIVE', message: 'Cuenta desactivada', status: 403 };
    }

    // Generar nuevos tokens
    const permissions = session.admin.permissions.length > 0
      ? session.admin.permissions
      : DEFAULT_PERMISSIONS_BY_ROLE[session.admin.role as keyof typeof DEFAULT_PERMISSIONS_BY_ROLE] || [];

    const newAccessPayload: AdminTokenPayload = {
      adminId: session.admin.id,
      email: session.admin.email,
      role: session.admin.role,
      permissions,
      isSuperAdmin: session.admin.isSuperAdmin,
      type: 'admin_access',
    };

    const newAccessToken = jwt.sign(newAccessPayload, adminSecret, {
      expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    });

    const newRefreshPayload: AdminTokenPayload = {
      ...newAccessPayload,
      type: 'admin_refresh',
    };

    const newRefreshToken = jwt.sign(newRefreshPayload, adminSecret, {
      expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    });

    // Actualizar sesion con nuevo refresh token
    await prisma.adminSession.update({
      where: { id: session.id },
      data: {
        refreshToken: hashToken(newRefreshToken),
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Obtiene informacion del admin actual
   */
  async getMe(adminId: string) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isSuperAdmin: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
      },
    });

    if (!admin) {
      throw { code: 'ADMIN_NOT_FOUND', message: 'Administrador no encontrado', status: 404 };
    }

    const permissions = admin.permissions.length > 0
      ? admin.permissions
      : DEFAULT_PERMISSIONS_BY_ROLE[admin.role as keyof typeof DEFAULT_PERMISSIONS_BY_ROLE] || [];

    return {
      ...admin,
      permissions,
    };
  }

  /**
   * Cambia la contrasena del admin
   */
  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress?: string
  ): Promise<void> {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw { code: 'ADMIN_NOT_FOUND', message: 'Administrador no encontrado', status: 404 };
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isPasswordValid) {
      throw { code: 'INVALID_PASSWORD', message: 'Contrasena actual incorrecta', status: 400 };
    }

    // Validar nueva contrasena — requisitos estrictos para admin
    const adminPasswordError = this.validateAdminPassword(newPassword);
    if (adminPasswordError) {
      throw { code: 'WEAK_PASSWORD', message: adminPasswordError, status: 400 };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.adminUser.update({
      where: { id: adminId },
      data: { passwordHash },
    });

    // Invalidar todas las sesiones excepto la actual
    await prisma.adminSession.deleteMany({
      where: { adminId },
    });

    await this.logAudit({
      adminId,
      action: 'PASSWORD_CHANGED',
      resource: 'admin_auth',
      ipAddress,
    });
  }

  /**
   * Registra una accion de auditoria
   */
  async logAudit(payload: AdminAuditPayload): Promise<void> {
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminId: payload.adminId,
          action: payload.action,
          resource: payload.resource,
          resourceId: payload.resourceId,
          details: payload.details,
          ipAddress: payload.ipAddress,
          userAgent: payload.userAgent,
        },
      });
    } catch (error) {
      logger.error('Error logging admin audit:', error);
    }
  }

  /**
   * Valida contraseña de administrador (requisitos más estrictos)
   * Mínimo 12 caracteres + mayúscula + minúscula + número + carácter especial
   */
  private validateAdminPassword(password: string): string | null {
    const errors: string[] = [];
    if (password.length < 12) errors.push('mínimo 12 caracteres');
    if (!/[A-Z]/.test(password)) errors.push('al menos una mayúscula');
    if (!/[a-z]/.test(password)) errors.push('al menos una minúscula');
    if (!/[0-9]/.test(password)) errors.push('al menos un número');
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~`]/.test(password)) errors.push('al menos un carácter especial');
    return errors.length > 0 ? `Contraseña de admin debe tener: ${errors.join(', ')}` : null;
  }

  /**
   * Crea un nuevo administrador (solo super admin)
   */
  async createAdmin(
    creatorId: string,
    data: {
      email: string;
      password: string;
      name: string;
      role: AdminRole;
      permissions?: string[];
      isSuperAdmin?: boolean;
    },
    ipAddress?: string
  ) {
    // Verificar que el email no existe
    const existing = await prisma.adminUser.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existing) {
      throw { code: 'EMAIL_EXISTS', message: 'El email ya esta registrado', status: 400 };
    }

    // Validar contraseña de admin
    const passwordError = this.validateAdminPassword(data.password);
    if (passwordError) {
      throw { code: 'WEAK_PASSWORD', message: passwordError, status: 400 };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const admin = await prisma.adminUser.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        name: data.name,
        role: data.role,
        permissions: data.permissions || [],
        isSuperAdmin: data.isSuperAdmin || false,
        createdBy: creatorId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isSuperAdmin: true,
        isActive: true,
        createdAt: true,
      },
    });

    await this.logAudit({
      adminId: creatorId,
      action: 'CREATE_ADMIN',
      resource: 'admins',
      resourceId: admin.id,
      details: { email: admin.email, role: admin.role },
      ipAddress,
    });

    return admin;
  }

  /**
   * Lista todos los administradores
   */
  async listAdmins(requesterId: string) {
    const admins = await prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isSuperAdmin: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.logAudit({
      adminId: requesterId,
      action: 'LIST_ADMINS',
      resource: 'admins',
    });

    return admins;
  }

  /**
   * Actualiza un administrador
   */
  async updateAdmin(
    requesterId: string,
    adminId: string,
    data: {
      name?: string;
      role?: AdminRole;
      permissions?: string[];
      isActive?: boolean;
    },
    ipAddress?: string
  ) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw { code: 'ADMIN_NOT_FOUND', message: 'Administrador no encontrado', status: 404 };
    }

    // No se puede modificar un super admin a menos que seas super admin
    if (admin.isSuperAdmin) {
      throw { code: 'CANNOT_MODIFY_SUPERADMIN', message: 'No se puede modificar un Super Admin', status: 403 };
    }

    const updated = await prisma.adminUser.update({
      where: { id: adminId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isSuperAdmin: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await this.logAudit({
      adminId: requesterId,
      action: 'UPDATE_ADMIN',
      resource: 'admins',
      resourceId: adminId,
      details: data,
      ipAddress,
    });

    return updated;
  }
}

export const adminAuthService = new AdminAuthService();
