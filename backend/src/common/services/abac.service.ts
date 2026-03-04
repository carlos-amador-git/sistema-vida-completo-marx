// src/common/services/abac.service.ts
/**
 * Servicio de Control de Acceso Basado en Atributos (ABAC)
 *
 * Complementa el RBAC existente con evaluación contextual de políticas.
 * Mientras RBAC pregunta "¿qué rol tiene el usuario?", ABAC pregunta
 * "¿bajo qué condiciones puede este usuario realizar esta acción?".
 *
 * Atributos evaluados:
 *   time_of_day         — Horario laboral (8–20h) vs fuera de horario
 *   ip_range            — Redes hospitalarias confiables
 *   is_emergency        — Contexto break-the-glass (token QR de emergencia)
 *   patient_relationship — Relación del accesante con el paciente
 *   geo_location        — Territorio México (lat 14.5–32.7, lon –118.4 a –86.7)
 *   device_trust        — Dispositivo conocido vs desconocido
 *
 * Política de emergencia:
 *   Si is_emergency=true Y el token QR es válido, se omiten restricciones
 *   de horario e IP para los recursos marcados como permitidos en emergencias.
 *
 * Uso típico:
 *   const result = await abacService.evaluate(userId, 'phi', 'read', {
 *     ip: req.ip,
 *     is_emergency: false,
 *     patient_relationship: 'doctor',
 *   });
 *   if (!result.allowed) throw new ABACError(result.reason!);
 */

import { logger } from './logger.service';
import { qrTokenService } from './qr-token.service';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS PÚBLICOS
// ═══════════════════════════════════════════════════════════════════════════

/** Operadores de comparación soportados por las condiciones ABAC */
export type ABACOperator = 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'between' | 'contains';

/**
 * Condición atómica de una política ABAC.
 * Expresa: atributo <operador> valor(es)
 */
export interface ABACCondition {
  /** Nombre del atributo contextual a evaluar */
  attribute: string;
  /** Operador de comparación */
  operator: ABACOperator;
  /** Valor o valores contra los que se compara el atributo */
  value: any;
}

/**
 * Política ABAC completa.
 * Una política se satisface cuando TODAS sus condiciones se cumplen.
 * Si conditions es un array vacío, la política siempre permite.
 */
export interface ABACPolicy {
  /** Identificador único de la política (ej. "PHI_ACCESS") */
  id: string;
  /** Descripción legible de la política */
  description: string;
  /** Recurso al que aplica (wildcard '*' aplica a todos) */
  resource: string;
  /** Acción a la que aplica (wildcard '*' aplica a todas) */
  action: string;
  /**
   * Conjuntos de condiciones en lógica OR entre grupos, AND dentro de cada grupo.
   * Formato: [[cond1 AND cond2], [cond3 AND cond4]] = (cond1 AND cond2) OR (cond3 AND cond4)
   * Si se entrega un array plano de ABACCondition[], se trata como un solo grupo AND.
   */
  conditionGroups: ABACCondition[][];
  /**
   * Si es true, esta política puede conceder acceso en contexto de emergencia
   * incluso cuando otras políticas lo denegarían.
   */
  allowsEmergencyOverride?: boolean;
  /** Prioridad de evaluación (mayor número = mayor prioridad). Default: 0 */
  priority?: number;
}

/**
 * Contexto de solicitud que alimenta la evaluación ABAC.
 * Todos los campos son opcionales; los ausentes se tratan como undefined
 * y las condiciones que los referencian fallarán de forma segura.
 */
