// src/modules/admin/admin.controller.ts
import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../../common/guards/admin-auth.middleware';
import { requirePermission, requireSuperAdmin, ADMIN_PERMISSIONS } from '../../common/guards/admin-roles.guard';
import { adminMetricsService } from './admin-metrics.service';
import { adminUsersService } from './admin-users.service';
import { adminAuditService } from './admin-audit.service';
import { adminHealthService } from './admin-health.service';
import { adminInstitutionsService } from './admin-institutions.service';
import { adminInsuranceService } from './admin-insurance.service';
import { logger } from '../../common/services/logger.service';
import {
  zodValidate,
  updateUserStatusSchema,
  forceLogoutSchema,
  createInstitutionSchema,
  updateInstitutionSchema,
  verifyInstitutionSchema,
  createInsuranceSchema,
  updateInsuranceSchema,
  verifyInsuranceSchema,
  toggleInsuranceStatusSchema,
  insurancePlanSchema,
  auditExportQuerySchema,
  cleanupSchema,
} from './admin.schemas';

const router = Router();

// Todas las rutas requieren autenticacion de admin
router.use(adminAuthMiddleware);

// ==================== METRICAS ====================

/**
 * GET /api/v1/admin/metrics/overview
 * Dashboard principal con metricas generales
 */
