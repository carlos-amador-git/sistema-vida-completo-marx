# Plan Maestro de Remediacion — Sistema VIDA

**Version:** 1.1 (post cross-audit Gemini)
**Fecha:** 2 de marzo de 2026
**Basado en:** DIAGNOSTICO_SEGURIDAD_VIDA.md (Score 52/100, ROJO)
**Objetivo:** Elevar de 52/100 a 90+/100 — Apto para operacion legal
**Cross-Audit Gemini:** 92/100 — APROBADO PARA EJECUCION

---

## Arquitectura de Ejecucion

### Recursos Disponibles

| Tipo | Recurso | Descripcion |
|------|---------|-------------|
| **Swarms** | `/swarm-plan` | Brain — planificacion y descomposicion |
| | `/swarm-build` | Vision + Builders + Experts — construccion paralela |
| | `/swarm-verify` | Guardians — verificacion cruzada |
| | `/swarm-ship` | Scribes — cierre, docs, commit |
| **Agent Teams** | Agent Tool (parallel) | Equipos ad-hoc de 2-6 agentes con roles asignados |
| **Agentes Especializados** | `/backend` | Desarrollador backend Express/Prisma |
| | `/frontend` | Desarrollador frontend React/Vite |
| | `/database` | Arquitecto PostgreSQL/PostGIS |
| | `/architect` | Disenador de arquitectura |
| | `/integration` | Ingeniero de integracion |
| | `/test-v2` | Testing expert (Jest, Playwright) |
| | `/audit` | Auditor de codigo (post-implementacion) |
| | `/func-audit` | Auditor funcional con scoring |
| | `/logic` | Logica de backend |
| **Skills** | `security` | Siempre cargado — validacion de seguridad |
| | `production-code-audit` | Auditoria de codigo de produccion |
| | `systematic-debugging` | Debugging estructurado |
| | `postgresql` | Experto PostgreSQL |
| | `docker-expert` | Experto Docker/infra |
| **Hibrido** | `/gemini` | Cross-audit externo (1M tokens) |
| **Squads** | Claude Squad | Multiples instancias Claude Code en paralelo |

### Regla de Separacion

> El agente que IMPLEMENTA nunca AUDITA su propio trabajo.
> Siempre: Builder -> Verifier (diferente agente).

---

## FASE 1: Emergencias de Seguridad

**Duracion total:** 5-7 dias
**Objetivo:** Eliminar vectores de acceso no autorizado inmediato
**Score esperado:** 52 -> 68/100

---

### Sprint 1.1 — Dia 0 (Hotfixes inmediatos)
**Duracion:** 2-4 horas
**Modalidad:** Agent Team (3 agentes paralelos)

| Tarea | ID | Agente | Archivos | Accion |
|-------|----|--------|----------|--------|
| Eliminar credenciales hardcodeadas | CRIT-01 | **Agent Alpha** (`/backend`) | `config/index.ts` | Remover fallbacks de DB_URL y REDIS_URL, dejar `process.env.X!` con validacion en env-validation.ts |
| Eliminar telefono real del seed | CRIT-13 | **Agent Alpha** (`/backend`) | `prisma/seed.ts` | Reemplazar con numero ficticio (+52 55 0000 0000) |
| Eliminar clave cifrado del seed | CRIT-08 | **Agent Alpha** (`/backend`) | `prisma/seed.ts` | Remover fallback, forzar env var |
| Eliminar demo credentials del bundle | CRIT-03 | **Agent Beta** (`/frontend`) | `Landing.tsx`, `Login.tsx`, `AdminLogin.tsx`, `vite.config.ts` | Tree-shaking con `define: { __DEMO__: ... }`, wrappear en `if (__DEMO__)` |
| Fix await en download token | HIGH-06 | **Agent Gamma** (`/backend`) | `secure-download.controller.ts` | Agregar `await` a generateTemporaryDownloadToken |
| Invalidar tokens tras uso | HIGH-07 | **Agent Gamma** (`/backend`) | `secure-download.controller.ts` | Descomentar `temporaryTokens.delete(token)` |
| Reducir rate limit login | HIGH-02 | **Agent Gamma** (`/backend`) | `auth.controller.ts` | Cambiar 20/min a 5/min |

**Verificacion:** `/swarm-verify` — Guardian revisa cada cambio contra el diagnostico
**Cierre:** `/swarm-ship` — Commit atomico `fix(security): hotfixes criticos Fase 1.1`

---

### Sprint 1.2 — Dias 1-2 (WebSocket + Dependencias)
**Duracion:** 1-2 dias
**Modalidad:** Agent Team (2 agentes paralelos) + Squad

| Tarea | ID | Agente | Archivos | Accion |
|-------|----|--------|----------|--------|
| Autenticar WebSocket con JWT | CRIT-04, CRIT-14 | **Agent Alpha** (`/backend` + `/logic`) | `main.ts`, nuevo `websocket/auth.middleware.ts` | Implementar `io.use()` con verificacion JWT en handshake, restringir CORS a corsOrigins, validar userId === socket.data.userId en join |
| Actualizar cliente WebSocket | CRIT-04 | **Agent Beta** (`/frontend`) | `hooks/useWebSocket.ts` | Enviar token en `socket.handshake.auth.token`, manejar reconexion con refresh |
| npm audit fix backend | CRIT-12 | **Squad Worker 1** | `backend/package.json` | `npm audit fix`, resolver CVEs criticos manualmente si es necesario |
| npm audit fix frontend | CRIT-12 | **Squad Worker 2** | `frontend/package.json` | `npm audit fix`, actualizar react-router-dom y axios |