export interface ABACContext {
  /** IP de origen de la solicitud */
  ip?: string;
  /** ¿El acceso ocurre dentro de horario laboral? (calculado automáticamente si se omite) */
  time_of_day?: 'working_hours' | 'off_hours';
  /** ¿Contexto de emergencia activo? */
  is_emergency?: boolean;
  /** Token QR de emergencia presentado (se verifica criptográficamente) */
  emergency_token?: string;
  /** Relación del usuario con el paciente dueño del recurso */
  patient_relationship?: 'self' | 'representative' | 'doctor' | 'emergency_accessor' | 'none';
  /** Coordenadas geográficas del origen (validadas contra territorio México) */
  geo_location?: { lat: number; lon: number };
  /** ¿El dispositivo está registrado como confiable? */
  device_trust?: 'known' | 'unknown';
  /** Campos adicionales arbitrarios para extensibilidad */
  [key: string]: any;
}

/**
 * Resultado de la evaluación ABAC.
 */
export interface ABACEvaluation {
  /** ¿Se permite el acceso? */
  allowed: boolean;
  /** Razón legible del resultado (presente siempre que allowed=false, y en overrides) */
  reason?: string;
  /** Lista de IDs de políticas que se evaluaron y contribuyeron al resultado */
  appliedPolicies: string[];
  /** ¿Se aplicó la excepción de emergencia? */
  emergencyOverride?: boolean;
}

