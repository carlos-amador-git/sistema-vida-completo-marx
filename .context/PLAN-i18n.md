# PLAN: Internacionalización (i18n) — Sistema VIDA

**Estado:** ACTIVO
**Fecha:** 2026-02-26
**Prioridad:** ALTA
**Estimación:** 5 sprints, ~12-16 días
**Idiomas:** Español (es-MX) + Inglés (en-US)

---

## Diagnóstico Actual

| Métrica | Valor |
|---------|-------|
| Archivos frontend con strings ES | 42 de 54 |
| Strings frontend únicos (aprox) | 550-650 |
| Archivos backend con strings ES | 20+ de 88 |
| Strings backend únicos (aprox) | 200+ |
| Email templates HTML | 9 completos |
| Notification providers (SMS/WA/Email) | 4 archivos |
| Infraestructura i18n existente | ZERO |
| Librería i18n instalada | Ninguna |
| Locale hardcoded | `es-MX` en 15+ call sites |

---

## Arquitectura i18n

### Stack Seleccionado

| Capa | Librería | Razón |
|------|----------|-------|
| Frontend | `react-i18next` + `i18next` | Estándar industria React, lazy loading, plurales, interpolación |
| Detección | `i18next-browser-languagedetector` | localStorage → navigator → default |
| Backend | `i18next` + `i18next-http-middleware` | Accept-Language header + user preference |
| Fechas | `date-fns` (ya instalado) + locales | Reemplazar `toLocaleDateString` hardcoded |

### Estrategia de Locale

```
Prioridad de detección:
1. User.preferredLanguage (BD) → para usuarios logueados
2. localStorage('vida-lang') → para visitantes recurrentes
3. Accept-Language header → para primera visita
4. Default: 'es' → México-first
```

**NO se usa** routing por path (`/en/`, `/es/`) — se usa preferencia de usuario.

### Estructura de Archivos

```
frontend/src/i18n/
├── config.ts                     # i18next init + plugins
└── locales/
    ├── es/
    │   ├── common.json           # Nav, buttons, dates, shared
    │   ├── auth.json             # Login, register, recovery
    │   ├── dashboard.json        # Dashboard
    │   ├── profile.json          # Perfil médico
    │   ├── directives.json       # Voluntades anticipadas
    │   ├── representatives.json  # Representantes
    │   ├── documents.json        # Documentos
    │   ├── emergency.json        # Vista emergencia + QR + panic
    │   ├── notifications.json    # Notificaciones + settings
    │   ├── subscription.json     # Planes, pagos, upgrade
    │   ├── admin.json            # Panel admin completo
    │   ├── landing.json          # Landing page
    │   └── extras.json           # NFC, Wallet, Biometric
    └── en/
        └── (misma estructura)

backend/src/common/i18n/
├── config.ts                     # i18next init
├── middleware.ts                  # Express middleware
└── locales/
    ├── es/
    │   ├── api.json              # API responses (success/error)
    │   ├── validation.json       # Validation messages
    │   ├── notifications.json    # SMS, WhatsApp text
    │   └── emails.json           # Email subjects + content
    └── en/
        └── (misma estructura)
```

### Patrones de Código

**Componentes React:**
```tsx
const { t } = useTranslation('profile');
return <label>{t('bloodType')}</label>;
```

**Zod schemas (sin acceso a hooks):**
```tsx
const getLoginSchema = (t: TFunction) => z.object({
  email: z.string().email(t('auth:invalidEmail')),
  password: z.string().min(8, t('auth:passwordMinLength')),
});
```

**Backend controllers:**
```ts
// Antes: res.json({ message: 'Usuario registrado exitosamente' })
// Ahora: res.json({ message: req.t('api:registerSuccess') })
```

**Email templates:**
```ts
// Antes: emailTemplates.welcome(name, url)
// Ahora: emailTemplates.welcome(name, url, locale)
```

**WABA templates:**
```ts
// Selección por locale del usuario
const templateName = locale === 'en'
  ? config.waba.templateEmergencyEn
  : config.waba.templateEmergency;
const langCode = locale === 'en' ? 'en_US' : 'es_MX';
```