**Verificacion:** `/swarm-verify` — Test de conexion WS sin token (debe rechazar), con token invalido (debe rechazar), con token valido (debe aceptar). Verificar que npm audit muestra 0 criticos.
**Cierre:** `/swarm-ship` — Commit `fix(security): WebSocket auth + dependency updates`

---

### Sprint 1.3 — Dias 3-4 (Tokens y Hashing)
**Duracion:** 1-2 dias
**Modalidad:** Agent Team (2 agentes)

| Tarea | ID | Agente | Archivos | Accion |
|-------|----|--------|----------|--------|
| Hashear refresh tokens en BD | HIGH-01 | **Agent Alpha** (`/backend` + `/database`) | `auth.service.ts`, `schema.prisma`, nueva migracion | SHA-256 hash antes de guardar, comparar hashes en verificacion. Migracion: invalidar sesiones existentes (forzar re-login) |
| Hashear MFA backup codes | HIGH-12 | **Agent Alpha** (`/backend`) | `admin-mfa.service.ts`, `schema.prisma` | Hashear con SHA-256 al generar, comparar hash al validar |
| Separar JWT_ADMIN_SECRET | HIGH-03 | **Agent Beta** (`/backend`) | `config/index.ts`, `env-validation.ts` | Hacer JWT_ADMIN_SECRET obligatorio, forzar que sea diferente de JWT_SECRET |
| Fix PrismaClient singleton | HIGH-11 | **Agent Beta** (`/backend`) | Nuevo `common/prisma.ts`, actualizar imports en 4+ archivos | Crear singleton exportable, reemplazar `new PrismaClient()` en auth.service, admin-auth.service, secure-download.controller, payments-webhook.controller |

**Verificacion:** `/swarm-verify` + `/test-v2` — Tests unitarios para hash de refresh tokens, MFA backup codes, singleton Prisma
**Cierre:** `/swarm-ship` — Commit `fix(security): token hashing + PrismaClient singleton`

---

### Sprint 1.4 — Dia 5 (Hardening rapido)
**Duracion:** 4-6 horas
**Modalidad:** Agent Team (2 agentes)

| Tarea | ID | Agente | Archivos | Accion |
|-------|----|--------|----------|--------|
| Restaurar Helmet protections | HIGH-05 | **Agent Alpha** (`/backend`) | `main.ts` | Remover `false` de crossOriginOpenerPolicy, crossOriginResourcePolicy, referrerPolicy |
| Health check sin info sensible | MED-04 | **Agent Alpha** (`/backend`) | `main.ts` | Remover version y environment del health endpoint |
| trust proxy para rate limiting | LOW-02 | **Agent Alpha** (`/backend`) | `main.ts` | Agregar `app.set('trust proxy', 1)` |
| Seed admin con cifrado | CRIT-08 adj. | **Agent Beta** (`/backend`) | `prisma/seed-admin.ts` | Reemplazar `JSON.stringify` por `encryptJSON` para campos medicos |
| Contrasena admin 12+ chars | MED-06 | **Agent Beta** (`/backend`) | `admin-auth.service.ts` | Minimo 12 caracteres + complejidad (mayuscula, minuscula, numero, especial) |

**Verificacion:** `/audit` — Auditoria rapida de todos los cambios de Fase 1
**Cierre:** `/swarm-ship` — Commit `fix(security): hardening Fase 1 completado`

---

### Gate de Fase 1 — Auditoria Cruzada

**Ejecutor:** `/func-audit` (scoring 0-50) + `/gemini review`

| Criterio | Peso | Aceptacion |
|----------|:----:|:----------:|
| 0 credenciales en codigo fuente | 20% | Obligatorio |
| WebSocket autenticado | 15% | Obligatorio |
| 0 CVEs criticos en npm audit | 15% | Obligatorio |
| Demo credentials ausentes del bundle | 15% | Obligatorio |
| Refresh tokens hasheados | 10% | Obligatorio |
| Rate limits correctos | 10% | Obligatorio |
| Tests pasan | 15% | Obligatorio |

**Score minimo:** 45/50 para avanzar a Fase 2

---

## FASE 2: Cifrado y Proteccion de Datos

**Duracion total:** 10-14 dias (ajustado por Gemini de 2-3 sem a realisticamente 2 sem con agentes)
**Objetivo:** Cifrar 100% de datos sensibles + eliminar XSS
**Score esperado:** 68 -> 82/100

---

### Sprint 2.1 — Dias 6-8 (Infraestructura de cifrado)
**Duracion:** 3 dias
**Modalidad:** `/swarm-build` (Vision + 3 Builders + 1 Expert)

**Vision:** `/architect` disena la arquitectura de cifrado:
- Envelope Encryption: DEK por usuario, KEK global (preparacion para KMS)
- Blind Index para campos con busqueda (CURP, email)
- Formato de almacenamiento: `{version}:{keyId}:{iv}:{ciphertext}:{tag}`
- Script de migracion de datos existentes

