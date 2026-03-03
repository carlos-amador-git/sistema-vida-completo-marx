// prisma/seed.ts
import { PrismaClient, DirectiveType, DirectiveStatus, SubscriptionStatus, BillingCycle, PaymentStatus, PaymentMethodType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { seedHospitals } from './seed-hospitals';

dotenv.config();

const prisma = new PrismaClient();

// Usar ENCRYPTION_KEY del .env — requerido, sin fallback
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.error('ENCRYPTION_KEY is required for seeding');
  process.exit(1);
}

function encrypt(plaintext: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function encryptJSON(data: any): string {
  return encrypt(JSON.stringify(data));
}

// Helper para generar fechas aleatorias en un rango
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Helper para generar CURP aleatorio válido
function generateCURP(name: string, sex: string, birthDate: Date): string {
  const apellido = name.split(' ')[0].toUpperCase().slice(0, 2);
  const nombre = name.split(' ')[1]?.toUpperCase().slice(0, 1) || 'X';
  const year = birthDate.getFullYear().toString().slice(2);
  const month = (birthDate.getMonth() + 1).toString().padStart(2, '0');
  const day = birthDate.getDate().toString().padStart(2, '0');
  const sexo = sex === 'H' ? 'H' : 'M';
  const estado = ['DF', 'NL', 'JL', 'MX', 'GR', 'OC', 'YU', 'QR'][Math.floor(Math.random() * 8)];
  const consonantes = 'BCDFGHJKLMNPQRSTVWXYZ';
  const random = consonantes[Math.floor(Math.random() * consonantes.length)] +
                 consonantes[Math.floor(Math.random() * consonantes.length)] +
                 consonantes[Math.floor(Math.random() * consonantes.length)];
  const verificador = Math.floor(Math.random() * 10).toString() +
                      String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${apellido}${nombre}${year}${month}${day}${sexo}${estado}${random}${verificador}`;
}

async function main() {
  // Check if force reset is requested via env var or arg
  const forceReset = process.env.FORCE_RESET === 'true';

  console.log('🚀 Iniciando verificación de datos esenciales...');

  // ==================== ASEGURAR PLANES DE SUSCRIPCIÓN ====================
  // Plan Básico - $49 MXN/mes
  const planBasico = await prisma.subscriptionPlan.upsert({
    where: { slug: 'basico' },
    update: {},
    create: {
      name: 'Plan Básico',
      slug: 'basico',
      description: 'Acceso esencial a Sistema VIDA. Incluye perfil médico digital, QR de emergencia y hasta 2 representantes.',
      priceMonthly: 49.00,
      priceAnnual: 490.00,
      currency: 'MXN',
      stripeProductId: 'prod_Thidi1IAzeACXu',
      stripePriceIdMonthly: 'price_1SkJCB8exEVmS6S7GxSdbt1G',
      stripePriceIdAnnual: 'price_1SkJCC8exEVmS6S7kfaAUAKt',
      features: {
        advanceDirectives: false,
        donorPreferences: false,
        nom151Seal: false,
        smsNotifications: false,
        exportData: false,
        prioritySupport: false,
      },
      limits: {
        representativesLimit: 2,
        qrDownloadsPerMonth: 5,
        emergencyContactsLimit: 3,
      },
      trialDays: 7,
      isActive: true,
      isDefault: true,
      displayOrder: 1,
    },
  });

  // Plan Premium - $149 MXN/mes
  const planPremium = await prisma.subscriptionPlan.upsert({
    where: { slug: 'premium' },
    update: {},
    create: {
      name: 'Plan Premium',
      slug: 'premium',
      description: 'Acceso completo a todas las funciones de Sistema VIDA. Incluye directivas de voluntad anticipada, preferencias de donación, sello NOM-151, notificaciones SMS ilimitadas y soporte prioritario.',
      priceMonthly: 149.00,
      priceAnnual: 1490.00,
      currency: 'MXN',
      stripeProductId: 'prod_Thid0VC03LPaez',
      stripePriceIdMonthly: 'price_1SkJCC8exEVmS6S7F3M8dnA5',
      stripePriceIdAnnual: 'price_1SkJCD8exEVmS6S7HudMUeTX',
      features: {
        advanceDirectives: true,
        donorPreferences: true,
        nom151Seal: true,
        smsNotifications: true,
        exportData: true,
        prioritySupport: true,
      },
      limits: {
        representativesLimit: 10,
        qrDownloadsPerMonth: -1,
        emergencyContactsLimit: -1,
      },
      trialDays: 0,
      isActive: true,
      isDefault: false,
      displayOrder: 2,
    },
  });

  console.log('✅ Planes de suscripción verificados/creados.');

  // ==================== ASEGURAR USUARIO DEMO PRINCIPAL ====================
  const demoEmail = 'demo@sistemavida.mx';
  const demoPassword = 'Demo123!';
  const demoPasswordHash = await bcrypt.hash(demoPassword, 12);

  // Verificar si existe, si no, crearlo. Si existe, actualizar password.
  let demoUser = await prisma.user.findUnique({ where: { email: demoEmail } });

  if (demoUser) {
    console.log('🔄 Usuario demo existente. Actualizando contraseña para asegurar acceso...');
    demoUser = await prisma.user.update({
      where: { email: demoEmail },
      data: { 
        passwordHash: demoPasswordHash,
        isActive: true,
        isVerified: true
      }
    });
  } else {
    console.log('🆕 Creando usuario demo faltante...');
    const birthDate = new Date('1980-01-01');
    const curp = generateCURP('Carlos García Rodríguez', 'H', birthDate);
    
    demoUser = await prisma.user.create({
      data: {
        email: demoEmail,
        passwordHash: demoPasswordHash,
        curp,
        name: 'Carlos García Rodríguez',
        dateOfBirth: birthDate,
        sex: 'H',
        phone: '+52 55 1234 5678',
        address: 'Calle Demo 123, CDMX',
        isActive: true,
        isVerified: true,
        createdAt: new Date(),
      },
    });

    // Crear suscripción Premium para el demo
    await prisma.subscription.create({
      data: {
        userId: demoUser.id,
        planId: planPremium.id,
        stripeSubscriptionId: `sub_demo_${demoUser.id.slice(0, 8)}`,
        stripeCustomerId: `cus_demo_${demoUser.id.slice(0, 8)}`,
        billingCycle: BillingCycle.ANNUAL,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        createdAt: new Date(),
      },
    });
    console.log('✅ Usuario demo creado con suscripción Premium.');
  }

  // ==================== ASEGURAR PERFIL MÉDICO DEL DEMO ====================
  // Aseguramos que el usuario demo siempre tenga un perfil médico y QR válido
  {
    const allergies = ['Penicilina', 'Sulfonamidas', 'Mariscos'];
    const conditions = ['Diabetes Mellitus Tipo 2', 'Hipertension Arterial', 'Hipotiroidismo'];
    const medications = [
      'Metformina 850mg - 1 cada 12 horas',
      'Losartan 50mg - 1 cada 24 horas',
      'Levotiroxina 100mcg - 1 en ayunas',
      'Aspirina 100mg - 1 cada 24 horas'
    ];
    const donorPreferences = {
      organs: ['corazon', 'rinones', 'higado', 'pulmones', 'pancreas'],
      tissues: ['corneas', 'piel', 'hueso', 'valvulas_cardiacas'],
      restrictions: [],
      notes: 'Deseo ayudar a quien lo necesite. Sin restricciones.'
    };

    await prisma.patientProfile.upsert({
      where: { userId: demoUser.id },
      update: {
        // Si ya existe, aseguramos que tenga un token QR válido por si acaso se perdió
        qrToken: (await prisma.patientProfile.findUnique({ where: { userId: demoUser.id } }))?.qrToken || crypto.randomBytes(32).toString('hex'),
      },
      create: {
        userId: demoUser.id,
        bloodType: 'O+',
        allergiesEnc: encryptJSON(allergies),
        conditionsEnc: encryptJSON(conditions),
        medicationsEnc: encryptJSON(medications),
        insuranceProvider: 'GNP Seguros',
        insurancePolicy: 'POL-2024-789456',
        insurancePhone: '800 400 9000',
        isDonor: true,
        donorPreferencesEnc: encryptJSON(donorPreferences),
        qrToken: crypto.randomBytes(32).toString('hex'),
      },
    });
    console.log('✅ Perfil médico asegurado para usuario demo.');
  }

  // Ahora verificar si debemos correr el seed completo (datos masivos)
  const userCount = await prisma.user.count();

  // Si hay más de 1 usuario (el demo que acabamos de asegurar/crear), y no es force reset, saltamos.
  // O si solo está el demo, tal vez queramos correr el seed completo para llenar datos?
  // Asumamos que si userCount > 10 (arbitrario) ya hay datos.
  // Pero el script original decía "userCount > 0". Ahora siempre será > 0 porque aseguramos el demo.
  
  // Vamos a contar usuarios NO demo.
  const otherUsersCount = await prisma.user.count({
    where: { email: { not: demoEmail } }
  });

  if (!forceReset && (otherUsersCount > 0 || demoUserExisted)) {
    console.log(`⚠️ La base de datos ya contiene datos (Usuarios: ${otherUsersCount + (demoUserExisted ? 1 : 0)}). Saltando seed masivo para preservar cambios.`);
    console.log('   (Usa FORCE_RESET=true para forzar el reinicio completo de la base de datos)');
    return;
  }

  console.log('🚀 Iniciando seed MASIVO de datos de prueba...\n');

  // Limpiar datos existentes (en orden por dependencias)
  // NOTA: Si llegamos aquí, vamos a borrar todo. Incluyendo el demo user que acabamos de asegurar/crear?
  // Sí, porque el script original hace deleteMany().
  // PERO, si acabamos de crear el demo user, borrarlo sería tonto.
  // El script original borra todo y recrea.
  
  // Si otherUsersCount == 0, significa que la DB está vacía o solo tiene el demo user.
  // Si solo tiene el demo user (que acabamos de crear/actualizar), podemos proceder a borrar todo y recrear TODO el set completo
  // para asegurar consistencia de datos relacionados (pagos, facturas, etc).

  // PROTECCION: Si estamos en producción, NO borrar datos masivamente a menos que se fuerce.
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction && !forceReset) {
    console.log('⚠️ Entorno de PRODUCCIÓN detectado. Saltando limpieza masiva de datos para preservar información.');
    console.log('   (Usa FORCE_RESET=true si realmente deseas reiniciar la base de datos)');
    return;
  }
  
  console.log('🧹 Limpiando datos existentes...');
  await prisma.invoice.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.subscription.deleteMany();
  // await prisma.subscriptionPlan.deleteMany(); // No borramos planes, ya los aseguramos
  await prisma.fiscalData.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.emergencyAccess.deleteMany();
  await prisma.witness.deleteMany();
  await prisma.advanceDirective.deleteMany();
  await prisma.representative.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.session.deleteMany();
  await prisma.medicalStaff.deleteMany();
  await prisma.medicalInstitution.deleteMany();
  await prisma.stateLegalTemplate.deleteMany();
  await prisma.user.deleteMany(); // Esto borrará el demo user también, pero se recreará abajo en el loop


  console.log('✅ Datos anteriores eliminados.\n');

  // ==================== USUARIOS DE DEMOSTRACIÓN ====================
  console.log('👥 Creando usuarios de demostración...');

  const passwordHash = await bcrypt.hash('Demo123!', 12);

  // Lista de usuarios demo para crear
  const demoUsers = [
    { name: 'Carlos García Rodríguez', email: 'demo@sistemavida.mx', sex: 'H', phone: '+52 55 1234 5678', isPremium: true, monthsActive: 8 },
    { name: 'María Elena López Torres', email: 'maria.lopez@email.com', sex: 'M', phone: '+52 55 2345 6789', isPremium: true, monthsActive: 6 },
    { name: 'Roberto Hernández Sánchez', email: 'roberto.hdz@email.com', sex: 'H', phone: '+52 81 3456 7890', isPremium: true, monthsActive: 4 },
    { name: 'Ana Patricia Martínez Ruiz', email: 'ana.martinez@email.com', sex: 'M', phone: '+52 33 4567 8901', isPremium: false, monthsActive: 3 },
    { name: 'José Luis Ramírez García', email: 'jose.ramirez@email.com', sex: 'H', phone: '+52 55 5678 9012', isPremium: true, monthsActive: 5 },
    { name: 'Laura Fernández Díaz', email: 'laura.fernandez@email.com', sex: 'M', phone: '+52 55 6789 0123', isPremium: false, monthsActive: 2 },
    { name: 'Miguel Ángel Torres Pérez', email: 'miguel.torres@email.com', sex: 'H', phone: '+52 442 7890 1234', isPremium: true, monthsActive: 7 },
    { name: 'Sofía Alejandra Moreno Vega', email: 'sofia.moreno@email.com', sex: 'M', phone: '+52 55 8901 2345', isPremium: false, monthsActive: 1 },
    { name: 'Fernando Cruz Mendoza', email: 'fernando.cruz@email.com', sex: 'H', phone: '+52 222 9012 3456', isPremium: true, monthsActive: 10 },
    { name: 'Patricia Gómez Luna', email: 'patricia.gomez@email.com', sex: 'M', phone: '+52 55 0123 4567', isPremium: true, monthsActive: 9 },
    { name: 'Ricardo Salazar Ortiz', email: 'ricardo.salazar@email.com', sex: 'H', phone: '+52 664 1234 5678', isPremium: false, monthsActive: 4 },
    { name: 'Carmen Jiménez Reyes', email: 'carmen.jimenez@email.com', sex: 'M', phone: '+52 55 2345 6780', isPremium: true, monthsActive: 3 },
    { name: 'Alejandro Vargas Castillo', email: 'alejandro.vargas@email.com', sex: 'H', phone: '+52 33 3456 7891', isPremium: false, monthsActive: 5 },
    { name: 'Diana Herrera Navarro', email: 'diana.herrera@email.com', sex: 'M', phone: '+52 81 4567 8902', isPremium: true, monthsActive: 6 },
    { name: 'Eduardo Flores Acosta', email: 'eduardo.flores@email.com', sex: 'H', phone: '+52 55 5678 9013', isPremium: true, monthsActive: 11 },
    { name: 'Gabriela Mendoza Silva', email: 'gabriela.mendoza@email.com', sex: 'M', phone: '+52 55 6789 0124', isPremium: false, monthsActive: 2 },
    { name: 'Juan Pablo Rivera León', email: 'juan.rivera@email.com', sex: 'H', phone: '+52 998 7890 1235', isPremium: true, monthsActive: 8 },
    { name: 'Verónica Castro Núñez', email: 'veronica.castro@email.com', sex: 'M', phone: '+52 55 8901 2346', isPremium: true, monthsActive: 7 },
    { name: 'Héctor Delgado Rojas', email: 'hector.delgado@email.com', sex: 'H', phone: '+52 477 9012 3457', isPremium: false, monthsActive: 1 },
    { name: 'Lucía Sánchez Paredes', email: 'lucia.sanchez@email.com', sex: 'M', phone: '+52 55 0123 4568', isPremium: true, monthsActive: 4 },
  ];

  const createdUsers = [];
  const now = new Date();

  for (const userData of demoUsers) {
    const birthDate = randomDate(new Date('1960-01-01'), new Date('1995-12-31'));
    const curp = generateCURP(userData.name, userData.sex, birthDate);
    const registrationDate = new Date(now.getTime() - (userData.monthsActive * 30 * 24 * 60 * 60 * 1000));

    const user = await prisma.user.create({
      data: {
        email: userData.email,
        passwordHash,
        curp,
        name: userData.name,
        dateOfBirth: birthDate,
        sex: userData.sex,
        phone: userData.phone,
        address: `Calle ${Math.floor(Math.random() * 999) + 1}, Col. Centro, CDMX`,
        isActive: true,
        isVerified: true,
        createdAt: registrationDate,
      },
    });

    // Crear suscripción para cada usuario
    const plan = userData.isPremium ? planPremium : planBasico;
    const subscriptionStart = registrationDate;
    const currentPeriodStart = new Date(now.getTime() - (Math.random() * 30 * 24 * 60 * 60 * 1000));
    const currentPeriodEnd = new Date(currentPeriodStart.getTime() + (30 * 24 * 60 * 60 * 1000));

    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        stripeSubscriptionId: `sub_demo_${user.id.slice(0, 8)}`,
        stripeCustomerId: `cus_demo_${user.id.slice(0, 8)}`,
        billingCycle: Math.random() > 0.3 ? BillingCycle.MONTHLY : BillingCycle.ANNUAL,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart,
        currentPeriodEnd,
        createdAt: subscriptionStart,
      },
    });

    // Crear historial de pagos para cada usuario
    const monthlyPrice = plan.slug === 'premium' ? 149.00 : 49.00;
    const cardBrands = ['visa', 'mastercard', 'amex'];
    const last4Options = ['4242', '1234', '5678', '9999', '0000', '8888'];

    for (let i = 0; i < userData.monthsActive; i++) {
      const paymentDate = new Date(subscriptionStart.getTime() + (i * 30 * 24 * 60 * 60 * 1000));
      if (paymentDate <= now) {
        await prisma.payment.create({
          data: {
            userId: user.id,
            subscriptionId: subscription.id,
            stripePaymentIntentId: `pi_demo_${user.id.slice(0, 6)}_${i}`,
            amount: monthlyPrice,
            currency: 'MXN',
            paymentMethod: PaymentMethodType.CARD,
            last4: last4Options[Math.floor(Math.random() * last4Options.length)],
            cardBrand: cardBrands[Math.floor(Math.random() * cardBrands.length)],
            status: PaymentStatus.SUCCEEDED,
            description: `Pago mensual - ${plan.name}`,
            paidAt: paymentDate,
            createdAt: paymentDate,
          },
        });
      }
    }

    createdUsers.push({ user, subscription, isPremium: userData.isPremium });
    console.log(`   ✅ ${userData.name} (${userData.isPremium ? 'Premium' : 'Básico'}) - ${userData.monthsActive} meses`);
  }

  console.log(`\n   Total: ${createdUsers.length} usuarios creados`);
  console.log(`   Premium: ${createdUsers.filter(u => u.isPremium).length} usuarios`);
  console.log(`   Básico: ${createdUsers.filter(u => !u.isPremium).length} usuarios\n`);

  // ==================== USUARIO DEMO PRINCIPAL ====================
  console.log('🎯 Configurando usuario demo principal...');

  // Buscar el usuario demo principal
  const testUser = createdUsers.find(u => u.user.email === 'demo@sistemavida.mx')!.user;

  console.log('Usuario demo:', testUser.email);

  // Crear perfil de paciente con datos medicos
  const allergies = ['Penicilina', 'Sulfonamidas', 'Mariscos'];
  const conditions = ['Diabetes Mellitus Tipo 2', 'Hipertension Arterial', 'Hipotiroidismo'];
  const medications = [
    'Metformina 850mg - 1 cada 12 horas',
    'Losartan 50mg - 1 cada 24 horas',
    'Levotiroxina 100mcg - 1 en ayunas',
    'Aspirina 100mg - 1 cada 24 horas'
  ];
  const donorPreferences = {
    organs: ['corazon', 'rinones', 'higado', 'pulmones', 'pancreas'],
    tissues: ['corneas', 'piel', 'hueso', 'valvulas_cardiacas'],
    restrictions: [],
    notes: 'Deseo ayudar a quien lo necesite. Sin restricciones.'
  };

  const profile = await prisma.patientProfile.create({
    data: {
      userId: testUser.id,
      bloodType: 'O+',
      allergiesEnc: encryptJSON(allergies),
      conditionsEnc: encryptJSON(conditions),
      medicationsEnc: encryptJSON(medications),
      insuranceProvider: 'GNP Seguros',
      insurancePolicy: 'POL-2024-789456',
      insurancePhone: '800 400 9000',
      isDonor: true,
      donorPreferencesEnc: encryptJSON(donorPreferences),
    },
  });

  console.log('Perfil medico creado con QR Token:', profile.qrToken);

  // Crear representantes
  const representatives = await Promise.all([
    prisma.representative.create({
      data: {
        userId: testUser.id,
        name: 'Usuario Demo',
        phone: '+525500000000',
        email: 'representante.demo@sistemavida.mx',
        relation: 'Apoderado Legal',
        priority: 1,
        isDonorSpokesperson: true,
        notifyOnEmergency: true,
        notifyOnAccess: true,
      },
    }),
    prisma.representative.create({
      data: {
        userId: testUser.id,
        name: 'Roberto Garcia Martinez',
        phone: '+525500000001',
        email: 'roberto.garcia@demo.test',
        relation: 'Hijo',
        priority: 2,
        isDonorSpokesperson: false,
        notifyOnEmergency: true,
        notifyOnAccess: false,
      },
    }),
    prisma.representative.create({
      data: {
        userId: testUser.id,
        name: 'Ana Patricia Garcia Martinez',
        phone: '+525500000002',
        email: 'ana.garcia@demo.test',
        relation: 'Hija',
        priority: 3,
        isDonorSpokesperson: false,
        notifyOnEmergency: true,
        notifyOnAccess: false,
      },
    }),
    prisma.representative.create({
      data: {
        userId: testUser.id,
        name: 'Dr. Carlos Mendez',
        phone: '+525500000003',
        email: 'dr.mendez@demo.test',
        relation: 'Médico Personal',
        priority: 4,
        isDonorSpokesperson: false,
        notifyOnEmergency: true,
        notifyOnAccess: true,
      },
    }),
    prisma.representative.create({
      data: {
        userId: testUser.id,
        name: 'Representante Demo',
        phone: '+525500000004',
        email: 'representante@demo.test',
        relation: 'Representante Legal',
        priority: 5,
        isDonorSpokesperson: false,
        notifyOnEmergency: true,
        notifyOnAccess: true,
      },
    }),
  ]);

  console.log('Representantes creados:', representatives.length);

  // Crear directiva de voluntad anticipada activa
  const directive = await prisma.advanceDirective.create({
    data: {
      userId: testUser.id,
      type: DirectiveType.DIGITAL_DRAFT,
      status: DirectiveStatus.ACTIVE,
      acceptsCPR: false,
      acceptsIntubation: false,
      acceptsDialysis: false,
      acceptsTransfusion: true,
      acceptsArtificialNutrition: false,
      palliativeCareOnly: true,
      additionalNotes: `En caso de encontrarme en estado terminal o de inconsciencia permanente,
expreso mi voluntad de:

1. NO recibir maniobras de reanimacion cardiopulmonar (RCP)
2. NO ser conectado a ventilacion mecanica invasiva
3. NO recibir dialisis si mi condicion es irreversible
4. SI acepto transfusiones sanguineas si son necesarias para mi comodidad
5. NO recibir alimentacion artificial por sonda
6. SI deseo recibir cuidados paliativos completos para control del dolor

Mi prioridad es mantener mi dignidad y calidad de vida, evitando el ensanamiento terapeutico.
Confio en mi apoderado legal para tomar decisiones en mi nombre.`,
      originState: 'CDMX',
      legalBasisSummary: 'Ley de Voluntad Anticipada para el Distrito Federal (2008)',
      validatedAt: new Date(),
      validationMethod: 'EMAIL',
    },
  });

  console.log('Directiva de voluntad anticipada creada:', directive.id);

  // Crear plantillas legales de algunos estados
  await Promise.all([
    prisma.stateLegalTemplate.create({
      data: {
        stateCode: 'CDMX',
        stateName: 'Ciudad de Mexico',
        lawName: 'Ley de Voluntad Anticipada para el Distrito Federal',
        lawDate: new Date('2008-01-07'),
        lawSummary: 'Primera ley de voluntad anticipada en Mexico. Permite a los residentes de la CDMX manifestar su decision de no ser sometidos a tratamientos que prolonguen su vida en caso de enfermedad terminal.',
        requiresNotary: true,
        requiresWitnesses: 2,
        requiresMedicalCert: true,
      },
    }),
    prisma.stateLegalTemplate.create({
      data: {
        stateCode: 'JAL',
        stateName: 'Jalisco',
        lawName: 'Ley de Voluntad Vital Anticipada del Estado de Jalisco',
        lawDate: new Date('2019-12-19'),
        lawSummary: 'Permite manifestar la voluntad anticipada sobre tratamientos medicos. Incluye disposiciones sobre donacion de organos.',
        requiresNotary: true,
        requiresWitnesses: 2,
        requiresMedicalCert: false,
      },
    }),
    prisma.stateLegalTemplate.create({
      data: {
        stateCode: 'NL',
        stateName: 'Nuevo Leon',
        lawName: 'Ley de Voluntad Anticipada del Estado de Nuevo Leon',
        lawDate: new Date('2019-10-23'),
        lawSummary: 'Reconoce el derecho de las personas a decidir sobre tratamientos medicos en caso de enfermedad terminal.',
        requiresNotary: true,
        requiresWitnesses: 2,
        requiresMedicalCert: true,
      },
    }),
  ]);

  console.log('Plantillas legales estatales creadas.');

  // Crear hospitales (CDMX y Morelos)
  await seedHospitals();

  // ==================== ESTADÍSTICAS FINALES ====================
  const totalPayments = await prisma.payment.count();
  const totalRevenue = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { status: PaymentStatus.SUCCEEDED },
  });
  const premiumCount = createdUsers.filter(u => u.isPremium).length;
  const basicoCount = createdUsers.filter(u => !u.isPremium).length;

  // Resumen final
  console.log('\n' + '═'.repeat(60));
  console.log('💰 RESUMEN DE DATOS DE DEMOSTRACIÓN');
  console.log('═'.repeat(60));
  console.log('');
  console.log('📊 MÉTRICAS DE NEGOCIO:');
  console.log(`   • Usuarios totales:     ${createdUsers.length}`);
  console.log(`   • Plan Básico ($49):    ${basicoCount} usuarios`);
  console.log(`   • Plan Premium ($149):  ${premiumCount} usuarios`);
  console.log(`   • Pagos procesados:     ${totalPayments}`);
  console.log(`   • Ingresos totales:     $${Number(totalRevenue._sum.amount || 0).toLocaleString()} MXN`);
  console.log('');
  console.log('📈 PROYECCIÓN MENSUAL:');
  const monthlyRevenue = (basicoCount * 49) + (premiumCount * 149);
  console.log(`   • MRR actual:           $${monthlyRevenue.toLocaleString()} MXN`);
  console.log(`   • ARR proyectado:       $${(monthlyRevenue * 12).toLocaleString()} MXN`);
  console.log('');
  console.log('🔐 DATOS DE ACCESO DE PRUEBA:');
  console.log('   Email:      demo@sistemavida.mx');
  console.log('   Password:   Demo123!');
  console.log(`   QR Token:   ${profile.qrToken}`);
  console.log('');
  console.log('🔑 ACCESO ADMIN:');
  console.log('   Email:      admin@sistemavida.mx');
  console.log('   Password:   Admin123!');
  console.log('');
  console.log('═'.repeat(60));
  console.log('✅ Seed completado exitosamente!');
  console.log('═'.repeat(60) + '\n');
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