### Migración BD

```sql
ALTER TABLE "User" ADD COLUMN "preferredLanguage" VARCHAR(5) DEFAULT 'es';
ALTER TABLE "Admin" ADD COLUMN "preferredLanguage" VARCHAR(5) DEFAULT 'es';
```

---

## Sprint 1 — Infraestructura i18n + Backend Core
**Duración:** 2-3 días | **Cobertura objetivo:** 0% → Infraestructura lista

### Tareas

| ID | Tarea | Agente | Prioridad |
|----|-------|--------|-----------|
| S1.1 | Instalar dependencias (i18next, react-i18next, i18next-browser-languagedetector, i18next-http-middleware) | /architect | BLOCKER |
| S1.2 | Crear estructura de directorios y archivos base i18n (frontend + backend) | /architect | BLOCKER |
| S1.3 | Configurar react-i18next con lazy loading por namespace | /frontend | BLOCKER |
| S1.4 | Backend: Middleware Express para detección de locale (Accept-Language + user pref) | /backend | ALTA |
| S1.5 | Backend: Helper `req.t()` disponible en todos los controllers | /backend | ALTA |
| S1.6 | Migración Prisma: `preferredLanguage` en User y Admin | /database | ALTA |
| S1.7 | Backend: Extraer strings de API responses a locale files (es + en) | /backend | ALTA |
| S1.8 | Backend: Parametrizar email templates con locale | /backend | ALTA |
| S1.9 | Backend: SMS/WhatsApp/Email providers aceptan locale param | /backend | MEDIA |
| S1.10 | Tests unitarios: middleware i18n, helper t(), providers con locale | /test-v2 | ALTA |

### Agent Team: "i18n-infra"

```
Lead:      /architect    → S1.1, S1.2 (decisiones de estructura)
Builder 1: /backend      → S1.4, S1.5, S1.7, S1.8, S1.9
Builder 2: /database     → S1.6
Builder 3: /frontend     → S1.3
Expert:    /integration  → Conexión frontend ↔ backend locale
Verify:    /test-v2      → S1.10
```

### Criterio de Salida
- [ ] `npm run build` sin errores en frontend y backend
- [ ] Middleware detecta locale correctamente de 3 fuentes
- [ ] Email template `welcome` funciona en ES y EN
- [ ] Tests verdes

---

## Sprint 2 — Frontend Core (Auth + Nav + Dashboard + Landing)
**Duración:** 2-3 días | **Cobertura objetivo:** ~25%

### Tareas

| ID | Tarea | Agente | Archivos |
|----|-------|--------|----------|
| S2.1 | Crear componente LanguageSwitcher (toggle ES/EN) | /ux-strategy | Nuevo componente |
| S2.2 | Integrar LanguageSwitcher en MainLayout header + Landing | /frontend | MainLayout.tsx, Landing.tsx |
| S2.3 | Extraer strings: Login.tsx + Zod schema | /frontend | Login.tsx |
| S2.4 | Extraer strings: Register.tsx + Zod schema | /frontend | Register.tsx |
| S2.5 | Extraer strings: MainLayout.tsx + BottomNav.tsx | /frontend | 2 archivos |
| S2.6 | Extraer strings: Dashboard.tsx | /frontend | Dashboard.tsx |
| S2.7 | Extraer strings: Landing.tsx (todos los sections) | /frontend | Landing.tsx |
| S2.8 | Extraer strings: App.tsx (404, loading) | /frontend | App.tsx |
| S2.9 | `<html lang="">` dinámico según i18n.language | /frontend | index.html |
| S2.10 | Crear hook `useFormatDate()` locale-aware, reemplazar `toLocaleDateString('es-MX')` | /frontend | Nuevo hook + refactor |
| S2.11 | Persistencia: localStorage + PATCH /profile si logueado | /integration | AuthContext + API |
| S2.12 | Escribir traducciones EN para: common, auth, dashboard, landing | /frontend | 4 archivos JSON |

