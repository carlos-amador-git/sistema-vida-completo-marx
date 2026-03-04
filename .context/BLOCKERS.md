# BLOCKERS - Sistema VIDA

## Activos

### BLOCKER-001: Migración WhatsApp a WABA
- **Estado:** LOCAL LISTO — Pendiente deploy a producción
- **Impacto:** ALTO - Representantes no reciben alertas reales en emergencias
- **Código:** Migración completada (Provider Pattern + Feature Flags)
- **Templates:** Todos aprobados por Meta (emergencia_vida_v1 es_MX/en_US, acceso_qr_vida_v1 es_MX)
- **Local:** Migración SQL ejecutada, .env corregido, build OK
- **Pendiente producción:**
  1. Configurar en Coolify: `WABA_PHONE_NUMBER_ID`, `WABA_ACCESS_TOKEN`, `WABA_BUSINESS_ACCOUNT_ID`
  2. Configurar templates: `WABA_TEMPLATE_EMERGENCY=emergencia_vida_v1`, `WABA_TEMPLATE_ACCESS=acceso_qr_vida_v1`
  3. Ejecutar SQL en BD producción: `prisma/migrations/add_whatsapp_channel.sql`
  4. Activar: `WHATSAPP_PROVIDER=waba`
- **Variables Email (pendiente):**
  - `RESEND_API_KEY`
  - `EMAIL_FROM_RESEND`
- **Owner:** CEO (Coolify) + Backend (monitoreo)

### BLOCKER-002: Representantes sin Notificaciones Activadas
- **Estado:** PENDIENTE EN PRODUCCIÓN (BD local vacía — no aplica)
- **Impacto:** MEDIO - Algunos representantes con notifyOnEmergency=false
- **Schema:** Defaults ya son `true` para nuevos registros
- **Solucion SQL (ejecutar en producción):**
```sql
UPDATE "Representative"
SET "notifyOnEmergency" = true, "notifyOnAccess" = true;
```
- **Owner:** CEO (acceso a BD producción)

## Resueltos

(ninguno documentado aun)
