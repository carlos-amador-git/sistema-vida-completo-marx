// src/modules/fhir/fhir.controller.ts
/**
 * FHIR R4 API Controller — HL7-compliant endpoints for VIDA medical data
 *
 * Exposes patient, consent, and audit data as standard FHIR R4 resources
 * to enable interoperability with external health information systems.
 *
 * Content-Type for all FHIR responses: application/fhir+json
 * Base path: /api/v1/fhir
 */
import { Router, Request, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { authMiddleware } from '../../common/guards/auth.middleware';
import { prisma } from '../../common/prisma';
import { fhirMapper } from './fhir-mapper.service';
import { pupService } from '../pup/pup.service';
import { directivesService } from '../directives/directives.service';
import { logger } from '../../common/services/logger.service';

const router = Router();

// ─── Helper: set FHIR content type ────────────────────────────────────────────

const FHIR_CONTENT_TYPE = 'application/fhir+json';

// ─── Helper: check if a user has ADMIN or AUDITOR role via RBAC ───────────────

async function userHasAdminRole(userId: string): Promise<boolean> {
  const userRole = await prisma.userRole.findFirst({
    where: {
      userId,
      role: {
        name: { in: ['ADMIN', 'AUDITOR'] },
      },
    },
    include: { role: true },
  });
  return userRole !== null;
}

// ─── Helper: build an OperationOutcome for FHIR error responses ───────────────

function fhirOperationOutcome(severity: 'error' | 'warning' | 'information', code: string, details: string) {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity,
        code,
        details: { text: details },
      },
    ],
  };
}

// ==================== PUBLIC ENDPOINTS ====================

/**
 * GET /api/v1/fhir/metadata
 * FHIR Capability Statement — public, no auth required
 * Describes what this FHIR server supports per the R4 specification.
 */
router.get('/metadata', (req: Request, res: Response) => {
  const fhirBase = process.env.FHIR_BASE_URL || 'https://vida.mx/fhir';

  const capabilityStatement = {
    resourceType: 'CapabilityStatement',
    id: 'vida-fhir-capability',
    url: `${fhirBase}/metadata`,
    version: '1.0.0',
    name: 'VIDAFHIRCapabilityStatement',
    title: 'VIDA FHIR R4 Capability Statement',
    status: 'active',
    experimental: false,
    date: new Date().toISOString(),
    publisher: 'MD Consultoría TI — Sistema VIDA',
    description: 'Sistema VIDA — Vinculación de Información para Decisiones y Alertas. Implements HL7 FHIR R4 for patient data interoperability.',
    kind: 'instance',
    software: {
      name: 'VIDA Backend',
      version: '1.0.0',
    },
    implementation: {
      description: 'VIDA FHIR R4 Server',
      url: fhirBase,
    },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json'],
    rest: [
      {
        mode: 'server',
        resource: [
          {
            type: 'Patient',
            interaction: [
              { code: 'read' },
            ],
            operation: [
              {
                name: 'everything',
                definition: 'http://hl7.org/fhir/OperationDefinition/Patient-everything',
              },
            ],
          },
          {
            type: 'Consent',
            interaction: [
              { code: 'read' },
            ],
          },
          {
            type: 'AuditEvent',
            interaction: [
              { code: 'search-type' },
            ],
            searchParam: [
              { name: '_count', type: 'number', documentation: 'Page size (max 100)' },
              { name: '_offset', type: 'number', documentation: 'Pagination offset' },
            ],
          },
        ],
      },
    ],
  };

  res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
  res.json(capabilityStatement);
});

// ==================== AUTHENTICATED ENDPOINTS ====================

// All endpoints below require a valid user JWT
router.use(authMiddleware);

// ─── Patient ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/fhir/Patient/:id
 * Returns the user's demographics as a FHIR R4 Patient resource.
 *
 * Authorization: authenticated + (admin role OR requesting own record)
 */