### Agent Team: "i18n-frontend-core"

```
Lead:      /frontend     → S2.3-S2.10, S2.12
Expert 1:  /ux-strategy  → S2.1, S2.2 (UX del selector)
Expert 2:  /tailwind     → Responsive con strings de longitud variable
Builder:   /integration  → S2.11
Verify 1:  /design-audit → UI no se rompe con EN (strings más largos)
Verify 2:  /test-v2      → Tests de LanguageSwitcher + persistencia
```

### Criterio de Salida
- [ ] Toggle ES/EN funcional en header
- [ ] Auth flow completo en inglés (login, register)
- [ ] Dashboard renderiza correctamente en EN
- [ ] Landing page 100% traducida
- [ ] Preferencia persiste en localStorage y BD
- [ ] 0 strings hardcoded en archivos tocados

---

## Sprint 3 — Módulos Principales + Emergency View
**Duración:** 3-4 días | **Cobertura objetivo:** ~65%

### Tareas

| ID | Tarea | Agente | Archivos | Strings (aprox) |
|----|-------|--------|----------|-----------------|
| S3.1 | Extraer: Profile.tsx (blood types, allergies, insurance, donors) | Builder 1 | Profile.tsx | ~80 |
| S3.2 | Extraer: Directives.tsx (medical decisions, states, legal) | Builder 1 | Directives.tsx | ~70 |
| S3.3 | Extraer: Representatives.tsx (relations, badges, priority) | Builder 1 | Representatives.tsx | ~50 |
| S3.4 | Extraer: Documents.tsx (categories, upload, filters) | Builder 2 | Documents.tsx | ~60 |
| S3.5 | Extraer: AccessHistory.tsx | Builder 2 | AccessHistory.tsx | ~25 |
| S3.6 | **Extraer: EmergencyView.tsx (CRÍTICO - vista pública)** | Builder 3 | EmergencyView.tsx | ~50 |
| S3.7 | Extraer: EmergencyQR.tsx | Builder 3 | EmergencyQR.tsx | ~30 |
| S3.8 | Extraer: PanicButton.tsx + PanicAlertModal.tsx | Builder 3 | 2 archivos | ~35 |
| S3.9 | Registrar templates WABA en inglés con Meta | /backend | Meta Business Manager | 2 templates |
| S3.10 | Backend: SMS text bodies bilingües | /backend | twilio-sms.provider.ts | ~4 strings |
| S3.11 | Backend: WhatsApp text fallback bilingüe | /backend | waba.provider.ts, twilio-wa.provider.ts | ~6 strings |
| S3.12 | Backend: Emergency email template bilingüe | /backend | resend-email.provider.ts | ~20 strings |
| S3.13 | Escribir TODAS las traducciones EN para este sprint | Builders | 5 archivos JSON | ~300 |

### Swarm: /swarm-build "i18n-modules"

```
Vision:    /ux-strategy  → Priorizar EmergencyView (público, médicos internacionales)
Builder 1: /frontend     → S3.1, S3.2, S3.3 (Profile, Directives, Reps)
Builder 2: /frontend     → S3.4, S3.5 (Documents, History)
Builder 3: /frontend     → S3.6, S3.7, S3.8 (Emergency, QR, Panic)
Expert 1:  /backend      → S3.9, S3.10, S3.11, S3.12
Expert 2:  /mexico       → Términos médicos MX→EN (CURP, NOM-151, cédula)
Verify:    /swarm-verify → Guardian team post-sprint
```

### Notas Especiales
- **EmergencyView.tsx** es la vista pública más importante para i18n — médicos extranjeros la usan
- Términos como "CURP" no se traducen, se explican: `CURP (Mexican ID number)`
- "Cédula profesional" → `Medical License Number`
- Estados mexicanos mantienen nombre original + traducción si aplica
- WABA templates EN pueden tardar en aprobarse — el fallback a texto libre EN cubre mientras

