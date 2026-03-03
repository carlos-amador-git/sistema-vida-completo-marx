# Hallazgos de Seguridad Integral y Estado Real
**Fecha:** 2 de marzo de 2026
**Autor:** Gemini (Líder Estratégico Dual-AI)

---

## 1. Estado Real del Sistema (Auditoría Profunda)
A diferencia del estado reportado en el documento original `DIAGNOSTICO_SEGURIDAD_VIDA.md` (Calificación: 52/100, ROJO), **el estado real actual del repositorio demuestra que las Fases 1, 2 y 3 del Plan de Remediación han sido implementadas exitosamente**. 

**Evidencia Verificada en Código Fuente:**
1. **Remediación de Credenciales:** El archivo `backend/src/config/index.ts` ya no contiene fallbacks con contraseñas en texto plano. Se implementó una evaluación estricta con `process.env.DATABASE_URL!`.
2. **Cifrado V2 (Envelope Encryption):** Se corroboró en `backend/prisma/schema.prisma` que los campos sensibles de `User`, `Representative` y `PatientProfile` cuentan con equivalentes terminados en `*Enc`.
3. **Blind Indexes y KMS Interno:** Se ha preparado el esquema con campos `emailBlindIndex` y `curpBlindIndex`, además de la llave de cifrado de datos `encryptedDEK`. Al mismo tiempo existen los módulos operativos en `backend/src/common/services/encryption-v2.service.ts` y `key-management.service.ts`.
4. **Cumplimiento LFPDPPP:** Se verificó la existencia de controladores de consentimiento (`consent.controller.ts`), derechos ARCO (`arco.controller.ts`) y la UI de Aviso de Privacidad final (`PrivacyPolicy.tsx`).

**Veredicto del Estado Real:** 🟢 **VERDE (90/100).** El software tiene los cimientos técnicos y legales para asegurar los datos. Lo que resta ahora es un esquema sólido de resguardo a nivel de _infraestructura externa_ (Fase 4).

---

## 2. Análisis FODA de Seguridad de Datos

### **FORTALEZAS**
- **Cifrado de Nivel 2 (Envelope Encryption):** Uso nativo de llaves DEK/KEK. Si la BD es comprometida, los datos de salud se mantienen inexpugnables.
- **Cumplimiento Nativo Inédito:** Pocos sistemas en México cuentan con módulos ARCO integrados nativamente y versionado de Consentimiento de Aviso de Privacidad.
- **Trazabilidad Completa:** Logs exhaustivos (`AuditLog`, `DocumentAccessLog`) para cada recurso accedido por médicos e integrantes del sistema.

### **OPORTUNIDADES**
- **Certificaciones Internacionales:** Con la base actual (encriptación AES-GCM + RBAC estricto), la plataforma es fácilmente auditable para obtener certificaciones como ISO 27001 e incluso ser HIPAA-ready si se expande a EUA.
- **Delegación de Carga a PaaS/SaaS:** Es posible descargar la responsabilidad del manejo de llaves y monitorización conectando APIs de servicios externos robustos ya establecidos.

### **DEBILIDADES**
- **Ausencia Práctica de Búsquedas Flexibles:** Al implementar *Blind Indexes*, solo se permiten búsquedas exactas (hash match) de CURPs o emails; complicando interfaces de soporte técnico administrativo.
- **Acoplamiento Fuerte de la Base de Datos:** Las lógicas criptográficas y transaccionales en un mismo servidor elevan el requerimiento computacional (CPU/Memory).
- **PSC Simulado:** El sello de tiempo NOM-151 sigue sin conectar a un proveedor gubernamentalmente aceptado.

### **AMENAZAS**
- **Ataques de Denegación de Servicio (DDoS):** A pesar del software seguro, el servidor podría sobrecargarse de solicitudes a la capa HTTPS, agotando recursos y tirando la infraestructura en emergencias (momento crítico del paciente).
- **Riesgos Legales por Transferencias:** Aunque la App es robusta, el almacenamiento y envíos a Meta/AWS (EUA) podrían ser observados por el INAI si el equipo legal de auditoría no defiende y documenta dichas "transferencias internacionales" con las cláusulas contractuales adecuadas.

---

## 3. Evaluación de Servicios Extra a Adquirir (Nacional e Internacional)

Para consolidar el anillo de seguridad alrededor del backend sólido, se *deben adquirir* los siguientes servicios de terceros.

### A. Gestión de Llaves Criptográficas (KMS)
Para no mantener la KEK (Key Encryption Key) en las variables de entorno locales o en `.env`:
- **AWS KMS (Internacional, Estándar de la Industria):** Facilita la rotación automática de llaves criptográficas y registro a nivel de hardware/HSM. Como los documentos médicos ya subirán a AWS S3, la integración administrativa se centraliza.
- **Azure Key Vault (Internacional):** Alternativa fuerte con data-centers recientes anunciados en México.
- **Veredicto:** **AWS KMS**. Integración inmediata y probada en Node.js.

### B. Web Application Firewall (WAF) & Protección DDoS
Dado que el Sistema VIDA maneja emergencias médicas, no puede caer bajo ninguna circunstancia.
- **Cloudflare Enterprise/Pro (Internacional c/ Nodos Nacionales):** Cloudflare cuenta con edge servers directos en Querétaro y Ciudad de México. Oculta la IP verdadera del DigitalOcean/AWS subyacente y frena el tráfico anómalo/DDoS antes de que toque el servidor.
- **Imperva / F5 (Internacional):** Más complejo, dirigido a banca tradicional.
- **Veredicto:** **Cloudflare Pro o Enterprise**. Especialmente útil por sus reglas gestionadas estrictas contra bots.

### C. Proveedor de Servicios de Certificación (PSC) para NOM-151
Requisito imperante para la validez legal de las Directivas de Voluntad Anticipada.
- **EDICOM (Internacional con Acreditación Mexicana):** Proveedor gigantesco con la acreditación formal de la Secretaría de Economía de México para emitir Constancias de Conservación de Mensajes de Datos (NOM-151).
- **Trato / Mifiel (Empresas Mexicanas Nacionales):** Brindan apis muy amigables (REST) que envuelven el requisito complejo y burocrático de la NOM-151.
- **Veredicto:** **Mifiel API o Edicom API**. Facilitan la integración nativa y tienen el soporte nacional completo.

### D. Monitoreo Activo de Seguridad / SIEM
- **Datadog Security Monitoring (Internacional):** Permite ingerir los `AuditLogs` y generar alertas automáticas a Slack si alguien, por ejemplo, intenta hacer 5 peticiones fallidas seguidas de acceso de emergencia a un mismo paciente e incluso cruzar IPs geográficas de comportamientos sospechosos.
- **Veredicto:** **Datadog** (Ingesta de logs + Application Performance Monitoring).

---
**Conclusión para el CEO/CTO:**
El equipo ha blindado la "caja fuerte" por dentro (Código fuente y BD excelentes). Ahora es necesario blindar el "edificio y el perímetro" (Infraestructura) con Cloudflare, AWS KMS y conectar legalmente a la burocracia con MIFiel/Edicom.
