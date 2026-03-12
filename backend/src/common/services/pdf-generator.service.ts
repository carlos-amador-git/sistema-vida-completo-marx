// src/common/services/pdf-generator.service.ts
import * as puppeteer from 'puppeteer';
import * as QRCode from 'qrcode';
import config from '../../config';
import { logger } from './logger.service';

interface MedicalProfileData {
  // Datos del usuario
  user: {
    name: string;
    email: string;
    phone?: string;
    curp?: string;
    birthDate?: Date;
  };
  // Perfil médico
  profile: {
    bloodType?: string;
    photoUrl?: string;
    qrToken: string;
    // Datos descifrados
    allergies?: Array<{
      name: string;
      severity: string;
      reaction?: string;
    }>;
    conditions?: Array<{
      name: string;
      diagnosedDate?: string;
      notes?: string;
    }>;
    medications?: Array<{
      name: string;
      dose?: string;
      frequency?: string;
    }>;
    // Seguro
    insuranceProvider?: string;
    insurancePolicy?: string;
    insurancePhone?: string;
    // Donación
    isDonor?: boolean;
    donorPreferences?: {
      organs?: string[];
      tissues?: string[];
      forResearch?: boolean;
      restrictions?: string;
    };
  };
  // Representantes/Contactos de emergencia
  representatives?: Array<{
    name: string;
    relationship: string;
    phone: string;
    email?: string;
    isPrimary: boolean;
  }>;
}