### Criterio de Salida
- [ ] EmergencyView 100% funcional en EN
- [ ] Todos los módulos de usuario traducidos
- [ ] Providers de notificación envían en idioma del usuario
- [ ] Templates WABA EN enviados a Meta (aprobación puede ser async)
- [ ] /swarm-verify score ≥ 40/50

---

## Sprint 4 — Admin + Suscripciones
**Duración:** 2-3 días | **Cobertura objetivo:** ~85%

### Tareas

| ID | Tarea | Agente | Archivos |
|----|-------|--------|----------|
| S4.1 | Extraer: Subscription.tsx | /frontend | Subscription.tsx |
| S4.2 | Extraer: SubscriptionPlans.tsx (precios, features, comparison) | /frontend | SubscriptionPlans.tsx |
| S4.3 | Extraer: SubscriptionSuccess.tsx | /frontend | SubscriptionSuccess.tsx |
| S4.4 | Extraer: UpgradePrompt.tsx + FeatureGate | /frontend | 2 archivos |
| S4.5 | Extraer: AdminLogin.tsx + AdminLayout.tsx | /frontend | 2 archivos |
| S4.6 | Extraer: AdminDashboard.tsx | /frontend | AdminDashboard.tsx |
| S4.7 | Extraer: AdminUsers.tsx + AdminAuditLog.tsx | /frontend | 2 archivos |
| S4.8 | Extraer: AdminInstitutions.tsx + AdminSubscriptions.tsx + AdminSystemHealth.tsx | /frontend | 3 archivos |
| S4.9 | Backend: Stripe checkout locale dinámico (`es` → `en` según user) | /backend | stripe.service.ts |
| S4.10 | Backend: Payment/invoice success/error messages bilingües | /backend | payments.controller.ts |
| S4.11 | Escribir traducciones EN: subscription.json + admin.json | /frontend | 2 archivos JSON |

### Agent Team: "i18n-admin"

```
Lead:      /frontend     → S4.1-S4.8, S4.11
Builder:   /backend      → S4.9, S4.10
Verify:    /test-v2      → Tests de flujo subscription + admin en EN
```

### Notas
- Precios en MXN se mantienen (no se convierten a USD) — el sistema opera en México
- `Intl.NumberFormat` usa locale del usuario para formato de número, pero currency siempre MXN
- Admin panel: menor prioridad de traducción (uso interno), pero se incluye por completitud

### Criterio de Salida
- [ ] Flujo de suscripción completo en EN
- [ ] Admin panel navegable en EN
- [ ] Stripe checkout en idioma del usuario
- [ ] Tests de pagos passing

---

## Sprint 5 — PWA + Extras + QA Final
**Duración:** 2-3 días | **Cobertura objetivo:** ~100%

### Tareas

| ID | Tarea | Agente | Archivos |
|----|-------|--------|----------|
| S5.1 | Service Worker: traducciones para push notifications | /frontend | service-worker.js |
| S5.2 | Extraer: NFCManager.tsx | /frontend | NFCManager.tsx |
| S5.3 | Extraer: WalletPass.tsx | /frontend | WalletPass.tsx |
| S5.4 | Extraer: BiometricSettings.tsx | /frontend | BiometricSettings.tsx |
| S5.5 | Extraer: Notifications.tsx + NotificationSettings.tsx | /frontend | 2 archivos |
| S5.6 | Extraer: ErrorBoundary.tsx | /frontend | ErrorBoundary.tsx |
| S5.7 | Backend: PDF generator bilingüe (perfil médico) | /backend | pdf-generator.service.ts |
| S5.8 | Auditoría: grep por TODOS los strings ES residuales en archivos .tsx/.ts | /audit | Codebase completo |
| S5.9 | Tests e2e: flujos completos en EN (login → dashboard → emergency → panic) | /test-v2 | Tests nuevos |
| S5.10 | /func-audit: Scoring funcional completo post-i18n | /func-audit | Reporte |
| S5.11 | /design-audit: Visual check EN vs ES en todas las vistas | /design-audit | Reporte |
| S5.12 | Documentación: guía para agregar nuevos idiomas | /doc-process | Nuevo doc |