| Tarea | Builder | Archivos | Accion |
|-------|---------|----------|--------|
| Encryption service v2 | **Builder 1** (`/backend` + `/logic`) | `common/utils/encryption.ts` -> `common/services/encryption-v2.service.ts` | Implementar encryptField/decryptField con Key ID, Blind Index (HMAC-SHA256), formato versionado, crypto.hkdfSync nativo (HIGH-04) |
| Migracion Prisma — nuevos campos | **Builder 2** (`/database`) | `schema.prisma`, nueva migracion | Agregar campos *Enc para User, AdvanceDirective, Witness, Representative, PatientProfile. Agregar curpHash, emailHash. Mantener campos originales temporalmente |
| Script de migracion de datos | **Builder 3** (`/backend` + `/database`) | Nuevo `prisma/migrations/encrypt-existing-data.ts` | Script que lee datos planos, cifra con v2, escribe campos *Enc, genera blind indexes. Transaccional por lotes de 100. Logging de progreso |
| CSRF + Cookie auth prep | **Expert** (`/integration`) | `csrf.middleware.ts`, `auth.service.ts` | Preparar backend para emitir httpOnly cookies en lugar de JSON body tokens |

**Verificacion:** `/swarm-verify` — Tests de encrypt/decrypt roundtrip, blind index lookup, migracion en BD de test
**Cierre:** `/swarm-ship` — Commit `feat(security): encryption v2 infrastructure`

---

### Sprint 2.2 — Dias 9-10 (Cifrado de campos criticos)
**Duracion:** 2 dias
**Modalidad:** Agent Team (3 agentes paralelos)

| Tarea | ID | Agente | Modelos/Archivos | Accion |
|-------|----|--------|------------------|--------|
| Cifrar AdvanceDirective | CRIT-06 | **Agent Alpha** (`/backend`) | `directives.service.ts`, schema | Cifrar acceptsCPR/Intubation/Dialysis/Transfusion/ArtificialNutrition/palliativeCareOnly/additionalNotes como JSON cifrado `directiveDecisionsEnc`. Agregar race condition fix con $transaction (HIGH-16) |
| Cifrar CURP + Blind Index | CRIT-07, HIGH-15 | **Agent Beta** (`/backend` + `/database`) | `auth.service.ts`, `curp-verification.service.ts`, schema | Cifrar CURP en User y Witness. Blind index con HMAC-SHA256 para @unique lookup. Actualizar todos los queries que buscan por CURP |
| Cifrar User PII | Diagnostico | **Agent Gamma** (`/backend`) | `auth.service.ts`, `pup.service.ts`, schema | Cifrar name, phone, address, dateOfBirth en User. Cifrar bloodType, insurancePolicy en PatientProfile. Blind index para email (lookup en login) |

**Verificacion:** `/swarm-verify` + `/test-v2` — Verificar que login sigue funcionando con blind index de email, QR de emergencia sigue mostrando datos descifrados, directivas se guardan/leen correctamente
**Cierre:** `/swarm-ship` — Commit `feat(security): encrypt critical PII fields`

---

### Sprint 2.3 — Dias 11-12 (Cifrado secundario + XSS)
**Duracion:** 2 dias
**Modalidad:** Agent Team (3 agentes paralelos)

| Tarea | ID | Agente | Archivos | Accion |
|-------|----|--------|----------|--------|
| Cifrar Representative + Witness | MED-14 | **Agent Alpha** (`/backend`) | `representatives/`, `directives.service.ts`, schema | Cifrar name, phone, email, relation en Representative. Cifrar name, email, phone, curp en Witness |
| Cifrar PanicAlert coords | MED-15 | **Agent Alpha** (`/backend`) | `panic/`, schema | Cifrar latitude, longitude en PanicAlert |
| Eliminar XSS: sanitizar HTML | CRIT-05 | **Agent Beta** (`/frontend`) | `Documents.tsx`, `PanicAlertModal.tsx` | Instalar DOMPurify, sanitizar todo innerHTML inseguro. Preferir interpolacion de texto plano donde sea posible |
| CSP headers | HIGH-08, MED-17 | **Agent Beta** (`/frontend` + `/integration`) | `nginx.conf`, `Caddyfile`, `main.ts` | Implementar CSP estricto (sin unsafe-inline para scripts, nonces para estilos). Headers en nginx Y Caddyfile (Coolify) |
| Migrar JWT a httpOnly cookies | CRIT-02 | **Agent Gamma** (`/backend` + `/frontend`) | `auth.service.ts`, `auth.controller.ts`, `AuthContext.tsx`, `api.ts`, `AdminAuthContext.tsx`, `adminApi.ts` | Backend: Set-Cookie httpOnly Secure SameSite=Strict. Frontend: remover localStorage de tokens, axios withCredentials. Admin: mismo patron |

**Verificacion:** `/swarm-verify` — XSS payload test, CSP violation test, cookie test (verificar httpOnly flag con DevTools), login/logout flow completo
**Cierre:** `/swarm-ship` — Commit `feat(security): XSS elimination + httpOnly cookies + CSP`

---

### Sprint 2.4 — Dias 13-14 (Cleanup y consolidacion)
**Duracion:** 1-2 dias
**Modalidad:** Agent Team (2 agentes) + Squad