function escapeHtml(str: unknown): string {
  if (!str) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class PDFGeneratorService {
  private browser: puppeteer.Browser | null = null;

  private async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      try {
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
        
        logger.info('Iniciando navegador Puppeteer', { 
          executablePath: executablePath || 'bundled',
          env: process.env.NODE_ENV 
        });

        this.browser = await puppeteer.launch({
          headless: true,
          executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
      } catch (error) {
        logger.error('Error al iniciar Puppeteer', error);
        throw error;
      }
    }
    return this.browser;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async generateMedicalProfilePDF(data: MedicalProfileData): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Generar QR code como data URL
      const qrDataUrl = await this.generateQRDataUrl(data.profile.qrToken);

      // Generar HTML
      const html = this.generateMedicalProfileHTML(data, qrDataUrl);

      // Cargar HTML en la página
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generar PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      });

      logger.info('PDF del perfil médico generado exitosamente');
      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }

  private async generateQRDataUrl(qrToken: string): Promise<string> {
    const emergencyUrl = `${config.frontendUrl}/emergency/${qrToken}`;
    return await QRCode.toDataURL(emergencyUrl, {
      width: 150,
      margin: 1,
      color: {
        dark: '#1e3a5f',
        light: '#ffffff',
      },
    });
  }

  private formatDate(date?: Date | string): string {
    if (!date) return 'No especificada';
    const d = new Date(date);
    return d.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private calculateAge(birthDate?: Date | string): string {
    if (!birthDate) return '';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return `${age} años`;
  }

  private getSeverityColor(severity: string): string {
    switch (severity?.toLowerCase()) {
      case 'alta':
      case 'high':
      case 'severe':
        return '#dc2626';
      case 'media':
      case 'medium':
      case 'moderate':
        return '#f59e0b';
      default:
        return '#22c55e';
    }
  }

  private generateMedicalProfileHTML(data: MedicalProfileData, qrDataUrl: string): string {
    const { user, profile, representatives } = data;
    const generatedDate = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Perfil Médico - ${escapeHtml(user.name)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #1f2937;
      background: #ffffff;
      line-height: 1.5;
      font-size: 11px;
    }

    .container {
      max-width: 100%;
      padding: 0;
    }

    /* Header */
    .header {
      background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .logo {
      width: 50px;
      height: 50px;
      background: white;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 24px;
      color: #0369a1;
    }

    .header-title h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 2px;
    }

    .header-title p {
      font-size: 11px;
      opacity: 0.9;
    }

    .qr-section {
      text-align: center;
      background: white;
      padding: 10px;
      border-radius: 10px;
    }

    .qr-section img {
      width: 100px;
      height: 100px;
    }

    .qr-section p {
      color: #0369a1;
      font-size: 8px;
      font-weight: 600;
      margin-top: 5px;
    }

    /* Sections */
    .section {
      background: #f8fafc;
      border-radius: 10px;
      padding: 15px;
      margin-bottom: 15px;
      border: 1px solid #e2e8f0;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #0ea5e9;
    }

    .section-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
    }

    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #0369a1;
    }

    /* Grid layouts */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .info-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .info-item {
      background: white;
      padding: 10px;
      border-radius: 8px;
      border-left: 3px solid #0ea5e9;
    }

    .info-label {
      font-size: 9px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }

    .info-value {
      font-size: 12px;
      font-weight: 600;
      color: #1e293b;
    }

    .info-value.highlight {
      color: #dc2626;
      font-size: 14px;
    }

    /* Blood type special */
    .blood-type {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      color: white;
      padding: 15px;
      border-radius: 10px;
      text-align: center;
      border-left: none;
    }

    .blood-type .info-label {
      color: rgba(255,255,255,0.8);
    }

    .blood-type .info-value {
      color: white;
      font-size: 28px;
      font-weight: 800;
    }

    /* Alerts/Lists */
    .alert-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .alert-item {
      background: white;
      padding: 10px 12px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-left: 4px solid;
    }

    .alert-item.allergy {
      border-color: #dc2626;
      background: #fef2f2;
    }

    .alert-item.condition {
      border-color: #f59e0b;
      background: #fffbeb;
    }

    .alert-item.medication {
      border-color: #22c55e;
      background: #f0fdf4;
    }

    .alert-badge {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-high {
      background: #dc2626;
      color: white;
    }

    .badge-medium {
      background: #f59e0b;
      color: white;
    }

    .badge-low {
      background: #22c55e;
      color: white;
    }

    .alert-content {
      flex: 1;
    }

    .alert-name {
      font-weight: 600;
      font-size: 11px;
      color: #1e293b;
    }

    .alert-detail {
      font-size: 9px;
      color: #64748b;
      margin-top: 2px;
    }

    /* Donor section */
    .donor-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 15px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 12px;
    }

    .donor-yes {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
    }

    .donor-no {
      background: #f1f5f9;
      color: #64748b;
    }

    .donor-preferences {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .donor-pref-item {
      background: white;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .donor-pref-label {
      font-size: 9px;
      color: #64748b;
      margin-bottom: 5px;
    }

    .donor-pref-list {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .donor-pref-tag {
      background: #dbeafe;
      color: #1e40af;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 500;
    }

    /* Contacts */
    .contact-card {
      background: white;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .contact-avatar {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 16px;
    }

    .contact-info {
      flex: 1;
    }

    .contact-name {
      font-weight: 600;
      font-size: 12px;
      color: #1e293b;
    }

    .contact-relation {
      font-size: 9px;
      color: #64748b;
    }

    .contact-details {
      font-size: 10px;
      color: #475569;
      margin-top: 3px;
    }

    .primary-badge {
      background: #fef3c7;
      color: #92400e;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 8px;
      font-weight: 600;
    }

    /* Insurance */
    .insurance-card {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      color: white;
      padding: 15px;
      border-radius: 10px;
    }

    .insurance-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .insurance-provider {
      font-size: 16px;
      font-weight: 700;
    }

    .insurance-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .insurance-item .info-label {
      color: rgba(255,255,255,0.7);
    }

    .insurance-item .info-value {
      color: white;
    }

    /* Footer */
    .footer {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #64748b;
      font-size: 9px;
    }

    .footer-logo {
      font-weight: 700;
      color: #0369a1;
      font-size: 12px;
      margin-bottom: 5px;
    }

    .emergency-notice {
      background: #fef2f2;
      border: 2px solid #dc2626;
      border-radius: 10px;
      padding: 12px;
      text-align: center;
      margin-bottom: 15px;
    }

    .emergency-notice h3 {
      color: #dc2626;
      font-size: 12px;
      margin-bottom: 5px;
    }

    .emergency-notice p {
      color: #991b1b;
      font-size: 10px;
    }

    .no-data {
      color: #94a3b8;
      font-style: italic;
      font-size: 10px;
    }

    /* Two column layout for page */
    .two-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <div class="logo">V</div>
        <div class="header-title">
          <h1>Perfil Médico</h1>
          <p>Sistema VIDA - Información de Emergencia</p>
        </div>
      </div>
      <div class="qr-section">
        <img src="${qrDataUrl}" alt="QR de Emergencia">
        <p>ESCANEAR EN<br>EMERGENCIA</p>
      </div>
    </div>

    <!-- Emergency Notice -->
    <div class="emergency-notice">
      <h3>DOCUMENTO DE INFORMACIÓN MÉDICA DE EMERGENCIA</h3>
      <p>Este documento contiene información médica vital. En caso de emergencia, escanee el código QR o visite: ${escapeHtml(config.frontendUrl)}/emergency/${escapeHtml(profile.qrToken)}</p>
    </div>

    <!-- Personal Info + Blood Type -->
    <div class="section">
      <div class="section-header">
        <div class="section-icon">👤</div>
        <span class="section-title">Información Personal</span>
      </div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Nombre Completo</div>
          <div class="info-value">${escapeHtml(user.name)}</div>
        </div>
        <div class="info-item blood-type">
          <div class="info-label">Tipo de Sangre</div>
          <div class="info-value">${escapeHtml(profile.bloodType || 'No especificado')}</div>
        </div>
        <div class="info-item">
          <div class="info-label">CURP</div>
          <div class="info-value">${escapeHtml(user.curp || 'No especificado')}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Fecha de Nacimiento</div>
          <div class="info-value">${escapeHtml(this.formatDate(user.birthDate))} ${user.birthDate ? `(${escapeHtml(this.calculateAge(user.birthDate))})` : ''}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Teléfono</div>
          <div class="info-value">${escapeHtml(user.phone || 'No especificado')}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Correo Electrónico</div>
          <div class="info-value">${escapeHtml(user.email)}</div>
        </div>
      </div>
    </div>

    <div class="two-columns">
      <!-- Allergies -->
      <div class="section">
        <div class="section-header">
          <div class="section-icon">⚠️</div>
          <span class="section-title">Alergias</span>
        </div>
        <div class="alert-list">
          ${profile.allergies && profile.allergies.length > 0
            ? profile.allergies.map(allergy => {
                const name = typeof allergy === 'string' ? allergy : allergy.name;
                const severity = typeof allergy === 'string' ? 'Media' : (allergy.severity || 'Media');
                const reaction = typeof allergy === 'string' ? null : allergy.reaction;
                return `
              <div class="alert-item allergy">
                <span class="alert-badge ${severity?.toLowerCase() === 'alta' || severity?.toLowerCase() === 'high' ? 'badge-high' : severity?.toLowerCase() === 'media' || severity?.toLowerCase() === 'medium' ? 'badge-medium' : 'badge-low'}">${escapeHtml(severity)}</span>
                <div class="alert-content">
                  <div class="alert-name">${escapeHtml(name)}</div>
                  ${reaction ? `<div class="alert-detail">Reacción: ${escapeHtml(reaction)}</div>` : ''}
                </div>
              </div>
            `;}).join('')
            : '<p class="no-data">No se han registrado alergias</p>'
          }
        </div>
      </div>

      <!-- Conditions -->
      <div class="section">
        <div class="section-header">
          <div class="section-icon">🏥</div>
          <span class="section-title">Condiciones Médicas</span>
        </div>
        <div class="alert-list">
          ${profile.conditions && profile.conditions.length > 0
            ? profile.conditions.map(condition => {
                const name = typeof condition === 'string' ? condition : condition.name;
                const diagnosedDate = typeof condition === 'string' ? null : condition.diagnosedDate;
                const notes = typeof condition === 'string' ? null : condition.notes;
                return `
              <div class="alert-item condition">
                <div class="alert-content">
                  <div class="alert-name">${escapeHtml(name)}</div>
                  ${diagnosedDate ? `<div class="alert-detail">Diagnosticado: ${escapeHtml(diagnosedDate)}</div>` : ''}
                  ${notes ? `<div class="alert-detail">${escapeHtml(notes)}</div>` : ''}
                </div>
              </div>
            `;}).join('')
            : '<p class="no-data">No se han registrado condiciones médicas</p>'
          }
        </div>
      </div>
    </div>

    <!-- Medications -->
    <div class="section">
      <div class="section-header">
        <div class="section-icon">💊</div>
        <span class="section-title">Medicamentos Actuales</span>
      </div>
      <div class="alert-list">
        ${profile.medications && profile.medications.length > 0
          ? profile.medications.map(med => {
              const name = typeof med === 'string' ? med : med.name;
              const dose = typeof med === 'string' ? '' : (med.dose || '');
              const frequency = typeof med === 'string' ? '' : (med.frequency || '');
              return `
            <div class="alert-item medication">
              <div class="alert-content">
                <div class="alert-name">${escapeHtml(name)}</div>
                ${dose || frequency ? `<div class="alert-detail">${escapeHtml(dose)} ${frequency ? `- ${escapeHtml(frequency)}` : ''}</div>` : ''}
              </div>
            </div>
          `;}).join('')
          : '<p class="no-data">No se han registrado medicamentos</p>'
        }
      </div>
    </div>

    <div class="two-columns">
      <!-- Insurance -->
      <div class="section">
        <div class="section-header">
          <div class="section-icon">🛡️</div>
          <span class="section-title">Seguro Médico</span>
        </div>
        ${profile.insuranceProvider
          ? `
            <div class="insurance-card">
              <div class="insurance-header">
                <span class="insurance-provider">${escapeHtml(profile.insuranceProvider)}</span>
              </div>
              <div class="insurance-grid">
                <div class="insurance-item">
                  <div class="info-label">No. de Póliza</div>
                  <div class="info-value">${escapeHtml(profile.insurancePolicy || 'No especificado')}</div>
                </div>
                <div class="insurance-item">
                  <div class="info-label">Teléfono de Emergencia</div>
                  <div class="info-value">${escapeHtml(profile.insurancePhone || 'No especificado')}</div>
                </div>
              </div>
            </div>
          `
          : '<p class="no-data">No se ha registrado información de seguro médico</p>'
        }
      </div>

      <!-- Donor -->
      <div class="section">
        <div class="section-header">
          <div class="section-icon">❤️</div>
          <span class="section-title">Donación de Órganos</span>
        </div>
        <div class="donor-badge ${profile.isDonor ? 'donor-yes' : 'donor-no'}">
          ${profile.isDonor ? '✓ SOY DONADOR DE ÓRGANOS' : '✗ No es donador registrado'}
        </div>
        ${profile.isDonor && profile.donorPreferences ? `
          <div class="donor-preferences">
            ${profile.donorPreferences.organs && profile.donorPreferences.organs.length > 0 ? `
              <div class="donor-pref-item">
                <div class="donor-pref-label">Órganos</div>
                <div class="donor-pref-list">
                  ${profile.donorPreferences.organs.map(org => `<span class="donor-pref-tag">${escapeHtml(org)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
            ${profile.donorPreferences.tissues && profile.donorPreferences.tissues.length > 0 ? `
              <div class="donor-pref-item">
                <div class="donor-pref-label">Tejidos</div>
                <div class="donor-pref-list">
                  ${profile.donorPreferences.tissues.map(tis => `<span class="donor-pref-tag">${escapeHtml(tis)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
          </div>
          ${profile.donorPreferences.restrictions ? `
            <div style="margin-top: 10px; background: #fef3c7; padding: 8px; border-radius: 6px; font-size: 9px;">
              <strong>Restricciones:</strong> ${escapeHtml(profile.donorPreferences.restrictions)}
            </div>
          ` : ''}
        ` : ''}
      </div>
    </div>

    <!-- Emergency Contacts -->
    <div class="section">
      <div class="section-header">
        <div class="section-icon">📞</div>
        <span class="section-title">Contactos de Emergencia</span>
      </div>
      <div class="info-grid">
        ${representatives && representatives.length > 0
          ? representatives.map(rep => `
            <div class="contact-card">
              <div class="contact-avatar">${escapeHtml(rep.name.charAt(0).toUpperCase())}</div>
              <div class="contact-info">
                <div class="contact-name">
                  ${escapeHtml(rep.name)}
                  ${rep.isPrimary ? '<span class="primary-badge">PRINCIPAL</span>' : ''}
                </div>
                <div class="contact-relation">${escapeHtml(rep.relationship)}</div>
                <div class="contact-details">
                  📱 ${escapeHtml(rep.phone)}
                  ${rep.email ? `<br>✉️ ${escapeHtml(rep.email)}` : ''}
                </div>
              </div>
            </div>
          `).join('')
          : '<p class="no-data">No se han registrado contactos de emergencia</p>'
        }
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="footer-logo">Sistema VIDA</div>
      <p>Vinculación de Información para Decisiones y Alertas Médicas</p>
      <p style="margin-top: 5px;">Documento generado el ${generatedDate}</p>
      <p style="margin-top: 3px; color: #94a3b8;">Este documento es confidencial y contiene información médica protegida.</p>
    </div>
  </div>
</body>
</html>
    `;
  }
}

export const pdfGeneratorService = new PDFGeneratorService();