### Swarm: /swarm-ship "i18n-release"

```
Scribe 1:  /frontend     → S5.1-S5.6
Scribe 2:  /backend      → S5.7
Auditor 1: /audit        → S5.8 (strings residuales)
Auditor 2: /func-audit   → S5.10 (scoring ≥ 45/50)
Auditor 3: /design-audit → S5.11 (UI regression)
Tester:    /test-v2      → S5.9
Documenter:/doc-process   → S5.12
```

### Criterio de Salida FINAL
- [ ] 0 strings ES hardcoded en archivos .tsx (excepto CURP, NOM-151, nombres propios)
- [ ] 0 strings ES hardcoded en archivos backend user-facing
- [ ] Todos los emails envían en idioma del usuario
- [ ] SMS/WhatsApp envían en idioma del usuario
- [ ] Service Worker muestra notificaciones push en idioma correcto
- [ ] PDFs se generan en idioma del usuario
- [ ] /func-audit score ≥ 45/50
- [ ] /design-audit: sin overflow ni truncamiento en EN
- [ ] Tests e2e verdes en ES y EN
- [ ] Documentación de cómo agregar un tercer idioma

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Strings EN más largos → UI overflow | MEDIO | /design-audit en Sprint 2, Tailwind truncate/wrap |
| Templates WABA EN tardan en aprobarse | BAJO | Fallback a texto libre EN (dentro de 24h window) |
| Términos MX sin equivalente EN (CURP, NOM-151) | BAJO | Mantener original + explicación entre paréntesis |
| Service Worker fuera del tree React | MEDIO | Bundle JSON separado, postMessage para cambio dinámico |
| Zod schemas no tienen acceso a hooks | BAJO | Factory function `getSchema(t)` documentado |
| confirm()/alert() nativos no traducibles | BAJO | Ya planeado reemplazar con modales custom |

---

## Dependencias Externas

| Dependencia | Sprint | Estado |
|-------------|--------|--------|
| Templates WABA EN aprobados por Meta | Sprint 3 | Por registrar |
| `react-i18next` ^14.x | Sprint 1 | Disponible en npm |
| `i18next-http-middleware` ^3.x | Sprint 1 | Disponible en npm |
| Traducciones EN de contenido legal MX | Sprint 3 | Requiere revisión legal |

---

## Resumen de Agentes por Sprint

| Sprint | Agentes Involucrados | Swarm/Team |
|--------|---------------------|------------|
| **S1** | /architect, /backend, /database, /frontend, /integration, /test-v2 | Agent Team "i18n-infra" |
| **S2** | /frontend, /ux-strategy, /tailwind, /integration, /design-audit, /test-v2 | Agent Team "i18n-frontend-core" |
| **S3** | /frontend ×3, /backend, /mexico, /ux-strategy, /swarm-verify | Swarm Build "i18n-modules" |
| **S4** | /frontend, /backend, /test-v2 | Agent Team "i18n-admin" |
| **S5** | /frontend, /backend, /audit, /func-audit, /design-audit, /test-v2, /doc-process | Swarm Ship "i18n-release" |

**Total agentes únicos:** 13 de 31 disponibles
**Swarms utilizados:** /swarm-plan (planning), /swarm-build (Sprint 3), /swarm-verify (Sprint 3), /swarm-ship (Sprint 5)

---

## Timeline

```
Sprint 1 ████████░░░░░░░░░░░░░░░░░░  2-3 días  │ Infraestructura
Sprint 2 ░░░░░░░░████████░░░░░░░░░░  2-3 días  │ Frontend Core
Sprint 3 ░░░░░░░░░░░░░░░░████████████  3-4 días  │ Módulos + Emergency
Sprint 4 ░░░░░░░░░░░░░░░░░░░░░░████████  2-3 días  │ Admin + Subs
Sprint 5 ░░░░░░░░░░░░░░░░░░░░░░░░░░████████  2-3 días  │ QA + Ship
                                              ─────────
                                              12-16 días total
```
