// src/components/pages/PrivacyPolicy.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { Shield, ArrowLeft, Globe, Server, CreditCard, Mail } from 'lucide-react';
import { consentApi, PolicyVersion } from '../../services/consentApi';

export default function PrivacyPolicy() {
  const [policy, setPolicy] = useState<PolicyVersion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    consentApi.getActivePolicy().then((data) => {
      setPolicy(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Cargando aviso de privacidad">
        <div className="w-8 h-8 border-2 border-vida-600 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/" className="text-gray-500 hover:text-gray-700" aria-label="Volver al inicio">
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-vida-600" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-gray-900">Aviso de Privacidad</h1>
          </div>
          {policy && (
            <span className="ml-auto text-sm text-gray-500">
              v{policy.version} - {new Date(policy.publishedAt).toLocaleDateString('es-MX')}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {policy?.content ? (
          <article
            className="bg-white rounded-xl shadow-sm border p-8 prose prose-gray max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(policy.content) }}
          />
        ) : (
          <StaticPrivacyPolicy />
        )}
      </main>
    </div>
  );
}

/**
 * Static fallback privacy policy per Art. 16 LFPDPPP
 * Used when no dynamic policy version exists in DB
 */
function StaticPrivacyPolicy() {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-8">
      <article className="prose prose-gray max-w-none">
        <h1>Aviso de Privacidad Integral</h1>
        <p className="text-sm text-gray-500">Conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</p>

        <h2>I. Identidad del Responsable</h2>
        <p>
          <strong>VIDA - Sistema de Directivas Médicas de Emergencia</strong>, con domicilio en México,
          es responsable del tratamiento de sus datos personales conforme a lo dispuesto por la LFPDPPP
          y su Reglamento.
        </p>

        <h2>II. Datos Personales Recabados</h2>
        <p>Para las finalidades señaladas, recabamos las siguientes categorías de datos personales:</p>
        <ul>
          <li><strong>Datos de identificación:</strong> Nombre completo, CURP, fecha de nacimiento, sexo, correo electrónico, teléfono</li>
          <li><strong>Datos de salud (sensibles):</strong> Tipo de sangre, alergias, condiciones médicas, medicamentos, póliza de seguro médico, directivas anticipadas de voluntad</li>
          <li><strong>Datos de contacto de emergencia:</strong> Nombre, teléfono, correo electrónico de representantes y testigos designados</li>
          <li><strong>Datos de ubicación:</strong> Coordenadas GPS al activar alertas de pánico (solo con su consentimiento explícito)</li>
          <li><strong>Datos financieros:</strong> Información de pago procesada a través de Stripe (no almacenamos números de tarjeta)</li>
        </ul>

        <h2>III. Finalidades del Tratamiento</h2>
        <h3>Finalidades primarias (necesarias):</h3>
        <ul>
          <li>Creación y gestión de su cuenta de usuario</li>
          <li>Almacenamiento y gestión de sus directivas anticipadas de voluntad</li>
          <li>Generación de códigos QR para acceso de emergencia a su información médica</li>
          <li>Contacto con sus representantes y contactos de emergencia</li>
          <li>Procesamiento de alertas de pánico y notificación a contactos</li>
          <li>Procesamiento de pagos y gestión de suscripción</li>
        </ul>
        <h3>Finalidades secundarias (opcionales):</h3>
        <ul>
          <li>Envío de notificaciones sobre actualizaciones del servicio</li>
          <li>Análisis estadístico agregado para mejora del servicio</li>
        </ul>

        <h2>IV. Transferencias Internacionales de Datos</h2>
        <p>Sus datos personales pueden ser transferidos a los siguientes terceros para las finalidades indicadas:</p>
        <div className="not-prose grid gap-4 my-6">
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <Server className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">Amazon Web Services (AWS) - EE.UU.</p>
              <p className="text-sm text-gray-600">Almacenamiento seguro de datos y documentos médicos (infraestructura cloud)</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <CreditCard className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">Stripe, Inc. - EE.UU.</p>
              <p className="text-sm text-gray-600">Procesamiento seguro de pagos con tarjeta (PCI DSS Level 1)</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <Mail className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">Resend - EE.UU.</p>
              <p className="text-sm text-gray-600">Envío de correos electrónicos transaccionales (verificación, notificaciones)</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <Globe className="w-5 h-5 text-sky-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">Meta Platforms (WhatsApp Business API) - EE.UU.</p>
              <p className="text-sm text-gray-600">Envío de notificaciones de emergencia vía WhatsApp</p>
            </div>
          </div>
        </div>
        <p>Todas las transferencias se realizan con medidas de seguridad adecuadas conforme al Art. 36 LFPDPPP.</p>

        <h2>V. Medios para Ejercer Derechos ARCO</h2>
        <p>
          Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse al tratamiento de sus datos personales
          (derechos ARCO), conforme a los artículos 28 al 35 de la LFPDPPP.
        </p>
        <p>
          Para ejercer estos derechos, puede utilizar la sección <strong>"Mis Datos y Privacidad"</strong> dentro de su perfil
          en la plataforma, o enviar una solicitud a: <strong>privacidad@sistemavida.mx</strong>
        </p>
        <p>
          Su solicitud será atendida en un plazo máximo de 20 días hábiles, conforme al Art. 32 de la LFPDPPP.
        </p>

        <h2>VI. Opciones y Medios para Limitar el Uso</h2>
        <p>Si desea limitar el uso o divulgación de sus datos personales, puede:</p>
        <ul>
          <li>Revocar el consentimiento para finalidades secundarias desde su perfil</li>
          <li>Solicitar la eliminación de su cuenta (con periodo de gracia de 30 días)</li>
          <li>Enviar solicitud a: <strong>privacidad@sistemavida.mx</strong></li>
        </ul>

        <h2>VII. Uso de Cookies y Tecnologías de Rastreo</h2>
        <p>
          Utilizamos cookies esenciales para el funcionamiento del servicio (autenticación, preferencias de sesión).
          No utilizamos cookies de rastreo publicitario ni compartimos información con redes publicitarias.
        </p>

        <h2>VIII. Cambios al Aviso de Privacidad</h2>
        <p>
          El presente aviso puede sufrir modificaciones. Cualquier cambio será notificado mediante
          la plataforma y requerirá su aceptación antes de continuar usando el servicio.
        </p>

        <h2>IX. Consentimiento</h2>
        <p>
          Al registrarse y usar la plataforma VIDA, usted manifiesta haber leído, entendido y aceptado
          los términos y condiciones del presente aviso de privacidad, otorgando su consentimiento
          expreso para el tratamiento de sus datos personales conforme a las finalidades descritas.
        </p>
        <p>
          Tratándose de datos sensibles (datos de salud), su consentimiento es expreso y por escrito,
          conforme al Art. 9 de la LFPDPPP.
        </p>

        <hr />
        <p className="text-sm text-gray-500">
          Última actualización: {new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </article>
    </div>
  );
}
