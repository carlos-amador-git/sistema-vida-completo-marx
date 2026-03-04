// src/data/privacyNoticeStatic.ts
// Static fallback — used when the /api/v1/legal/privacy-notice endpoint is unreachable.
// This object mirrors the structure of PrivacyNotice from legalApi.ts and the
// backend's privacy-notice.ts module.

import type { PrivacyNotice } from '../services/legalApi';

export const privacyNotice: PrivacyNotice = {
  version: '1.0.0',
  effectiveDate: '2026-03-04',
  lastUpdated: '2026-03-04',

  responsibleParty: {
    name: 'VIDA - Voluntad Anticipada Digital',
    legalName: 'VIDA - Sistema de Directivas Médicas de Emergencia',
    address: 'Ciudad de México, México',
    email: 'privacidad@vidadigital.mx',
    phone: '+52 (55) 0000-0000',
    website: 'https://vidadigital.mx',
  },

  sections: {
    dataCollected: [
      {
        category: 'Datos de identificación',
        items: [
          'Nombre completo',
          'Clave Única de Registro de Población (CURP)',
          'Fecha de nacimiento',
          'Sexo',
          'Correo electrónico',
          'Número de teléfono celular',
        ],
        sensitive: false,
      },
      {
        category: 'Datos de salud (datos sensibles)',
        items: [
          'Tipo de sangre',
          'Alergias a medicamentos, alimentos u otras sustancias',
          'Condiciones médicas crónicas o preexistentes',
          'Medicamentos de uso actual con dosis y frecuencia',
          'Directivas anticipadas de voluntad (instrucciones de resucitación, soporte vital, donación de órganos)',
          'Número y nombre de póliza de seguro médico',
          'Nombre del médico tratante y datos de contacto',
        ],
        sensitive: true,
      },
      {
        category: 'Datos de contactos de emergencia y representantes',
        items: [
          'Nombre completo del representante o testigo',
          'Número de teléfono celular',
          'Correo electrónico',
          'Relación o parentesco con el titular',
        ],
        sensitive: false,
      },
      {
        category: 'Datos de ubicación',
        items: [
          'Coordenadas GPS al momento de activar una alerta de pánico (únicamente con consentimiento explícito del titular y durante la emergencia activa)',
        ],
        sensitive: false,
      },
      {
        category: 'Datos financieros',
        items: [
          'Nombre del titular de la tarjeta de pago',
          'Últimos 4 dígitos de la tarjeta (token Stripe; los datos completos de tarjeta son procesados exclusivamente por Stripe y no son almacenados por VIDA)',
          'Historial de transacciones y suscripciones',
        ],
        sensitive: false,
      },
      {
        category: 'Datos biométricos (cuando se habilita autenticación biométrica)',
        items: [
          'Credenciales WebAuthn vinculadas al dispositivo (datos de clave pública; no se almacenan huellas, rostros ni imágenes biométricas en los servidores de VIDA)',
        ],
        sensitive: true,
      },
      {
        category: 'Datos de uso y navegación',
        items: [
          'Dirección IP',
          'Agente de usuario (navegador y sistema operativo)',
          'Registros de acceso al código QR de emergencia (quién, cuándo y desde dónde)',
          'Historial de actividad dentro de la plataforma',
        ],
        sensitive: false,
      },
    ],

    purposes: [
      {
        id: 'account_management',
        title: 'Creación y gestión de cuenta de usuario',
        description:
          'Registrar al titular, autenticar su identidad en cada sesión, mantener la seguridad de su cuenta y gestionar su suscripción al servicio.',
        legalBasis: 'Ejecución de contrato — Art. 7 LFPDPPP',
        required: true,
      },
      {
        id: 'directives_storage',
        title: 'Almacenamiento y gestión de directivas anticipadas de voluntad',
        description:
          'Guardar, actualizar y presentar al personal médico o servicios de emergencia las instrucciones anticipadas del titular respecto a procedimientos de resucitación, soporte vital, donación de órganos y otras decisiones médicas críticas.',
        legalBasis:
          'Ejecución de contrato y cumplimiento de obligación legal — Art. 7 y 10 LFPDPPP; Ley de Voluntad Anticipada del Distrito Federal y leyes estatales equivalentes',
        required: true,
      },
      {
        id: 'emergency_qr',
        title: 'Generación de código QR y ficha de acceso de emergencia',
        description:
          'Producir un código QR único que permita al personal médico o de emergencias acceder, sin autenticación previa, a los datos médicos críticos del titular en situaciones de riesgo vital.',
        legalBasis: 'Ejecución de contrato — Art. 7 LFPDPPP',
        required: true,
      },
      {
        id: 'representative_notification',
        title: 'Notificación a representantes y contactos de emergencia',
        description:
          'Enviar alertas por correo electrónico, SMS o WhatsApp a los representantes y contactos designados por el titular cuando se active una alerta de pánico o cuando el código QR de emergencia sea escaneado.',
        legalBasis: 'Ejecución de contrato — Art. 7 LFPDPPP',
        required: true,
      },
      {
        id: 'panic_alert',
        title: 'Procesamiento de alertas de pánico',
        description:
          'Recibir y tramitar la señal de alerta de pánico del titular, geolocalizar al usuario (con consentimiento), identificar hospitales cercanos y notificar a contactos de emergencia y servicios de auxilio.',
        legalBasis: 'Ejecución de contrato y protección de intereses vitales — Art. 7 y 10 LFPDPPP',
        required: true,
      },
      {
        id: 'payment_processing',
        title: 'Procesamiento de pagos y gestión de suscripción',
        description:
          'Procesar cobros de suscripción, gestionar renovaciones, cancelaciones y emitir comprobantes fiscales digitales.',
        legalBasis: 'Ejecución de contrato y obligación legal fiscal — Art. 7 LFPDPPP; CFF',
        required: true,
      },
      {
        id: 'security_audit',
        title: 'Seguridad, prevención de fraude y auditoría',
        description:
          'Detectar accesos no autorizados, prevenir el uso fraudulento de la cuenta, mantener bitácoras de auditoría y cumplir con requerimientos legales de autoridades competentes.',
        legalBasis: 'Obligación legal y legítimo interés — Art. 10 LFPDPPP',
        required: true,
      },
      {
        id: 'service_improvement',
        title: 'Mejora del servicio mediante análisis estadístico agregado',
        description:
          'Analizar métricas de uso de manera anonimizada y agregada para mejorar funcionalidades, detectar errores y optimizar la experiencia del usuario. No se vinculan datos de uso a la identidad del titular.',
        legalBasis: 'Consentimiento — Art. 8 LFPDPPP',
        required: false,
      },
      {
        id: 'service_communications',
        title: 'Comunicaciones sobre actualizaciones y nuevas funcionalidades',
        description:
          'Informar al titular sobre nuevas características, cambios en los planes de suscripción o mejoras relevantes del servicio VIDA.',
        legalBasis: 'Consentimiento — Art. 8 LFPDPPP',
        required: false,
      },
    ],

    transfers: [
      {
        recipient: 'Personal médico y servicios de emergencia (SUMA, Cruz Roja, hospitales)',
        country: 'México',
        purpose:
          'Acceso a datos médicos críticos del titular mediante escaneo del código QR de emergencia. Esta transferencia es la finalidad principal del servicio y el titular la autoriza expresamente al activar su perfil de emergencia.',
        legalBasis:
          'Art. 37 fracc. I LFPDPPP — necesaria para la atención de una emergencia que pueda dañar a una persona.',
      },
      {
        recipient: 'Representantes y contactos de emergencia designados por el titular',
        country: 'México',
        purpose: 'Notificación de alertas de pánico, escaneos del código QR y actualizaciones de directivas.',
        legalBasis: 'Art. 37 fracc. I LFPDPPP — autorización expresa del titular al designar al contacto.',
      },
      {
        recipient: 'Amazon Web Services (AWS)',
        country: 'Estados Unidos de América',
        purpose:
          'Infraestructura de cómputo en la nube para el almacenamiento seguro de datos y documentos médicos (cifrado AES-256 en reposo y TLS 1.3 en tránsito).',
        legalBasis:
          'Art. 36 LFPDPPP — transferencia internacional con medidas de seguridad equivalentes; AWS cuenta con certificaciones SOC 2, ISO 27001 y ofrece Cláusulas Contractuales Estándar.',
      },
      {
        recipient: 'Stripe, Inc.',
        country: 'Estados Unidos de América',
        purpose: 'Procesamiento seguro de pagos con tarjeta de crédito/débito. Stripe es certificado PCI DSS Nivel 1.',
        legalBasis:
          'Art. 36 LFPDPPP — ejecución del contrato de servicio; Stripe cumple con medidas de seguridad equivalentes.',
      },
      {
        recipient: 'Resend (servicio de correo transaccional)',
        country: 'Estados Unidos de América',
        purpose:
          'Envío de correos electrónicos transaccionales: verificación de cuenta, recuperación de contraseña, alertas de acceso y notificaciones de emergencia.',
        legalBasis: 'Art. 36 LFPDPPP — ejecución del contrato de servicio.',
      },
      {
        recipient: 'Meta Platforms, Inc. (WhatsApp Business API)',
        country: 'Estados Unidos de América',
        purpose: 'Envío de alertas y notificaciones de emergencia vía WhatsApp a los contactos designados por el titular.',
        legalBasis:
          'Art. 36 LFPDPPP — consentimiento del titular; transferencia necesaria para la finalidad principal del servicio.',
      },
    ],

    arcoRights: {
      description:
        'Conforme a los artículos 28 al 35 de la LFPDPPP, el titular tiene derecho a: Acceder a sus datos personales en posesión del responsable y conocer la información relativa a las condiciones y generalidades de su tratamiento (Acceso); Solicitar la corrección de sus datos cuando sean inexactos o incompletos (Rectificación); Solicitar que sus datos sean dados de baja de los registros o bases de datos del responsable cuando considere que no están siendo utilizados conforme a los principios de la Ley (Cancelación); u Oponerse al tratamiento de sus datos para fines específicos (Oposición).',
      contactEmail: 'privacidad@vidadigital.mx',
      contactAddress: 'Ciudad de México, México',
      responseDeadlineDays: 20,
      requiredInfo: [
        'Nombre completo del titular',
        'CURP o cualquier documento que acredite la identidad del titular',
        'Descripción clara y precisa de los datos personales sobre los que se solicita ejercer el derecho ARCO',
        'Cualquier documento o información que facilite la localización de los datos personales',
        'En el caso de Rectificación: los cambios a efectuar y documentación de respaldo',
        'Correo electrónico o domicilio para recibir la respuesta',
      ],
      procedure: [
        'Ingrese a su cuenta y diríjase a "Mi Perfil" → "Mis Datos y Privacidad" → "Ejercer Derechos ARCO" para presentar su solicitud de forma electrónica.',
        'Alternativamente, envíe su solicitud por escrito a privacidad@vidadigital.mx con los datos requeridos.',
        'El responsable acusará recibo de su solicitud y le informará si la misma resulta procedente o no en un plazo de 20 días hábiles.',
        'Si la solicitud es procedente, se hará efectiva dentro de los 15 días hábiles siguientes.',
        'Ambos plazos podrán prorrogarse por una sola vez por un período igual, cuando así lo justifiquen las circunstancias del caso.',
      ],
    },

    consent: {
      mechanism:
        'Al registrarse en la plataforma VIDA, el titular lee y acepta el presente Aviso de Privacidad mediante una casilla de verificación explícita en el formulario de registro. Para las finalidades secundarias no necesarias (análisis estadístico y comunicaciones de mejora), el titular podrá otorgar o negar su consentimiento de forma independiente desde la sección "Privacidad y Consentimiento" de su perfil.',
      sensitiveDataConsent:
        'Tratándose de datos personales sensibles (datos de salud y datos biométricos), el consentimiento del titular es expreso y por escrito, conforme al artículo 9 de la LFPDPPP. Este consentimiento se recaba en el momento en que el titular decide ingresar información de salud en su perfil médico o activar la autenticación biométrica, mediante confirmación explícita e informada.',
      minorDataPolicy:
        'El servicio VIDA está dirigido a personas mayores de 18 años. No recabamos intencionalmente datos personales de menores de edad. Si un padre, madre o tutor legal desea registrar información para un menor, deberá contactar a privacidad@vidadigital.mx para recibir orientación específica.',
    },

    revocation: {
      mechanism:
        'El titular puede revocar en cualquier momento el consentimiento que haya otorgado para el tratamiento de sus datos personales, en la medida en que la ley lo permita.',
      procedure: [
        'Para revocar el consentimiento de finalidades secundarias (análisis estadístico, comunicaciones): ingrese a "Mi Perfil" → "Privacidad y Consentimiento" y desactive las finalidades secundarias.',
        'Para cancelar su cuenta y revocar el consentimiento general: ingrese a "Mi Perfil" → "Configuración de Cuenta" → "Eliminar mi cuenta". Su solicitud tendrá un período de gracia de 30 días durante el cual podrá reactivar su cuenta. Transcurrido dicho período, sus datos serán eliminados de forma permanente, salvo los que deban conservarse por obligación legal.',
        'Alternativamente, envíe su solicitud de revocación a privacidad@vidadigital.mx.',
      ],
      effects:
        'La revocación del consentimiento para finalidades primarias (almacenamiento de directivas, acceso de emergencia) implica la cancelación del servicio, ya que dichas finalidades son necesarias para su prestación. Los datos de salud serán eliminados una vez que la solicitud sea procesada. VIDA conservará únicamente los datos contables y fiscales que la ley obligue a mantener.',
      contactEmail: 'privacidad@vidadigital.mx',
    },

    cookies: {
      essentialCookies: [
        'accessToken — Token de sesión HTTP-only cifrado; identifica al usuario autenticado. Duración: 15 minutos.',
        'refreshToken — Token de renovación de sesión HTTP-only cifrado. Duración: 7 días.',
        'XSRF-TOKEN — Token de protección contra ataques CSRF. Duración: sesión.',
        'vida_lang — Preferencia de idioma del usuario (es/en). Duración: 1 año.',
      ],
      analyticalCookies: [],
      marketingCookies: false,
      thirdPartyTracking: false,
      optOutMechanism:
        'Las cookies esenciales no pueden desactivarse sin afectar el funcionamiento del servicio (autenticación y seguridad). No utilizamos cookies analíticas de terceros ni de seguimiento publicitario. La configuración de idioma puede eliminarse borrando el almacenamiento local del navegador.',
    },

    changes: {
      notificationMechanism: [
        'Aviso visible en la plataforma al iniciar sesión',
        'Correo electrónico enviado a la dirección registrada',
        'Publicación de la versión actualizada en /aviso-privacidad con número de versión y fecha de entrada en vigor',
      ],
      consentRequired: true,
      archiveLocation:
        'Las versiones anteriores del Aviso de Privacidad se conservan en la plataforma y pueden solicitarse a privacidad@vidadigital.mx.',
    },

    securityMeasures:
      'VIDA implementa medidas de seguridad técnicas, administrativas y físicas para proteger sus datos personales contra daño, pérdida, alteración, destrucción o acceso no autorizado. Entre estas medidas destacan: cifrado AES-256 en reposo y TLS 1.3 en tránsito; autenticación multifactor (contraseña + biometría WebAuthn); tokens de sesión HTTP-only y protección CSRF; bitácoras de auditoría con retención de 90 días; acceso mínimo necesario al personal de VIDA; y pruebas periódicas de seguridad. En caso de una vulneración de seguridad que afecte sus derechos patrimoniales o morales, VIDA le notificará conforme al artículo 20 de la LFPDPPP.',

    dataRetention:
      'Los datos personales se conservarán únicamente durante el tiempo necesario para cumplir las finalidades descritas en este aviso y los plazos establecidos por la legislación aplicable: datos de salud y directivas anticipadas: mientras la cuenta esté activa y hasta 30 días después de la cancelación; datos fiscales y de transacciones: 5 años conforme al Código Fiscal de la Federación; bitácoras de auditoría y seguridad: 90 días; datos de ubicación de alertas de pánico: 30 días. Transcurridos estos plazos, los datos se eliminarán de forma segura e irreversible.',

    inapeContactInfo:
      'Si considera que su solicitud de ejercicio de derechos ARCO no fue atendida correctamente, o que sus datos personales han sido tratados en contravención a la LFPDPPP, puede interponer una queja o denuncia ante el Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales (INAI): www.inai.org.mx | Teléfono: 800 835 4324 | Insurgentes Sur 3211, Col. Insurgentes Cuicuilco, C.P. 04530, Ciudad de México.',
  },
};
