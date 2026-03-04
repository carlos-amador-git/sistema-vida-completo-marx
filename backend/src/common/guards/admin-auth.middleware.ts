// src/common/guards/admin-auth.middleware.ts
import { logger } from '../services/logger.service';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config';
import { getAdminAccessToken } from '../utils/auth-cookies';

import { prisma } from '../prisma';

// Extender tipos de Express
declare global {
  namespace Express {
    interface Request {
      adminId?: string;
      adminEmail?: string;
      adminRole?: string;
      adminPermissions?: string[];
      isSuperAdmin?: boolean;
    }
  }
}

interface AdminTokenPayload {
  adminId: string;
  email: string;
  role: string;
  permissions: string[];
  isSuperAdmin: boolean;
  type: 'admin_access' | 'admin_refresh';
}

/**
 * Middleware para autenticacion de administradores
 * Verifica el token JWT admin y agrega datos al request
 */
export const adminAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Read access token from httpOnly cookie; fall back to Authorization header for backward compatibility
    const cookieToken = getAdminAccessToken(req);
    const authHeader = req.headers.authorization;
    let token: string | undefined = cookieToken;

    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_ADMIN_TOKEN',
          message: 'Token de administrador requerido',
        },
      });
    }

    // Verificar token con secret de admin
    const adminSecret = config.jwt.adminSecret || config.jwt.secret;
    const payload = jwt.verify(token, adminSecret) as AdminTokenPayload;

    if (payload.type !== 'admin_access') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN_TYPE',
          message: 'Token invalido para administrador',
        },
      });
    }

    // Verificar que el admin existe y esta activo
    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.adminId },
      select: {
        id: true,
        email: true,
        role: true,
        permissions: true,
        isActive: true,
        isSuperAdmin: true,
        lockedUntil: true,
      },
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'ADMIN_NOT_FOUND',
          message: 'Administrador no encontrado',
        },
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ADMIN_INACTIVE',
          message: 'Cuenta de administrador desactivada',
        },
      });
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ADMIN_LOCKED',
          message: 'Cuenta bloqueada temporalmente. Intente mas tarde.',
        },
      });
    }

    // Agregar datos al request
    req.adminId = admin.id;
    req.adminEmail = admin.email;
    req.adminRole = admin.role;
    req.adminPermissions = admin.permissions;
    req.isSuperAdmin = admin.isSuperAdmin;

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Sesion expirada. Inicie sesion nuevamente.',
        },
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token invalido',
        },
      });
    }

    logger.error('Error en admin auth middleware:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Error de autenticacion',
      },
    });
  }
};

export default adminAuthMiddleware;
