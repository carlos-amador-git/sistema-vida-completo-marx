-- Migración: Agregar campos de cifrado V2, MFA y otros faltantes
-- Fecha: 2026-03-06
-- Razón: Sincronización completa del esquema para corregir errores 500.

-- Tabla: User (Asegurando todos los campos del modelo Prisma)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nameEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "curpEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dateOfBirthEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "addressEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailBlindIndex" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "curpBlindIndex" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "encryptedDEK" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dekKeyId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "webauthnChallenge" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "webauthnChallengeExpires" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredLanguage" VARCHAR(5) DEFAULT 'es';

-- Indices para Blind Indexes en User
CREATE INDEX IF NOT EXISTS "User_emailBlindIndex_idx" ON "User"("emailBlindIndex");
CREATE INDEX IF NOT EXISTS "User_curpBlindIndex_idx" ON "User"("curpBlindIndex");

-- Tabla: PatientProfile
ALTER TABLE "PatientProfile" ADD COLUMN IF NOT EXISTS "bloodTypeEnc" TEXT;
ALTER TABLE "PatientProfile" ADD COLUMN IF NOT EXISTS "insurancePolicyEnc" TEXT;
ALTER TABLE "PatientProfile" ADD COLUMN IF NOT EXISTS "donorPreferencesEnc" TEXT;

-- Tabla: Representative
ALTER TABLE "Representative" ADD COLUMN IF NOT EXISTS "nameEnc" TEXT;
ALTER TABLE "Representative" ADD COLUMN IF NOT EXISTS "phoneEnc" TEXT;
ALTER TABLE "Representative" ADD COLUMN IF NOT EXISTS "emailEnc" TEXT;

-- Tabla: AdvanceDirective
ALTER TABLE "AdvanceDirective" ADD COLUMN IF NOT EXISTS "directiveDecisionsEnc" TEXT;

-- Tabla: Witness
ALTER TABLE "Witness" ADD COLUMN IF NOT EXISTS "nameEnc" TEXT;
ALTER TABLE "Witness" ADD COLUMN IF NOT EXISTS "phoneEnc" TEXT;
ALTER TABLE "Witness" ADD COLUMN IF NOT EXISTS "emailEnc" TEXT;
ALTER TABLE "Witness" ADD COLUMN IF NOT EXISTS "curpEnc" TEXT;

-- Tabla: PanicAlert
ALTER TABLE "PanicAlert" ADD COLUMN IF NOT EXISTS "locationEnc" TEXT;

-- Tabla: AdminUser (MFA y Preferencias)
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "preferredLanguage" VARCHAR(5) DEFAULT 'es';
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaBackupCodes" TEXT[];
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaEnabledAt" TIMESTAMP(3);
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaPendingSecret" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaPendingExpires" TIMESTAMP(3);
