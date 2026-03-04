// src/modules/auth/auth.service.ts
import { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../../config';
import { generateSecureToken } from '../../common/utils/encryption';
import { encryptionV2 } from '../../common/services/encryption-v2.service';
import { securityMetrics } from '../../common/services/security-metrics.service';
import { emailService } from '../../common/services/email.service';
import { emailTemplates } from '../../common/services/email-templates.service';
import { logger } from '../../common/services/logger.service';
import { curpVerificationService } from '../../common/services/curp-verification.service';
import { keyManagement } from '../../common/services/key-management.service';
import { createHash } from 'crypto';

import { prisma } from '../../common/prisma';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE SEGURIDAD
// ═══════════════════════════════════════════════════════════════════════════

// Máximo de sesiones activas por usuario (las más antiguas se eliminan)
const MAX_SESSIONS_PER_USER = 5;

// Requisitos de contraseña
const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false, // Opcional para mejor UX
};

// Tipos
interface TokenPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface RegisterInput {
  email: string;
  password: string;
  curp: string;
  name: string;
  phone?: string;
  dateOfBirth?: Date;
  sex?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

// Errores personalizados
export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

class AuthService {
  /**
   * Registra un nuevo usuario
   */
  async register(input: RegisterInput): Promise<{ user: User; tokens: AuthTokens }> {
    // Validar fuerza de contraseña
    const passwordError = this.validatePasswordStrength(input.password);
    if (passwordError) {
      throw new AuthError('WEAK_PASSWORD', passwordError);
    }

    // Verificar si el email ya existe
    const existingEmail = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existingEmail) {
      throw new AuthError('EMAIL_EXISTS', 'Este correo electrónico ya está registrado');
    }

    // Verificar si el CURP ya existe
    const existingCurp = await prisma.user.findUnique({
      where: { curp: input.curp.toUpperCase() },
    });
    if (existingCurp) {
      throw new AuthError('CURP_EXISTS', 'Este CURP ya está registrado');
    }

    // Validar y verificar CURP
    const curpValidation = await curpVerificationService.verify(input.curp);
    if (!curpValidation.isValid) {
      throw new AuthError('INVALID_CURP', curpValidation.error || 'El CURP es inválido');
    }

    // Log si fue verificado con API externa
    if (curpValidation.isVerified) {
      logger.info('CURP verificado con RENAPO', {
        curp: curpValidation.curp,
        source: curpValidation.source,
      });
    }

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(input.password, 12);
    
    // Generar token de verificación
    const verificationToken = generateSecureToken(32);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
    