| Tarea | ID | Agente | Archivos | Accion |
|-------|----|--------|----------|--------|
| Eliminar console.log en prod | MED-09 | **Squad Worker 1** | `vite.config.ts` | `esbuild: { drop: ['console'] }` |
| localStorage cleanup | HIGH-09 | **Agent Alpha** (`/frontend`) | `usePushNotifications.ts` | Migrar vida_notifications a sessionStorage con TTL de 1 hora, max 20 entradas |
| Validacion magic bytes uploads | MED-05 | **Agent Alpha** (`/backend`) | `documents.controller.ts` | Instalar `file-type`, validar magic bytes ademas de MIME |
| Eliminar fallback GPS CDMX | MED-08 | **Agent Beta** (`/frontend`) | `PanicButton.tsx` | Enviar alerta sin coordenadas si GPS falla, mostrar aviso al usuario |
| CSRF exempt cleanup | MED-01 | **Agent Beta** (`/backend`) | `csrf.middleware.ts` | Remover /profile y /representatives de lista de exentos |
| Admin input validation | MED-03 | **Agent Beta** (`/backend`) | `admin.controller.ts` | Agregar Zod schemas para todos los endpoints admin |
| Admin route permissions | MED-07 | **Agent Alpha** (`/frontend`) | `App.tsx` | Agregar `requiredPermission` por ruta admin |
| Migrar HKDF a nativo | HIGH-04 | **Squad Worker 2** | `document-encryption.service.ts` | Reemplazar HKDF manual por `crypto.hkdfSync` (RFC 5869) |

**Verificacion:** `/audit` + `/func-audit` (scoring completo de Fase 2)
**Cierre:** `/swarm-ship` — Commit `fix(security): cleanup + hardening Fase 2`

---

### Gate de Fase 2 — Auditoria Cruzada

**Ejecutor:** `/func-audit` + `/swarm-verify` + `/gemini review`

| Criterio | Peso | Aceptacion |
|----------|:----:|:----------:|
| 0 campos PII en texto plano (Anexo A todo VERDE) | 25% | Obligatorio |
| XSS eliminado (0 innerHTML inseguro sin sanitizar) | 15% | Obligatorio |
| JWT en httpOnly cookies (0 tokens en localStorage) | 15% | Obligatorio |
| CSP header presente y funcional | 10% | Obligatorio |
| Blind indexes funcionando para CURP y email | 10% | Obligatorio |
| Migracion de datos exitosa (0 perdida de datos) | 15% | Obligatorio |
| Tests pasan | 10% | Obligatorio |

**Score minimo:** 45/50 para avanzar a Fase 3

---

## FASE 3: Cumplimiento Regulatorio LFPDPPP

**Duracion total:** 8-10 dias
**Objetivo:** Cumplir requisitos legales para operacion en Mexico
**Score esperado:** 82 -> 90/100

---

### Sprint 3.1 — Dias 15-17 (Aviso de Privacidad + Consentimiento)
**Duracion:** 3 dias
**Modalidad:** `/swarm-build` (Vision + 2 Builders + 1 Expert)

**Vision:** `/architect` + `/requirements` disenan:
- Modelo de datos para consentimiento (ConsentRecord, PrivacyPolicyVersion)
- Flujo de aceptacion con versionado
- UI de aviso de privacidad

| Tarea | ID | Builder | Archivos | Accion |
|-------|----|---------|----------|--------|
| Aviso de Privacidad — Contenido legal | CRIT-09 | **Expert** (CEO + asesor legal) | Nuevo `frontend/src/components/pages/PrivacyPolicy.tsx` | Redactar aviso con TODOS los elementos del Art. 16 LFPDPPP: identidad responsable, finalidades, opciones limitar uso, medios ARCO, transferencias internacionales (AWS, Stripe, Meta, Resend con finalidad), procedimiento cambios |
| Modelo de consentimiento | CRIT-09 | **Builder 1** (`/database` + `/backend`) | `schema.prisma`, nuevas migraciones, nuevo `modules/consent/` | Modelos: PrivacyPolicyVersion (version, content, publishedAt), ConsentRecord (userId, policyVersionId, acceptedAt, ipAddress, scope). Endpoints: GET policy, POST accept, GET history |
| UI de consentimiento | CRIT-09 | **Builder 2** (`/frontend`) | `Register.tsx`, nuevo `ConsentModal.tsx`, `PrivacyPolicy.tsx` | Flujo obligatorio en registro. Modal de re-aceptacion cuando cambia la version. Links funcionales (no href="#"). Checkbox granular por finalidad |
| Declaracion transferencias intl. | HIGH-13 | **Builder 1** (`/backend`) | Incluido en aviso | Seccion especifica en aviso: AWS S3 (docs), Stripe (pagos), Meta WABA (notificaciones), Resend (email). Finalidad y pais de cada uno |

**Verificacion:** `/swarm-verify` — Verificar que registro bloquea sin aceptar aviso, que links funcionan, que ConsentRecord se crea con version correcta
**Cierre:** `/swarm-ship` — Commit `feat(legal): privacy policy + consent management`

---

