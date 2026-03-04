// Script para probar el flujo completo de emergencia:
// 1. Registrar usuario + representante
// 2. Activar alerta de pánico con coordenadas
// 3. Verificar: hospital cercano, URL de Maps, mensajes WhatsApp/SMS/Email

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const API = 'http://localhost:3001/api/v1';

async function setupTestData() {
  console.log('=== SETUP: Creando datos de prueba ===\n');

  // Limpiar datos previos de test
  await prisma.notification.deleteMany({});
  await prisma.panicAlert.deleteMany({});
  await prisma.representative.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.patientProfile.deleteMany({});
  await prisma.user.deleteMany({});

  // Crear usuario
  const passwordHash = await bcrypt.hash('TestPass123', 10);
  const user = await prisma.user.create({
    data: {
      name: 'Juan Perez',
      email: 'juan.test@vida.mx',
      passwordHash,
      curp: 'PETJ900101HDFRNN09',
      phone: '+5217771234567',
      isActive: true,
      isVerified: true,
      preferredLanguage: 'es',
    },
  });
  console.log(`  Usuario: ${user.name} (${user.id})`);

  // Crear perfil con condiciones
  await prisma.patientProfile.create({
    data: {
      userId: user.id,
      bloodType: 'O+',
      allergiesEnc: '["Penicilina"]',
      conditionsEnc: '["Diabetes","Hipertension"]',
      medicationsEnc: '["Metformina 500mg"]',
    },
  });
  console.log('  Perfil creado con condiciones: Diabetes, Hipertension');

  // Crear representante con email
  const rep = await prisma.representative.create({
    data: {
      userId: user.id,
      name: 'Maria Garcia',
      phone: '+5217779876543',
      email: 'maria.test@vida.mx',
      relation: 'Esposa',
      priority: 1,
      notifyOnEmergency: true,
      notifyOnAccess: true,
    },
  });
  console.log(`  Representante: ${rep.name} (${rep.phone}, ${rep.email})`);

  return user;
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as any;
  if (!data.success) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  return data.data.tokens.accessToken;
}

async function testPanicAlert(token: string) {
  console.log('\n=== TEST: Alerta de Panico ===\n');

  // Coordenadas de prueba: Cuernavaca centro
  const lat = 18.9242;
  const lon = -99.2216;

  console.log(`  Coordenadas: ${lat}, ${lon} (Cuernavaca)`);
  console.log(`  Google Maps esperado: https://www.google.com/maps?q=${lat},${lon}`);

  const res = await fetch(`${API}/emergency/panic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      latitude: lat,
      longitude: lon,
      accuracy: 10,
      message: 'Test de emergencia',
    }),
  });

  const data = (await res.json()) as any;
  console.log(`\n  Status: ${res.status}`);

  if (!data.success) {
    console.log(`  ERROR: ${JSON.stringify(data.error)}`);
    return;
  }

  const result = data.data;
  console.log(`  Alert ID: ${result.alertId}`);
  console.log(`  Status: ${result.status}`);

  // Verificar hospitales cercanos
  console.log(`\n  --- Hospitales cercanos (${result.nearbyHospitals?.length || 0}) ---`);
  if (result.nearbyHospitals && result.nearbyHospitals.length > 0) {
    for (const h of result.nearbyHospitals) {
      console.log(`    ${h.name}`);
      console.log(`      Distancia: ${h.distance?.toFixed(2)} km`);
      console.log(`      Tel emergencia: ${h.emergencyPhone || 'N/A'}`);
      console.log(`      Especialidades: ${h.specialties?.join(', ') || 'N/A'}`);
      if (h.matchScore !== undefined) {
        console.log(`      Match Score: ${h.matchScore}% (${h.matchedSpecialties?.join(', ')})`);
      }
    }
  } else {
    console.log('    NINGUNO encontrado!');
  }

  // Verificar notificaciones a representantes
  console.log(`\n  --- Representantes notificados (${result.representativesNotified?.length || 0}) ---`);
  if (result.representativesNotified) {
    for (const r of result.representativesNotified) {
      console.log(`    ${r.name} (${r.phone})`);
      console.log(`      SMS: ${r.smsStatus}`);
      console.log(`      WhatsApp: ${r.whatsappStatus}`);
      console.log(`      Email: ${r.emailStatus}`);
    }
  }
}

async function checkNotificationsInDB() {
  console.log('\n=== VERIFICACION: Notificaciones en BD ===\n');

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
  });

  console.log(`  Total: ${notifications.length} notificaciones\n`);

  for (const n of notifications) {
    const meta = n.metadata as any;
    console.log(`  [${n.channel}] ${n.type}`);
    console.log(`    Status: ${n.status}`);
    console.log(`    Dest: ${n.phone || n.email}`);
    console.log(`    Body: ${n.body}`);
    if (meta?.location) {
      console.log(`    Location: lat=${meta.location.lat}, lng=${meta.location.lng}`);
    }
    if (meta?.simulated) console.log(`    SIMULADO: si`);
    if (n.errorMessage) console.log(`    Error: ${n.errorMessage}`);
    console.log('');
  }
}

async function main() {
  try {
    console.log('============================================');
    console.log(' TEST FLUJO DE EMERGENCIA - Sistema VIDA');
    console.log('============================================\n');

    const user = await setupTestData();

    const token = await login('juan.test@vida.mx', 'TestPass123');
    console.log(`  Token obtenido: ${token.substring(0, 30)}...`);

    await testPanicAlert(token);
    await checkNotificationsInDB();

    console.log('============================================');
    console.log(' TEST COMPLETADO');
    console.log('============================================');
  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
