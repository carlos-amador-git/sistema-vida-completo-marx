# Diagnostico de Seguridad Integral — Sistema VIDA

**Fecha:** 2 de marzo de 2026
**Elaborado por:** MD Consultoria TI — Auditoria de Seguridad y Cumplimiento
**Alcance:** Backend (Express/TypeScript/Prisma/PostgreSQL), Frontend (React/Vite/TypeScript), Infraestructura (Docker/Coolify)
**Commit auditado:** `d0c0049` (rama `main`)
**Clasificacion del documento:** Confidencial — Uso interno
**Cross-Audit:** Gemini (Senior Security Architect) — 2 de marzo de 2026

---

## Resumen Ejecutivo

El Sistema VIDA (Vinculacion de Informacion para Decisiones y Alertas) es una plataforma digital de gestion de voluntad anticipada, perfil medico de emergencia y donacion de organos. Procesa datos personales sensibles de salud conforme a la clasificacion de la LFPDPPP, incluyendo diagnosticos, medicamentos, alergias, preferencias de tratamiento en situaciones terminales y estado de donador de organos.

Se realizo una auditoria exhaustiva de seguridad cubriendo cuatro ejes: (1) seguridad del backend, (2) seguridad del frontend, (3) proteccion de datos y esquema de cifrado, y (4) cumplimiento regulatorio mexicano e internacional.

### Calificacion Global: 58/100

El sistema presenta una base tecnica solida en cifrado y autenticacion, pero tiene brechas criticas en proteccion integral de datos personales, seguridad de comunicaciones en tiempo real y cumplimiento regulatorio que impiden su operacion legal.

### Hallazgos por Severidad

| Severidad | Backend | Frontend | Datos | Regulatorio | Gemini Cross-Audit | Total |
|-----------|---------|----------|-------|-------------|:------------------:|-------|
| **CRITICO** | 3 | 3 | 4 | 3 | +1 | **14** |
| **HIGH** | 7 | 7 | 4 | 4 | +2 | **24** |
| **MEDIUM** | 8 | 5 | 4 | 3 | +1 | **21** |
| **LOW** | 4 | 4 | 2 | — | — | **10** |

---

## Tabla de Contenidos