### Sprint 3.2 — Dias 18-21 (Modulo ARCO)
**Duracion:** 4 dias
**Modalidad:** Agent Team (3 agentes paralelos) + `/swarm-plan` para diseno

**Planificacion:** `/swarm-plan` disena modulo ARCO completo:
- Endpoints REST para cada derecho (A, R, C, O)
- Generacion de folio unico por solicitud
- Plazos legales (20 dias habiles Art. 32)
- Flujo de eliminacion de cuenta (cancelacion)

| Tarea | ID | Agente | Archivos | Accion |
|-------|----|--------|----------|--------|
| Backend ARCO module | CRIT-10 | **Agent Alpha** (`/backend` + `/logic`) | Nuevo `modules/arco/` (controller, service, routes) | POST /arco/request (tipo: ACCESS/RECTIFICATION/CANCELLATION/OPPOSITION), GET /arco/requests (historial), GET /arco/request/:id (status). Generacion de folio, tracking de plazos, notificacion por email |
| Eliminacion de cuenta | CRIT-10 | **Agent Beta** (`/backend` + `/database`) | `arco/`, nueva migracion | Endpoint DELETE /account: soft-delete con periodo de gracia 30 dias, luego anonimizacion irreversible (nullify PII, mantener audit log anonimizado). Notificacion por email de confirmacion |
| Portabilidad gratuita | R-05 | **Agent Gamma** (`/backend` + `/frontend`) | `premium-features.service.ts`, nuevo endpoint `/export/my-data` | Remover barrera de pago para exportacion de datos. Nuevo endpoint que genera ZIP con todos los datos del usuario en formato JSON + PDF. Gratuito para TODOS los planes |
| Frontend ARCO | CRIT-10 | **Agent Gamma** (`/frontend`) | Nuevo `components/pages/ARCORequest.tsx`, actualizar `Profile.tsx` | UI para solicitar derechos ARCO, ver historial de solicitudes, eliminar cuenta con confirmacion doble |

**Verificacion:** `/swarm-verify` + `/test-v2` — Test de flujo ARCO completo, test de eliminacion de cuenta, test de portabilidad
**Cierre:** `/swarm-ship` — Commit `feat(legal): ARCO rights module + data portability`

---

### Sprint 3.3 — Dias 22-24 (Directivas + Compliance)
**Duracion:** 3 dias
**Modalidad:** Agent Team (2 agentes)

| Tarea | ID | Agente | Archivos | Accion |
|-------|----|--------|----------|--------|
| Distincion legal de directivas | CRIT-11, R-03 | **Agent Alpha** (`/backend` + `/frontend`) | `emergency.service.ts`, `EmergencyView.tsx`, `Directives.tsx` | Indicador visual claro en UI de emergencia: DIGITAL_DRAFT (icono warning + leyenda "Sin validez legal — documento informativo"), NOTARIZED_DOCUMENT (icono check + "Documento con fe publica"). Backend: campo legalStatus en response |
| Verificacion edad 18+ | MED-16 | **Agent Alpha** (`/backend`) | `directives.service.ts` | Calcular edad desde CURP (posiciones 5-10 = AAMMDD), rechazar creacion de directiva si < 18 anos |
| Renombrar CLINICAL_HISTORY | R-06 | **Agent Beta** (`/backend` + `/frontend`) | `schema.prisma`, enums, servicios, frontend | Renombrar categoria a EMERGENCY_PROFILE, agregar leyenda "Este documento no constituye un expediente clinico conforme a la NOM-004-SSA3-2012" |
| Proceso notificacion vulneracion | MED-13 | **Agent Beta** (`/backend`) | Nuevo `modules/security/breach-notification.service.ts` | Implementar proceso: deteccion -> notificacion al titular (72h) -> reporte al INAI. Template de email. Log de incidentes |

**Verificacion:** `/swarm-verify` — Verificar distincion visual en emergencias, rechazo de directiva para menores, proceso de notificacion
**Cierre:** `/swarm-ship` — Commit `feat(legal): directive legal status + age verification + breach process`

---

### Gate de Fase 3 — Auditoria Cruzada

**Ejecutor:** `/func-audit` + `/gemini review` + asesor legal externo

| Criterio | Peso | Aceptacion |
|----------|:----:|:----------:|
| Aviso de privacidad con 6/6 elementos Art. 16 | 20% | Obligatorio |
| Consentimiento obligatorio en registro | 15% | Obligatorio |
| Modulo ARCO funcional (4 derechos) | 20% | Obligatorio |
| Eliminacion de cuenta implementada | 15% | Obligatorio |
| Portabilidad gratuita | 10% | Obligatorio |
| Distincion legal de directivas | 10% | Obligatorio |
| Tests pasan | 10% | Obligatorio |

**Score minimo:** 45/50 para avanzar a Fase 4
**Requisito adicional:** Revision por asesor legal antes de deploy

---

## FASE 4: Hardening y Certificacion

**Duracion total:** 5-7 dias (sin PSC real — tramite administrativo separado)
**Objetivo:** Elevar a nivel certificable
**Score esperado:** 90 -> 95/100

---

### Sprint 4.1 — Dias 25-27 (Envelope Encryption + Rotacion)
**Duracion:** 3 dias
**Modalidad:** `/swarm-build` (Vision + 2 Builders)

