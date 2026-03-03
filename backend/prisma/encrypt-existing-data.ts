// prisma/encrypt-existing-data.ts
/**
 * Data Migration Script: Encrypt existing plaintext fields + generate blind indexes
 *
 * This script reads plaintext PII from existing records, encrypts them
 * with encryption-v2, and populates the new *Enc + blind index columns.
 *
 * Run: npx ts-node prisma/encrypt-existing-data.ts
 *
 * Safe to re-run: skips records that already have encrypted fields populated.
 */

import { PrismaClient } from '@prisma/client';

// We need to bootstrap config before encryption service
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Dynamic import to handle config initialization
async function main() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getEncryptionV2Service } = require('../src/common/services/encryption-v2.service');
  const enc = getEncryptionV2Service();

  const prisma = new PrismaClient();
  const BATCH_SIZE = 100;

  const stats = {
    users: { processed: 0, encrypted: 0, skipped: 0 },
    profiles: { processed: 0, encrypted: 0, skipped: 0 },
    directives: { processed: 0, encrypted: 0, skipped: 0 },
    representatives: { processed: 0, encrypted: 0, skipped: 0 },
    witnesses: { processed: 0, encrypted: 0, skipped: 0 },
    panicAlerts: { processed: 0, encrypted: 0, skipped: 0 },
  };

  try {
    // ── Users ──────────────────────────────────────────────────────────
    console.log('\n[1/6] Encrypting User PII...');
    let skip = 0;
    while (true) {
      const users = await prisma.user.findMany({
        where: { nameEnc: null },
        take: BATCH_SIZE,
        skip,
        select: { id: true, name: true, phone: true, curp: true, dateOfBirth: true, address: true, email: true },
      });
      if (users.length === 0) break;

      await prisma.$transaction(
        users.map((u) =>
          prisma.user.update({
            where: { id: u.id },
            data: {
              nameEnc: enc.encryptField(u.name),
              phoneEnc: u.phone ? enc.encryptField(u.phone) : null,
              curpEnc: enc.encryptField(u.curp),
              dateOfBirthEnc: u.dateOfBirth ? enc.encryptField(u.dateOfBirth.toISOString()) : null,
              addressEnc: u.address ? enc.encryptField(u.address) : null,
              emailBlindIndex: enc.generateBlindIndex(u.email),
              curpBlindIndex: enc.generateCurpBlindIndex(u.curp),
            },
          })
        )
      );

      stats.users.encrypted += users.length;
      stats.users.processed += users.length;
      console.log(`  Users: ${stats.users.encrypted} encrypted`);
    }

    // Count skipped (already have nameEnc)
    stats.users.skipped = await prisma.user.count({ where: { nameEnc: { not: null } } }) - stats.users.encrypted;
    console.log(`  Users done: ${stats.users.encrypted} encrypted, ${stats.users.skipped} skipped`);

    // ── PatientProfile ─────────────────────────────────────────────────
    console.log('\n[2/6] Encrypting PatientProfile...');
    skip = 0;
    while (true) {
      const profiles = await prisma.patientProfile.findMany({
        where: { bloodTypeEnc: null, bloodType: { not: null } },
        take: BATCH_SIZE,
        skip,
        select: { id: true, bloodType: true, insurancePolicy: true },
      });
      if (profiles.length === 0) break;

      await prisma.$transaction(
        profiles.map((p) =>
          prisma.patientProfile.update({
            where: { id: p.id },
            data: {
              bloodTypeEnc: p.bloodType ? enc.encryptField(p.bloodType) : null,
              insurancePolicyEnc: p.insurancePolicy ? enc.encryptField(p.insurancePolicy) : null,
            },
          })
        )
      );

      stats.profiles.encrypted += profiles.length;
      stats.profiles.processed += profiles.length;
      console.log(`  Profiles: ${stats.profiles.encrypted} encrypted`);
    }
    console.log(`  Profiles done: ${stats.profiles.encrypted} encrypted`);

    // ── AdvanceDirective ───────────────────────────────────────────────
    console.log('\n[3/6] Encrypting AdvanceDirective decisions...');
    skip = 0;
    while (true) {
      const directives = await prisma.advanceDirective.findMany({
        where: { directiveDecisionsEnc: null },
        take: BATCH_SIZE,
        skip,
        select: {
          id: true,
          acceptsCPR: true,
          acceptsIntubation: true,
          acceptsDialysis: true,
          acceptsTransfusion: true,
          acceptsArtificialNutrition: true,
          palliativeCareOnly: true,
          additionalNotes: true,
        },
      });
      if (directives.length === 0) break;

      await prisma.$transaction(
        directives.map((d) => {
          const decisions = {
            acceptsCPR: d.acceptsCPR,
            acceptsIntubation: d.acceptsIntubation,
            acceptsDialysis: d.acceptsDialysis,
            acceptsTransfusion: d.acceptsTransfusion,
            acceptsArtificialNutrition: d.acceptsArtificialNutrition,
            palliativeCareOnly: d.palliativeCareOnly,
            additionalNotes: d.additionalNotes,
          };
          return prisma.advanceDirective.update({
            where: { id: d.id },
            data: {
              directiveDecisionsEnc: enc.encryptJSON(decisions),
            },
          });
        })
      );

      stats.directives.encrypted += directives.length;
      stats.directives.processed += directives.length;
      console.log(`  Directives: ${stats.directives.encrypted} encrypted`);
    }
    console.log(`  Directives done: ${stats.directives.encrypted} encrypted`);

    // ── Representative ─────────────────────────────────────────────────
    console.log('\n[4/6] Encrypting Representative PII...');
    skip = 0;
    while (true) {
      const reps = await prisma.representative.findMany({
        where: { nameEnc: null },
        take: BATCH_SIZE,
        skip,
        select: { id: true, name: true, phone: true, email: true },
      });
      if (reps.length === 0) break;

      await prisma.$transaction(
        reps.map((r) =>
          prisma.representative.update({
            where: { id: r.id },
            data: {
              nameEnc: enc.encryptField(r.name),
              phoneEnc: enc.encryptField(r.phone),
              emailEnc: r.email ? enc.encryptField(r.email) : null,
            },
          })
        )
      );

      stats.representatives.encrypted += reps.length;
      stats.representatives.processed += reps.length;
      console.log(`  Representatives: ${stats.representatives.encrypted} encrypted`);
    }
    console.log(`  Representatives done: ${stats.representatives.encrypted} encrypted`);

    // ── Witness ────────────────────────────────────────────────────────
    console.log('\n[5/6] Encrypting Witness PII...');
    skip = 0;
    while (true) {
      const witnesses = await prisma.witness.findMany({
        where: { nameEnc: null },
        take: BATCH_SIZE,
        skip,
        select: { id: true, name: true, phone: true, email: true, curp: true },
      });
      if (witnesses.length === 0) break;

      await prisma.$transaction(
        witnesses.map((w) =>
          prisma.witness.update({
            where: { id: w.id },
            data: {
              nameEnc: enc.encryptField(w.name),
              phoneEnc: w.phone ? enc.encryptField(w.phone) : null,
              emailEnc: w.email ? enc.encryptField(w.email) : null,
              curpEnc: w.curp ? enc.encryptField(w.curp) : null,
            },
          })
        )
      );

      stats.witnesses.encrypted += witnesses.length;
      stats.witnesses.processed += witnesses.length;
      console.log(`  Witnesses: ${stats.witnesses.encrypted} encrypted`);
    }
    console.log(`  Witnesses done: ${stats.witnesses.encrypted} encrypted`);

    // ── PanicAlert ─────────────────────────────────────────────────────
    console.log('\n[6/6] Encrypting PanicAlert locations...');
    skip = 0;
    while (true) {
      const alerts = await prisma.panicAlert.findMany({
        where: { locationEnc: null },
        take: BATCH_SIZE,
        skip,
        select: { id: true, latitude: true, longitude: true, accuracy: true },
      });
      if (alerts.length === 0) break;

      await prisma.$transaction(
        alerts.map((a) =>
          prisma.panicAlert.update({
            where: { id: a.id },
            data: {
              locationEnc: enc.encryptJSON({
                lat: a.latitude,
                lon: a.longitude,
                accuracy: a.accuracy,
              }),
            },
          })
        )
      );

      stats.panicAlerts.encrypted += alerts.length;
      stats.panicAlerts.processed += alerts.length;
      console.log(`  PanicAlerts: ${stats.panicAlerts.encrypted} encrypted`);
    }
    console.log(`  PanicAlerts done: ${stats.panicAlerts.encrypted} encrypted`);

    // ── Summary ────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════');
    console.log('Migration Summary:');
    console.log('════════════════════════════════════════');
    for (const [model, s] of Object.entries(stats)) {
      console.log(`  ${model}: ${s.encrypted} encrypted, ${s.skipped} skipped`);
    }
    console.log('════════════════════════════════════════');
    console.log('Migration completed successfully.');

    await prisma.$disconnect();
  } catch (error) {
    console.error('Migration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
