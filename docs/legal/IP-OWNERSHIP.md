# VIDA System — Intellectual Property Ownership Documentation

**Date:** March 2026
**Owner:** MD Consultoria TI
**System:** VIDA v1.0 — Vinculacion de Informacion para Decisiones y Alertas

---

## 1. System Components and Ownership

### Proprietary Code (100% Owned)

| Component | Path | Description |
|---|---|---|
| Backend API | backend/src/ | Express + TypeScript + Prisma API server |
| Frontend SPA | frontend/src/ | React 18 + Vite + Tailwind application |
| Database Schema | backend/prisma/schema.prisma | 30+ models, PostgreSQL |
| FHIR Module | backend/src/modules/fhir/ | HL7 FHIR R4 resource mapping |
| Encryption System | backend/src/common/services/encryption*.ts | AES-256-GCM envelope encryption |
| RBAC/ABAC | backend/src/common/services/rbac.service.ts, abac.service.ts | Access control system |
| QR Token System | backend/src/common/services/qr-token.service.ts | HMAC-SHA256 signed tokens |
| Emergency Module | backend/src/modules/emergency/ | Break-the-glass patient access |
| Panic Module | backend/src/modules/panic/ | Emergency alert system |
| NOM-151 Integration | backend/src/common/services/nom151.service.ts | PSC timestamping |
| SIEM Service | backend/src/common/services/siem.service.ts | Security monitoring |
| Data Retention | backend/src/common/services/data-retention.service.ts | NOM-004 compliance |
| CI/CD Pipeline | .github/workflows/ | Security and build pipelines |

### License: PROPRIETARY
All source code in this repository is proprietary and confidential.
See `backend/package.json` license field: "PROPRIETARY"

---

## 2. Third-Party Dependencies

### Backend (Production)

| Package | License | Usage | Risk |
|---|---|---|---|
| express | MIT | HTTP server | None |
| @prisma/client | Apache-2.0 | Database ORM | None |
| jsonwebtoken | MIT | JWT auth | None |
| bcryptjs | MIT | Password hashing | None |
| helmet | MIT | Security headers | None |
| socket.io | MIT | WebSocket | None |
| stripe | Apache-2.0 | Payments | None |
| twilio | MIT | SMS notifications | None |
| resend | MIT | Email delivery | None |
| @aws-sdk/client-s3 | Apache-2.0 | Object storage | None |
| otpauth | MIT | TOTP MFA | None |
| qrcode | MIT | QR generation | None |
| zod | MIT | Validation | None |
| winston | MIT | Logging | None |
| redis | MIT | Caching | None |
| ioredis | MIT | Redis client | None |
| i18next | MIT | Internationalization | None |
| sharp | Apache-2.0 | Image processing | None |
| puppeteer | Apache-2.0 | PDF generation | None |
| passkit-generator | MIT | Wallet passes | None |
| uuid | MIT | ID generation | None |
| axios | MIT | HTTP client | None |

### Frontend (Production)

| Package | License | Usage | Risk |
|---|---|---|---|
| react | MIT | UI framework | None |
| react-dom | MIT | DOM rendering | None |
| react-router-dom | MIT | Routing | None |
| axios | MIT | API client | None |
| tailwindcss | MIT | Styling | None |
| i18next | MIT | Internationalization | None |
| framer-motion | MIT | Animations | None |
| lucide-react | ISC | Icons | None |
| @stripe/react-stripe-js | MIT | Payment UI | None |
| leaflet | BSD-2-Clause | Maps | None |

**All dependencies use permissive licenses (MIT, Apache-2.0, BSD, ISC).**
No copyleft (GPL/AGPL) dependencies are present.

---

## 3. Standards and Specifications Referenced

| Standard | Usage | License |
|---|---|---|
| HL7 FHIR R4 | Medical data interoperability | Open standard |
| SNOMED CT | Clinical terminology codes | IHTSDO license (free for Mexico) |
| LOINC | Lab/clinical codes | Free Regenstrief license |
| NOM-004-SSA3-2012 | Clinical record requirements | Mexican public regulation |
| NOM-024-SSA3-2012 | Health information exchange | Mexican public regulation |
| NOM-151-SCFI-2002 | Digital document conservation | Mexican public regulation |
| LFPDPPP | Privacy law | Mexican federal law |
| OWASP Top 10 | Security guidelines | Open (CC BY-SA 4.0) |
| WCAG 2.1 | Accessibility | W3C recommendation (open) |

---

## 4. Data Ownership

- **Patient Data:** Owned by patients per LFPDPPP Art. 1. System processes data as "responsable" per Art. 3.
- **Medical Records:** Subject to NOM-004 5-year retention.
- **Audit Logs:** Owned by system operator. Required for compliance.
- **Encryption Keys:** Managed by system operator. Not extractable by patients.

---

## 5. Contributor Agreement

All code in this repository was authored by:
- MD Consultoria TI development team
- AI-assisted development (Claude Code by Anthropic)

No external contributors have commit access.
No open-source contributions were incorporated beyond listed dependencies.

---

## 6. Export Control

This software contains:
- AES-256-GCM encryption (standard commercial encryption)
- HMAC-SHA256 authentication
- No export-restricted cryptographic algorithms

Classified as EAR99 under US export regulations (standard commercial software).
No ITAR controlled components.