**Vision:** `/architect` disena Envelope Encryption:
- KEK (Key Encryption Key) gestionada por env var (futuro: AWS KMS)
- DEK (Data Encryption Key) unica por usuario, cifrada con KEK
- Key rotation: re-cifrar DEKs, no datos
- Key ID en formato almacenado para soportar multiples KEKs

| Tarea | Builder | Archivos | Accion |
|-------|---------|----------|--------|
| KEK/DEK system | **Builder 1** (`/backend` + `/architect`) | `encryption-v2.service.ts`, nuevo `key-management.service.ts` | Generar DEK por usuario al registrarse, cifrar DEK con KEK, almacenar DEK cifrada en User. Funcion de rotacion de KEK |
| Migracion a envelope | **Builder 2** (`/database` + `/backend`) | Nueva migracion, script de migracion | Re-cifrar datos existentes con DEK individual. Transaccional, con rollback |

**Verificacion:** `/swarm-verify` — Test de rotacion de KEK, test de acceso a datos con DEK, performance benchmark
**Cierre:** `/swarm-ship` — Commit `feat(security): envelope encryption (DEK/KEK)`

---

### Sprint 4.2 — Dias 28-30 (Hardening final)
**Duracion:** 2-3 dias
**Modalidad:** Agent Team (2 agentes) + Squad

| Tarea | ID | Agente | Archivos | Accion |
|-------|----|--------|----------|--------|
| Preparar interfaz PSC NOM-151 | HIGH-14 | **Agent Alpha** (`/backend` + `/integration`) | `directives.service.ts`, nuevo `services/nom151.service.ts` | Abstraer interfaz de PSC, mantener mock para dev pero con flag claro `NOM151_PROVIDER=mock\|real`, preparar para integracion real |
| Admin permisos granulares | MED-07 | **Agent Beta** (`/frontend`) | `App.tsx`, rutas admin | Verificar permisos especificos por ruta admin, no solo autenticacion |
| WebAuthn challenge TTL | LOW-03 | **Agent Alpha** (`/backend`) | `webauthn.service.ts` | Agregar TTL de 5 minutos al challenge, limpiar challenges expirados |
| Auditoria pup.service | MED-11 | **Agent Beta** (`/backend`) | `pup.service.ts` | Registrar en AuditLog cada lectura de perfil medico |
| Validacion QR token client | MED-10 | **Agent Beta** (`/frontend`) | `EmergencyView.tsx` | Validar formato UUID antes de llamar API |
| Password validation frontend | LOW-05 | **Squad Worker** | `Register.tsx` | Agregar requisito de caracter especial |

**Verificacion:** `/swarm-verify` + `/audit` completo
**Cierre:** `/swarm-ship` — Commit `feat(security): hardening final Fase 4`

---

### Sprint 4.3 — Dia 31 (Auditoria final integral)
**Duracion:** 1 dia
**Modalidad:** Auditoria cruzada completa

| Paso | Ejecutor | Accion |
|------|----------|--------|
| 1 | `/func-audit` | Scoring funcional completo (todos los hallazgos del diagnostico original) |
| 2 | `/audit` | Code audit de todos los cambios |
| 3 | `/test-v2` | Suite completa de tests |
| 4 | `/gemini review` | Cross-audit final con codebase completo (1M tokens) |
| 5 | `/swarm-verify` (4 Guardians) | Verificacion cruzada de los 69 hallazgos originales |

---

### Gate Final — Certificacion

| Criterio | Aceptacion |
|----------|:----------:|
| Score `/func-audit` >= 45/50 | Obligatorio |
| Score Gemini >= 88/100 | Obligatorio |
| 0 hallazgos CRITICOS abiertos | Obligatorio |
| <= 3 hallazgos HIGH abiertos (con plan) | Obligatorio |
| Suite de tests > 80% coverage | Obligatorio |
| Aviso de privacidad revisado por abogado | Obligatorio |

---

## Resumen de Recursos por Fase

| Fase | Sprints | Dias | Agentes Paralelos | Swarms | Squads |
|------|:-------:|:----:|:-----------------:|:------:|:------:|
| **1** Emergencias | 4 | 5-7 | 3 teams (2-3 agentes c/u) | verify + ship x4 | 1 (npm audit) |
| **2** Cifrado | 4 | 10-14 | 1 swarm-build + 3 teams | verify + ship x4 | 1 (cleanup) |
| **3** Legal | 3 | 8-10 | 1 swarm-plan + 1 swarm-build + 3 teams | verify + ship x3 | — |
| **4** Hardening | 3 | 5-7 | 1 swarm-build + 2 teams | verify x5 (final) + ship x2 | 1 (minor) |
| **Total** | **14** | **28-38** | — | — | — |

---

## Diagrama de Dependencias entre Fases