router.get(
  '/Patient/:id',
  param('id').isUUID().withMessage('Patient ID must be a valid UUID'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
        return res.status(400).json(
          fhirOperationOutcome('error', 'invalid', errors.array()[0].msg as string)
        );
      }

      const { id } = req.params;
      const requesterId = req.userId!;

      // Authorization: must be self or have admin/auditor role
      const isSelf = requesterId === id;
      if (!isSelf) {
        const isAdmin = await userHasAdminRole(requesterId);
        if (!isAdmin) {
          res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
          return res.status(403).json(
            fhirOperationOutcome('error', 'forbidden', 'Access denied: you may only retrieve your own Patient resource')
          );
        }
      }

      // Fetch user record
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          curp: true,
          dateOfBirth: true,
          sex: true,
          phone: true,
          updatedAt: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
        return res.status(404).json(
          fhirOperationOutcome('error', 'not-found', `Patient/${id} not found`)
        );
      }

      const fhirPatient = fhirMapper.mapPatient(user);

      res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
      res.json(fhirPatient);
    } catch (error) {
      logger.error('FHIR GET /Patient/:id error:', error);
      res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
      res.status(500).json(
        fhirOperationOutcome('error', 'exception', 'An unexpected error occurred processing the request')
      );
    }
  }
);

/**
 * GET /api/v1/fhir/Patient/:id/$everything
 * Returns a FHIR Bundle containing all clinical data for the patient:
 *   Patient + AllergyIntolerance[] + Condition[] + MedicationStatement[] + Consent + AuditEvent[]
 *
 * Authorization: authenticated + (admin role OR requesting own record)
 */
router.get(
  '/Patient/:id/\\$everything',
  param('id').isUUID().withMessage('Patient ID must be a valid UUID'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
        return res.status(400).json(
          fhirOperationOutcome('error', 'invalid', errors.array()[0].msg as string)
        );
      }

      const { id } = req.params;
      const requesterId = req.userId!;

      // Authorization: must be self or have admin/auditor role
      const isSelf = requesterId === id;
      if (!isSelf) {
        const isAdmin = await userHasAdminRole(requesterId);
        if (!isAdmin) {
          res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
          return res.status(403).json(
            fhirOperationOutcome('error', 'forbidden', 'Access denied: you may only retrieve your own patient data')
          );
        }
      }

      // Fetch user record
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          curp: true,
          dateOfBirth: true,
          sex: true,
          phone: true,
          updatedAt: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
        return res.status(404).json(
          fhirOperationOutcome('error', 'not-found', `Patient/${id} not found`)
        );
      }

      // Fetch medical profile (allergies, conditions, medications)
      const profile = await pupService.getProfile(id);

      // Fetch active advance directive
      const directive = await directivesService.getActiveDirective(id);

      // Fetch recent audit events (last 10) for this patient
      const recentAuditLogs = await prisma.auditLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          userId: true,
          actorType: true,
          actorName: true,
          action: true,
          resource: true,
          resourceId: true,
          ipAddress: true,
          createdAt: true,
        },
      });

      // Build FHIR resources
      const resources: any[] = [];

      // 1. Patient
      resources.push(fhirMapper.mapPatient(user));

      // 2. AllergyIntolerance[]
      if (profile && profile.allergies.length > 0) {
        const allergies = fhirMapper.mapAllergies(id, profile.allergies);
        resources.push(...allergies);
      }

      // 3. Condition[]
      if (profile && profile.conditions.length > 0) {
        const conditions = fhirMapper.mapConditions(id, profile.conditions);
        resources.push(...conditions);
      }

      // 4. MedicationStatement[]
      if (profile && profile.medications.length > 0) {
        const medications = fhirMapper.mapMedications(id, profile.medications);
        resources.push(...medications);
      }

      // 5. Consent (active directive only)
      if (directive) {
        const consent = fhirMapper.mapConsent({
          id: directive.id,
          userId: id,
          type: directive.type,
          status: directive.status,
          acceptsCPR: directive.acceptsCPR,
          acceptsIntubation: directive.acceptsIntubation,
          content: directive.additionalNotes,
          validatedAt: directive.validatedAt,
          updatedAt: directive.updatedAt,
        });
        resources.push(consent);
      }

      // 6. AuditEvent[] (recent)
      const auditEvents = recentAuditLogs.map(log => fhirMapper.mapAuditEvent(log));
      resources.push(...auditEvents);

      // Wrap all resources in a Bundle
      const bundle = fhirMapper.createBundle(resources, 'collection');

      res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
      res.json(bundle);
    } catch (error) {
      logger.error('FHIR GET /Patient/:id/$everything error:', error);
      res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
      res.status(500).json(
        fhirOperationOutcome('error', 'exception', 'An unexpected error occurred processing the request')
      );
    }
  }
);

