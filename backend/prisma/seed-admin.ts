// prisma/seed-admin.ts
// Seed de datos de prueba para el panel de administracion
import { PrismaClient, AdminRole, DirectiveStatus, DirectiveType, PanicStatus, InstitutionType, AttentionLevel, StaffRole, InsuranceType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Usar ENCRYPTION_KEY del .env — requerido para cifrar datos médicos
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.error('ENCRYPTION_KEY is required for seed-admin');
  process.exit(1);
}

function encryptForSeed(plaintext: string): string {
  const key = Buffer.from(ENCRYPTION_KEY!, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function encryptJSON(data: any): string {
  return encryptForSeed(JSON.stringify(data));
}

// Datos mexicanos realistas
const NOMBRES_HOMBRES = [
  'Carlos', 'Juan', 'Miguel', 'Jose', 'Luis', 'Francisco', 'Antonio',
  'Pedro', 'Ricardo', 'Fernando', 'Manuel', 'Eduardo', 'Rafael', 'Alejandro',
  'Roberto', 'Sergio', 'Jorge', 'David', 'Mario', 'Arturo', 'Alberto',
  'Raul', 'Daniel', 'Oscar', 'Javier', 'Victor', 'Marco', 'Enrique'
];

const NOMBRES_MUJERES = [
  'Maria', 'Ana', 'Rosa', 'Patricia', 'Carmen', 'Guadalupe', 'Laura',
  'Isabel', 'Elena', 'Beatriz', 'Teresa', 'Lucia', 'Sofia', 'Fernanda',
  'Adriana', 'Diana', 'Monica', 'Claudia', 'Alejandra', 'Veronica',
  'Gabriela', 'Mariana', 'Andrea', 'Paulina', 'Daniela', 'Karla', 'Sandra'
];

const APELLIDOS = [
  'Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Gonzalez', 'Hernandez',
  'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Flores', 'Rivera', 'Gomez',
  'Diaz', 'Morales', 'Reyes', 'Cruz', 'Ortiz', 'Gutierrez', 'Chavez',
  'Mendoza', 'Vargas', 'Castillo', 'Romero', 'Jimenez', 'Ruiz', 'Herrera',
  'Medina', 'Aguilar', 'Vega', 'Ramos', 'Molina', 'Contreras', 'Delgado'
];

const ESTADOS = [
  { code: 'CDMX', name: 'Ciudad de Mexico' },
  { code: 'JAL', name: 'Jalisco' },
  { code: 'NL', name: 'Nuevo Leon' },
  { code: 'PUE', name: 'Puebla' },
  { code: 'GTO', name: 'Guanajuato' },
  { code: 'VER', name: 'Veracruz' },
  { code: 'YUC', name: 'Yucatan' },
  { code: 'QRO', name: 'Queretaro' },
  { code: 'SLP', name: 'San Luis Potosi' },
  { code: 'AGS', name: 'Aguascalientes' },
];

const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const ALERGIAS = [
  'Penicilina', 'Aspirina', 'Ibuprofeno', 'Mariscos', 'Cacahuates',
  'Latex', 'Polen', 'Sulfas', 'Contraste yodado', 'Huevo'
];

const CONDICIONES = [
  'Diabetes Tipo 2', 'Hipertension', 'Asma', 'Artritis', 'Hipotiroidismo',
  'Epilepsia', 'Enfermedad cardiaca', 'EPOC', 'Insuficiencia renal',
  'Fibromialgia', 'Lupus', 'Esclerosis multiple'
];

const MEDICAMENTOS = [
  'Metformina 500mg', 'Losartan 50mg', 'Omeprazol 20mg', 'Aspirina 100mg',
  'Atorvastatina 20mg', 'Levotiroxina 100mcg', 'Amlodipino 5mg',
  'Metoprolol 50mg', 'Enalapril 10mg', 'Lisinopril 10mg'
];

const RELACIONES = [
  'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER', 'LEGAL_REPRESENTATIVE'
];

const ACCIONES_AUDIT = [
  'LOGIN', 'LOGOUT', 'VIEW_PROFILE', 'UPDATE_PROFILE', 'CREATE_DIRECTIVE',
  'UPDATE_DIRECTIVE', 'ADD_REPRESENTATIVE', 'GENERATE_QR', 'VIEW_QR',
  'EMERGENCY_ACCESS_GRANTED', 'PANIC_ALERT_CREATED', 'PASSWORD_RESET'
];

// Hospitales con urgencias en CDMX y Estado de México - Datos reales
const HOSPITALES_CDMX = [
  // === CDMX ===
  {
    name: 'Centro Médico ABC - Santa Fe',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.3662, lng: -99.2693,
    address: 'Av. Carlos Graef Fernández 154, Cuajimalpa, CDMX',
    phone: '5511031666',
    state: 'CDMX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte', 'Atlas', 'Zurich', 'Latinoamericana', 'Plan Seguro', 'Sura', 'HDI', 'Chubb']
  },
  {
    name: 'Centro Médico ABC - Observatorio',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.4012, lng: -99.1927,
    address: 'Sur 136 No. 116, Col. Las Américas, Álvaro Obregón, CDMX',
    phone: '5552308161',
    state: 'CDMX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte', 'Atlas', 'Zurich', 'Latinoamericana', 'Plan Seguro', 'Sura', 'HDI', 'Chubb']
  },
  {
    name: 'Médica Sur',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.3014, lng: -99.1557,
    address: 'Puente de Piedra 150, Toriello Guerra, Tlalpan, CDMX',
    phone: '5554247200',
    state: 'CDMX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte']
  },
  {
    name: 'Hospital Ángeles Pedregal',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.3124, lng: -99.2048,
    address: 'Camino a Santa Teresa 1055, Héroes de Padierna, CDMX',
    phone: '5554495500',
    state: 'CDMX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte', 'Atlas']
  },
  {
    name: 'Hospital Ángeles México',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.4095, lng: -99.1781,
    address: 'Agrarismo 208, Escandón, Miguel Hidalgo, CDMX',
    phone: '5555169900',
    state: 'CDMX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte', 'Atlas']
  },
  {
    name: 'Hospital Ángeles Acoxpa',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.3048, lng: -99.1432,
    address: 'Calzada Acoxpa 430, Ex Hacienda Coapa, Tlalpan, CDMX',
    phone: '5554247200',
    state: 'CDMX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte', 'Atlas']
  },
  {
    name: 'Hospital San Ángel Inn Universidad',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.3726, lng: -99.1537,
    address: 'Río Churubusco 601, Xoco, Benito Juárez, CDMX',
    phone: '5556236363',
    state: 'CDMX',
    insurances: ['AIG', 'Allianz', 'AXA', 'BUPA', 'GNP', 'Mapfre', 'Metlife', 'Pan-American', 'Plan Seguro', 'Sura']
  },
  {
    name: 'Hospital San Ángel Inn Patriotismo',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'SECOND' as AttentionLevel,
    lat: 19.4015, lng: -99.1721,
    address: 'Av. Patriotismo 67, San Juan, Benito Juárez, CDMX',
    phone: '5552730505',
    state: 'CDMX',
    insurances: ['AIG', 'Allianz', 'AXA', 'BUPA', 'GNP', 'Mapfre', 'Metlife', 'Pan-American', 'Plan Seguro', 'Sura']
  },
  {
    name: 'Hospital San Ángel Inn Chapultepec',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'SECOND' as AttentionLevel,
    lat: 19.4218, lng: -99.1631,
    address: 'Av. Chapultepec 489, Juárez, Cuauhtémoc, CDMX',
    phone: '5552419800',
    state: 'CDMX',
    insurances: ['AIG', 'Allianz', 'AXA', 'BUPA', 'GNP', 'Mapfre', 'Metlife', 'Pan-American', 'Plan Seguro', 'Sura']
  },
  {
    name: 'Hospital Español',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.4286, lng: -99.1732,
    address: 'Ejército Nacional 613, Granada, Miguel Hidalgo, CDMX',
    phone: '5552559600',
    state: 'CDMX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte', 'Atlas', 'Zurich', 'Chubb']
  },
  {
    name: 'Star Médica Centro',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'SECOND' as AttentionLevel,
    lat: 19.4424, lng: -99.1368,
    address: 'Sor Juana Inés de la Cruz 132, Centro, CDMX',
    phone: '5553401000',
    state: 'CDMX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte']
  },
  {
    name: 'Hospital Dalinde',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'SECOND' as AttentionLevel,
    lat: 19.4108, lng: -99.1623,
    address: 'Tuxpan 25, Roma Sur, Cuauhtémoc, CDMX',
    phone: '5552652800',
    state: 'CDMX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa']
  },
  // === ESTADO DE MÉXICO ===
  {
    name: 'Hospital Satélite',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'SECOND' as AttentionLevel,
    lat: 19.5088, lng: -99.2355,
    address: 'Cto. Misioneros 5, Cd. Satélite, Naucalpan, Edo. Méx.',
    phone: '5550891410',
    state: 'MEX',
    insurances: ['Metlife', 'AXA', 'GNP', 'Monterrey NYL', 'Mapfre', 'Banorte', 'Allianz', 'Atlas', 'Inbursa']
  },
  {
    name: 'Star Médica Lomas Verdes',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'SECOND' as AttentionLevel,
    lat: 19.5142, lng: -99.2456,
    address: 'Av. Lomas Verdes 2165, Naucalpan, Edo. Méx.',
    phone: '5526251700',
    state: 'MEX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte']
  },
  {
    name: 'Star Médica Tlalnepantla',
    type: 'HOSPITAL_PRIVATE' as InstitutionType,
    level: 'SECOND' as AttentionLevel,
    lat: 19.5389, lng: -99.1978,
    address: 'Av. Mario Colin s/n, Tlalnepantla, Edo. Méx.',
    phone: '5553217070',
    state: 'MEX',
    insurances: ['GNP', 'AXA', 'Metlife', 'Allianz', 'Monterrey NYL', 'Mapfre', 'BUPA', 'Inbursa', 'Banorte']
  },
  // === INSTITUCIONES PÚBLICAS (para completar) ===
  {
    name: 'Hospital General de México',
    type: 'HOSPITAL_PUBLIC' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.4113, lng: -99.1526,
    address: 'Dr. Balmis 148, Doctores, Cuauhtémoc, CDMX',
    phone: '5552761400',
    state: 'CDMX',
    insurances: [] // Público - no requiere seguro
  },
  {
    name: 'Instituto Nacional de Cardiología',
    type: 'HOSPITAL_PUBLIC' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.2929, lng: -99.1531,
    address: 'Juan Badiano 1, Belisario Domínguez, Tlalpan, CDMX',
    phone: '5555732911',
    state: 'CDMX',
    insurances: [] // Público
  },
  {
    name: 'IMSS Hospital La Raza',
    type: 'IMSS' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.4695, lng: -99.1394,
    address: 'Calzada Vallejo s/n, La Raza, Azcapotzalco, CDMX',
    phone: '5557245900',
    state: 'CDMX',
    insurances: [] // IMSS
  },
  {
    name: 'ISSSTE Hospital 20 de Noviembre',
    type: 'ISSSTE' as InstitutionType,
    level: 'THIRD' as AttentionLevel,
    lat: 19.3903, lng: -99.1608,
    address: 'Félix Cuevas 540, Del Valle, Benito Juárez, CDMX',
    phone: '5552005003',
    state: 'CDMX',
    insurances: [] // ISSSTE
  },
  {
    name: 'Cruz Roja Mexicana - CDMX',
    type: 'AMBULANCE_SERVICE' as InstitutionType,
    level: 'FIRST' as AttentionLevel,
    lat: 19.4239, lng: -99.1687,
    address: 'Juan Luis Vives 200, Polanco, Miguel Hidalgo, CDMX',
    phone: '5555571680',
    emergencyPhone: '065',
    state: 'CDMX',
    insurances: [] // Servicio de emergencias
  },
];

