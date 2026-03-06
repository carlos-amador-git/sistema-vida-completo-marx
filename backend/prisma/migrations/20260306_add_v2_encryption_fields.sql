-- Migración: Agregar campos de cifrado V2 y Blind Indexes
-- Fecha: 2026-03-06
-- Razón: Sincronizar esquema de base de datos con prisma.schema para evitar errores 500 en login y otros módulos.

-- Tabla: User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nameEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "curpEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dateOfBirthEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "addressEnc" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailBlindIndex" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "curpBlindIndex" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "encryptedDEK" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dekKeyId" TEXT;

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

-- Tabla: AdminUser (MFA)
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaBackupCodes" TEXT[];
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaEnabledAt" TIMESTAMP(3);
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaPendingSecret" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaPendingExpires" TIMESTAMP(3);
