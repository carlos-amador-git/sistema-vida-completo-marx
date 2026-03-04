// src/common/guards/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { authService, AuthError } from '../../modules/auth/auth.service';
import i18next from '../i18n/config';

// Extender el tipo Request para incluir userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/**
 * Middleware de autenticación
 * Verifica el token JWT y añade userId al request
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check cookie first, then fall back to Authorization header
    let token = req.cookies?.accessToken;

    if (!token) {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'NO_TOKEN',
            message: (req as any).t?.('api:generic.tokenNotProvided') || i18next.t('api:generic.tokenNotProvided'),
          },
        });
      }

      // Formato esperado: "Bearer <token>"
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN_FORMAT',
            message: (req as any).t?.('api:generic.invalidTokenFormat') || i18next.t('api:generic.invalidTokenFormat'),
          },
        });
      }

      token = parts[1];
    }

    const payload = authService.verifyAccessToken(token);

    req.userId = payload.userId;
    req.userEmail = payload.email;

    next();
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: (req as any).t?.('api:generic.notAuthorized') || i18next.t('api:generic.notAuthorized'),
      },
    });
  }
};

/**
 * Middleware opcional de autenticación
 * No falla si no hay token, pero si hay uno válido, añade userId
 */
export const optionalAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check cookie first, then fall back to Authorization header
    let token = req.cookies?.accessToken;

    if (!token) {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return next();
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return next();
      }

      token = parts[1];
    }

    const payload = authService.verifyAccessToken(token);

    req.userId = payload.userId;
    req.userEmail = payload.email;

    next();
  } catch (error) {
    // En caso de error, simplemente continuar sin autenticación
    next();
  }
};