// Utilidades
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomElements<T>(arr: T[], min: number, max: number): T[] {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function generateCURP(nombre: string, apellido: string, sexo: 'H' | 'M', fechaNac: Date): string {
  const year = fechaNac.getFullYear().toString().slice(2);
  const month = (fechaNac.getMonth() + 1).toString().padStart(2, '0');
  const day = fechaNac.getDate().toString().padStart(2, '0');
  const estado = randomElement(['DF', 'JC', 'NL', 'PL', 'GT', 'VZ', 'YN', 'QT']);

  return `${apellido.slice(0, 2).toUpperCase()}${nombre.charAt(0).toUpperCase()}${nombre.charAt(1).toUpperCase()}${year}${month}${day}${sexo}${estado}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}`;
}

function generatePhone(): string {
  const prefixes = ['55', '33', '81', '222', '442', '477', '999'];
  return `${randomElement(prefixes)}${Math.floor(10000000 + Math.random() * 90000000)}`;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  console.log('🌱 Iniciando seed de datos de prueba...\n');

  // Limpiar datos existentes (en orden de dependencias)
  console.log('🧹 Limpiando datos existentes...');
  await prisma.adminAuditLog.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.panicAlert.deleteMany();
  await prisma.emergencyAccess.deleteMany();
  await prisma.witness.deleteMany();
  await prisma.advanceDirective.deleteMany();
  await prisma.representative.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.insurancePlan.deleteMany();
  await prisma.insuranceCompany.deleteMany();
  await prisma.medicalStaff.deleteMany();
  await prisma.medicalInstitution.deleteMany();
  await prisma.user.deleteMany();

  // ==================== ADMINISTRADORES ====================
  console.log('\n👨‍💼 Creando administradores...');

  const passwordHash = await bcrypt.hash('Admin123!', 12);

  const admins = await Promise.all([
    prisma.adminUser.create({
      data: {
        email: 'superadmin@sistemavida.mx',
        passwordHash,
        name: 'Super Administrador',
        role: 'SUPER_ADMIN',
        permissions: ['*'],
        isSuperAdmin: true,
        isActive: true,
      },
    }),
    prisma.adminUser.create({
      data: {
        email: 'admin@sistemavida.mx',
        passwordHash,
        name: 'Administrador Principal',
        role: 'ADMIN',
        permissions: [
          'metrics:read', 'users:read', 'users:write',
          'audit:read', 'audit:export', 'institutions:read',
          'institutions:write', 'health:read'
        ],
        isSuperAdmin: false,
        isActive: true,
      },
    }),
    prisma.adminUser.create({
      data: {
        email: 'moderador@sistemavida.mx',
        passwordHash,
        name: 'Moderador del Sistema',
        role: 'MODERATOR',
        permissions: [
          'metrics:read', 'users:read', 'audit:read',
          'institutions:read', 'health:read'
        ],
        isSuperAdmin: false,
        isActive: true,
      },
    }),
    prisma.adminUser.create({
      data: {
        email: 'viewer@sistemavida.mx',
        passwordHash,
        name: 'Visor de Metricas',
        role: 'VIEWER',
        permissions: ['metrics:read', 'health:read'],
        isSuperAdmin: false,
        isActive: true,
      },
    }),
    prisma.adminUser.create({
      data: {
        email: 'soporte@sistemavida.mx',
        passwordHash,
        name: 'Soporte Tecnico',
        role: 'SUPPORT',
        permissions: [
          'metrics:read', 'users:read', 'audit:read', 'health:read'
        ],
        isSuperAdmin: false,
        isActive: true,
      },
    }),
  ]);

  console.log(`   ✓ ${admins.length} administradores creados`);
  console.log('   📧 Credenciales: [email]@sistemavida.mx / Admin123!');

  // ==================== INSTITUCIONES MEDICAS ====================
  console.log('\n🏥 Creando instituciones medicas (datos reales)...');

  // Crear mapa para almacenar las relaciones hospital-aseguradora
  const hospitalInsuranceMap: { hospitalId: string; insuranceShortNames: string[] }[] = [];

  const institutions = await Promise.all(
    HOSPITALES_CDMX.map(async (h, i) => {
      const shortName = h.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const city = h.state === 'MEX' ? 'Naucalpan' : 'Ciudad de Mexico';

      const institution = await prisma.medicalInstitution.create({
        data: {
          name: h.name,
          type: h.type,
          cluesCode: `${h.state === 'MEX' ? 'MCSSA' : 'DFSSA'}0${String(i + 1).padStart(4, '0')}`,
          address: h.address,
          city,
          state: h.state,
          zipCode: h.state === 'MEX' ? '53100' : '06600',
          latitude: h.lat,
          longitude: h.lng,
          phone: h.phone,
          emergencyPhone: (h as any).emergencyPhone || h.phone,
          email: `urgencias@${shortName.slice(0, 20)}.mx`,
          attentionLevel: h.level,
          specialties: ['Urgencias', 'Medicina Interna', 'Cirugía General', 'Traumatología'],
          hasEmergency: true,
          has24Hours: true,
          hasICU: h.level === 'THIRD',
          hasTrauma: h.level !== 'FIRST',
          isActive: true,
          isVerified: true, // Todos verificados porque son datos reales
          verifiedAt: new Date(),
        },
      });

      // Guardar relación con aseguradoras para conectar después
      if (h.insurances && h.insurances.length > 0) {
        hospitalInsuranceMap.push({
          hospitalId: institution.id,
          insuranceShortNames: h.insurances,
        });
      }

      return institution;
    })
  );

  console.log(`   ✓ ${institutions.length} instituciones creadas (${HOSPITALES_CDMX.filter(h => h.state === 'CDMX').length} CDMX, ${HOSPITALES_CDMX.filter(h => h.state === 'MEX').length} Edo. Méx.)`);

  // ==================== ASEGURADORAS ====================
  // Datos oficiales de la CNSF (Comisión Nacional de Seguros y Fianzas)
  console.log('\n🛡️  Creando aseguradoras (datos oficiales CNSF)...');

  const ASEGURADORAS_CNSF = [
    // === RAMO DE SALUD (Gastos Médicos Mayores) ===
    { name: 'Plan Seguro, S.A. de C.V., Compañía de Seguros', shortName: 'Plan Seguro', type: 'HEALTH' as InsuranceType, coverageTypes: ['Gastos Médicos Mayores', 'Accidentes y Enfermedades'] },
    { name: 'Medi Access Seguros de Salud, S.A. de C.V.', shortName: 'Medi Access', type: 'HEALTH' as InsuranceType, coverageTypes: ['Gastos Médicos Mayores', 'Accidentes y Enfermedades'] },
    { name: 'BBVA Seguros Salud, S.A. de C.V.', shortName: 'BBVA Salud', type: 'HEALTH' as InsuranceType, coverageTypes: ['Gastos Médicos Mayores', 'Accidentes y Enfermedades'] },
    { name: 'AXA Salud, S.A. de C.V.', shortName: 'AXA Salud', type: 'HEALTH' as InsuranceType, coverageTypes: ['Gastos Médicos Mayores', 'Accidentes y Enfermedades'] },
    { name: 'General de Salud, Compañía de Seguros, S.A.', shortName: 'General Salud', type: 'HEALTH' as InsuranceType, coverageTypes: ['Gastos Médicos Mayores', 'Accidentes y Enfermedades'] },
    { name: 'Servicios Integrales de Salud Nova, S.A. de C.V.', shortName: 'Nova Salud', type: 'HEALTH' as InsuranceType, coverageTypes: ['Gastos Médicos Mayores', 'Accidentes y Enfermedades'] },
    { name: 'Seguros Centauro, Salud Especializada, S.A. de C.V.', shortName: 'Centauro', type: 'HEALTH' as InsuranceType, coverageTypes: ['Gastos Médicos Mayores', 'Accidentes y Enfermedades'] },
    { name: 'Dentegra Seguros Dentales, S.A.', shortName: 'Dentegra', type: 'HEALTH' as InsuranceType, coverageTypes: ['Seguros Dentales', 'Accidentes y Enfermedades'] },
    { name: 'Odontored Seguros Dentales, S.A. de C.V.', shortName: 'Odontored', type: 'HEALTH' as InsuranceType, coverageTypes: ['Seguros Dentales', 'Accidentes y Enfermedades'] },

    // === RAMO DE ACCIDENTES Y ENFERMEDADES + VIDA ===
    { name: 'Seguros Banorte, S.A de C.V., Grupo Financiero Banorte', shortName: 'Banorte', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Allianz México, S.A., Compañía de Seguros', shortName: 'Allianz', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Patrimonial Inbursa, S.A.', shortName: 'Inbursa', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Seguros El Potosí, S.A.', shortName: 'El Potosí', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'General de Seguros, S.A.B.', shortName: 'General', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Seguros Sura, S.A. de C.V.', shortName: 'Sura', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'La Latinoamericana Seguros, S.A.', shortName: 'Latinoamericana', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Seguros Ve por Más, S.A., Grupo Financiero Ve por Más', shortName: 'Ve por Más', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Zurich Santander Seguros México, S.A.', shortName: 'Zurich Santander', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Seguros Inbursa, S.A., Grupo Financiero Inbursa', shortName: 'Seguros Inbursa', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Seguros Atlas, S.A.', shortName: 'Atlas', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'HDI Seguros, S.A. de C.V.', shortName: 'HDI', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Metlife México, S.A.', shortName: 'Metlife', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'QBE de México Compañía de Seguros, S.A. de C.V.', shortName: 'QBE', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Seguros Monterrey New York Life, S.A. de C.V.', shortName: 'Monterrey NYL', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Chubb Seguros México, S.A.', shortName: 'Chubb', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Mapfre México, S.A.', shortName: 'Mapfre', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Grupo Nacional Provincial, S.A.B', shortName: 'GNP', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Principal Seguros, S.A. de C.V.', shortName: 'Principal', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'AXA Seguros, S.A. de C.V.', shortName: 'AXA', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Citibanamex Seguros, S.A. de C.V.', shortName: 'Citibanamex', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Metlife Más, S.A. de C.V.', shortName: 'Metlife Más', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'HSBC Seguros, S.A. de C.V., Grupo Financiero HSBC', shortName: 'HSBC', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Seguros BBVA Bancomer, S.A. de C.V.', shortName: 'BBVA', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Tokio Marine, Compañía de Seguros, S.A. de C.V.', shortName: 'Tokio Marine', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Zurich Vida, Compañía de Seguros, S.A.', shortName: 'Zurich Vida', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'HIR Compañía de Seguros, S.A. de C.V.', shortName: 'HIR', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Seguros Azteca, S.A. de C.V.', shortName: 'Azteca', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Cardif México Seguros de Vida, S.A. de C.V.', shortName: 'Cardif', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Aserta Seguros Vida, S.A. de C.V.', shortName: 'Aserta', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Pan-American México, Compañía de Seguros, S.A. de C.V.', shortName: 'Pan-American', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Thona Seguros, S.A. de C.V.', shortName: 'Thona', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Assurant Vida México, S.A.', shortName: 'Assurant', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },
    { name: 'Agroasemex, S.A.', shortName: 'Agroasemex', type: 'HEALTH_LIFE' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades', 'Vida'] },

    // === SOLO ACCIDENTES Y ENFERMEDADES ===
    { name: 'AIG Seguros México, S.A. de C.V.', shortName: 'AIG', type: 'ACCIDENT' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades'] },
    { name: 'Zurich, Compañía de Seguros, S.A.', shortName: 'Zurich', type: 'ACCIDENT' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades'] },
    { name: 'BUPA México, Compañía de Seguros, S.A. de C.V.', shortName: 'BUPA', type: 'ACCIDENT' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades'] },
    { name: 'Prevem Seguros, S.A. de C.V.', shortName: 'Prevem', type: 'ACCIDENT' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades'] },
    { name: 'Umbrella Compañía de Seguros, S.A. de C.V.', shortName: 'Umbrella', type: 'ACCIDENT' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades'] },
    { name: 'SPP Institución de Seguros, S.A. de C.V.', shortName: 'SPP', type: 'ACCIDENT' as InsuranceType, coverageTypes: ['Accidentes y Enfermedades'] },
  ];

  const insurances = await Promise.all(
    ASEGURADORAS_CNSF.map(async (aseg, i) => {
      // Generar datos de contacto simulados para cada aseguradora
      const shortCode = aseg.shortName?.toLowerCase().replace(/\s+/g, '') || 'seguro';

      const insurance = await prisma.insuranceCompany.create({
        data: {
          name: aseg.name,
          shortName: aseg.shortName,
          type: aseg.type,
          cnsfNumber: `CNSF-${String(i + 1).padStart(4, '0')}`,
          rfc: `${aseg.shortName?.slice(0, 3).toUpperCase() || 'SEG'}${900101 + i}XXX`,
          address: `Av. Insurgentes Sur ${1000 + i * 100}, Col. Del Valle`,
          city: 'Ciudad de Mexico',
          state: 'CDMX',
          zipCode: `03100`,
          phone: `55${String(50000000 + i * 111111).slice(0, 8)}`,
          emergencyPhone: `800${String(1000000 + i * 11111).slice(0, 7)}`,
          email: `contacto@${shortCode}.com.mx`,
          website: `https://www.${shortCode}.com.mx`,
          coverageTypes: aseg.coverageTypes,
          hasNationalCoverage: aseg.type === 'HEALTH_LIFE' || aseg.type === 'HEALTH',
          statesCovered: aseg.type === 'HEALTH_LIFE' || aseg.type === 'HEALTH'
            ? ESTADOS.map(e => e.code)
            : ESTADOS.slice(0, 5).map(e => e.code),
          description: `Aseguradora autorizada por la CNSF. Especializada en ${aseg.coverageTypes.join(', ')}.`,
          isVerified: Math.random() > 0.3,
          verifiedAt: Math.random() > 0.3 ? new Date() : null,
          isActive: true,
          networkSize: Math.floor(Math.random() * 200) + 50,
        },
      });

      // Crear 2-4 planes por aseguradora
      const numPlanes = Math.floor(Math.random() * 3) + 2;
      const planes = ['Básico', 'Plus', 'Premium', 'Platinum'];
      for (let j = 0; j < numPlanes; j++) {
        await prisma.insurancePlan.create({
          data: {
            insuranceId: insurance.id,
            name: `Plan ${planes[j]}`,
            code: `${aseg.shortName?.slice(0, 3).toUpperCase() || 'PLN'}-${planes[j].slice(0, 3).toUpperCase()}`,
            sumAssured: (j + 1) * 5000000,
            deductible: (4 - j) * 5000,
            coinsurance: 10 - j * 2,
            features: [
              'Hospitalización',
              j > 0 ? 'Maternidad' : null,
              j > 1 ? 'Cobertura internacional' : null,
              j > 2 ? 'Segunda opinión médica' : null,
            ].filter(Boolean) as string[],
            exclusions: ['Enfermedades preexistentes (primeros 2 años)', 'Cirugía estética'],
            hospitalLevel: j < 2 ? 'Red Amplia' : 'Red Selecta',
            isActive: true,
          },
        });
      }

      return insurance;
    })
  );

  // ==================== CONECTAR HOSPITALES CON ASEGURADORAS ====================
  console.log('\n🔗 Conectando hospitales con aseguradoras (según convenios reales)...');

  let conexionesCreadas = 0;
  for (const mapping of hospitalInsuranceMap) {
    for (const shortName of mapping.insuranceShortNames) {
      // Buscar la aseguradora por shortName
      const insurance = insurances.find(ins =>
        ins.shortName?.toLowerCase() === shortName.toLowerCase() ||
        ins.shortName?.toLowerCase().includes(shortName.toLowerCase()) ||
        shortName.toLowerCase().includes(ins.shortName?.toLowerCase() || '')
      );

      if (insurance) {
        try {
          await prisma.insuranceCompany.update({
            where: { id: insurance.id },
            data: {
              networkHospitals: {
                connect: { id: mapping.hospitalId },
              },
            },
          });
          conexionesCreadas++;
        } catch (e) {
          // Ignorar si ya existe la conexión
        }
      }
    }
  }

  console.log(`   ✓ ${insurances.length} aseguradoras creadas`);
  console.log(`   ✓ ${conexionesCreadas} conexiones hospital-aseguradora establecidas`);

  // ==================== USUARIOS DE PRUEBA ====================
  console.log('\n👤 Creando usuarios de prueba...');

  const userPasswordHash = await bcrypt.hash('Demo123!', 12);
  const users = [];

  for (let i = 0; i < 50; i++) {
    const esHombre = Math.random() > 0.5;
    const nombre = esHombre ? randomElement(NOMBRES_HOMBRES) : randomElement(NOMBRES_MUJERES);
    const apellidoP = randomElement(APELLIDOS);
    const apellidoM = randomElement(APELLIDOS);
    const fullName = `${nombre} ${apellidoP} ${apellidoM}`;
    const sexo = esHombre ? 'H' : 'M';
    const fechaNac = randomDate(new Date('1950-01-01'), new Date('2000-12-31'));
    const curp = generateCURP(nombre, apellidoP, sexo as 'H' | 'M', fechaNac);
    const createdAt = randomDate(new Date('2024-01-01'), new Date());

    const user = await prisma.user.create({
      data: {
        email: `${nombre.toLowerCase()}.${apellidoP.toLowerCase()}${i}@ejemplo.mx`,
        passwordHash: userPasswordHash,
        curp,
        name: fullName,
        dateOfBirth: fechaNac,
        sex: sexo,
        phone: generatePhone(),
        address: `Calle ${randomElement(APELLIDOS)} ${Math.floor(Math.random() * 500)}, ${randomElement(ESTADOS).name}`,
        isActive: Math.random() > 0.1,
        isVerified: Math.random() > 0.3,
        createdAt,
        lastLoginAt: Math.random() > 0.5 ? randomDate(createdAt, new Date()) : null,
      },
    });

    users.push(user);

    // Crear perfil (70% de usuarios)
    if (Math.random() > 0.3) {
      // Usar aseguradoras reales del sistema
      const tieneSeguro = Math.random() > 0.3;
      const aseguradoraAleatoria = tieneSeguro ? randomElement(insurances) : null;

      await prisma.patientProfile.create({
        data: {
          userId: user.id,
          bloodType: randomElement(TIPOS_SANGRE),
          allergiesEnc: encryptJSON(randomElements(ALERGIAS, 0, 3)),
          conditionsEnc: encryptJSON(randomElements(CONDICIONES, 0, 2)),
          medicationsEnc: encryptJSON(randomElements(MEDICAMENTOS, 0, 3)),
          insuranceProvider: aseguradoraAleatoria?.shortName || null,
          insurancePolicy: tieneSeguro ? `POL-${Math.floor(100000 + Math.random() * 900000)}` : null,
          insurancePhone: aseguradoraAleatoria ? `800${String(1000000 + Math.floor(Math.random() * 9000000)).slice(0, 7)}` : null,
          isDonor: Math.random() > 0.6,
        },
      });
    }

    // Crear representantes (60% de usuarios)
    if (Math.random() > 0.4) {
      const numReps = Math.floor(Math.random() * 3) + 1;
      for (let r = 0; r < numReps; r++) {
        const repEsHombre = Math.random() > 0.5;
        const repNombre = repEsHombre ? randomElement(NOMBRES_HOMBRES) : randomElement(NOMBRES_MUJERES);
        const repApellido = randomElement(APELLIDOS);

        await prisma.representative.create({
          data: {
            userId: user.id,
            name: `${repNombre} ${repApellido}`,
            phone: generatePhone(),
            email: Math.random() > 0.5 ? `${repNombre.toLowerCase()}.${repApellido.toLowerCase()}@ejemplo.mx` : null,
            relation: randomElement(RELACIONES),
            priority: r + 1,
            isDonorSpokesperson: r === 0 && Math.random() > 0.7,
            notifyOnEmergency: true,
            notifyOnAccess: Math.random() > 0.3,
          },
        });
      }
    }

    // Crear directiva (40% de usuarios)
    if (Math.random() > 0.6) {
      const estado = randomElement(ESTADOS);
      await prisma.advanceDirective.create({
        data: {
          userId: user.id,
          type: randomElement(['NOTARIZED_DOCUMENT', 'DIGITAL_DRAFT', 'DIGITAL_WITNESSED'] as DirectiveType[]),
          status: randomElement(['DRAFT', 'PENDING_VALIDATION', 'ACTIVE'] as DirectiveStatus[]),
          acceptsCPR: Math.random() > 0.5,
          acceptsIntubation: Math.random() > 0.5,
          acceptsDialysis: Math.random() > 0.5,
          acceptsTransfusion: Math.random() > 0.7,
          acceptsArtificialNutrition: Math.random() > 0.5,
          palliativeCareOnly: Math.random() > 0.7,
          originState: estado.code,
          nom151Sealed: Math.random() > 0.8,
          nom151Timestamp: Math.random() > 0.8 ? new Date() : null,
          createdAt: randomDate(createdAt, new Date()),
        },
      });
    }
  }

  console.log(`   ✓ ${users.length} usuarios creados`);
  console.log('   📧 Credenciales: [email] / Demo123!');

  // ==================== ACCESOS DE EMERGENCIA ====================
  console.log('\n🚨 Creando accesos de emergencia...');

  const emergencyAccesses = [];
  for (let i = 0; i < 30; i++) {
    const patient = randomElement(users);
    const institution = randomElement(institutions);
    const accessDate = randomDate(new Date('2024-06-01'), new Date());

    const access = await prisma.emergencyAccess.create({
      data: {
        patientId: patient.id,
        accessorName: `${randomElement(NOMBRES_HOMBRES)} ${randomElement(APELLIDOS)}`,
        accessorRole: randomElement(['Medico Urgencias', 'Paramedico', 'Enfermera', 'Tecnico Emergencias']),
        accessorLicense: `CED-${Math.floor(1000000 + Math.random() * 9000000)}`,
        institutionId: institution.id,
        institutionName: institution.name,
        qrTokenUsed: `qr-${patient.id.slice(0, 8)}`,
        ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        latitude: institution.latitude! + (Math.random() - 0.5) * 0.01,
        longitude: institution.longitude! + (Math.random() - 0.5) * 0.01,
        locationName: institution.name,
        dataAccessed: randomElements(['profile', 'allergies', 'conditions', 'medications', 'directives', 'representatives'], 2, 5),
        accessedAt: accessDate,
        expiresAt: new Date(accessDate.getTime() + 60 * 60 * 1000),
      },
    });
    emergencyAccesses.push(access);
  }

  console.log(`   ✓ ${emergencyAccesses.length} accesos de emergencia creados`);

  // ==================== ALERTAS DE PANICO ====================
  console.log('\n🆘 Creando alertas de panico...');

  const panicAlerts = [];
  for (let i = 0; i < 20; i++) {
    const user = randomElement(users);
    const createdAt = randomDate(new Date('2024-06-01'), new Date());
    const status = randomElement(['ACTIVE', 'CANCELLED', 'RESOLVED', 'EXPIRED'] as PanicStatus[]);

    const alert = await prisma.panicAlert.create({
      data: {
        userId: user.id,
        latitude: 19.4326 + (Math.random() - 0.5) * 0.1,
        longitude: -99.1332 + (Math.random() - 0.5) * 0.1,
        accuracy: Math.random() * 50 + 10,
        locationName: `${randomElement(['Av.', 'Calle', 'Blvd.'])} ${randomElement(APELLIDOS)}, ${randomElement(ESTADOS).name}`,
        status,
        message: Math.random() > 0.7 ? 'Necesito ayuda urgente' : null,
        createdAt,
        cancelledAt: status === 'CANCELLED' ? randomDate(createdAt, new Date()) : null,
        resolvedAt: status === 'RESOLVED' ? randomDate(createdAt, new Date()) : null,
        nearbyHospitals: institutions.slice(0, 3).map(h => ({
          id: h.id,
          name: h.name,
          distance: Math.random() * 5,
        })),
      },
    });
    panicAlerts.push(alert);
  }

  console.log(`   ✓ ${panicAlerts.length} alertas de panico creadas`);

  // ==================== LOGS DE AUDITORIA ====================
  console.log('\n📋 Creando logs de auditoria...');

  for (let i = 0; i < 150; i++) {
    const user = randomElement(users);
    const action = randomElement(ACCIONES_AUDIT);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actorType: 'USER',
        actorId: user.id,
        actorName: user.name,
        action,
        resource: action.includes('PROFILE') ? 'profiles' :
                  action.includes('DIRECTIVE') ? 'directives' :
                  action.includes('REPRESENTATIVE') ? 'representatives' :
                  action.includes('QR') ? 'emergency' :
                  action.includes('PANIC') ? 'panic_alerts' :
                  'auth',
        ipAddress: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        createdAt: randomDate(new Date('2024-01-01'), new Date()),
      },
    });
  }

  // Logs de admin
  const adminActions = ['LOGIN_SUCCESS', 'VIEW_USERS', 'VIEW_METRICS', 'EXPORT_AUDIT', 'VIEW_HEALTH'];
  for (let i = 0; i < 50; i++) {
    const admin = randomElement(admins);

    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: randomElement(adminActions),
        resource: randomElement(['users', 'metrics', 'audit_logs', 'system']),
        ipAddress: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        createdAt: randomDate(new Date('2024-06-01'), new Date()),
      },
    });
  }

  console.log('   ✓ 150 logs de usuario + 50 logs de admin creados');

  // ==================== RESUMEN ====================
  console.log('\n' + '='.repeat(60));
  console.log('✅ SEED COMPLETADO EXITOSAMENTE');
  console.log('='.repeat(60));
  console.log('\n📊 Resumen de datos creados:');
  console.log(`   • ${admins.length} Administradores`);
  console.log(`   • ${institutions.length} Instituciones medicas`);
  console.log(`   • ${insurances.length} Aseguradoras (datos CNSF)`);
  console.log(`   • ${users.length} Usuarios de prueba`);
  console.log(`   • ${emergencyAccesses.length} Accesos de emergencia`);
  console.log(`   • ${panicAlerts.length} Alertas de panico`);
  console.log('   • 200 Logs de auditoria');

  console.log('\n🔑 Credenciales de Admin:');
  console.log('   ┌────────────────────────────────────────────────────┐');
  console.log('   │ superadmin@sistemavida.mx  │ Admin123! │ SUPER_ADMIN │');
  console.log('   │ admin@sistemavida.mx       │ Admin123! │ ADMIN       │');
  console.log('   │ moderador@sistemavida.mx   │ Admin123! │ MODERATOR   │');
  console.log('   │ viewer@sistemavida.mx      │ Admin123! │ VIEWER      │');
  console.log('   │ soporte@sistemavida.mx     │ Admin123! │ SUPPORT     │');
  console.log('   └────────────────────────────────────────────────────┘');

  console.log('\n🔑 Usuario de prueba:');
  console.log('   Email: [cualquier email de usuario] / Demo123!');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