export class ABACError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'ABAC_DENIED',
    public readonly status: number = 403
  ) {
    super(message);
    this.name = 'ABACError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

/** Rango de horario laboral (hora UTC-6 / hora Ciudad de México sin DST) */
const WORKING_HOURS_START = 8;   // 08:00
const WORKING_HOURS_END   = 20;  // 20:00

/** CIDRs de redes hospitalarias confiables (IPv4) */
const TRUSTED_HOSPITAL_CIDRS: string[] = [
  '10.0.0.0/8',       // Red privada Clase A — redes internas hospitalarias
  '172.16.0.0/12',    // Red privada Clase B
  '192.168.0.0/16',   // Red privada Clase C
  '127.0.0.1/32',     // Loopback (desarrollo y pruebas)
];

/** Límites geográficos de México (WGS84) */
const MEX_LAT_MIN =  14.5;
const MEX_LAT_MAX =  32.7;
const MEX_LON_MIN = -118.4;
const MEX_LON_MAX =  -86.7;

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES INTERNAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parsea un CIDR IPv4 y retorna función de membresía.
 */
function parseCIDR(cidr: string): (ip: string) => boolean {
  const [network, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

  const networkInt = ipToInt(network) & mask;

  return (ip: string) => {
    try {
      return (ipToInt(ip) & mask) === networkInt;
    } catch {
      return false;
    }
  };
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

const TRUSTED_CIDR_MATCHERS = TRUSTED_HOSPITAL_CIDRS.map(parseCIDR);

function isIpTrusted(ip: string | undefined): boolean {
  if (!ip) return false;
  // Normalizar IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const normalized = ip.replace(/^::ffff:/, '');
  return TRUSTED_CIDR_MATCHERS.some((matcher) => matcher(normalized));
}

function isWithinMexicoTerritory(lat: number, lon: number): boolean {
  return (
    lat >= MEX_LAT_MIN &&
    lat <= MEX_LAT_MAX &&
    lon >= MEX_LON_MIN &&
    lon <= MEX_LON_MAX
  );
}

function getCurrentTimeSlot(): 'working_hours' | 'off_hours' {
  // Usar hora de Ciudad de México (UTC-6, sin ajuste DST simplificado)
  const now = new Date();
  const cdmxOffset = -6;
  const cdmxHour = (now.getUTCHours() + cdmxOffset + 24) % 24;
  return cdmxHour >= WORKING_HOURS_START && cdmxHour < WORKING_HOURS_END
    ? 'working_hours'
    : 'off_hours';
}

/**
 * Evalúa una condición ABAC atómica contra el contexto enriquecido.
 */
function evaluateCondition(condition: ABACCondition, ctx: Record<string, any>): boolean {
  const { attribute, operator, value } = condition;
  const attrValue = ctx[attribute];

  // Atributo ausente en contexto — falla de forma segura (deny)
  if (attrValue === undefined || attrValue === null) {
    return false;
  }

  switch (operator) {
    case 'eq':
      return attrValue === value;

    case 'neq':
      return attrValue !== value;

    case 'in':
      if (!Array.isArray(value)) return false;
      return value.includes(attrValue);

    case 'gt':
      return typeof attrValue === 'number' && attrValue > value;

    case 'lt':
      return typeof attrValue === 'number' && attrValue < value;

    case 'between': {
      if (!Array.isArray(value) || value.length !== 2) return false;
      const [min, max] = value;
      return typeof attrValue === 'number' && attrValue >= min && attrValue <= max;
    }

    case 'contains':
      if (typeof attrValue === 'string') return attrValue.includes(String(value));
      if (Array.isArray(attrValue)) return attrValue.includes(value);
      return false;

    default:
      logger.warn('Operador ABAC desconocido', { operator, attribute });
      return false;
  }
}

/**
 * Evalúa un grupo de condiciones en lógica AND.
 */
function evaluateConditionGroup(group: ABACCondition[], ctx: Record<string, any>): boolean {
  return group.every((cond) => evaluateCondition(cond, ctx));
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICIO ABAC
// ═══════════════════════════════════════════════════════════════════════════

class ABACService {
  private policies: Map<string, ABACPolicy> = new Map();

  constructor() {
    this.loadDefaultPolicies();
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  /**
   * Evalúa si un usuario puede realizar una acción sobre un recurso
   * dado el contexto de la solicitud.
   *
   * Lógica:
   * 1. Enriquecer contexto (calcular time_of_day, validar geo, verificar IP)
   * 2. Si is_emergency=true y emergency_token válido: aplicar override
   * 3. Recopilar políticas aplicables (resource + action match)
   * 4. Ordenar por prioridad descendente
   * 5. Evaluar cada política: se permite si al menos UN grupo de condiciones pasa
   * 6. Denegar si ninguna política permite el acceso
   */
  async evaluate(
    userId: string,
    resource: string,
    action: string,
    context: ABACContext = {}
  ): Promise<ABACEvaluation> {
    const enriched = this.enrichContext(context);
    const appliedPolicies: string[] = [];

    // Verificar token de emergencia si se presentó
    const emergencyTokenValid = this.validateEmergencyToken(enriched.emergency_token);

    // Buscar políticas aplicables al recurso+acción (incluyendo wildcards)
    const applicablePolicies = this.findApplicablePolicies(resource, action);

    if (applicablePolicies.length === 0) {
      // Sin política definida: denegación implícita (fail-closed)
      logger.warn('ABAC: sin política definida para recurso/acción — acceso denegado', {
        userId, resource, action,
      });
      return {
        allowed: false,
        reason: `Sin política definida para ${resource}:${action}`,
        appliedPolicies: [],
      };
    }

    // Evaluar cada política en orden de prioridad
    for (const policy of applicablePolicies) {
      // Check de emergencia: si la política lo permite y el token es válido
      if (
        policy.allowsEmergencyOverride &&
        enriched.is_emergency === true &&
        emergencyTokenValid
      ) {
        appliedPolicies.push(policy.id);
        logger.security('ABAC: override de emergencia aplicado', {
          userId, resource, action, policyId: policy.id,
        });
        return {
          allowed: true,
          reason: `Override de emergencia — política: ${policy.id}`,
          appliedPolicies,
          emergencyOverride: true,
        };
      }

      // Evaluación normal: al menos UN grupo de condiciones debe pasar (OR entre grupos)
      const policyPasses = policy.conditionGroups.some((group) =>
        evaluateConditionGroup(group, enriched)
      );

      if (policyPasses) {
        appliedPolicies.push(policy.id);
        logger.debug('ABAC: política satisfecha', {
          userId, resource, action, policyId: policy.id,
        });
        return {
          allowed: true,
          appliedPolicies,
        };
      }

      // La política aplica pero no se satisface — registrar como evaluada
      appliedPolicies.push(policy.id);
    }

    // Ninguna política permitió el acceso
    logger.warn('ABAC: acceso denegado', {
      userId, resource, action,
      evaluatedPolicies: appliedPolicies,
      contextSummary: this.summarizeContext(enriched),
    });

    return {
      allowed: false,
      reason: this.buildDenyReason(resource, action, enriched),
      appliedPolicies,
    };
  }

  /**
   * Registra una política ABAC en el motor.
   * Si ya existe una política con el mismo ID, la reemplaza.
   */
  registerPolicy(policy: ABACPolicy): void {
    // Normalizar conditionGroups: si se entregó array plano, envolver en grupo
    const normalized: ABACPolicy = {
      ...policy,
      priority: policy.priority ?? 0,
    };
    this.policies.set(policy.id, normalized);
    logger.debug('ABAC: política registrada', { policyId: policy.id });
  }

  /**
   * Carga las políticas médicas predeterminadas del sistema VIDA.
   * Puede llamarse nuevamente para restaurar defaults tras modificaciones en runtime.
   */
  loadDefaultPolicies(): void {
    const defaults: ABACPolicy[] = [
      // ─────────────────────────────────────────────────────────────────────
      // PHI_ACCESS — Información de salud protegida
      // Permite acceso durante horario laboral desde red confiable,
      // O fuera de horario si hay token de emergencia válido.
      // ─────────────────────────────────────────────────────────────────────
      {
        id: 'PHI_ACCESS',
        description: 'Acceso a información de salud protegida (PHI/IPS)',
        resource: 'phi',
        action: '*',
        priority: 10,
        allowsEmergencyOverride: true,
        conditionGroups: [
          // Grupo 1: horario laboral + red confiable
          [
            { attribute: 'time_of_day',   operator: 'eq', value: 'working_hours' },
            { attribute: 'ip_trusted',    operator: 'eq', value: true },
          ],
          // Grupo 2: relación médico + red confiable (permite fuera de horario)
          [
            { attribute: 'patient_relationship', operator: 'in', value: ['doctor'] },
            { attribute: 'ip_trusted',           operator: 'eq', value: true },
          ],
          // Grupo 3: relación self (paciente accede a sus propios datos)
          [
            { attribute: 'patient_relationship', operator: 'eq', value: 'self' },
          ],
          // Grupo 4: representante autorizado durante horario laboral
          [
            { attribute: 'patient_relationship', operator: 'eq', value: 'representative' },
            { attribute: 'time_of_day',          operator: 'eq', value: 'working_hours' },
          ],
        ],
      },

      // ─────────────────────────────────────────────────────────────────────
      // DIRECTIVE_MODIFY — Modificación de directivas médicas
      // Solo el paciente (self) o su representante autorizado pueden modificar.
      // ─────────────────────────────────────────────────────────────────────
      {
        id: 'DIRECTIVE_MODIFY',
        description: 'Modificación de directivas médicas de emergencia',
        resource: 'directive',
        action: 'write',
        priority: 20,
        allowsEmergencyOverride: false, // Las directivas NO se modifican en emergencia
        conditionGroups: [
          // El paciente modifica sus propias directivas
          [
            { attribute: 'patient_relationship', operator: 'eq', value: 'self' },
          ],
          // El representante legal modifica durante horario laboral
          [
            { attribute: 'patient_relationship', operator: 'eq', value: 'representative' },
            { attribute: 'time_of_day',          operator: 'eq', value: 'working_hours' },
          ],
        ],
      },

      // ─────────────────────────────────────────────────────────────────────
      // DIRECTIVE_READ — Lectura de directivas médicas
      // Médicos, enfermeros y personal de emergencias pueden leer.
      // ─────────────────────────────────────────────────────────────────────
      {
        id: 'DIRECTIVE_READ',
        description: 'Lectura de directivas médicas de emergencia',
        resource: 'directive',
        action: 'read',
        priority: 10,
        allowsEmergencyOverride: true,
        conditionGroups: [
          // Self siempre puede leer sus propias directivas
          [
            { attribute: 'patient_relationship', operator: 'eq', value: 'self' },
          ],
          // Personal médico durante horario o desde red confiable
          [
            { attribute: 'patient_relationship', operator: 'in', value: ['doctor', 'representative', 'emergency_accessor'] },
            { attribute: 'ip_trusted',           operator: 'eq', value: true },
          ],
          // Representante autorizado
          [
            { attribute: 'patient_relationship', operator: 'eq', value: 'representative' },
            { attribute: 'time_of_day',          operator: 'eq', value: 'working_hours' },
          ],
        ],
      },

      // ─────────────────────────────────────────────────────────────────────
      // ADMIN_ACCESS — Acceso administrativo al sistema
      // Solo desde IPs confiables en horario laboral.
      // ─────────────────────────────────────────────────────────────────────
      {
        id: 'ADMIN_ACCESS',
        description: 'Acceso administrativo al panel y configuración del sistema',
        resource: 'admin',
        action: '*',
        priority: 30,
        allowsEmergencyOverride: false,
        conditionGroups: [
          [
            { attribute: 'time_of_day', operator: 'eq', value: 'working_hours' },
            { attribute: 'ip_trusted',  operator: 'eq', value: true },
          ],
        ],
      },

      // ─────────────────────────────────────────────────────────────────────
      // AUDIT_VIEW — Visualización de logs de auditoría
      // Requiere IP confiable (horario extendido para auditores).
      // ─────────────────────────────────────────────────────────────────────
      {
        id: 'AUDIT_VIEW',
        description: 'Acceso de lectura a logs de auditoría y métricas',
        resource: 'audit',
        action: 'read',
        priority: 15,
        allowsEmergencyOverride: false,
        conditionGroups: [
          [
            { attribute: 'ip_trusted', operator: 'eq', value: true },
          ],
        ],
      },

      // ─────────────────────────────────────────────────────────────────────
      // EMERGENCY_ACCESS — Acceso de emergencia vía QR
      // Cualquier hora, cualquier lugar, requiere token QR válido.
      // ─────────────────────────────────────────────────────────────────────
      {
        id: 'EMERGENCY_ACCESS',
        description: 'Acceso de emergencia médica via código QR firmado',
        resource: 'emergency',
        action: '*',
        priority: 50,
        allowsEmergencyOverride: true,
        conditionGroups: [
          [
            { attribute: 'is_emergency',        operator: 'eq', value: true },
            { attribute: 'emergency_token_valid', operator: 'eq', value: true },
          ],
        ],
      },

      // ─────────────────────────────────────────────────────────────────────
      // GEO_RESTRICTED — Validación de territorio para recursos sensibles
      // Acceso a recursos que requieren estar en México.
      // ─────────────────────────────────────────────────────────────────────
      {
        id: 'GEO_MEXICO_REQUIRED',
        description: 'Recurso restringido a territorio mexicano',
        resource: 'geo_restricted',
        action: '*',
        priority: 5,
        allowsEmergencyOverride: true,
        conditionGroups: [
          [
            { attribute: 'geo_valid', operator: 'eq', value: true },
          ],
          // Permitir si no se proporcionó geo (no obligatorio cuando hay IP confiable)
          [
            { attribute: 'ip_trusted', operator: 'eq', value: true },
          ],
        ],
      },
    ];

    for (const policy of defaults) {
      this.registerPolicy(policy);
    }

    logger.info('ABAC: políticas predeterminadas cargadas', {
      count: defaults.length,
      ids: defaults.map((p) => p.id),
    });
  }

  /**
   * Devuelve la lista de políticas registradas (copia inmutable).
   */
  listPolicies(): ABACPolicy[] {
    return Array.from(this.policies.values());
  }

  // -------------------------------------------------------------------------
  // Helpers privados
  // -------------------------------------------------------------------------

  /**
   * Enriquece el contexto con atributos derivados:
   * - time_of_day  (calculado si no se entregó)
   * - ip_trusted   (calculado desde IP)
   * - geo_valid    (calculado desde geo_location)
   * - emergency_token_valid (calculado desde emergency_token)
   */
  private enrichContext(context: ABACContext): Record<string, any> {
    const enriched: Record<string, any> = { ...context };

    // Tiempo
    if (!enriched.time_of_day) {
      enriched.time_of_day = getCurrentTimeSlot();
    }

    // IP confiable
    enriched.ip_trusted = isIpTrusted(enriched.ip);

    // Validación geográfica
    if (enriched.geo_location) {
      const { lat, lon } = enriched.geo_location as { lat: number; lon: number };
      enriched.geo_valid = isWithinMexicoTerritory(lat, lon);
    } else {
      enriched.geo_valid = null; // no disponible, no se puede verificar
    }

    // Validez del token de emergencia
    enriched.emergency_token_valid = this.validateEmergencyToken(enriched.emergency_token);

    return enriched;
  }

  /**
   * Verifica criptográficamente el token de emergencia.
   * Soporta tokens QR firmados del qrTokenService.
   */
  private validateEmergencyToken(token: string | undefined): boolean {
    if (!token) return false;

    try {
      const payload = qrTokenService.verifyToken(token);
      if (!payload) return false;

      // Solo tokens con scope 'emergency' o 'full' son válidos para override
      return payload.scope === 'emergency' || payload.scope === 'full';
    } catch {
      return false;
    }
  }

  /**
   * Recopila políticas que aplican al recurso y acción dados,
   * ordenadas por prioridad descendente.
   */
  private findApplicablePolicies(resource: string, action: string): ABACPolicy[] {
    const matching: ABACPolicy[] = [];

    for (const policy of this.policies.values()) {
      const resourceMatch = policy.resource === '*' || policy.resource === resource;
      const actionMatch   = policy.action   === '*' || policy.action   === action;

      if (resourceMatch && actionMatch) {
        matching.push(policy);
      }
    }

    // Mayor prioridad primero
    return matching.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Construye un mensaje de denegación contextualizado.
   */
  private buildDenyReason(
    resource: string,
    action: string,
    ctx: Record<string, any>
  ): string {
    const reasons: string[] = [];

    if (ctx.time_of_day === 'off_hours') {
      reasons.push('fuera de horario laboral (8–20h hora CDMX)');
    }
    if (ctx.ip_trusted === false) {
      reasons.push('IP no pertenece a una red hospitalaria confiable');
    }
    if (ctx.geo_location && ctx.geo_valid === false) {
      reasons.push('ubicación geográfica fuera del territorio mexicano');
    }
    if (ctx.device_trust === 'unknown') {
      reasons.push('dispositivo no reconocido');
    }
    if (
      ctx.patient_relationship === 'none' ||
      ctx.patient_relationship === undefined
    ) {
      reasons.push('sin relación con el paciente dueño del recurso');
    }

    const base = `Acceso denegado para ${resource}:${action}`;
    return reasons.length > 0
      ? `${base} — ${reasons.join('; ')}`
      : `${base} — condiciones de política no satisfechas`;
  }

  /**
   * Genera un resumen seguro del contexto para logs (sin datos sensibles).
   */
  private summarizeContext(ctx: Record<string, any>): Record<string, any> {
    return {
      time_of_day:          ctx.time_of_day,
      ip_trusted:           ctx.ip_trusted,
      geo_valid:            ctx.geo_valid,
      device_trust:         ctx.device_trust,
      patient_relationship: ctx.patient_relationship,
      is_emergency:         ctx.is_emergency,
      emergency_token_valid: ctx.emergency_token_valid,
      // Omitir: ip (PII), emergency_token (sensible), geo_location exacta
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const abacService = new ABACService();
export default abacService;
