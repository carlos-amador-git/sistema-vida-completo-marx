// src/common/seeds/rbac.seed.ts
/**
 * Seed de Roles y Permisos RBAC para el Sistema VIDA
 *
 * Ejecutar:
 *   npx ts-node src/common/seeds/rbac.seed.ts
 *   (o mediante el script npm run seed:rbac si está configurado)
 *
 * Idempotente: puede ejecutarse múltiples veces sin duplicar datos.
 *
 * Roles del sistema:
 * ─────────────────────────────────────────────────────────────────
 * PATIENT   — Paciente. Acceso solo a sus propios datos.
 * DOCTOR    — Médico con cédula verificada. Lectura consentida de pacientes.
 * NURSE     — Enfermero/a. Acceso limitado en emergencias.
 * EMERGENCY — Personal de emergencias / paramédico.
 * ADMIN     — Administrador del sistema VIDA. CRUD completo.
 * AUDITOR   — Solo lectura de logs, métricas y salud del sistema.
 * ─────────────────────────────────────────────────────────────────
 *
 * Recursos:
 *   directive — Directivas de voluntad anticipada
 *   patient   — Perfil del paciente y datos médicos
 *   alert     — Alertas de pánico y respuestas
 *   hospital  — Información de hospitales e instituciones
 *   user      — Usuarios del sistema
 *   audit     — Logs de auditoría
 *   system    — Configuración y salud del sistema
 *
 * Acciones:
 *   create, read, update, delete, execute
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// DEFINICIÓN DE PERMISOS
// ═══════════════════════════════════════════════════════════════════════════

interface PermissionDef {
  action: string;
  resource: string;
  description: string;
}

const ALL_PERMISSIONS: PermissionDef[] = [
  // ── directive ──────────────────────────────────────────────
  { action: 'create', resource: 'directive', description: 'Crear directivas de voluntad anticipada' },
  { action: 'read',   resource: 'directive', description: 'Leer directivas de voluntad anticipada' },
  { action: 'update', resource: 'directive', description: 'Actualizar directivas de voluntad anticipada' },
  { action: 'delete', resource: 'directive', description: 'Eliminar directivas de voluntad anticipada' },
  { action: 'execute', resource: 'directive', description: 'Ejecutar/activar directivas en emergencia' },

  // ── patient ─────────────────────────────────────────────────
  { action: 'create', resource: 'patient', description: 'Crear perfil de paciente' },
  { action: 'read',   resource: 'patient', description: 'Leer perfil y datos médicos del paciente' },
  { action: 'update', resource: 'patient', description: 'Actualizar datos de paciente' },
  { action: 'delete', resource: 'patient', description: 'Eliminar perfil de paciente' },

  // ── alert ───────────────────────────────────────────────────
  { action: 'create', resource: 'alert', description: 'Crear alerta de pánico' },
  { action: 'read',   resource: 'alert', description: 'Leer alertas de pánico' },
  { action: 'update', resource: 'alert', description: 'Actualizar estado de alerta' },
  { action: 'delete', resource: 'alert', description: 'Cancelar/eliminar alerta' },
  { action: 'execute', resource: 'alert', description: 'Responder a alerta de pánico' },

  // ── hospital ─────────────────────────────────────────────────
  { action: 'create', resource: 'hospital', description: 'Registrar institución médica' },
  { action: 'read',   resource: 'hospital', description: 'Consultar información de hospitales' },
  { action: 'update', resource: 'hospital', description: 'Actualizar datos de institución médica' },
  { action: 'delete', resource: 'hospital', description: 'Eliminar institución médica' },

  // ── user ─────────────────────────────────────────────────────
  { action: 'create', resource: 'user', description: 'Crear usuarios en el sistema' },
  { action: 'read',   resource: 'user', description: 'Leer datos de usuarios' },
  { action: 'update', resource: 'user', description: 'Modificar datos de usuarios' },
  { action: 'delete', resource: 'user', description: 'Eliminar/desactivar usuarios' },
  { action: 'execute', resource: 'user', description: 'Ejecutar acciones especiales de usuario (reset, ban)' },

  // ── audit ─────────────────────────────────────────────────────
  { action: 'read',   resource: 'audit', description: 'Leer logs de auditoría' },
  { action: 'execute', resource: 'audit', description: 'Exportar logs de auditoría' },

  // ── system ───────────────────────────────────────────────────
  { action: 'read',   resource: 'system', description: 'Ver métricas y salud del sistema' },
  { action: 'update', resource: 'system', description: 'Modificar configuración del sistema' },
  { action: 'execute', resource: 'system', description: 'Ejecutar tareas de sistema (cleanup, migration)' },
];

// ═══════════════════════════════════════════════════════════════════════════
// DEFINICIÓN DE ROLES Y SUS PERMISOS
// ═══════════════════════════════════════════════════════════════════════════

interface RoleDef {
  name: string;
  description: string;
  permissions: Array<{ action: string; resource: string }>;
}

const ROLES: RoleDef[] = [
  {
    name: 'PATIENT',
    description: 'Paciente registrado. Accede únicamente a sus propios datos.',
    permissions: [
      // Sus propias directivas
      { action: 'create',  resource: 'directive' },
      { action: 'read',    resource: 'directive' },
      { action: 'update',  resource: 'directive' },
      { action: 'delete',  resource: 'directive' },
      // Su propio perfil
      { action: 'read',    resource: 'patient' },
      { action: 'update',  resource: 'patient' },
      // Pánico — solo crear y leer sus propias alertas
      { action: 'create',  resource: 'alert' },
      { action: 'read',    resource: 'alert' },
      { action: 'delete',  resource: 'alert' },  // cancelar su propia alerta
      // Información hospitalaria (consulta)
      { action: 'read',    resource: 'hospital' },
    ],
  },
  {
    name: 'DOCTOR',
    description: 'Médico con cédula profesional verificada (SEP). Acceso con consentimiento del paciente.',
    permissions: [
      // Directivas con consentimiento
      { action: 'read',    resource: 'directive' },
      // Datos del paciente (acceso consentido)
      { action: 'read',    resource: 'patient' },
      // Puede crear notas/documentos médicos
      { action: 'create',  resource: 'patient' },
      // Información hospitalaria
      { action: 'read',    resource: 'hospital' },
    ],
  },
  {
    name: 'NURSE',
    description: 'Enfermero/a. Lectura en emergencias, respuesta a alertas.',
    permissions: [
      // Directivas en emergencia
      { action: 'read',    resource: 'directive' },
      // Perfil del paciente (emergencia)
      { action: 'read',    resource: 'patient' },
      // Alertas — responder
      { action: 'read',    resource: 'alert' },
      { action: 'execute', resource: 'alert' },
      // Hospitales
      { action: 'read',    resource: 'hospital' },
    ],
  },
  {
    name: 'EMERGENCY',
    description: 'Personal de emergencias: paramédicos, técnicos. Acceso break-glass a directivas.',
    permissions: [
      // Break-glass: lectura de directivas en emergencia
      { action: 'read',    resource: 'directive' },
      { action: 'execute', resource: 'directive' },
      // Perfil del paciente
      { action: 'read',    resource: 'patient' },
      // Alertas — responder
      { action: 'read',    resource: 'alert' },
      { action: 'execute', resource: 'alert' },
      { action: 'update',  resource: 'alert' },
      // Hospitales — acceso completo para routing
      { action: 'read',    resource: 'hospital' },
    ],
  },
  {
    name: 'ADMIN',
    description: 'Administrador del sistema VIDA. CRUD completo sobre usuarios, roles y configuración.',
    permissions: [
      // Directivas — gestión completa
      { action: 'create',  resource: 'directive' },
      { action: 'read',    resource: 'directive' },
      { action: 'update',  resource: 'directive' },
      { action: 'delete',  resource: 'directive' },
      // Pacientes — gestión completa
      { action: 'create',  resource: 'patient' },
      { action: 'read',    resource: 'patient' },
      { action: 'update',  resource: 'patient' },
      { action: 'delete',  resource: 'patient' },
      // Alertas — gestión completa
      { action: 'create',  resource: 'alert' },
      { action: 'read',    resource: 'alert' },
      { action: 'update',  resource: 'alert' },
      { action: 'delete',  resource: 'alert' },
      { action: 'execute', resource: 'alert' },
      // Hospitales — gestión completa
      { action: 'create',  resource: 'hospital' },
      { action: 'read',    resource: 'hospital' },
      { action: 'update',  resource: 'hospital' },
      { action: 'delete',  resource: 'hospital' },
      // Usuarios — gestión completa
      { action: 'create',  resource: 'user' },
      { action: 'read',    resource: 'user' },
      { action: 'update',  resource: 'user' },
      { action: 'delete',  resource: 'user' },
      { action: 'execute', resource: 'user' },
      // Auditoría — lectura y exportación
      { action: 'read',    resource: 'audit' },
      { action: 'execute', resource: 'audit' },
      // Sistema — gestión completa
      { action: 'read',    resource: 'system' },
      { action: 'update',  resource: 'system' },
      { action: 'execute', resource: 'system' },
    ],
  },
  {
    name: 'AUDITOR',
    description: 'Auditor externo o interno. Solo lectura de logs, métricas y seguridad.',
    permissions: [
      // Auditoría — lectura y exportación
      { action: 'read',    resource: 'audit' },
      { action: 'execute', resource: 'audit' },
      // Sistema — solo métricas
      { action: 'read',    resource: 'system' },
      // Usuarios — solo lectura (para auditoría)
      { action: 'read',    resource: 'user' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function seedRBAC(): Promise<void> {
  console.log('🔐 Iniciando seed de RBAC...\n');

  // 1. Crear todos los permisos (upsert por action+resource)
  console.log(`📋 Creando ${ALL_PERMISSIONS.length} permisos...`);
  const permissionUpserts = ALL_PERMISSIONS.map((p) =>
    prisma.permission.upsert({
      where: { action_resource: { action: p.action, resource: p.resource } },
      create: p,
      update: { description: p.description },
    })
  );
  const createdPermissions = await Promise.all(permissionUpserts);
  console.log(`   ✓ ${createdPermissions.length} permisos procesados\n`);

  // Mapa para lookup rápido por "action:resource"
  const permissionMap = new Map<string, string>();
  for (const perm of createdPermissions) {
    permissionMap.set(`${perm.action}:${perm.resource}`, perm.id);
  }

  // 2. Crear roles y asignarles permisos
  console.log(`👥 Creando ${ROLES.length} roles...`);
  for (const roleDef of ROLES) {
    // Upsert del rol
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      create: {
        name: roleDef.name,
        description: roleDef.description,
      },
      update: {
        description: roleDef.description,
      },
    });

    // Resolver IDs de permisos
    const permissionIds: string[] = [];
    const missing: string[] = [];
    for (const p of roleDef.permissions) {
      const permId = permissionMap.get(`${p.action}:${p.resource}`);
      if (permId) {
        permissionIds.push(permId);
      } else {
        missing.push(`${p.action}:${p.resource}`);
      }
    }

    if (missing.length > 0) {
      console.warn(`   ⚠ Permisos no encontrados para ${roleDef.name}: ${missing.join(', ')}`);
    }

    // Obtener RolePermissions existentes
    const existingRPs = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const existingPermIds = new Set(existingRPs.map((rp) => rp.permissionId));

    // Solo insertar los que no existen
    const newPermIds = permissionIds.filter((id) => !existingPermIds.has(id));
    if (newPermIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: newPermIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }

    console.log(
      `   ✓ ${roleDef.name.padEnd(12)} — ${permissionIds.length} permisos` +
        (newPermIds.length > 0 ? ` (+${newPermIds.length} nuevos)` : ' (sin cambios)')
    );
  }

  console.log('\n✅ Seed de RBAC completado exitosamente.');
  console.log('\nResumen de roles:');
  for (const r of ROLES) {
    console.log(`  • ${r.name.padEnd(12)} — ${r.description}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EJECUCIÓN
// ═══════════════════════════════════════════════════════════════════════════

seedRBAC()
  .catch((error) => {
    console.error('\n❌ Error en seed de RBAC:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
