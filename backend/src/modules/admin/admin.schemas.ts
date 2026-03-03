// src/modules/admin/admin.schemas.ts
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// ==================== ZOD VALIDATION MIDDLEWARE ====================

export function zodValidate(schema: z.ZodSchema, source: 'body' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === 'body' ? req.body : req.query);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos de entrada inválidos',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    // Replace with parsed (and coerced) data
    if (source === 'body') {
      req.body = result.data;
    }

    next();
  };
}

// ==================== AUTH SCHEMAS ====================

export const adminLoginSchema = z.object({
  email: z.string().email('Email inválido').transform((v) => v.toLowerCase()),
  password: z.string().min(1, 'Contraseña requerida'),
});

export const adminMFAVerifySchema = z.object({
  mfaToken: z.string().min(1, 'Token MFA requerido'),
  code: z.string().min(1, 'Código MFA requerido'),
});

export const adminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida'),
  newPassword: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'La contraseña debe contener mayúsculas, minúsculas y números'
    ),
});

export const createAdminSchema = z.object({
  email: z.string().email('Email inválido').transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'La contraseña debe contener mayúsculas, minúsculas y números'
    ),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'VIEWER', 'SUPPORT']),
  permissions: z.array(z.string()).optional(),
  isSuperAdmin: z.boolean().optional(),
});

export const updateAdminSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'VIEWER', 'SUPPORT']).optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ==================== USER MANAGEMENT SCHEMAS ====================

export const updateUserStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive es requerido' }),
  reason: z.string().max(500).optional(),
});

export const forceLogoutSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ==================== INSTITUTION SCHEMAS ====================

export const createInstitutionSchema = z.object({
  name: z.string().min(2, 'Nombre requerido').max(200),
  type: z.enum([
    'HOSPITAL',
    'CLINICA',
    'CONSULTORIO',
    'LABORATORIO',
    'FARMACIA',
    'CENTRO_SALUD',
    'OTRO',
  ]),
  clues: z.string().max(20).optional(),
  state: z.string().min(2).max(50).optional(),
  city: z.string().min(2).max(100).optional(),
  address: z.string().max(300).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  hasEmergency: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const updateInstitutionSchema = createInstitutionSchema.partial();

export const verifyInstitutionSchema = z.object({
  verified: z.boolean({ required_error: 'verified es requerido' }),
});

// ==================== INSURANCE SCHEMAS ====================

export const createInsuranceSchema = z.object({
  name: z.string().min(2, 'Nombre requerido').max(200),
  type: z.string().min(1).max(50).optional(),
  rfc: z.string().max(13).optional(),
  state: z.string().max(50).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  hasNationalCoverage: z.boolean().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
});

export const updateInsuranceSchema = createInsuranceSchema.partial();

export const verifyInsuranceSchema = z.object({
  verified: z.boolean({ required_error: 'verified es requerido' }),
});

export const toggleInsuranceStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive es requerido' }),
});

export const insurancePlanSchema = z.object({
  name: z.string().min(1, 'Nombre del plan requerido').max(200),
  description: z.string().max(500).optional(),
  coverageLevel: z.string().max(50).optional(),
  monthlyPremium: z.number().min(0).optional(),
  annualPremium: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

// ==================== AUDIT SCHEMAS ====================

export const auditExportQuerySchema = z.object({
  type: z.enum(['user', 'admin', 'emergency'], {
    required_error: 'Tipo requerido',
    invalid_type_error: 'Tipo inválido. Use: user, admin, emergency',
  }),
  format: z.enum(['csv', 'json']).default('csv'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ==================== HEALTH SCHEMAS ====================

export const cleanupSchema = z.object({
  dryRun: z.boolean().default(true),
});

// ==================== MFA SCHEMAS ====================

export const mfaCodeSchema = z.object({
  code: z.string().min(1, 'Código requerido'),
});