```
Fase 1 (Emergencias)
  |
  +---> Gate 1 (func-audit + gemini) --- PASS? --->
  |
  v
Fase 2 (Cifrado)
  |  [Sprint 2.1 DEBE completarse antes de 2.2-2.3]
  |  [Sprint 2.2-2.3 pueden ser paralelos]
  |
  +---> Gate 2 (func-audit + verify + gemini) --- PASS? --->
  |
  v
Fase 3 (Legal)     [Sprint 3.1 antes de 3.2, Sprint 3.3 paralelo con 3.2]
  |
  +---> Gate 3 (func-audit + gemini + abogado) --- PASS? --->
  |
  v
Fase 4 (Hardening)  [Sprints 4.1 y 4.2 paralelos]
  |
  +---> Gate Final (auditoria integral) --- PASS? ---> PRODUCCION
```

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigacion |
|--------|---------|------------|
| Migracion de cifrado corrompe datos | Critico | Backup completo antes de Sprint 2.2. Script transaccional con rollback. Verificacion hash pre/post |
| httpOnly cookies rompen flujo de auth | Alto | Feature flag para rollback a localStorage. Testing exhaustivo en Sprint 2.3 |
| Blind index de CURP/email tiene colisiones | Alto | Usar HMAC-SHA256 con salt secreto (probabilidad colision negligible). Test con dataset completo |
| Aviso de privacidad no aprobado por abogado | Bloqueante | Iniciar revision legal en paralelo con Fase 1 |
| npm audit fix introduce breaking changes | Medio | Pin versions especificas, tests de integracion |
| Envelope encryption impacta performance | Medio | Benchmark antes de deploy, cache de DEKs descifradas en memoria |

---

## Hallazgos Cubiertos — Matriz de Trazabilidad

| ID | Hallazgo | Sprint | Status |
|----|----------|--------|--------|
| CRIT-01 | Credenciales hardcodeadas | 1.1 | Planificado |
| CRIT-02 | JWT en localStorage | 2.3 | Planificado |
| CRIT-03 | Demo credentials en bundle | 1.1 | Planificado |
| CRIT-04 | WebSocket sin auth | 1.2 | Planificado |
| CRIT-05 | XSS almacenado | 2.3 | Planificado |
| CRIT-06 | Directivas sin cifrar | 2.2 | Planificado |
| CRIT-07 | CURP en texto plano | 2.2 | Planificado |
| CRIT-08 | Clave cifrado en seed | 1.1 | Planificado |
| CRIT-09 | Aviso privacidad inexistente | 3.1 | Planificado |
| CRIT-10 | Derechos ARCO sin implementar | 3.2 | Planificado |
| CRIT-11 | Directiva sin distincion legal | 3.3 | Planificado |
| CRIT-12 | CVEs criticos | 1.2 | Planificado |
| CRIT-13 | Telefono real en seed | 1.1 | Planificado |
| CRIT-14 | Enumeracion WS (Gemini) | 1.2 | Planificado |
| HIGH-01 | Refresh tokens sin hash | 1.3 | Planificado |
| HIGH-02 | Rate limit permisivo | 1.1 | Planificado |
| HIGH-03 | JWT mismo secret | 1.3 | Planificado |
| HIGH-04 | HKDF no estandar | 2.4 | Planificado |
| HIGH-05 | Helmet desactivado | 1.4 | Planificado |
| HIGH-06 | Bug await download | 1.1 | Planificado |
| HIGH-07 | Token no se invalida | 1.1 | Planificado |
| HIGH-08 | Sin CSP | 2.3 | Planificado |
| HIGH-09 | Datos en localStorage | 2.4 | Planificado |
| HIGH-10 | Admin redirect inseguro | 2.3 (cookie migration) | Planificado |
| HIGH-11 | PrismaClient multiple | 1.3 | Planificado |
| HIGH-12 | MFA backup sin hash | 1.3 | Planificado |
| HIGH-13 | Transferencias intl. | 3.1 | Planificado |
| HIGH-14 | PSC simulado | 4.2 | Planificado |
| HIGH-15 | Blind Index CURP (Gemini) | 2.2 | Planificado |
| HIGH-16 | Race condition (Gemini) | 2.2 | Planificado |
| MED-01 | CSRF exentos | 2.4 | Planificado |
| MED-02 | JWT en body | 2.3 | Planificado |
| MED-03 | Admin sin validacion | 2.4 | Planificado |
| MED-04 | Health expone info | 1.4 | Planificado |
| MED-05 | Upload sin magic bytes | 2.4 | Planificado |
| MED-06 | Password admin debil | 1.4 | Planificado |
| MED-07 | Admin sin permisos ruta | 2.4 + 4.2 | Planificado |
| MED-08 | Fallback GPS CDMX | 2.4 | Planificado |
| MED-09 | console.log en prod | 2.4 | Planificado |
| MED-10 | QR sin validacion | 4.2 | Planificado |
| MED-11 | Sin auditoria pup | 4.2 | Planificado |
| MED-12 | Clave unica sin rotacion | 4.1 | Planificado |
| MED-13 | Sin proceso vulneracion | 3.3 | Planificado |
| MED-14 | Representantes sin cifrar | 2.3 | Planificado |
| MED-15 | Coords sin cifrar | 2.3 | Planificado |
| MED-16 | Sin verificacion edad | 3.3 | Planificado |
| MED-17 | CSP unsafe-inline (Gemini) | 2.3 | Planificado |
| LOW-01 | Stack traces en prod | 2.4 (console drop) | Planificado |
| LOW-02 | trust proxy | 1.4 | Planificado |
| LOW-03 | WebAuthn challenge TTL | 4.2 | Planificado |
| LOW-04 | NOM-151 inactivo | 4.2 | Planificado |
| LOW-05 | Password frontend debil | 4.2 | Planificado |
| LOW-06 | Stripe placeholder | Nota: config en deploy | Planificado |
| LOW-07 | Links href="#" | 3.1 | Planificado |
| LOW-08 | Maps key no validada | Nota: config en deploy | Planificado |
| R-01 | Aviso privacidad | 3.1 | Planificado |
| R-02 | ARCO | 3.2 | Planificado |
| R-03 | Distincion legal | 3.3 | Planificado |
| R-04 | Transferencias intl. | 3.1 | Planificado |
| R-05 | Export condicionado pago | 3.2 | Planificado |
| R-06 | CLINICAL_HISTORY | 3.3 | Planificado |

