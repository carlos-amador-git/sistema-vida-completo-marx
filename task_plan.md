# Plan de Tareas Estratégicas - Fase 4 (Hardware & Cloud Sec)
**Fecha:** 2 de marzo de 2026
**Estatus de Viabilidad:** 🟢 VERDE (Backend seguro, listo para integraciones Cloud).

Basado en la lectura analítica del código fuente, **se ha comprobado que las Fases 1, 2 y 3 del plan de remediación previo ya están implementadas** (cifrado V2 KMS-Ready, módulos ARCO y políticas de privacidad en la base de datos). 
El esquema de base de datos ahora es sólido y cumple con LFPDPPP, pero necesita el blindaje final de infraestructura.

A continuación, el plan de trabajo directo para el equipo de Agentes Claude (Swarms):

### 1. Integración de AWS KMS (Key Management Service)
- **Agente Asignado:** `/backend` + `/integration`
- **Archivos a modificar:** `backend/src/common/services/key-management.service.ts`, `backend/src/config/index.ts`
- **Acción:** Reemplazar el mock/local de la KEK (Key Encryption Key) actual por llamadas al SDK de AWS KMS (`@aws-sdk/client-kms`). Implementar la lógica para obtener la Data Encryption Key (DEK) descifrada al momento de autenticar al usuario llamando a `DecryptCommand`.
- **Razón:** AWS KMS es el estándar global para protección de llaves según HIPAA y previene que una intrusión al servidor exponga todas las DEKs del Sistema.

### 2. Configuración Perimetral de WAF (Cloudflare Pro/Enterprise)
- **Agente Asignado:** Intervención Manual del CTO / CEO con asistencia de `/infrastructure`.
- **Acción:** Asegurar que todo el tráfico hacia la API de Producción y el Frontend pase de forma estricta por Cloudflare (Proxy Status: Proxied). 
- **Reglas requeridas:**
  - Configurar WAF Managed Rules específicas para mitigar inyecciones SQL y ataques a la capa de aplicación (OWASP Core Ruleset).
  - Aplicar Rate Limits estrictos a nivel de red para los endpoints `/api/v1/auth/*` y `/api/v1/emergency/*` para evitar brute-force y descubrimiento masivo de curps indexados.

### 3. Integración de SIEM Activo (Datadog Security Monitoring)
- **Agente Asignado:** `/backend`
- **Archivos a modificar:** `backend/src/common/services/logger.service.ts`
- **Acción:** Conectar la clase nativa del `AuditLog` en la arquitectura de Logger con la ingesta y API de Datadog utilizando `@datadog/datadog-api-client` o mediante un agente Datadog instalado en el servidor que lea el stdout estructurado (JSON). 
- **Casos de Alerta a Configurar en Datadog:** Alertar al correo del administrador o canal de Slack si un mismo dispositivo/IP falla >3 intentos de Acceso de Emergencia (PAE) en 5 minutos.

### 4. Integración Definitiva PSC NOM-151 (Mifiel o Edicom API)
- **Agente Asignado:** `/backend` + `/integration`
- **Archivos a modificar:** `backend/src/common/services/nom151.service.ts`, `backend/src/config/index.ts`
- **Acción:** Remover el entorno y strings "Simulados" en la función responsable de generar la Constancia de Conservación de Mensajes de Datos. Conectar las credenciales REST API de **Mifiel** o **Edicom** para que al generar una Directiva Anticipada Digital, esta se registre formalmente obteniendo su ASN.1 y validando jurídicamente la firma ante la Secretaría de Economía Mexicana.

### Gate de Aceptación y Despliegue Final
`/swarm-verify` deberá comprobar:
1. Simulación o pruebas de integración (Unit Tests) donde KMS firme las DEKs.
2. Comprobación que el SDK del PSC devuelve IDs de transacción reales (en entorno Sandbox).
3. Verificación que los logs estructurados cumplen con el formato que Datadog puede parsear.
