# STATUS - Sistema VIDA

**Actualizado:** 2026-03-03 (Sesión 7)
**Fase:** MVP Fase 1 - Listo para Deploy
**Branch:** main
**Plan Activo:** Ninguno — pendiente deploy a producción

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
2. `emergencia_vida_v1` es_MX — **APPROVED** (UTILITY, id: 954722793796826)
3. `emergencia_vida_v1` en_US — **APPROVED** (UTILITY, id: 1432208321692178)
4. Template MARKETING actual probado: funciona con sesión activa, fallback texto plano sin sesión

### Diagnóstico WABA
- Template MARKETING requiere sesión 24h → causa fallback texto plano para algunos usuarios
- Templates UTILITY aprobados eliminan esta restricción
- No existe webhook para mensajes entrantes WhatsApp
- Footer "no responda" incluido en nuevo template

## Sesión 7 — Deploy Prep (2026-03-03)

### Completado
1. Templates WABA corregidos en `.env` y `.env.example`: `emergencia_vida_v1`, `acceso_qr_vida_v1`
2. `WABA_API_VERSION` actualizado de v18.0 a v22.0
3. Migración SQL `add_whatsapp_channel.sql` ejecutada en BD local — enum `WHATSAPP` confirmado
4. Build verificado: tsc 0 errores (backend + frontend)

### Pendiente para Deploy (Producción / Coolify)

1. Configurar variables WABA reales en Coolify:
   - `WABA_PHONE_NUMBER_ID`, `WABA_ACCESS_TOKEN`, `WABA_BUSINESS_ACCOUNT_ID`
   - `WABA_TEMPLATE_EMERGENCY=emergencia_vida_v1`
   - `WABA_TEMPLATE_ACCESS=acceso_qr_vida_v1`
   - `WHATSAPP_PROVIDER=waba`
2. Configurar email: `RESEND_API_KEY`, `EMAIL_FROM_RESEND`
3. Ejecutar migración SQL en BD de producción: `add_whatsapp_channel.sql`
4. Fix BLOCKER-002 en producción: `UPDATE "Representative" SET "notifyOnEmergency" = true, "notifyOnAccess" = true;`