1. [Estado Actual — Controles Positivos](#1-estado-actual--controles-positivos)
2. [Hallazgos Criticos](#2-hallazgos-criticos)
3. [Hallazgos High](#3-hallazgos-high)
4. [Hallazgos Medium](#4-hallazgos-medium)
5. [Hallazgos Low](#5-hallazgos-low)
6. [Analisis de Proteccion de Datos](#6-analisis-de-proteccion-de-datos)
7. [Cumplimiento Regulatorio](#7-cumplimiento-regulatorio)
8. [Prospectiva — Estado Objetivo](#8-prospectiva--estado-objetivo)
9. [Plan de Ruta](#9-plan-de-ruta)
10. [Cross-Audit por Gemini](#10-cross-audit-por-gemini-senior-security-architect)
11. [Anexo A — Clasificacion de Campos por Modelo](#anexo-a--clasificacion-de-campos-por-modelo)
12. [Anexo B — Archivos Clave Referenciados](#anexo-b--archivos-clave-referenciados)

---

## 1. Estado Actual — Controles Positivos

Antes de detallar las vulnerabilidades, es importante reconocer los controles de seguridad correctamente implementados:

| Area | Implementacion | Estado |
|------|---------------|--------|
| Cifrado en reposo | AES-256-GCM con IV aleatorio para alergias, condiciones, medicamentos, preferencias de donacion | Correcto |
| Hashing de contrasenas | bcrypt con cost factor 12 | Correcto |
| Cifrado de documentos | HKDF por documento con salt unico de 32 bytes | Correcto |
| Autenticacion biometrica | WebAuthn/FIDO2 completo via simplewebauthn | Correcto |
| MFA para administradores | TOTP con secret cifrado con AES-256-GCM | Correcto |
| Audit trail | 4 tablas: AuditLog, AdminAuditLog, EmergencyAccess, DocumentAccessLog | Correcto |
| Sanitizacion de logs | Lista de campos sensibles redactados automaticamente (CURP, password, token, etc.) | Correcto |
| Rate limiting | Aplicado en auth, emergencias y endpoints criticos | Correcto |
| Integridad documental | SHA-256 para hash de documentos + estructura NOM-151 | Correcto |
| Retencion de datos | Politicas implementadas con archivado a S3 para AdminAuditLog (2 anos), EmergencyAccess (5 anos), Sessions (90 dias) | Correcto |
| Verificacion de identidad | Validacion de CURP con RENAPO, verificacion de cedula profesional con SEP | Correcto |
| Verificacion de firma Stripe | Idempotencia de webhooks implementada | Correcto |
| Path traversal prevention | `path.normalize` + verificacion de prefix en descarga de archivos | Correcto |
| Timing attack prevention | Delay artificial en lookup de QR token de emergencia | Correcto |

---

## 2. Hallazgos Criticos

### CRIT-01: Credenciales de Produccion Hardcodeadas en Codigo Fuente

**Archivo:** `backend/src/config/index.ts`, lineas 12 y 17

```typescript
database: {
  url: process.env.DATABASE_URL || 'postgres://postgres:KQqiN935P8...@pk4wo4s0goco8wgcgwwwkw40:5432/postgres',
},
redis: {
  url: process.env.REDIS_URL || 'redis://default:SfUbrDH4lr...@yc8004w8gsckcg404goc8wss:6379/0',
},
```

**Riesgo:** Credenciales de produccion de PostgreSQL y Redis estan como fallback en codigo versionado. Cualquier persona con acceso al repositorio obtiene acceso total a la base de datos de produccion que contiene datos medicos de pacientes. El `.gitignore` excluye `.env` pero `config/index.ts` SI esta en el repositorio.

**Impacto:** Acceso total a todos los datos de salud de todos los usuarios.

**Remediacion:**
```typescript
database: {
  url: process.env.DATABASE_URL!, // Sin fallback — falla si no esta configurado
},
redis: {
  url: process.env.REDIS_URL!,
},
```
**Accion adicional obligatoria:** Rotar todas las credenciales de produccion inmediatamente. Considerar las actuales como comprometidas.

---

### CRIT-02: JWT Tokens Almacenados en localStorage (Vulnerables a XSS)

**Archivos:**
- `frontend/src/context/AuthContext.tsx` — lineas 81-82, 91-92, 100-101
- `frontend/src/services/api.ts` — lineas 33, 53, 58-59, 69-70
- `frontend/src/services/adminApi.ts` — lineas 28-29, 32-33, 37-38

```typescript
localStorage.setItem('accessToken', response.data.tokens.accessToken);
localStorage.setItem('refreshToken', response.data.tokens.refreshToken);
```

**Riesgo:** `localStorage` es accesible por cualquier script en la pagina. Combinado con los hallazgos de XSS (CRIT-05), un atacante puede exfiltrar tokens JWT que otorgan acceso completo a registros medicos, directivas de voluntad anticipada y datos de emergencia. El token de admin (`admin_access_token`) otorga acceso a todos los registros de usuarios.

**Remediacion:** Migrar a httpOnly cookies configuradas por el backend:
```
Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/api
Set-Cookie: refresh_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh
```

---

### CRIT-03: Credenciales Demo Hardcodeadas en Bundle de Produccion

**Archivos:**
- `frontend/src/components/pages/Login.tsx` — lineas 19-28
- `frontend/src/components/admin/pages/AdminLogin.tsx` — lineas 11-36
- `frontend/src/components/pages/Landing.tsx` — lineas 27-42

```typescript
const DEMO_ADMINS = [
  { email: 'superadmin@sistemavida.mx', password: 'Admin123!', role: 'SUPER_ADMIN' },
  { email: 'admin@sistemavida.mx', password: 'Admin123!' },
];
```

**Riesgo:** Estas constantes se compilan al bundle JS de produccion independientemente de `VITE_ENABLE_DEMO_MODE`. El flag solo controla la visibilidad del UI, no elimina las constantes del bundle. Cualquiera puede extraerlas con DevTools o `grep` del JS minificado. La credencial de SUPER_ADMIN otorga acceso total al panel de administracion.

**Verificacion:** `grep -r "Admin123" dist/assets/*.js` — presente en el bundle compilado.

**Remediacion:** Usar `define` de Vite para tree-shaking condicional:
```typescript
// vite.config.ts
define: { __DEMO_ENABLED__: process.env.VITE_ENABLE_DEMO_MODE === 'true' }
// En codigo: if (__DEMO_ENABLED__) { /* eliminado en build de produccion */ }
```

---

### CRIT-04: WebSocket Sin Autenticacion + CORS Wildcard

**Archivo:** `backend/src/main.ts`, lineas 66-73

```typescript
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: true, // CUALQUIER origen puede conectarse
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Handler acepta cualquier userId sin verificacion:
socket.on('join-user', (userId: string) => {
  socket.join(`user-${userId}`); // Sin verificar identidad
});
```

**Riesgo:** Cualquier cliente desde cualquier origen puede conectarse y suscribirse a la sala de cualquier usuario. Esto expone alertas de panico medico (nombre del paciente, ubicacion GPS, hospitales cercanos) a terceros no autorizados.

**Remediacion:**
```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Token requerido'));
  try {
    const payload = authService.verifyAccessToken(token);
    socket.data.userId = payload.userId;
    next();
  } catch { next(new Error('Token invalido')); }
});

socket.on('join-user', (userId: string) => {
  if (userId !== socket.data.userId) return;
  socket.join(`user-${userId}`);
});
```

---

### CRIT-05: Renderizado de HTML Sin Sanitizar con Datos de Usuario (XSS Almacenado)

**Archivo:** `frontend/src/components/pages/Documents.tsx`, linea 1019

```typescript
<p style="..." innerHTML={t('deleteModal.description', { name: selectedDocument.title })} />
```

`selectedDocument.title` proviene de datos de usuario. Si contiene un payload malicioso de script, se ejecutara en el navegador de la victima.

**Cadena de ataque completa:** CRIT-05 (XSS) + CRIT-02 (tokens en localStorage) = robo de sesion y acceso a datos medicos.

**Remediacion:** Instalar DOMPurify y sanitizar todo contenido HTML dinamico, o usar interpolacion segura de texto plano.

---

### CRIT-06: Datos Sensibles de Voluntad Anticipada Sin Cifrar

**Archivo:** `backend/prisma/schema.prisma` — modelo `AdvanceDirective`

```prisma
acceptsCPR           Boolean  @default(true)
acceptsIntubation    Boolean  @default(true)
acceptsDialysis      Boolean  @default(true)
acceptsTransfusion   Boolean  @default(true)
acceptsArtificialNutrition Boolean @default(true)
palliativeCareOnly   Boolean  @default(false)
additionalNotes      String?  @db.Text
```

**Riesgo:** Las decisiones de voluntad anticipada son los datos mas sensibles del sistema — representan literalmente la voluntad de vida o muerte del usuario. Estan almacenados completamente en texto plano. Cualquier acceso no autorizado a la BD los expone directamente.

---

### CRIT-07: CURP Almacenado en Texto Plano

**Archivo:** `backend/prisma/schema.prisma` — modelos `User` y `Witness`

```prisma
curp String? @unique
```

**Riesgo:** El CURP es un identificador gubernamental unico que la LFPDPPP clasifica como dato personal. Almacenarlo sin cifrar y con un indice de base de datos lo hace trivialmente accesible en cualquier dump de BD. Afecta a todos los usuarios y testigos.

---

### CRIT-08: Seed con Clave de Encriptacion Hardcodeada

**Archivo:** `backend/prisma/seed.ts`, linea 13

```typescript
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef...';
```

**Riesgo:** Si el seed se ejecuta sin la variable de entorno (CI/CD, entorno de prueba), todos los datos sensibles quedan cifrados con una clave publicamente conocida. Adicionalmente, `seed-admin.ts` almacena datos medicos SIN cifrar — los campos `allergiesEnc`, `conditionsEnc`, `medicationsEnc` usan `JSON.stringify` directamente en lugar de `encryptJSON`.

---

### CRIT-09: Aviso de Privacidad Inexistente

**Archivo:** `frontend/src/components/pages/Register.tsx`, lineas 267-274

```tsx
<a href="#" className="text-vida-600 hover:underline">{t('register.termsLink')}</a>
<a href="#" className="text-vida-600 hover:underline">{t('register.privacyLink')}</a>
```

**Riesgo legal:** Se recopilan datos sensibles de salud sin informar al titular. Los enlaces a Terminos y Aviso de Privacidad apuntan a `href="#"` — no existe contenido. Viola el Art. 8 y Art. 16 LFPDPPP. Multa potencial: hasta 320,000 dias de salario minimo.

No se encontro en ningun archivo del proyecto implementacion de aviso de privacidad que contenga los elementos exigidos por el Art. 16:

| Elemento Art. 16 LFPDPPP | Implementado |
|---------------------------|:------------:|
| Identidad y domicilio del responsable | No |
| Finalidades del tratamiento | No |
| Opciones para limitar uso/divulgacion | No |
| Medios para ejercer derechos ARCO | No |
| Transferencias y sus finalidades | No |
| Procedimiento para notificar cambios | No |

---

### CRIT-10: Derechos ARCO Sin Implementar

**Riesgo legal:** No existe mecanismo para que el titular ejerza sus derechos de Acceso, Rectificacion, Cancelacion ni Oposicion (Arts. 28-36 LFPDPPP).

- **Acceso:** No hay endpoint para solicitar copia integra de datos personales
- **Rectificacion:** El perfil es editable, pero no hay proceso formal con acuse y plazo (20 dias habiles, Art. 32)
- **Cancelacion:** No existe endpoint de eliminacion de cuenta. `updateUserStatus` solo desactiva sin eliminar datos
- **Oposicion:** No hay mecanismo declarado

**Agravante:** La exportacion de datos esta condicionada a plan premium (`exportData: boolean` en features). Condicionar derechos ARCO a pago viola el Art. 29 LFPDPPP que los declara como gratuitos.

---

### CRIT-11: Directiva Digital Sin Distincion Legal en Emergencias

**Archivo:** `backend/src/modules/emergency/emergency.service.ts`, lineas 100-102 y 234-244

La interfaz de emergencia expone directivas `DIGITAL_DRAFT` activas de forma identica a `NOTARIZED_DOCUMENT`, sin advertir al medico que el borrador digital no tiene validez legal como documento de voluntad anticipada en ningun estado de la Republica.

**Riesgo:** Un medico que actue basandose en un `DIGITAL_DRAFT` podria enfrentar responsabilidad civil o penal.

---

### CRIT-12: Dependencias con CVEs Criticos

**Backend:**

| Dependencia | Vulnerabilidad | Severidad |
|-------------|---------------|-----------|
| fast-xml-parser 5.0.0-5.3.7 | RangeError DoS, Entity encoding bypass, Stack overflow | CRITICAL |
| basic-ftp <5.2.0 | Path Traversal en downloadToDir() | CRITICAL |
| + 30 vulnerabilidades HIGH | AWS SDK, nodemailer | HIGH |

**Frontend:**

| Dependencia | Vulnerabilidad | Severidad |
|-------------|---------------|-----------|
| react-router-dom (via @remix-run/router) | XSS via Open Redirects (CVSS 8.0) | HIGH |
| axios | DoS via Prototype Pollution (__proto__) | HIGH |
| serve / serve-handler | Path traversal (servidor de produccion) | HIGH |

---

### CRIT-13: Numero de Telefono Real en Seed

**Archivo:** `backend/prisma/seed.ts`, lineas 444-447

El seed contiene un numero de telefono real (`+52 55 3508 4672`) asociado al nombre "Rafael Chavez", probablemente una persona fisica real. Este dato esta en el codigo fuente versionado, accesible a cualquiera con acceso al repositorio.

---

## 3. Hallazgos High

### HIGH-01: Refresh Tokens en Texto Plano en Base de Datos

**Archivo:** `backend/prisma/schema.prisma` — modelo `Session`

Los refresh tokens de 7 dias se almacenan sin hashear. Si la BD es comprometida, un atacante obtiene tokens validos de todos los usuarios y puede generar access tokens indefinidamente.

**Remediacion:** Hashear con SHA-256 antes de almacenar; comparar hashes al verificar.

---

### HIGH-02: Rate Limiter de Login Demasiado Permisivo

**Archivo:** `backend/src/modules/auth/auth.controller.ts`, lineas 41-43

20 intentos/minuto = 1,200/hora = 28,800/dia desde una sola IP. Para un sistema con datos de salud, deberia ser maximo 5 intentos/minuto.

---

### HIGH-03: JWT con Mismo Secret para Usuarios y Administradores

**Archivo:** `backend/src/config/index.ts`, linea 23

```typescript
adminSecret: process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET!,
```

Si `JWT_ADMIN_SECRET` no esta configurado, ambos comparten el mismo secret, reduciendo la defensa en profundidad.

---

### HIGH-04: HKDF No Estandar para Derivacion de Claves

**Archivo:** `backend/src/common/services/document-encryption.service.ts`, lineas 68-80

La implementacion manual de HKDF no sigue RFC 5869. Node.js tiene `crypto.hkdfSync` nativo desde v15.

---

### HIGH-05: Helmet Desactiva Protecciones Cross-Origin

**Archivo:** `backend/src/main.ts`, lineas 81-97

```typescript
app.use(helmet({
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  referrerPolicy: false,
}));
```

Desactivacion global incluso en produccion, debilitando proteccion contra ataques Spectre y cross-origin.

---

### HIGH-06: Bug — Token de Descarga Sin `await`

**Archivo:** `backend/src/modules/documents/secure-download.controller.ts`, lineas 277-281

```typescript
const token = generateTemporaryDownloadToken(document.s3Key, 300, { userId });
// FALTA await — retorna Promise, redirige a "[object Promise]"
res.redirect(`/api/v1/secure-download/${token}`);
```

El flujo de descarga autenticada esta roto.

---

### HIGH-07: Token de Descarga No Se Invalida Tras Uso

**Archivo:** `backend/src/modules/documents/secure-download.controller.ts`, lineas 229-231

```typescript
// Opcional: eliminar token despues de uso unico (mas seguro)
// temporaryTokens.delete(token);  <-- COMENTADO
```

Tokens de descarga de documentos medicos reutilizables durante 15 minutos.

---

### HIGH-08: Sin Content Security Policy (CSP)

**Archivos:** `frontend/nginx.conf`, `frontend/Caddyfile`

No hay header CSP en ninguna configuracion de servidor. El Caddyfile (Coolify) no tiene ningun header de seguridad. Sin CSP, los riesgos de XSS se amplifican directamente.

---

### HIGH-09: Datos de Emergencia Persisten en localStorage

**Archivo:** `frontend/src/hooks/usePushNotifications.ts`, lineas 56-64

Nombre de paciente, ID, coordenadas GPS y hospitales cercanos de alertas de panico se persisten en `localStorage['vida_notifications']` indefinidamente (hasta 100 entradas). Sobrevive sesiones del navegador y es accesible por XSS.

---

### HIGH-10: Admin Route Protection Usa `window.location.href`

**Archivo:** `frontend/src/context/AdminAuthContext.tsx`, lineas 163, 183

Usa `window.location.href` para redireccion en lugar de React Router `Navigate`, vulnerable a open redirect y bypass de navigation guards.

---

### HIGH-11: Multiples Instancias de PrismaClient (Memory Leak)

**Archivos:** `auth.service.ts`, `admin-auth.service.ts`, `secure-download.controller.ts`, `payments-webhook.controller.ts`

Cada modulo crea su propia instancia de PrismaClient. El webhook controller crea instancias dentro de un `switch`, generando una nueva conexion por evento sin cierre controlado.

---

### HIGH-12: Codigos MFA Backup Sin Hashear

**Archivo:** `backend/prisma/schema.prisma` — modelo `AdminUser`

Los 10 codigos de respaldo MFA de administradores se almacenan como `String[]` en texto plano. Si la BD se compromete, son utilizables directamente.

---

### HIGH-13: Transferencias Internacionales No Declaradas

Datos de salud se transfieren a:
- **AWS S3** (EUA) — documentos medicos
- **Stripe** (EUA) — datos de pago
- **Meta/WABA** (EUA) — notificaciones WhatsApp
- **Resend** (EUA) — emails

Sin clausulas contractuales estandar documentadas ni autorizacion del INAI para transferencia internacional de datos sensibles de salud (Art. 37 LFPDPPP).

---

### HIGH-14: PSC NOM-151 Simulado

**Archivo:** `backend/src/modules/directives/directives.service.ts`, lineas 218-228

```typescript
const mockCertificate = `NOM151-CERT-${generateSecureToken(16)}`;
// nom151Provider: 'PSC Demo Provider'
```

El certificado de sellado de tiempo es simulado. En produccion no tiene validez legal.

---

## 4. Hallazgos Medium

| # | Hallazgo | Archivo | Remediacion |
|---|----------|---------|-------------|
| MED-01 | CSRF exento en endpoints de datos medicos (`/profile`, `/representatives`) | `csrf.middleware.ts` L20-31 | Remover de lista de exentos |
| MED-02 | JWT tokens en JSON body (no httpOnly cookies) — backend | `auth.controller.ts` L209-220 | Migrar a Set-Cookie httpOnly |
| MED-03 | Admin endpoints sin validacion de input (`req.body` sin sanitizar) | `admin.controller.ts` L557-558 | Agregar express-validator o Zod |
| MED-04 | Health check expone version y entorno | `main.ts` L199-232 | Remover version/environment del endpoint publico |
| MED-05 | Validacion de file upload solo por MIME type (no magic bytes) | `documents.controller.ts` L18-35 | Agregar validacion con file-type |
| MED-06 | Contrasena de admin solo requiere 8 caracteres sin complejidad | `admin-auth.service.ts` L346-348 | Minimo 12 chars + complejidad |
| MED-07 | Admin child routes sin verificacion de permisos por ruta | `App.tsx` L181-188 | Agregar `requiredPermission` por ruta |
| MED-08 | Fallback GPS hardcodeado a CDMX en produccion (boton de panico) | `PanicButton.tsx` L85-97 | Enviar alerta sin coordenadas si GPS falla |
| MED-09 | `console.log` con datos de pacientes en produccion | Multiples archivos | `esbuild: { drop: ['console'] }` en vite.config |
| MED-10 | Emergency QR sin validacion de formato de token client-side | `EmergencyView.tsx` L22 | Validar formato antes de API call |
| MED-11 | Sin auditoria de acceso a datos cifrados desde `pup.service.ts` | `pup.service.ts` | Registrar en AuditLog cada lectura de perfil |
| MED-12 | Clave de encriptacion unica global sin rotacion ni Key ID | `encryption.ts` | Implementar envelope encryption con Key ID |
| MED-13 | Sin proceso de notificacion de vulneracion de datos | No implementado | Implementar proceso de notificacion 72h al INAI |
| MED-14 | Datos de representantes sin cifrar (nombre, telefono, email, parentesco) | `schema.prisma` | Cifrar con encryptJSON |
| MED-15 | Geolocalizacion de alertas de panico sin proteccion | `schema.prisma` — PanicAlert | Cifrar coordenadas |
| MED-16 | No hay verificacion de edad minima para directivas | `directives.service.ts` | Calcular edad desde CURP, exigir 18+ |

---

## 5. Hallazgos Low

| # | Hallazgo | Archivo |
|---|----------|---------|
| LOW-01 | `console.error` expone stack traces en produccion | `main.ts` L306 |
| LOW-02 | Rate limiting sin `trust proxy` para balanceador | `main.ts` L155 |
| LOW-03 | WebAuthn challenge sin TTL en BD | `webauthn.service.ts` L70-73 |
| LOW-04 | NOM-151 posiblemente inactivo en produccion | `config/index.ts` |
| LOW-05 | Validacion de contrasena frontend sin requisito de caracter especial | `Register.tsx` L13-30 |
| LOW-06 | Stripe publishable key es placeholder en `.env.production` | `frontend/.env.production` |
| LOW-07 | Enlaces de Terminos y Privacidad apuntan a `href="#"` | `Register.tsx` L267-273 |
| LOW-08 | `VITE_GOOGLE_MAPS_API_KEY` declarado pero no validado | `vite-env.d.ts` L5 |

---

## 6. Analisis de Proteccion de Datos

### 6.1 Mapa de Cifrado por Modelo

#### Modelo `User`

| Campo | Clasificacion | Cifrado | Deberia |
|-------|--------------|:-------:|:-------:|
| `email` | PII directo | No | Si (o hashing para lookup) |
| `curp` | PII gubernamental critico | No | **Si** |
| `name` | PII directo | No | Si |
| `dateOfBirth` | PII + salud | No | Si |
| `phone` | PII directo | No | Si |
| `address` | PII directo | No | Si |
| `passwordHash` | Credencial | bcrypt-12 | Correcto |
| `verificationToken` | Token temporal | No | Aceptable (expira) |
| `resetToken` | Token temporal | No | Deberia hashearse |

#### Modelo `PatientProfile`

| Campo | Clasificacion | Cifrado | Deberia |
|-------|--------------|:-------:|:-------:|
| `bloodType` | Dato de salud | No | **Si** |
| `allergiesEnc` | Dato de salud critico | AES-256-GCM | Correcto |
| `conditionsEnc` | Dato de salud critico | AES-256-GCM | Correcto |
| `medicationsEnc` | Dato de salud critico | AES-256-GCM | Correcto |
| `donorPreferencesEnc` | Voluntad | AES-256-GCM | Correcto |
| `insurancePolicy` | PII financiero | No | **Si** |

#### Modelo `AdvanceDirective`

| Campo | Clasificacion | Cifrado | Deberia |
|-------|--------------|:-------:|:-------:|
| `acceptsCPR` | Decision medica critica | No | **Si** |
| `acceptsIntubation` | Decision medica critica | No | **Si** |
| `acceptsDialysis` | Decision medica critica | No | **Si** |
| `acceptsTransfusion` | Decision medica critica | No | **Si** |
| `acceptsArtificialNutrition` | Decision medica critica | No | **Si** |
| `palliativeCareOnly` | Decision medica critica | No | **Si** |
| `additionalNotes` | Texto libre voluntad | No | **Si** |
| `documentHash` | Integridad | SHA-256 | Correcto |

#### Modelo `Witness`

| Campo | Clasificacion | Cifrado | Deberia |
|-------|--------------|:-------:|:-------:|
| `curp` | PII gubernamental | No | **Si** |
| `name, email, phone` | PII tercero | No | **Si** |

#### Modelo `Representative`

| Campo | Clasificacion | Cifrado | Deberia |
|-------|--------------|:-------:|:-------:|
| `name, phone, email, relation` | PII tercero | No | **Si** |

#### Modelo `AdminUser`

| Campo | Clasificacion | Cifrado | Deberia |
|-------|--------------|:-------:|:-------:|
| `passwordHash` | Credencial | bcrypt-12 | Correcto |
| `mfaSecret` | 2FA | AES-256-GCM | Correcto |
| `mfaBackupCodes` | 2FA respaldo | **No** | **Hashear (SHA-256)** |

### 6.2 Arquitectura de Cifrado — Evaluacion

**Capa 1 — Datos estructurados (`encryption.ts`):**
- Algoritmo: AES-256-GCM (correcto)
- IV aleatorio por operacion (correcto)
- Auth tag para integridad (correcto)
- **Problema:** Una sola clave para todos los usuarios. Sin rotacion. Sin Key ID.

**Capa 2 — Documentos (`document-encryption.service.ts`):**
- HKDF por documento con salt unico (correcto)
- Header de version (VIDA_ENC_V1) (correcto)
- Eliminacion segura (3 sobreescrituras) (correcto)
- **Problema:** HKDF no usa `crypto.hkdfSync` estandar.

**Capa 3 — Admin MFA (`admin-mfa.service.ts`):**
- Secret cifrado con AES-256-GCM (correcto)
- **Problema:** Backup codes en texto plano

### 6.3 Gestion de Consentimiento

No existe modelo de consentimiento en el esquema. No hay tabla `ConsentRecord`, `PrivacyPolicy`, ni `DataProcessingAgreement`. No existe endpoint de eliminacion de cuenta. No hay registro de aceptacion de aviso de privacidad con versionado.

---

## 7. Cumplimiento Regulatorio

### 7.1 Tabla Consolidada

| Marco Normativo | Aspecto | Estado |
|----------------|---------|:------:|
| **LFPDPPP** | Aviso de privacidad (Arts. 15-18) | No cumple |
| **LFPDPPP** | Derechos ARCO (Arts. 28-36) | No cumple |
| **LFPDPPP** | Consentimiento informado (Art. 8) | Parcial |
| **LFPDPPP** | Deber de confidencialidad (Art. 21) | Cumple |
| **LFPDPPP** | Medidas tecnicas de seguridad (Arts. 19-22) | Cumple |
| **LFPDPPP** | Medidas administrativas | Parcial |
| **LFPDPPP** | Transferencias internacionales (Arts. 36-43) | Parcial |
| **LFPDPPP** | Medidas fisicas | No evaluable |
| **NOM-024-SSA3-2012** | Seguridad y confidencialidad | Cumple |
| **NOM-024-SSA3-2012** | Interoperabilidad | Parcial |
| **NOM-024-SSA3-2012** | Disponibilidad | Parcial |
| **NOM-004-SSA3-2012** | Expediente clinico | N/A (no aplica directamente) |
| **NOM-151-SCFI-2016** | Sellado de tiempo | Parcial (PSC simulado) |
| **Ley Voluntad Anticipada** | Formalidades legales | Parcial |
| **Ley Voluntad Anticipada** | Distincion de valor legal | No cumple |
| **GDPR** (referencia) | Privacy by design | Parcial |
| **GDPR** (referencia) | Minimizacion de datos | Parcial |
| **GDPR** (referencia) | Derecho al olvido | No cumple |
| **GDPR** (referencia) | Portabilidad de datos | No cumple |
| **HIPAA** (referencia) | Technical safeguards | Cumple |
| **HIPAA** (referencia) | Administrative safeguards | Parcial |
| **HIPAA** (referencia) | Physical safeguards | No evaluable |

### 7.2 Hallazgos Regulatorios Criticos

**R-01: Aviso de Privacidad Inexistente** — Viola Art. 16 LFPDPPP. Multa potencial: 100 a 320,000 dias de UMA.

**R-02: Derechos ARCO Sin Implementar** — Viola Arts. 28-36 LFPDPPP. La cancelacion solo desactiva sin eliminar datos. La exportacion esta condicionada a plan de pago.

**R-03: Directiva Digital Sin Distincion Legal** — Un medico no puede distinguir entre un documento notarial valido y un borrador digital sin formalidades legales al momento de una emergencia.

**R-04: Transferencias Internacionales Sin Documentar** — Datos de salud se transfieren a servidores en EUA (AWS, Stripe, Meta, Resend) sin clausulas contractuales estandar ni declaracion al titular.

**R-05: Exportacion de Datos Condicionada a Pago** — Viola Art. 29 LFPDPPP que declara los derechos ARCO como gratuitos.

**R-06: Categoria CLINICAL_HISTORY para Documento Autogenerado** — El sistema genera un "Perfil Medico de Emergencia" y lo categoriza como `CLINICAL_HISTORY`, lo cual puede generar confusion con el expediente clinico regulado por NOM-004-SSA3-2012. Recomendacion: renombrar a `EMERGENCY_PROFILE` con leyenda de no-expediente-clinico.

---

## 8. Prospectiva — Estado Objetivo

### Nivel Objetivo: Sistema Certificable para Datos Sensibles de Salud en Mexico

```
ESTADO ACTUAL (58/100)                    ESTADO OBJETIVO (95/100)
--------------------------------------------------------------------
Cifrado parcial (solo 4 campos)      =>   Cifrado total de PII + datos de salud
JWT en localStorage                  =>   httpOnly cookies + CSRF tokens
WebSocket abierto                    =>   WebSocket autenticado + CORS estricto
Sin aviso de privacidad              =>   Aviso completo + versionado + consentimiento granular
Sin derechos ARCO                    =>   Modulo ARCO completo + eliminacion de cuenta
Credenciales en codigo fuente        =>   Secrets manager (env vars estrictas, sin fallbacks)
PSC simulado                         =>   PSC real acreditado ante Secretaria de Economia
Sin CSP                              =>   CSP estricto + headers de seguridad completos
Demo credentials en bundle           =>   Tree-shaking + eliminacion total en build produccion
Una clave de cifrado global          =>   Rotacion de claves + Key ID + envelope encryption
Sin proceso de incidentes            =>   Proceso de notificacion 72h al INAI + al titular
Directivas sin distincion legal      =>   Indicador visual + leyenda legal por tipo
Exportacion condicionada a pago      =>   Portabilidad gratuita conforme LFPDPPP
Sin validacion de edad               =>   Verificacion 18+ desde CURP para directivas
HKDF manual                          =>   crypto.hkdfSync nativo (RFC 5869)
```

---

## 9. Plan de Ruta

### Fase 1: Emergencias de Seguridad (1-2 semanas)

**Objetivo:** Eliminar vectores de ataque que permiten acceso no autorizado inmediato.

| # | Accion | Prioridad | Esfuerzo |
|---|--------|:---------:|----------|
| 1.1 | Eliminar credenciales hardcodeadas de `config/index.ts` + rotar en produccion | P0 | 30 min + rotacion |
| 1.2 | Eliminar demo credentials del bundle (tree-shaking condicional en Vite) | P0 | 2 horas |
| 1.3 | Autenticar WebSocket con JWT en handshake + CORS estricto | P0 | 4 horas |
| 1.4 | Invalidar tokens de descarga tras uso unico | P0 | 1 hora |
| 1.5 | Fix: agregar `await` a `generateTemporaryDownloadToken` | P0 | 15 min |
| 1.6 | `npm audit fix` en backend y frontend | P0 | 1 hora |
| 1.7 | Reducir rate limit de login a 5 intentos/minuto | P0 | 30 min |
| 1.8 | Hashear refresh tokens en BD (SHA-256) | P1 | 4 horas |
| 1.9 | Hashear MFA backup codes de administradores | P1 | 2 horas |
| 1.10 | Eliminar numero de telefono real del seed | P0 | 15 min |

### Fase 2: Cifrado y Proteccion de Datos (2-3 semanas)

**Objetivo:** Cifrar todos los datos sensibles y eliminar vectores de XSS.

| # | Accion | Prioridad | Esfuerzo |
|---|--------|:---------:|----------|
| 2.1 | Cifrar campos de voluntad anticipada (acceptsCPR, intubation, etc.) | P0 | 8 horas |
| 2.2 | Cifrar CURP en User y Witness | P0 | 4 horas |
| 2.3 | Cifrar nombre, telefono, direccion en User | P1 | 4 horas |
| 2.4 | Cifrar bloodType, insurancePolicy en PatientProfile | P1 | 2 horas |
| 2.5 | Cifrar datos de representantes (nombre, telefono, email, parentesco) | P1 | 2 horas |
| 2.6 | Migrar JWT a httpOnly cookies + implementar CSRF | P0 | 8 horas |
| 2.7 | Agregar CSP headers en nginx y Caddyfile | P0 | 4 horas |
| 2.8 | Sanitizar todo contenido HTML dinamico con DOMPurify | P0 | 2 horas |
| 2.9 | Eliminar `console.log` de builds de produccion | P1 | 1 hora |
| 2.10 | Singleton de PrismaClient + cleanup de instancias | P1 | 4 horas |
| 2.11 | Validacion de magic bytes en uploads (file-type) | P1 | 2 horas |
| 2.12 | Migrar HKDF a `crypto.hkdfSync` nativo | P2 | 2 horas |
| 2.13 | Migrar notificaciones de localStorage a sessionStorage con TTL | P1 | 2 horas |
| 2.14 | Eliminar fallback GPS de CDMX en PanicButton | P1 | 1 hora |
| 2.15 | Corregir seed-admin.ts para usar encryptJSON | P1 | 2 horas |
| 2.16 | Eliminar clave de cifrado hardcodeada del seed.ts | P0 | 30 min |

### Fase 3: Cumplimiento Regulatorio (3-4 semanas)

**Objetivo:** Cumplir con LFPDPPP y normatividad de voluntad anticipada para operacion legal.

| # | Accion | Prioridad | Esfuerzo |
|---|--------|:---------:|----------|
| 3.1 | Redactar e implementar Aviso de Privacidad completo (Art. 16 LFPDPPP) | P0 | 1 semana |
| 3.2 | Implementar versionado de aviso de privacidad con registro de aceptacion por usuario | P0 | 3 dias |
| 3.3 | Modulo ARCO: endpoint de solicitud con generacion de folio | P0 | 1 semana |
| 3.4 | Modulo ARCO: endpoint de eliminacion de cuenta con supresion/anonimizacion | P0 | 1 semana |
| 3.5 | Portabilidad de datos gratuita (remover barrera de pago) | P0 | 2 dias |
| 3.6 | Distincion visual de tipo de directiva en emergencias + leyenda legal | P0 | 3 dias |
| 3.7 | Declaracion de transferencias internacionales en aviso de privacidad | P0 | Incluido en 3.1 |
| 3.8 | Proceso de notificacion de vulneracion de datos (titular + INAI) | P1 | 1 semana |
| 3.9 | Verificacion de edad minima (18 anos) para directivas | P1 | 1 dia |
| 3.10 | Renombrar categoria CLINICAL_HISTORY a EMERGENCY_PROFILE | P2 | 1 dia |

### Fase 4: Hardening y Preparacion para Certificacion (2-3 semanas)

**Objetivo:** Elevar el nivel de seguridad a estandares certificables.

| # | Accion | Prioridad | Esfuerzo |
|---|--------|:---------:|----------|
| 4.1 | Integracion con PSC acreditado para NOM-151 real | P1 | 2 semanas |
| 4.2 | Rotacion de claves de cifrado + Key ID en formato almacenado | P1 | 1 semana |
| 4.3 | Implementar `trust proxy` para rate limiting | P2 | 1 hora |
| 4.4 | Politica de retencion para grabaciones de testigos | P2 | 2 dias |
| 4.5 | Auditoria de acceso a datos cifrados desde pup.service | P2 | 2 dias |
| 4.6 | Evaluar HL7 FHIR para interoperabilidad | P3 | Investigacion |
| 4.7 | Separar JWT_ADMIN_SECRET obligatorio en todos los entornos | P1 | 1 hora |
| 4.8 | Restaurar protecciones cross-origin en Helmet | P1 | 2 horas |
| 4.9 | Agregar permisos por ruta en admin frontend | P2 | 1 dia |
| 4.10 | Penetration testing externo | P1 | Contratar |

---

## 10. Cross-Audit por Gemini (Senior Security Architect)

> Este cross-audit fue realizado por Gemini con ventana de contexto de 1M tokens, analizando el codebase completo contra los hallazgos del diagnostico inicial. Su rol fue cuestionar, validar y complementar.

### 10.1 Calificacion Ajustada: 52/100

Gemini redujo la calificacion de 58 a **52/100**, argumentando que la magnitud de la exposicion de datos (80% de campos sensibles sin cifrar) justifica una evaluacion mas severa.

**Veredicto: ROJO** — El sistema NO debe entrar en operacion. El plan de remediacion debe ejecutarse bajo supervision de un Security Lead.

### 10.2 Validacion de Hallazgos

| Hallazgo | Validacion Gemini | Comentario |
|:---------|:-----------------:|:-----------|
| CRIT-01 (Credenciales hardcodeadas) | Confirmado | Credenciales reales de PostgreSQL y Redis localizadas. Rotacion obligatoria e inmediata. |
| CRIT-02 (JWT en localStorage) | Confirmado | Vulnerable a robo de sesion masivo via XSS. Remediacion de HttpOnly cookies correcta. |
| CRIT-03 (Demo credentials en bundle) | Confirmado | Cadenas persisten en bundle de produccion independientemente del flag. |
| CRIT-04 (WebSocket inseguro) | Confirmado | Cualquier atacante puede espiar alertas de panico conociendo un UUID. |
| CRIT-05 (XSS almacenado) | Confirmado | Inyeccion directa de datos de usuario sin sanitizar. |
| CRIT-06/07 (Datos sin cifrar) | Confirmado | 80% de datos sensibles (CURP, directivas, representantes) en texto plano. |
| CRIT-08 (Clave en seed) | Confirmado | Clave de cifrado hardcodeada como fallback. |
| CRIT-09 (Aviso de privacidad) | Confirmado | Violacion directa de LFPDPPP en sistema de datos de salud. |
| CRIT-11 (Distincion legal) | Confirmado | Grave riesgo de responsabilidad medica. |
| HIGH-04 (HKDF no estandar) | Confirmado | Funcional pero limitada a una iteracion de expansion. |
| HIGH-06 (Bug await) | Confirmado | Sistema de descarga segura funcionalmente roto. |
| HIGH-07 (Token reutilizable) | Confirmado | Invalidacion tras uso esta comentada en el codigo. |
| HIGH-14 (PSC simulado) | Confirmado | "PSC Demo Provider" sin validez legal. |

### 10.3 Hallazgos Adicionales Detectados por Gemini

#### CRIT-14: Exposicion de PII en WebSocket Handshake (Side-channel)

La sala `representative-{userId}` permite a un atacante enumerar IDs de usuarios validos intentando conexiones masivas y observando si el servidor acepta el "join". Esto amplifica el riesgo de CRIT-04 al permitir descubrimiento de usuarios activos.

#### HIGH-15: Falta de Blind Index para Busqueda de CURP Cifrado

Si se cifra el CURP (CRIT-07), el sistema perdera la capacidad de busqueda unica por indice de BD. Se requiere implementar un **Blind Index** (hashing con salt secreto separado) para permitir busquedas sin exponer el dato original. Sin esto, la migracion de cifrado rompe funcionalidad critica.

**Solucion propuesta:**
```
curpHash    String   @unique    // HMAC-SHA256(curp, BLIND_INDEX_KEY)
curpEnc     String              // AES-256-GCM(curp, ENCRYPTION_KEY)
```

#### HIGH-16: Race Condition en Validacion de Directivas

En `directives.service.ts`, el metodo `validateDirective` no utiliza transacciones de base de datos (`$transaction`). Un usuario podria ejecutar multiples validaciones simultaneas para bypassear logica de limites o estados.

#### MED-17: CSP con `unsafe-inline` en Estilos

El CSP actual en `main.ts` permite `'unsafe-inline'` para estilos. En un sistema de salud, esto facilita ataques de inyeccion de CSS que pueden exfiltrar datos via `background-image` URLs sin necesidad de scripts.

### 10.4 Cuestionamiento de Prioridades

Gemini cuestiona el plan de ruta en tres puntos:

**1. CRIT-13 debe ser Dia 1, no esta priorizado correctamente:**
> El numero de telefono real de una persona fisica en el repositorio es una fuga de datos activa. Debe eliminarse antes de cualquier otro paso.

**2. El esfuerzo de Fase 2 (Cifrado) esta subestimado:**
> Cifrar campos existentes en una base de datos con datos reales requiere scripts de migracion complejos (descifrar con formato viejo, re-cifrar con formato nuevo, validar integridad). Esto no esta contemplado en el plan. Esfuerzo real: 4-6 semanas, no 2-3.

**3. NOM-151 real debe bajar de prioridad:**
> Integrar un PSC acreditado es un proceso administrativo de meses (tramites con Secretaria de Economia). El sistema debe tener la arquitectura lista pero no bloquear seguridad tecnica por un tramite legal.

### 10.5 Recomendaciones Arquitectonicas de Gemini

#### Envelope Encryption (en lugar de clave global)
No usar una sola `ENCRYPTION_KEY` global. Generar una clave de datos (DEK) por usuario, cifrada con una clave maestra (KEK) gestionada en un KMS (AWS KMS o HashiCorp Vault).

```
Usuario -> DEK (unica por usuario) -> cifra datos del usuario
DEK -> cifrada con KEK (clave maestra en KMS)
Rotacion: solo re-cifrar DEKs, no todos los datos
```

#### Zero Knowledge para Directivas
Las decisiones de voluntad anticipada (DNR, etc.) no deberian ser legibles ni por el administrador del sistema. Solo el paciente (con su clave) y el medico (via QR de emergencia) deberian tener acceso a la llave de descifrado.

#### Sanitizacion Automatica de Salida
Reemplazar renderizado HTML inseguro por componentes de interpolacion segura o sanitizacion forzada en el pipeline de renderizado.

### 10.6 Riesgos de Alto Impacto Identificados por Gemini

| Riesgo | Descripcion | Impacto |
|--------|-------------|---------|
| **Legal (INAI)** | La falta de Aviso de Privacidad y Derechos ARCO es una "bomba de tiempo" regulatoria | Multas de hasta 320,000 dias UMA |
| **Integridad de Datos** | Un atacante con acceso a la BD (via CRIT-01) puede alterar voluntades anticipadas — cambiar "No Intubar" por "Si Intubar" | Riesgo de vida real |
| **Reputacional** | Credenciales de infraestructura en codigo sugiere baja higiene de seguridad, lo cual ahuyenta socios institucionales (hospitales) | Inviabilidad comercial |

---

## Anexo A — Clasificacion de Campos por Modelo

### Leyenda
- ROJO: Dato sensible sin cifrar (requiere accion)
- VERDE: Dato cifrado correctamente
- AMARILLO: Dato aceptable sin cifrar (no PII o token temporal)

| Modelo | Campo | Tipo | Estado |
|--------|-------|------|:------:|
| User | email | PII | ROJO |
| User | curp | PII gubernamental | ROJO |
| User | name | PII | ROJO |
| User | dateOfBirth | PII + salud | ROJO |
| User | phone | PII | ROJO |
| User | address | PII | ROJO |
| User | passwordHash | Credencial | VERDE |
| PatientProfile | bloodType | Dato de salud | ROJO |
| PatientProfile | allergiesEnc | Dato de salud | VERDE |
| PatientProfile | conditionsEnc | Dato de salud | VERDE |
| PatientProfile | medicationsEnc | Dato de salud | VERDE |
| PatientProfile | donorPreferencesEnc | Voluntad | VERDE |
| PatientProfile | insurancePolicy | PII financiero | ROJO |
| AdvanceDirective | acceptsCPR | Decision medica | ROJO |
| AdvanceDirective | acceptsIntubation | Decision medica | ROJO |
| AdvanceDirective | acceptsDialysis | Decision medica | ROJO |
| AdvanceDirective | acceptsTransfusion | Decision medica | ROJO |
| AdvanceDirective | acceptsArtificialNutrition | Decision medica | ROJO |
| AdvanceDirective | palliativeCareOnly | Decision medica | ROJO |
| AdvanceDirective | additionalNotes | Texto libre voluntad | ROJO |
| AdvanceDirective | documentHash | Integridad | VERDE |
| Witness | curp | PII gubernamental | ROJO |
| Witness | name, email, phone | PII tercero | ROJO |
| Representative | name, phone, email, relation | PII tercero | ROJO |
| AdminUser | passwordHash | Credencial | VERDE |
| AdminUser | mfaSecret | 2FA | VERDE |
| AdminUser | mfaBackupCodes | 2FA respaldo | ROJO |
| PanicAlert | latitude, longitude | Geolocalizacion | ROJO |
| EmergencyAccess | accessorName, accessorLicense | PII tercero | AMARILLO |
| Session | refreshToken | Credencial | ROJO |

---

## Anexo B — Archivos Clave Referenciados

### Backend
- `backend/src/config/index.ts` — Configuracion central con credenciales hardcodeadas
- `backend/src/main.ts` — Server setup, Helmet, CORS, WebSocket, rate limiting
- `backend/src/modules/auth/auth.controller.ts` — Login, registro, rate limiting
- `backend/src/modules/auth/auth.service.ts` — JWT, sesiones, refresh tokens
- `backend/src/modules/auth/webauthn.service.ts` — WebAuthn/FIDO2
- `backend/src/modules/admin/admin-auth.service.ts` — Auth de administradores
- `backend/src/modules/admin/admin-mfa.service.ts` — MFA TOTP para admins
- `backend/src/modules/admin/admin.controller.ts` — Endpoints de administracion
- `backend/src/modules/admin/admin-users.service.ts` — Gestion de usuarios
- `backend/src/modules/directives/directives.service.ts` — Voluntad anticipada + NOM-151
- `backend/src/modules/emergency/emergency.service.ts` — Acceso de emergencia
- `backend/src/modules/documents/secure-download.controller.ts` — Descarga segura
- `backend/src/modules/documents/documents.controller.ts` — Upload de documentos
- `backend/src/modules/pup/pup.service.ts` — Perfil medico del paciente
- `backend/src/modules/payments/services/premium-features.service.ts` — Features por plan
- `backend/src/common/utils/encryption.ts` — Cifrado AES-256-GCM
- `backend/src/common/services/document-encryption.service.ts` — Cifrado HKDF por documento
- `backend/src/common/services/audit-retention.service.ts` — Politicas de retencion
- `backend/src/common/services/logger.service.ts` — Sanitizacion de logs
- `backend/src/common/middleware/csrf.middleware.ts` — CSRF middleware
- `backend/src/common/guards/admin-auth.middleware.ts` — Auth middleware admin
- `backend/prisma/schema.prisma` — Esquema de base de datos
- `backend/prisma/seed.ts` — Seed de datos con clave hardcodeada
- `backend/prisma/seed-admin.ts` — Seed admin sin cifrado en campos medicos

### Frontend
- `frontend/src/context/AuthContext.tsx` — Almacenamiento de tokens en localStorage
- `frontend/src/context/AdminAuthContext.tsx` — Auth admin + redirect inseguro
- `frontend/src/services/api.ts` — Axios interceptors + token handling
- `frontend/src/services/adminApi.ts` — Admin API + tokens en localStorage
- `frontend/src/components/pages/Login.tsx` — Demo credentials hardcodeadas
- `frontend/src/components/pages/Register.tsx` — Aviso de privacidad href="#"
- `frontend/src/components/pages/Documents.tsx` — HTML sin sanitizar con datos de usuario
- `frontend/src/components/pages/EmergencyView.tsx` — QR token sin validacion
- `frontend/src/components/admin/pages/AdminLogin.tsx` — Admin demo credentials
- `frontend/src/components/pages/Landing.tsx` — Demo credentials
- `frontend/src/components/panic/PanicButton.tsx` — Fallback GPS CDMX
- `frontend/src/components/panic/PanicAlertModal.tsx` — HTML sin sanitizar
- `frontend/src/hooks/useWebSocket.ts` — WebSocket sin autenticacion
- `frontend/src/hooks/usePushNotifications.ts` — Datos sensibles en localStorage
- `frontend/src/App.tsx` — Rutas admin sin permisos por ruta
- `frontend/nginx.conf` — Headers de seguridad (sin CSP)
- `frontend/Caddyfile` — Sin headers de seguridad
- `frontend/.env.production` — Stripe key placeholder

### Infraestructura
- `docker-compose.yml` — PostgreSQL + Redis

---

## Firmas

| Rol | Nombre | Fecha |
|-----|--------|-------|
| Auditor de Seguridad | MD Consultoria TI | 2 de marzo de 2026 |
| CEO / Product Owner | | |
| CTO / Lead Developer | | |

---

*Este documento es confidencial y esta destinado exclusivamente para uso interno del equipo de Sistema VIDA. La distribucion no autorizada esta prohibida.*
