// src/components/pages/PrivacyNotice.tsx
// Aviso de Privacidad Integral — LFPDPPP 2025
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Printer,
  Database,
  Target,
  Share2,
  Key,
  CheckCircle,
  XCircle,
  Cookie,
  RefreshCw,
  AlertTriangle,
  Clock,
  Lock,
  Info,
} from 'lucide-react';
import { legalApi, PrivacyNotice as PrivacyNoticeData } from '../../services/legalApi';

// ─── Static fallback (mirrors the structured data) ───────────────────────────
// Used when the API is unreachable at render time.
import { privacyNotice as staticNotice } from '../../data/privacyNoticeStatic';

// ─── Section collapse component ──────────────────────────────────────────────

interface CollapsibleSectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  badgeColor?: string;
}

function CollapsibleSection({
  id,
  title,
  icon,
  children,
  defaultOpen = false,
  badge,
  badgeColor = 'bg-vida-100 text-vida-700',
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      id={id}
      className="border border-gray-200 rounded-xl overflow-hidden shadow-sm"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-5 bg-white hover:bg-gray-50 transition-colors text-left"
        aria-expanded={open}
        aria-controls={`${id}-content`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-vida-50 text-vida-600">
            {icon}
          </span>
          <span className="font-semibold text-gray-900 text-sm sm:text-base">{title}</span>
          {badge && (
            <span className={`hidden sm:inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        <span className="flex-shrink-0 text-gray-400">
          {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </span>
      </button>

      {open && (
        <div
          id={`${id}-content`}
          className="p-5 bg-white border-t border-gray-100 space-y-4 text-sm text-gray-700 leading-relaxed"
        >
          {children}
        </div>
      )}
    </section>
  );
}

// ─── Tab selector ─────────────────────────────────────────────────────────────

interface TabProps {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}

function TabSelector({ tabs, active, onChange }: TabProps) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-full sm:w-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            active === tab.id
              ? 'bg-white text-vida-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Full notice view ─────────────────────────────────────────────────────────

function FullNotice({ notice }: { notice: PrivacyNoticeData }) {
  const { sections, responsibleParty } = notice;

  return (
    <div className="space-y-3">
      {/* Header info card */}
      <div className="bg-vida-50 border border-vida-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-vida-900">{responsibleParty.name}</h2>
            <p className="text-sm text-vida-700 mt-0.5">{responsibleParty.address}</p>
            <a
              href={`mailto:${responsibleParty.email}`}
              className="text-sm text-vida-600 hover:text-vida-800 font-medium"
            >
              {responsibleParty.email}
            </a>
          </div>
          <div className="text-right text-xs text-vida-600 shrink-0">
            <div>Versión {notice.version}</div>
            <div>Vigente desde {new Date(notice.effectiveDate).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div>Actualizado el {new Date(notice.lastUpdated).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-vida-700 border-t border-vida-200 pt-3">
          Conforme a la <strong>Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</strong>, su Reglamento y los Lineamientos del INAI.
        </p>
      </div>

      {/* I. Datos Personales Recabados */}
      <CollapsibleSection
        id="datos"
        title="I. Datos Personales Recabados"
        icon={<Database className="w-4 h-4" />}
        defaultOpen={true}
        badge="Art. 16 II"
      >
        <p className="text-gray-600">Para las finalidades descritas en este aviso, recabamos las siguientes categorías de datos personales:</p>
        <div className="space-y-4 mt-3">
          {sections.dataCollected.map((cat) => (
            <div
              key={cat.category}
              className={`rounded-lg p-4 border ${
                cat.sensitive
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {cat.sensitive && (
                  <span className="text-xs font-semibold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
                    Datos Sensibles
                  </span>
                )}
                <span className="font-semibold text-gray-800 text-sm">{cat.category}</span>
              </div>
              <ul className="space-y-1 pl-4">
                {cat.items.map((item) => (
                  <li key={item} className="text-gray-600 text-sm list-disc list-outside">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-amber-800 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Los datos de salud son <strong>datos sensibles</strong> conforme al Art. 3 fracc. VI LFPDPPP. Su tratamiento requiere su consentimiento expreso y por escrito (Art. 9 LFPDPPP).</span>
        </div>
      </CollapsibleSection>

      {/* II. Finalidades */}
      <CollapsibleSection
        id="finalidades"
        title="II. Finalidades del Tratamiento"
        icon={<Target className="w-4 h-4" />}
        badge="Art. 16 III"
      >
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Finalidades Primarias — necesarias para el servicio
            </h3>
            <div className="space-y-2">
              {sections.purposes.filter(p => p.required).map((p) => (
                <div key={p.id} className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                  <p className="font-medium text-gray-800 text-sm">{p.title}</p>
                  <p className="text-gray-600 text-xs mt-1">{p.description}</p>
                  <p className="text-vida-600 text-xs mt-1 font-medium">Base jurídica: {p.legalBasis}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-gray-400" />
              Finalidades Secundarias — puede oponerse
            </h3>
            <div className="space-y-2">
              {sections.purposes.filter(p => !p.required).map((p) => (
                <div key={p.id} className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                  <p className="font-medium text-gray-800 text-sm">{p.title}</p>
                  <p className="text-gray-600 text-xs mt-1">{p.description}</p>
                  <p className="text-vida-600 text-xs mt-1 font-medium">Base jurídica: {p.legalBasis}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Para oponerse a las finalidades secundarias, diríjase a <strong>Mi Perfil → Privacidad y Consentimiento</strong>.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* III. Transferencias */}
      <CollapsibleSection
        id="transferencias"
        title="III. Transferencias de Datos"
        icon={<Share2 className="w-4 h-4" />}
        badge="Art. 36-37"
      >
        <p className="text-gray-600 mb-3">Sus datos personales pueden ser transferidos a los siguientes destinatarios:</p>
        <div className="space-y-3">
          {sections.transfers.map((t, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-4 bg-gray-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="font-semibold text-gray-800 text-sm">{t.recipient}</p>
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full shrink-0">{t.country}</span>
              </div>
              <p className="text-gray-600 text-xs mb-1">{t.purpose}</p>
              <p className="text-vida-600 text-xs font-medium">Base jurídica: {t.legalBasis}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* IV. Derechos ARCO */}
      <CollapsibleSection
        id="arco"
        title="IV. Derechos ARCO"
        icon={<Key className="w-4 h-4" />}
        badge="Art. 28-35"
        defaultOpen={true}
      >
        <p className="text-gray-700">{sections.arcoRights.description}</p>

        <div className="rounded-lg bg-vida-50 border border-vida-200 p-4 mt-3">
          <h4 className="font-semibold text-vida-800 mb-2 text-sm">Cómo ejercer sus derechos</h4>
          <ol className="space-y-1 pl-4">
            {sections.arcoRights.procedure.map((step, i) => (
              <li key={i} className="text-vida-700 text-sm list-decimal list-outside">{step}</li>
            ))}
          </ol>
        </div>

        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Contacto</p>
            <a href={`mailto:${sections.arcoRights.contactEmail}`} className="text-vida-600 text-sm font-medium hover:underline">
              {sections.arcoRights.contactEmail}
            </a>
            <p className="text-xs text-gray-500 mt-0.5">{sections.arcoRights.contactAddress}</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Plazo de respuesta</p>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-vida-600" />
              <span className="text-sm font-medium text-gray-800">{sections.arcoRights.responseDeadlineDays} días hábiles</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Conforme al Art. 32 LFPDPPP</p>
          </div>
        </div>

        <div className="mt-3">
          <h4 className="font-semibold text-gray-700 text-sm mb-2">Información requerida en su solicitud</h4>
          <ul className="space-y-1 pl-4">
            {sections.arcoRights.requiredInfo.map((item, i) => (
              <li key={i} className="text-gray-600 text-sm list-disc list-outside">{item}</li>
            ))}
          </ul>
        </div>
      </CollapsibleSection>

      {/* V. Consentimiento */}
      <CollapsibleSection
        id="consentimiento"
        title="V. Consentimiento"
        icon={<CheckCircle className="w-4 h-4" />}
        badge="Art. 7-9"
      >
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-gray-700 text-sm mb-1">Mecanismo de consentimiento</h4>
            <p className="text-gray-600">{sections.consent.mechanism}</p>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <h4 className="font-semibold text-amber-800 text-sm mb-1 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Consentimiento para datos sensibles
            </h4>
            <p className="text-amber-700 text-sm">{sections.consent.sensitiveDataConsent}</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-700 text-sm mb-1">Menores de edad</h4>
            <p className="text-gray-600">{sections.consent.minorDataPolicy}</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* VI. Revocación */}
      <CollapsibleSection
        id="revocacion"
        title="VI. Revocación del Consentimiento"
        icon={<XCircle className="w-4 h-4" />}
        badge="Art. 8"
      >
        <p className="text-gray-700">{sections.revocation.mechanism}</p>
        <div className="mt-3">
          <h4 className="font-semibold text-gray-700 text-sm mb-2">Procedimiento</h4>
          <ol className="space-y-1 pl-4">
            {sections.revocation.procedure.map((step, i) => (
              <li key={i} className="text-gray-600 text-sm list-decimal list-outside">{step}</li>
            ))}
          </ol>
        </div>
        <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="font-semibold text-gray-700 text-sm mb-1">Efectos de la revocación</h4>
          <p className="text-gray-600 text-sm">{sections.revocation.effects}</p>
        </div>
      </CollapsibleSection>

      {/* VII. Cookies */}
      <CollapsibleSection
        id="cookies"
        title="VII. Cookies y Tecnologías de Rastreo"
        icon={<Cookie className="w-4 h-4" />}
        badge="Art. 16 VI"
      >
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-gray-700 text-sm mb-2">Cookies esenciales (no desactivables)</h4>
            <ul className="space-y-1.5">
              {sections.cookies.essentialCookies.map((c, i) => (
                <li key={i} className="text-gray-600 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className={`rounded-lg p-3 border text-sm ${sections.cookies.marketingCookies ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              <span className="font-semibold">Cookies de marketing:</span>{' '}
              {sections.cookies.marketingCookies ? 'Sí utilizamos' : 'No utilizamos'}
            </div>
            <div className={`rounded-lg p-3 border text-sm ${sections.cookies.thirdPartyTracking ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              <span className="font-semibold">Rastreo de terceros:</span>{' '}
              {sections.cookies.thirdPartyTracking ? 'Sí utilizamos' : 'No utilizamos'}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-gray-700 text-sm mb-1">Cómo desactivarlas</h4>
            <p className="text-gray-600 text-sm">{sections.cookies.optOutMechanism}</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* VIII. Cambios */}
      <CollapsibleSection
        id="cambios"
        title="VIII. Cambios al Aviso"
        icon={<RefreshCw className="w-4 h-4" />}
        badge="Art. 16 VII"
      >
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-gray-700 text-sm mb-1">Mecanismo de notificación</h4>
            <ul className="space-y-1 pl-4">
              {sections.changes.notificationMechanism.map((m, i) => (
                <li key={i} className="text-gray-600 text-sm list-disc list-outside">{m}</li>
              ))}
            </ul>
          </div>
          <p className="text-gray-600 text-sm">
            {sections.changes.consentRequired
              ? 'Cualquier cambio sustancial requerirá su consentimiento explícito antes de continuar usando el servicio.'
              : 'Los cambios entrarán en vigor en la fecha indicada.'}
          </p>
          <p className="text-gray-500 text-xs">{sections.changes.archiveLocation}</p>
        </div>
      </CollapsibleSection>

      {/* IX. Seguridad */}
      <CollapsibleSection
        id="seguridad"
        title="IX. Medidas de Seguridad"
        icon={<Lock className="w-4 h-4" />}
        badge="Art. 19"
      >
        <p className="text-gray-700">{sections.securityMeasures}</p>
      </CollapsibleSection>

      {/* X. Conservación */}
      <CollapsibleSection
        id="conservacion"
        title="X. Conservación de Datos"
        icon={<Clock className="w-4 h-4" />}
        badge="Art. 11"
      >
        <p className="text-gray-700">{sections.dataRetention}</p>
      </CollapsibleSection>

      {/* XI. INAI */}
      <CollapsibleSection
        id="inai"
        title="XI. Queja ante el INAI"
        icon={<Info className="w-4 h-4" />}
        badge="Art. 45"
      >
        <p className="text-gray-700">{sections.inapeContactInfo}</p>
      </CollapsibleSection>
    </div>
  );
}

// ─── Simplified notice view ───────────────────────────────────────────────────

function SimplifiedNotice({ notice }: { notice: PrivacyNoticeData }) {
  const items = [
    { label: 'Quiénes somos', text: notice.sections.purposes[0]?.legalBasis ? 'VIDA es una plataforma que almacena sus directivas médicas anticipadas y las hace accesibles en emergencias a través de un código QR.' : '' },
    { label: 'Datos que recabamos', text: 'Nombre, CURP, correo, teléfono; datos de salud sensibles (tipo de sangre, alergias, condiciones, medicamentos, directivas anticipadas); contactos de emergencia; y datos de pago procesados por Stripe.' },
    { label: 'Para qué los usamos', text: 'Mostrar su información médica crítica a servicios de emergencia (finalidad principal), notificar a sus representantes, y gestionar su cuenta y suscripción.' },
    { label: 'Con quién los compartimos', text: 'Personal médico y de emergencias (con su autorización expresa), representantes que usted designe, y proveedores de infraestructura (AWS, Stripe, Resend, WhatsApp Business) con medidas de seguridad adecuadas.' },
    { label: 'Sus derechos ARCO', text: 'Puede Acceder, Rectificar, Cancelar u Oponerse al uso de sus datos en Mi Perfil → Mis Datos y Privacidad, o escribiendo a privacidad@vidadigital.mx. Respuesta en 20 días hábiles.' },
    { label: 'Datos sensibles', text: 'Sus datos de salud son datos sensibles. Al ingresarlos, otorga consentimiento expreso conforme al Art. 9 LFPDPPP. Puede revocar este consentimiento en cualquier momento.' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        Esta es la versión resumida del Aviso de Privacidad. Puede consultar la versión completa en la pestaña correspondiente.
      </div>

      <div className="grid gap-3">
        {items.map((item, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.label}</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-vida-50 border border-vida-200 p-4 text-center">
        <p className="text-vida-700 text-sm font-medium">¿Preguntas sobre privacidad?</p>
        <a
          href={`mailto:${notice.responsibleParty.email}`}
          className="text-vida-600 font-semibold text-sm hover:underline"
        >
          {notice.responsibleParty.email}
        </a>
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function PrivacyNotice() {
  const [notice, setNotice] = useState<PrivacyNoticeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'integral' | 'simplified'>('integral');

  useEffect(() => {
    legalApi.getPrivacyNotice().then((data) => {
      setNotice(data ?? staticNotice);
      setLoading(false);
    });
  }, []);

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-vida-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando aviso de privacidad...</p>
        </div>
      </div>
    );
  }

  if (!notice) return null;

  const tabs = [
    { id: 'integral', label: 'Aviso Integral' },
    { id: 'simplified', label: 'Versión Simplificada' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Sticky header */}
      <header className="bg-white border-b sticky top-0 z-20 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Shield className="w-5 h-5 text-vida-600 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                Aviso de Privacidad
              </h1>
              <p className="text-xs text-gray-400 hidden sm:block">LFPDPPP — v{notice.version}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
            aria-label="Imprimir aviso de privacidad"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 print:px-0">
        {/* Print-only title */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Aviso de Privacidad Integral — LFPDPPP</h1>
          <p className="text-gray-600 mt-1">{notice.responsibleParty.name} | {notice.responsibleParty.email}</p>
          <p className="text-gray-500 text-sm">Versión {notice.version} — Vigente desde {new Date(notice.effectiveDate).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {/* Tab selector */}
        <div className="flex items-center justify-between gap-4 mb-5 print:hidden">
          <TabSelector
            tabs={tabs}
            active={activeTab}
            onChange={(id) => setActiveTab(id as 'integral' | 'simplified')}
          />
          <span className="hidden sm:block text-xs text-gray-400">
            Última actualización: {new Date(notice.lastUpdated).toLocaleDateString('es-MX')}
          </span>
        </div>

        {/* Content */}
        {activeTab === 'integral' ? (
          <FullNotice notice={notice} />
        ) : (
          <SimplifiedNotice notice={notice} />
        )}

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-gray-200 text-center print:hidden">
          <p className="text-xs text-gray-400">
            {notice.responsibleParty.name} &bull; {notice.responsibleParty.email} &bull; {notice.responsibleParty.address}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            En caso de inconformidad, puede presentar queja ante el INAI:{' '}
            <a href="https://www.inai.org.mx" target="_blank" rel="noopener noreferrer" className="text-vida-500 hover:underline">
              www.inai.org.mx
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
