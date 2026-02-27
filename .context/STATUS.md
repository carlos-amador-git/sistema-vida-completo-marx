# STATUS - Sistema VIDA

**Actualizado:** 2026-02-26 (Sesión 6)
**Fase:** MVP Fase 1 - Listo para Pruebas
**Branch:** main
**Plan Activo:** Ninguno — sistema operativo

## Estado General

| Componente | Estado | Notas |
|------------|--------|-------|
| Backend API | FUNCIONAL | Express + TypeScript + Prisma |
| Frontend | FUNCIONAL | React 18 + Vite + Tailwind |
| Base de Datos | FUNCIONAL | PostgreSQL + Redis |
| Autenticación | FUNCIONAL | JWT con refresh tokens |
| Encriptación | FUNCIONAL | AES-256-GCM |
| Notificaciones | MIGRADO | Provider Pattern: WABA + Twilio fallback |
| i18n | COMPLETO | ES/EN, residuales corregidos |

## Sesión 6 — i18n Residuales + WABA Templates

### i18n Residuales (commit 1ccd924, 23 archivos, +264/-192)
1. ~85 tildes corregidas en locales ES (admin, notifications, common, extras, subscription)
2. 9x "Sistema VIDA" → "VIDA System" en locales EN
3. useSubscription.ts (6 errors) y useNFC.ts (13 strings) migrados a i18next.t()
4. documents.controller.ts (18 strings) y hospital.controller.ts (10 strings) migrados a req.t()
5. Global error handlers en main.ts migrados a req.t()
6. AdminAuthContext.tsx (6 JSX strings) migrado a useTranslation('admin')
7. ADMIN_ROLE_LABELS eliminado, reemplazado con t('roles.*')
8. Nuevas secciones locale: roles, access, nfc.errors, hospital, subscription.errors
9. Build verificado: tsc 0 errores (frontend + backend), vite build OK

### WABA Templates
1. `acceso_qr_vida_v1` — **APPROVED** (UTILITY, es_MX) — probado OK con CEO
2. `emergencia_vida_v1` es_MX — **PENDING** (UTILITY, id: 954722793796826)
3. `emergencia_vida_v1` en_US — **PENDING** (UTILITY, id: 1432208321692178)
4. Template MARKETING actual probado: funciona con sesión activa, fallback texto plano sin sesión

### Diagnóstico WABA
- Template MARKETING requiere sesión 24h → causa fallback texto plano para algunos usuarios
- Nuevo template UTILITY eliminará esta restricción cuando Meta apruebe
- No existe webhook para mensajes entrantes WhatsApp
- Footer "no responda" incluido en nuevo template

## Pendiente para Deploy

1. Esperar aprobación `emergencia_vida_v1` → cambiar `WABA_TEMPLATE_EMERGENCY` en .env
2. Ejecutar migración SQL: `prisma/migrations/add_whatsapp_channel.sql`
3. Configurar variables WABA en Coolify
4. Fix BLOCKER-002: representantes con notifyOnEmergency=false
