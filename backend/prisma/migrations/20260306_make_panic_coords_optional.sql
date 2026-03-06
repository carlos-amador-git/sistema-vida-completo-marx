-- Migración: Hacer coordenadas opcionales en PanicAlert
-- Fecha: 2026-03-06
-- Razón: Permitir alertas de pánico cuando el GPS no está disponible.

ALTER TABLE "PanicAlert" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "PanicAlert" ALTER COLUMN "longitude" DROP NOT NULL;