// ─── Consent ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/fhir/Consent/:directiveId
 * Returns an advance directive as a FHIR R4 Consent resource.
 *
 * Authorization: authenticated + (admin role OR owner of the directive)
 */
router.get(
  '/Consent/:directiveId',
  param('directiveId').isUUID().withMessage('Directive ID must be a valid UUID'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
        return res.status(400).json(
          fhirOperationOutcome('error', 'invalid', errors.array()[0].msg as string)
        );
      }

      const { directiveId } = req.params;
      const requesterId = req.userId!;

      // Fetch the directive from DB (ownership check included)
      const directive = await prisma.advanceDirective.findUnique({
        where: { id: directiveId },
        select: {
          id: true,
          userId: true,
          type: true,
          status: true,
          acceptsCPR: true,
          acceptsIntubation: true,
          additionalNotes: true,
          validatedAt: true,
          updatedAt: true,
        },
      });

      if (!directive) {
        res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
        return res.status(404).json(
          fhirOperationOutcome('error', 'not-found', `Consent/${directiveId} not found`)
        );
      }

      // Authorization: must be owner or admin
      const isOwner = directive.userId === requesterId;
      if (!isOwner) {
        const isAdmin = await userHasAdminRole(requesterId);
        if (!isAdmin) {
          res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
          return res.status(403).json(
            fhirOperationOutcome('error', 'forbidden', 'Access denied: you may only retrieve your own Consent resources')
          );
        }
      }

      const fhirConsent = fhirMapper.mapConsent({
        id: directive.id,
        userId: directive.userId,
        type: directive.type,
        status: directive.status,
        acceptsCPR: directive.acceptsCPR,
        acceptsIntubation: directive.acceptsIntubation,
        content: directive.additionalNotes,
        validatedAt: directive.validatedAt,
        updatedAt: directive.updatedAt,
      });

      res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
      res.json(fhirConsent);
    } catch (error) {
      logger.error('FHIR GET /Consent/:directiveId error:', error);
      res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
      res.status(500).json(
        fhirOperationOutcome('error', 'exception', 'An unexpected error occurred processing the request')
      );
    }
  }
);

// ─── AuditEvent ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/fhir/AuditEvent
 * Returns audit logs as a searchset FHIR Bundle.
 *
 * Authorization: authenticated + ADMIN or AUDITOR role only
 *
 * Query params:
 *   _count  — page size (default: 20, max: 100)
 *   _offset — pagination offset (default: 0)
 */
router.get(
  '/AuditEvent',
  query('_count').optional().isInt({ min: 1, max: 100 }).withMessage('_count must be an integer between 1 and 100'),
  query('_offset').optional().isInt({ min: 0 }).withMessage('_offset must be a non-negative integer'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
        return res.status(400).json(
          fhirOperationOutcome('error', 'invalid', errors.array()[0].msg as string)
        );
      }

      const requesterId = req.userId!;

      // Authorization: admin/auditor role only
      const isAdmin = await userHasAdminRole(requesterId);
      if (!isAdmin) {
        res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
        return res.status(403).json(
          fhirOperationOutcome('error', 'forbidden', 'Access denied: AuditEvent search requires ADMIN or AUDITOR role')
        );
      }

      const pageSize = Math.min(parseInt(req.query['_count'] as string || '20', 10), 100);
      const offset = parseInt(req.query['_offset'] as string || '0', 10);

      // Fetch audit logs with pagination
      const [auditLogs, totalCount] = await Promise.all([
        prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: pageSize,
          skip: offset,
          select: {
            id: true,
            userId: true,
            actorType: true,
            actorName: true,
            action: true,
            resource: true,
            resourceId: true,
            ipAddress: true,
            createdAt: true,
          },
        }),
        prisma.auditLog.count(),
      ]);

      const auditEvents = auditLogs.map(log => fhirMapper.mapAuditEvent(log));
      const bundle = fhirMapper.createBundle(auditEvents, 'searchset');

      // Override total with the real DB count (not just page size)
      bundle.total = totalCount;

      res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
      res.json(bundle);
    } catch (error) {
      logger.error('FHIR GET /AuditEvent error:', error);
      res.setHeader('Content-Type', FHIR_CONTENT_TYPE);
      res.status(500).json(
        fhirOperationOutcome('error', 'exception', 'An unexpected error occurred processing the request')
      );
    }
  }
);

export default router;