    // Crear usuario (con campos cifrados V2 + blind indexes)
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        curp: input.curp.toUpperCase(),
        name: input.name,
        phone: input.phone,
        dateOfBirth: input.dateOfBirth,
        sex: input.sex?.toUpperCase(),
        // Campos cifrados V2
        nameEnc: encryptionV2.encryptField(input.name),
        phoneEnc: input.phone ? encryptionV2.encryptField(input.phone) : null,
        curpEnc: encryptionV2.encryptField(input.curp.toUpperCase()),
        dateOfBirthEnc: input.dateOfBirth ? encryptionV2.encryptField(input.dateOfBirth.toISOString()) : null,
        // Blind indexes para búsqueda
        emailBlindIndex: encryptionV2.generateBlindIndex(input.email),
        curpBlindIndex: encryptionV2.generateCurpBlindIndex(input.curp),
        verificationToken: hashToken(verificationToken),
        verificationExpires,
        // Crear perfil vacío
        profile: {
          create: {
            qrToken: uuidv4(),
          },
        },
      },
      include: {
        profile: true,
      },
    });
    
    // Provision per-user DEK (envelope encryption)
    keyManagement.provisionUserDEK(user.id).catch(err => {
      logger.error('Error provisioning DEK for user', err, { userId: user.id });
    });

    // Generar tokens
    const tokens = await this.generateTokens(user);

    // Enviar email de verificación
    this.sendVerificationEmail(user, verificationToken).catch(err => {
      logger.error('Error enviando email de verificación', err, { userId: user.id });
    });

    return { user, tokens };
  }
  
  /**
   * Inicia sesión de usuario
   */
  async login(input: LoginInput, ipAddress?: string, userAgent?: string): Promise<{ user: User; tokens: AuthTokens }> {
    const ip = ipAddress || 'unknown';

    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { profile: true },
    });

    if (!user) {
      // Registrar intento fallido
      securityMetrics.recordFailedLogin(ip, input.email, 'USER_NOT_FOUND');
      throw new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    if (!user.isActive) {
      securityMetrics.recordFailedLogin(ip, input.email, 'ACCOUNT_DISABLED');
      throw new AuthError('ACCOUNT_DISABLED', 'Esta cuenta ha sido desactivada');
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      securityMetrics.recordFailedLogin(ip, input.email, 'INVALID_PASSWORD');
      throw new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    // Aplicar límite de sesiones antes de crear nueva
    await this.enforceSessionLimit(user.id);

    // Generar tokens
    const tokens = await this.generateTokens(user);

    // Guardar sesión
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: hashToken(tokens.refreshToken),
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });

    // Actualizar último login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Registrar login exitoso
    securityMetrics.recordSuccessfulLogin(ip, user.id);

    return { user, tokens };
  }
  
  /**
   * Refresca el access token
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    // Verificar el refresh token
    let payload: TokenPayload;
    try {
      payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as TokenPayload;
    } catch (error) {
      throw new AuthError('INVALID_TOKEN', 'Token de refresco inválido');
    }
    
    if (payload.type !== 'refresh') {
      throw new AuthError('INVALID_TOKEN', 'Tipo de token inválido');
    }
    
    // Buscar la sesión
    const session = await prisma.session.findUnique({
      where: { refreshToken: hashToken(refreshToken) },
      include: { user: true },
    });
    
    if (!session || session.expiresAt < new Date()) {
      throw new AuthError('SESSION_EXPIRED', 'La sesión ha expirado');
    }
    
    // Generar nuevos tokens
    const tokens = await this.generateTokens(session.user);
    
    // Actualizar el refresh token en la sesión
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    
    return tokens;
  }
  
  /**
   * Cierra sesión
   */
  async logout(refreshToken: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { refreshToken: hashToken(refreshToken) },
    });
  }
  
  /**
   * Cierra todas las sesiones del usuario
   */
  async logoutAll(userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId },
    });
  }
  
  /**
   * Verifica el email del usuario
   */
  async verifyEmail(token: string): Promise<User> {
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: hashToken(token),
        verificationExpires: { gt: new Date() },
      },
    });
    
    if (!user) {
      throw new AuthError('INVALID_TOKEN', 'Token de verificación inválido o expirado');
    }
    
    return await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationExpires: null,
      },
    });
  }
  
  /**
   * Solicita recuperación de contraseña
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    
    if (!user) {
      // No revelar si el email existe
      return;
    }
    
    const resetToken = generateSecureToken(32);
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: hashToken(resetToken), resetExpires },
    });

    // Enviar email con link de recuperación
    this.sendPasswordResetEmail(user, resetToken).catch(err => {
      logger.error('Error enviando email de recuperación', err, { userId: user.id });
    });
  }
  
  /**
   * Restablece la contraseña
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Validar fuerza de contraseña antes de procesar
    const passwordError = this.validatePasswordStrength(newPassword);
    if (passwordError) {
      throw new AuthError('WEAK_PASSWORD', passwordError);
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashToken(token),
        resetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AuthError('INVALID_TOKEN', 'Token de recuperación inválido o expirado');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetExpires: null,
      },
    });
    
    // Cerrar todas las sesiones
    await this.logoutAll(user.id);
  }
  
  /**
   * Verifica un access token y retorna el payload
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as TokenPayload;
      if (payload.type !== 'access') {
        throw new AuthError('INVALID_TOKEN', 'Tipo de token inválido');
      }
      return payload;
    } catch (error) {
      throw new AuthError('INVALID_TOKEN', 'Token inválido o expirado');
    }
  }
  
  /**
   * Genera par de tokens (access y refresh)
   */
  private async generateTokens(user: User): Promise<AuthTokens> {
    const accessPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      type: 'access',
    };
    
    const refreshPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      type: 'refresh',
    };
    
    const accessToken = jwt.sign(accessPayload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    });
    
    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutos en segundos
    };
  }
  
  /**
   * Valida formato de CURP
   */
  private isValidCURP(curp: string): boolean {
    const curpRegex = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$/;
    return curpRegex.test(curp.toUpperCase());
  }

  /**
   * Valida la fuerza de la contraseña
   * @returns null si es válida, o mensaje de error si no
   */
  validatePasswordStrength(password: string): string | null {
    const errors: string[] = [];

    if (password.length < PASSWORD_REQUIREMENTS.minLength) {
      errors.push(`mínimo ${PASSWORD_REQUIREMENTS.minLength} caracteres`);
    }

    if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('al menos una mayúscula');
    }

    if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('al menos una minúscula');
    }

    if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
      errors.push('al menos un número');
    }

    if (PASSWORD_REQUIREMENTS.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('al menos un carácter especial');
    }

    // Verificar patrones comunes inseguros
    const commonPatterns = [
      /^123456/,
      /^password/i,
      /^qwerty/i,
      /^abc123/i,
      /(.)\1{3,}/, // 4+ caracteres repetidos
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('no usar patrones comunes');
        break;
      }
    }

    if (errors.length > 0) {
      return `La contraseña debe tener: ${errors.join(', ')}`;
    }

    return null;
  }

  /**
   * Limita las sesiones activas por usuario
   * Elimina las más antiguas si excede el límite
   */
  private async enforceSessionLimit(userId: string): Promise<void> {
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (sessions.length >= MAX_SESSIONS_PER_USER) {
      // Eliminar sesiones más antiguas (mantener las más recientes)
      const sessionsToDelete = sessions.slice(MAX_SESSIONS_PER_USER - 1);
      const idsToDelete = sessionsToDelete.map(s => s.id);

      await prisma.session.deleteMany({
        where: { id: { in: idsToDelete } },
      });

      logger.info(
        `[AUTH] Sesiones antiguas eliminadas para usuario ${userId}: ${idsToDelete.length}`
      );
    }
  }

  /**
   * Obtiene las sesiones activas del usuario
   */
  async getActiveSessions(userId: string): Promise<Array<{
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    expiresAt: Date;
    isCurrent?: boolean;
  }>> {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return sessions;
  }

  /**
   * Revoca una sesión específica
   */
  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const result = await prisma.session.deleteMany({
      where: {
        id: sessionId,
        userId, // Solo puede eliminar sus propias sesiones
      },
    });

    return result.count > 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODOS DE EMAIL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Envía email de verificación de cuenta
   */
  private async sendVerificationEmail(user: User, token: string): Promise<void> {
    const verificationUrl = `${config.frontendUrl}/verify-email?token=${token}`;

    const { subject, html } = emailTemplates.emailVerification({
      name: user.name,
      verificationUrl,
      expiresIn: '24 horas',
    });

    const result = await emailService.send({
      to: user.email,
      subject,
      html,
    });

    if (result.success) {
      logger.info('Email de verificación enviado', { userId: user.id, email: user.email });
    } else {
      logger.error('Fallo al enviar email de verificación', null, {
        userId: user.id,
        error: result.error,
      });
    }
  }

  /**
   * Envía email de recuperación de contraseña
   */
  private async sendPasswordResetEmail(user: User, token: string, ipAddress?: string): Promise<void> {
    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;

    const { subject, html } = emailTemplates.passwordReset({
      name: user.name,
      resetUrl,
      expiresIn: '1 hora',
      ipAddress,
    });

    const result = await emailService.send({
      to: user.email,
      subject,
      html,
    });

    if (result.success) {
      logger.info('Email de recuperación enviado', { userId: user.id, email: user.email });
    } else {
      logger.error('Fallo al enviar email de recuperación', null, {
        userId: user.id,
        error: result.error,
      });
    }
  }

  /**
   * Reenvía email de verificación
   */
  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'Usuario no encontrado');
    }

    if (user.isVerified) {
      throw new AuthError('ALREADY_VERIFIED', 'El email ya está verificado');
    }

    // Generar nuevo token
    const verificationToken = generateSecureToken(32);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: { verificationToken: hashToken(verificationToken), verificationExpires },
    });

    await this.sendVerificationEmail(user, verificationToken);
  }
}

export const authService = new AuthService();
export default authService;