router.get('/metrics/overview',
  requirePermission(ADMIN_PERMISSIONS.METRICS_READ),
  async (req: Request, res: Response) => {
    try {
      const metrics = await adminMetricsService.getOverview();
      res.json({ success: true, data: metrics });
    } catch (error: any) {
      logger.error('Error getting metrics overview:', error);
      res.status(500).json({
        success: false,
        error: { code: 'METRICS_ERROR', message: error.message || 'Error al obtener metricas' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/metrics/users
 * Metricas detalladas de usuarios
 */
router.get('/metrics/users',
  requirePermission(ADMIN_PERMISSIONS.METRICS_READ),
  async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as 'day' | 'week' | 'month' | 'year') || 'month';
      const metrics = await adminMetricsService.getUserMetrics(period);
      res.json({ success: true, data: metrics });
    } catch (error: any) {
      logger.error('Error getting user metrics:', error);
      res.status(500).json({
        success: false,
        error: { code: 'METRICS_ERROR', message: error.message || 'Error al obtener metricas de usuarios' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/metrics/emergency
 * Metricas de accesos de emergencia
 */
router.get('/metrics/emergency',
  requirePermission(ADMIN_PERMISSIONS.METRICS_READ),
  async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as 'day' | 'week' | 'month') || 'week';
      const metrics = await adminMetricsService.getEmergencyMetrics(period);
      res.json({ success: true, data: metrics });
    } catch (error: any) {
      logger.error('Error getting emergency metrics:', error);
      res.status(500).json({
        success: false,
        error: { code: 'METRICS_ERROR', message: error.message || 'Error al obtener metricas de emergencia' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/metrics/directives
 * Metricas de directivas
 */
router.get('/metrics/directives',
  requirePermission(ADMIN_PERMISSIONS.METRICS_READ),
  async (req: Request, res: Response) => {
    try {
      const metrics = await adminMetricsService.getDirectiveMetrics();
      res.json({ success: true, data: metrics });
    } catch (error: any) {
      logger.error('Error getting directive metrics:', error);
      res.status(500).json({
        success: false,
        error: { code: 'METRICS_ERROR', message: error.message || 'Error al obtener metricas de directivas' },
      });
    }
  }
);

// ==================== USUARIOS ====================

/**
 * GET /api/v1/admin/users
 * Lista usuarios con paginacion y filtros
 */
router.get('/users',
  requirePermission(ADMIN_PERMISSIONS.USERS_READ),
  async (req: Request, res: Response) => {
    try {
      const {
        page,
        limit,
        search,
        isActive,
        isVerified,
        sortBy,
        sortOrder,
      } = req.query;

      const result = await adminUsersService.listUsers({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        search: search as string,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
      }, req.adminId!);

      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error listing users:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al listar usuarios' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/users/:id
 * Detalle de un usuario
 */
router.get('/users/:id',
  requirePermission(ADMIN_PERMISSIONS.USERS_READ),
  async (req: Request, res: Response) => {
    try {
      const user = await adminUsersService.getUserDetail(req.params.id, req.adminId!);
      res.json({ success: true, data: user });
    } catch (error: any) {
      logger.error('Error getting user detail:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al obtener usuario' },
      });
    }
  }
);

/**
 * PUT /api/v1/admin/users/:id/status
 * Activar/desactivar usuario
 */
router.put('/users/:id/status',
  requirePermission(ADMIN_PERMISSIONS.USERS_WRITE),
  zodValidate(updateUserStatusSchema),
  async (req: Request, res: Response) => {
    try {
      const { isActive, reason } = req.body;

      const user = await adminUsersService.updateUserStatus(
        req.params.id,
        isActive,
        req.adminId!,
        reason
      );

      res.json({ success: true, data: user });
    } catch (error: any) {
      logger.error('Error updating user status:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al actualizar usuario' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/users/:id/activity
 * Actividad de un usuario
 */
router.get('/users/:id/activity',
  requirePermission(ADMIN_PERMISSIONS.USERS_READ),
  async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const activity = await adminUsersService.getUserActivity(req.params.id, req.adminId!, limit);
      res.json({ success: true, data: activity });
    } catch (error: any) {
      logger.error('Error getting user activity:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al obtener actividad' },
      });
    }
  }
);

/**
 * POST /api/v1/admin/users/:id/force-logout
 * Forzar cierre de sesiones
 */
router.post('/users/:id/force-logout',
  requirePermission(ADMIN_PERMISSIONS.USERS_WRITE),
  zodValidate(forceLogoutSchema),
  async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const result = await adminUsersService.forceLogout(req.params.id, req.adminId!, reason);
      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error forcing logout:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al forzar logout' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/users/:id/stats
 * Estadisticas de un usuario
 */
router.get('/users/:id/stats',
  requirePermission(ADMIN_PERMISSIONS.USERS_READ),
  async (req: Request, res: Response) => {
    try {
      const stats = await adminUsersService.getUserStats(req.params.id, req.adminId!);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      logger.error('Error getting user stats:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al obtener estadisticas' },
      });
    }
  }
);

// ==================== AUDITORIA ====================

/**
 * GET /api/v1/admin/audit
 * Lista logs de auditoria
 */
router.get('/audit',
  requirePermission(ADMIN_PERMISSIONS.AUDIT_READ),
  async (req: Request, res: Response) => {
    try {
      const {
        page,
        limit,
        userId,
        action,
        resource,
        startDate,
        endDate,
        sortOrder,
      } = req.query;

      const result = await adminAuditService.listUserAuditLogs({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        userId: userId as string,
        action: action as string,
        resource: resource as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        sortOrder: sortOrder as any,
      }, req.adminId!);

      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error listing audit logs:', error);
      res.status(500).json({
        success: false,
        error: { code: 'AUDIT_ERROR', message: error.message || 'Error al listar logs' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/audit/admin
 * Lista logs de auditoria de administradores
 */
router.get('/audit/admin',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        page,
        limit,
        adminId,
        action,
        resource,
        startDate,
        endDate,
        sortOrder,
      } = req.query;

      const result = await adminAuditService.listAdminAuditLogs({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        adminId: adminId as string,
        action: action as string,
        resource: resource as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        sortOrder: sortOrder as any,
      }, req.adminId!);

      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error listing admin audit logs:', error);
      res.status(500).json({
        success: false,
        error: { code: 'AUDIT_ERROR', message: error.message || 'Error al listar logs de admin' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/audit/emergency
 * Lista accesos de emergencia
 */
router.get('/audit/emergency',
  requirePermission(ADMIN_PERMISSIONS.AUDIT_READ),
  async (req: Request, res: Response) => {
    try {
      const { page, limit, patientId, institutionId, startDate, endDate } = req.query;

      const result = await adminAuditService.listEmergencyAccesses({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        patientId: patientId as string,
        institutionId: institutionId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      }, req.adminId!);

      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error listing emergency accesses:', error);
      res.status(500).json({
        success: false,
        error: { code: 'AUDIT_ERROR', message: error.message || 'Error al listar accesos de emergencia' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/audit/panic-alerts
 * Lista alertas de panico
 */
router.get('/audit/panic-alerts',
  requirePermission(ADMIN_PERMISSIONS.AUDIT_READ),
  async (req: Request, res: Response) => {
    try {
      const { page, limit, userId, status, startDate, endDate } = req.query;

      const result = await adminAuditService.listPanicAlerts({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        userId: userId as string,
        status: status as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      }, req.adminId!);

      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error listing panic alerts:', error);
      res.status(500).json({
        success: false,
        error: { code: 'AUDIT_ERROR', message: error.message || 'Error al listar alertas' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/audit/export
 * Exporta logs de auditoria
 */
router.get('/audit/export',
  requirePermission(ADMIN_PERMISSIONS.AUDIT_EXPORT),
  zodValidate(auditExportQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    try {
      const { type, startDate, endDate, format } = req.query as { type: string; startDate?: string; endDate?: string; format?: string };

      const result = await adminAuditService.exportAuditLogs({
        type: type as 'user' | 'admin' | 'emergency',
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        format: (format as 'csv' | 'json') || 'csv',
      }, req.adminId!);

      if (result.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=audit_${type}_${Date.now()}.csv`);
        res.send(result.data);
      } else {
        res.json({ success: true, data: result.data });
      }
    } catch (error: any) {
      logger.error('Error exporting audit logs:', error);
      res.status(500).json({
        success: false,
        error: { code: 'EXPORT_ERROR', message: error.message || 'Error al exportar' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/audit/stats
 * Estadisticas de auditoria
 */
router.get('/audit/stats',
  requirePermission(ADMIN_PERMISSIONS.AUDIT_READ),
  async (req: Request, res: Response) => {
    try {
      const stats = await adminAuditService.getAuditStats(req.adminId!);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      logger.error('Error getting audit stats:', error);
      res.status(500).json({
        success: false,
        error: { code: 'AUDIT_ERROR', message: error.message || 'Error al obtener estadisticas' },
      });
    }
  }
);

// ==================== INSTITUCIONES ====================

/**
 * GET /api/v1/admin/institutions
 * Lista instituciones
 */
router.get('/institutions',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_READ),
  async (req: Request, res: Response) => {
    try {
      const {
        page,
        limit,
        search,
        type,
        state,
        isVerified,
        hasEmergency,
        sortBy,
        sortOrder,
      } = req.query;

      const result = await adminInstitutionsService.listInstitutions({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        search: search as string,
        type: type as any,
        state: state as string,
        isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
        hasEmergency: hasEmergency !== undefined ? hasEmergency === 'true' : undefined,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
      }, req.adminId!);

      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error listing institutions:', error);
      res.status(500).json({
        success: false,
        error: { code: 'ERROR', message: error.message || 'Error al listar instituciones' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/institutions/stats
 * Estadisticas de instituciones
 */
router.get('/institutions/stats',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_READ),
  async (req: Request, res: Response) => {
    try {
      const stats = await adminInstitutionsService.getInstitutionStats(req.adminId!);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      logger.error('Error getting institution stats:', error);
      res.status(500).json({
        success: false,
        error: { code: 'ERROR', message: error.message || 'Error al obtener estadisticas' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/institutions/:id
 * Detalle de una institucion
 */
router.get('/institutions/:id',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_READ),
  async (req: Request, res: Response) => {
    try {
      const institution = await adminInstitutionsService.getInstitutionDetail(req.params.id, req.adminId!);
      res.json({ success: true, data: institution });
    } catch (error: any) {
      logger.error('Error getting institution detail:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al obtener institucion' },
      });
    }
  }
);

/**
 * POST /api/v1/admin/institutions
 * Crea una nueva institucion
 */
router.post('/institutions',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  zodValidate(createInstitutionSchema),
  async (req: Request, res: Response) => {
    try {
      const institution = await adminInstitutionsService.createInstitution(req.body, req.adminId!);
      res.status(201).json({ success: true, data: institution });
    } catch (error: any) {
      logger.error('Error creating institution:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al crear institucion' },
      });
    }
  }
);

/**
 * PUT /api/v1/admin/institutions/:id
 * Actualiza una institucion
 */
router.put('/institutions/:id',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  zodValidate(updateInstitutionSchema),
  async (req: Request, res: Response) => {
    try {
      const institution = await adminInstitutionsService.updateInstitution(
        req.params.id,
        req.body,
        req.adminId!
      );
      res.json({ success: true, data: institution });
    } catch (error: any) {
      logger.error('Error updating institution:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al actualizar institucion' },
      });
    }
  }
);

/**
 * PUT /api/v1/admin/institutions/:id/verify
 * Verifica/desverifica una institucion
 */
router.put('/institutions/:id/verify',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  zodValidate(verifyInstitutionSchema),
  async (req: Request, res: Response) => {
    try {
      const { verified } = req.body;

      const institution = await adminInstitutionsService.verifyInstitution(
        req.params.id,
        verified,
        req.adminId!
      );
      res.json({ success: true, data: institution });
    } catch (error: any) {
      logger.error('Error verifying institution:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al verificar institucion' },
      });
    }
  }
);

/**
 * POST /api/v1/admin/institutions/:id/oauth-credentials
 * Genera credenciales OAuth para una institucion
 */
router.post('/institutions/:id/oauth-credentials',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const credentials = await adminInstitutionsService.generateOAuthCredentials(
        req.params.id,
        req.adminId!
      );
      res.json({ success: true, data: credentials });
    } catch (error: any) {
      logger.error('Error generating OAuth credentials:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al generar credenciales' },
      });
    }
  }
);

// ==================== ASEGURADORAS ====================

/**
 * GET /api/v1/admin/insurance
 * Lista aseguradoras con paginacion y filtros
 */
router.get('/insurance',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_READ),
  async (req: Request, res: Response) => {
    try {
      const {
        page,
        limit,
        search,
        type,
        state,
        isVerified,
        hasNationalCoverage,
        sortBy,
        sortOrder,
      } = req.query;

      const result = await adminInsuranceService.listInsurance(req.adminId!, {
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        search: search as string,
        type: type as any,
        state: state as string,
        isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
        hasNationalCoverage: hasNationalCoverage !== undefined ? hasNationalCoverage === 'true' : undefined,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error listing insurance:', error);
      res.status(500).json({
        success: false,
        error: { code: 'ERROR', message: error.message || 'Error al listar aseguradoras' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/insurance/stats
 * Estadisticas de aseguradoras
 */
router.get('/insurance/stats',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_READ),
  async (req: Request, res: Response) => {
    try {
      const stats = await adminInsuranceService.getInsuranceStats(req.adminId!);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      logger.error('Error getting insurance stats:', error);
      res.status(500).json({
        success: false,
        error: { code: 'ERROR', message: error.message || 'Error al obtener estadisticas' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/insurance/:id
 * Detalle de una aseguradora
 */
router.get('/insurance/:id',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_READ),
  async (req: Request, res: Response) => {
    try {
      const insurance = await adminInsuranceService.getInsuranceDetail(req.adminId!, req.params.id);
      res.json({ success: true, data: insurance });
    } catch (error: any) {
      logger.error('Error getting insurance detail:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al obtener aseguradora' },
      });
    }
  }
);

/**
 * POST /api/v1/admin/insurance
 * Crea una nueva aseguradora
 */
router.post('/insurance',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  zodValidate(createInsuranceSchema),
  async (req: Request, res: Response) => {
    try {
      const insurance = await adminInsuranceService.createInsurance(req.adminId!, req.body);
      res.status(201).json({ success: true, data: insurance });
    } catch (error: any) {
      logger.error('Error creating insurance:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al crear aseguradora' },
      });
    }
  }
);

/**
 * PUT /api/v1/admin/insurance/:id
 * Actualiza una aseguradora
 */
router.put('/insurance/:id',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  zodValidate(updateInsuranceSchema),
  async (req: Request, res: Response) => {
    try {
      const insurance = await adminInsuranceService.updateInsurance(req.adminId!, req.params.id, req.body);
      res.json({ success: true, data: insurance });
    } catch (error: any) {
      logger.error('Error updating insurance:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al actualizar aseguradora' },
      });
    }
  }
);

/**
 * PUT /api/v1/admin/insurance/:id/verify
 * Verifica/desverifica una aseguradora
 */
router.put('/insurance/:id/verify',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  zodValidate(verifyInsuranceSchema),
  async (req: Request, res: Response) => {
    try {
      const { verified } = req.body;

      const insurance = await adminInsuranceService.verifyInsurance(req.adminId!, req.params.id, verified);
      res.json({ success: true, data: insurance });
    } catch (error: any) {
      logger.error('Error verifying insurance:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al verificar aseguradora' },
      });
    }
  }
);

/**
 * PUT /api/v1/admin/insurance/:id/status
 * Activa/desactiva una aseguradora
 */
router.put('/insurance/:id/status',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  zodValidate(toggleInsuranceStatusSchema),
  async (req: Request, res: Response) => {
    try {
      const { isActive } = req.body;

      const insurance = await adminInsuranceService.toggleInsuranceStatus(req.adminId!, req.params.id, isActive);
      res.json({ success: true, data: insurance });
    } catch (error: any) {
      logger.error('Error toggling insurance status:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al cambiar estado' },
      });
    }
  }
);

/**
 * POST /api/v1/admin/insurance/:id/plans
 * Agrega un plan a una aseguradora
 */
router.post('/insurance/:id/plans',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  zodValidate(insurancePlanSchema),
  async (req: Request, res: Response) => {
    try {
      const plan = await adminInsuranceService.addPlan(req.adminId!, req.params.id, req.body);
      res.status(201).json({ success: true, data: plan });
    } catch (error: any) {
      logger.error('Error adding plan:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al agregar plan' },
      });
    }
  }
);

/**
 * PUT /api/v1/admin/insurance/plans/:planId
 * Actualiza un plan
 */
router.put('/insurance/plans/:planId',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  zodValidate(insurancePlanSchema.partial()),
  async (req: Request, res: Response) => {
    try {
      const plan = await adminInsuranceService.updatePlan(req.adminId!, req.params.planId, req.body);
      res.json({ success: true, data: plan });
    } catch (error: any) {
      logger.error('Error updating plan:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al actualizar plan' },
      });
    }
  }
);

/**
 * DELETE /api/v1/admin/insurance/plans/:planId
 * Elimina un plan
 */
router.delete('/insurance/plans/:planId',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  async (req: Request, res: Response) => {
    try {
      await adminInsuranceService.deletePlan(req.adminId!, req.params.planId);
      res.json({ success: true, data: { deleted: true } });
    } catch (error: any) {
      logger.error('Error deleting plan:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al eliminar plan' },
      });
    }
  }
);

/**
 * POST /api/v1/admin/insurance/:id/network/:hospitalId
 * Agrega hospital a la red de aseguradora
 */
router.post('/insurance/:id/network/:hospitalId',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  async (req: Request, res: Response) => {
    try {
      const insurance = await adminInsuranceService.addHospitalToNetwork(
        req.adminId!,
        req.params.id,
        req.params.hospitalId
      );
      res.json({ success: true, data: insurance });
    } catch (error: any) {
      logger.error('Error adding hospital to network:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al agregar hospital' },
      });
    }
  }
);

/**
 * DELETE /api/v1/admin/insurance/:id/network/:hospitalId
 * Quita hospital de la red de aseguradora
 */
router.delete('/insurance/:id/network/:hospitalId',
  requirePermission(ADMIN_PERMISSIONS.INSTITUTIONS_WRITE),
  async (req: Request, res: Response) => {
    try {
      const insurance = await adminInsuranceService.removeHospitalFromNetwork(
        req.adminId!,
        req.params.id,
        req.params.hospitalId
      );
      res.json({ success: true, data: insurance });
    } catch (error: any) {
      logger.error('Error removing hospital from network:', error);
      res.status(error.status || 500).json({
        success: false,
        error: { code: error.code || 'ERROR', message: error.message || 'Error al quitar hospital' },
      });
    }
  }
);

// ==================== SALUD DEL SISTEMA ====================

/**
 * GET /api/v1/admin/health
 * Estado general del sistema
 */
router.get('/health',
  requirePermission(ADMIN_PERMISSIONS.HEALTH_READ),
  async (req: Request, res: Response) => {
    try {
      const health = await adminHealthService.getSystemHealth(req.adminId!);
      res.json({ success: true, data: health });
    } catch (error: any) {
      logger.error('Error getting system health:', error);
      res.status(500).json({
        success: false,
        error: { code: 'HEALTH_ERROR', message: error.message || 'Error al verificar salud' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/health/database
 * Estado de la base de datos
 */
router.get('/health/database',
  requirePermission(ADMIN_PERMISSIONS.HEALTH_READ),
  async (req: Request, res: Response) => {
    try {
      const dbHealth = await adminHealthService.checkDatabase();
      res.json({ success: true, data: dbHealth });
    } catch (error: any) {
      logger.error('Error checking database:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: error.message || 'Error al verificar BD' },
      });
    }
  }
);

/**
 * GET /api/v1/admin/health/performance
 * Metricas de rendimiento
 */
router.get('/health/performance',
  requirePermission(ADMIN_PERMISSIONS.HEALTH_READ),
  async (req: Request, res: Response) => {
    try {
      const performance = await adminHealthService.getPerformanceMetrics(req.adminId!);
      res.json({ success: true, data: performance });
    } catch (error: any) {
      logger.error('Error getting performance metrics:', error);
      res.status(500).json({
        success: false,
        error: { code: 'PERFORMANCE_ERROR', message: error.message || 'Error al obtener metricas' },
      });
    }
  }
);

/**
 * POST /api/v1/admin/health/cleanup
 * Ejecuta limpieza de datos antiguos
 */
router.post('/health/cleanup',
  requireSuperAdmin,
  zodValidate(cleanupSchema),
  async (req: Request, res: Response) => {
    try {
      const { dryRun } = req.body;
      const result = await adminHealthService.runCleanup(req.adminId!, dryRun);
      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Error running cleanup:', error);
      res.status(500).json({
        success: false,
        error: { code: 'CLEANUP_ERROR', message: error.message || 'Error en limpieza' },
      });
    }
  }
);

export default router;