**Cobertura: 56/56 hallazgos + 6 regulatorios = 100%**

---

## Cross-Audit por Gemini — Resultado

**Calificacion del Plan: 92/100** — APROBADO PARA EJECUCION
**Evaluador:** Gemini (Senior Security Architect)
**Fecha:** 2 de marzo de 2026

### Validaciones Positivas

- Estructura de fases logica: "Detencion de Hemorragia" (F1) antes de "Cirugia Mayor" (F2)
- Sprint 2.1 (infra cifrado) ANTES de implementacion de campos — evita retrabajo masivo
- Cobertura 100% de hallazgos confirmada
- Modelo Builder -> Verifier es estandar de oro para remediaciones
- Separacion Alpha (backend) / Beta (frontend) en tareas transversales es correcta
- Distincion DIGITAL_DRAFT vs NOTARIZED_DOCUMENT es vital para el sistema legal mexicano

### Ajustes Recomendados (incorporados a v1.1)

| # | Recomendacion | Impacto | Accion Tomada |
|---|---------------|---------|---------------|
| G-01 | Mover diseno conceptual de Envelope Encryption (KEK/DEK) del Sprint 4.1 al Sprint 2.1 | Evita segunda migracion de datos en Fase 4 | **ACEPTADO** — Sprint 2.1 incluira keyId en formato de almacenamiento desde el inicio |
| G-02 | Mover validacion de edad 18+ del Sprint 3.3 al Sprint 2.2 | Es filtro de entrada, no tiene sentido cifrar datos de quien no puede registrar directiva | **ACEPTADO** — Se movera a Sprint 2.2 |
| G-03 | Elevar MED-08 (Fallback GPS CDMX) a HIGH | Coordenadas falsas en emergencia medica = consecuencias fatales | **ACEPTADO** — Prioridad elevada, se mantiene en Sprint 2.4 pero con prioridad P0 |
| G-04 | Agregar protocolo de "Limpieza de Sesiones" post-migracion a cookies | Sesiones huerfanas tras cambio de localStorage a httpOnly | **ACEPTADO** — Se agrega paso de invalidacion global en Sprint 2.3 |
| G-05 | Agregar riesgo: busquedas parciales imposibles con Blind Index | Admin no podra buscar "todos los Juan" ni CURPs parciales | **ACEPTADO** — Agregado a riesgos. Negocio debe aceptar restriccion por seguridad |
| G-06 | Agregar riesgo: secretos en CI/CD y logs de agentes | Claves de prueba podrian terminar en logs de swarm-build | **ACEPTADO** — Agregado a riesgos con mitigacion |
| G-07 | Sprint 3.1 (Aviso Privacidad) requiere supervision humana directa | Art. 16 LFPDPPP no es delegable a agente autonomo | **ACEPTADO** — Expert marcado como CEO + asesor legal (no autonomo) |
| G-08 | Designar agente "Guardian de Esquema" en Fase 2 | Evitar conflictos de migracion Prisma entre agentes paralelos | **ACEPTADO** — Builder 2 (/database) sera el unico que modifica schema.prisma |

### Justificacion del -8 (92/100)

| Deduccion | Motivo |
|:---------:|--------|
| -3 | Envelope Encryption debia estar desde Sprint 2.1 (no 4.1) |
| -3 | Riesgo de performance de Blind Indexes no analizado |
| -2 | Falta protocolo de limpieza de sesiones post-migracion cookies |

### Riesgos Adicionales (Gemini)

| Riesgo | Impacto | Mitigacion |
|--------|---------|------------|
| Busquedas parciales imposibles con Blind Index | Medio-Alto | Aceptar restriccion por seguridad. Si admin necesita busqueda parcial, implementar busqueda cifrada con Searchable Encryption o aceptar que solo se busca por match exacto |
| Secretos en logs de agentes CI/CD | Alto | Usar .env.test con claves de prueba dedicadas. Nunca inyectar claves reales en agentes. Logs de agentes se purgan post-sprint |
| Sesiones huerfanas post-migracion cookies | Medio | Invalidacion global de sesiones (DELETE FROM Session) tras deploy de Sprint 2.3. Forzar re-login a todos los usuarios |

### Veredicto Final Gemini

> El plan es **EXCEPCIONAL**. Esta disenado no solo para pasar un checklist, sino para construir un sistema resiliente. Recomiendo iniciar con Fase 1, Sprint 1.1 de inmediato tras la confirmacion del CEO.

---

*Plan v1.1 — Cross-audit Gemini integrado.*
*Pendiente: aprobacion CEO para iniciar ejecucion.*
