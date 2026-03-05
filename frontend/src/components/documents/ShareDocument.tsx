// src/components/documents/ShareDocument.tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { profileApi } from '../../services/api';
import {
  X,
  Copy,
  Check,
  Share2,
  Mail,
  MessageCircle,
  QrCode,
  Loader2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';

interface ShareDocumentProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareDocument({ isOpen, onClose }: ShareDocumentProps) {
  const { t } = useTranslation('documents');
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['profile-share-info'],
    queryFn: () => profileApi.getShareInfo(),
    enabled: isOpen,
  });

  const shareInfo = data?.data;
  const emergencyUrl = shareInfo?.emergencyUrl || '';

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setShowQR(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(emergencyUrl);
      setCopied(true);
      toast.success(t('share.linkCopied', { defaultValue: 'Enlace copiado' }));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('share.copyError', { defaultValue: 'Error al copiar' }));
    }
  };

  const handleWebShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: t('share.shareTitle', { defaultValue: 'Mi Perfil Medico de Emergencia - VIDA' }),
        text: t('share.shareText', { defaultValue: 'Accede a mi perfil medico de emergencia VIDA' }),
        url: emergencyUrl,
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Share failed:', err);
      }
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `${t('share.shareText', { defaultValue: 'Accede a mi perfil medico de emergencia VIDA' })}: ${emergencyUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(
      t('share.shareTitle', { defaultValue: 'Mi Perfil Medico de Emergencia - VIDA' })
    );
    const body = encodeURIComponent(
      `${t('share.shareText', { defaultValue: 'Accede a mi perfil medico de emergencia VIDA' })}:\n\n${emergencyUrl}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} aria-hidden="true" />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-modal-title"
          className="relative bg-white rounded-xl shadow-xl max-w-md w-full"
        >
          <div className="flex items-center justify-between p-4 border-b">
            <h3 id="share-modal-title" className="text-lg font-semibold text-gray-900">
              {t('share.title', { defaultValue: 'Compartir Perfil Medico' })}
            </h3>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              aria-label={t('share.close', { defaultValue: 'Cerrar' })}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-vida-600 animate-spin" />
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  {t('share.description', { defaultValue: 'Comparte tu enlace de emergencia para que puedan acceder a tu perfil medico en caso de necesidad.' })}
                </p>

                {/* Copy Link */}
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="text"
                    value={emergencyUrl}
                    readOnly
                    className="flex-1 bg-transparent text-sm text-gray-700 outline-none truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-salud-600" aria-hidden="true" />
                        {t('share.copied', { defaultValue: 'Copiado' })}
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" aria-hidden="true" />
                        {t('share.copy', { defaultValue: 'Copiar' })}
                      </>
                    )}
                  </button>
                </div>

                {/* Share Options */}
                <div className="grid grid-cols-2 gap-3">
                  {typeof navigator.share === 'function' && (
                    <button
                      onClick={handleWebShare}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="p-2 bg-vida-100 rounded-lg">
                        <Share2 className="w-5 h-5 text-vida-600" aria-hidden="true" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {t('share.nativeShare', { defaultValue: 'Compartir' })}
                      </span>
                    </button>
                  )}

                  <button
                    onClick={handleWhatsApp}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="p-2 bg-green-100 rounded-lg">
                      <MessageCircle className="w-5 h-5 text-green-600" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium text-gray-900">WhatsApp</span>
                  </button>

                  <button
                    onClick={handleEmail}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Mail className="w-5 h-5 text-blue-600" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium text-gray-900">Email</span>
                  </button>

                  <button
                    onClick={() => setShowQR(!showQR)}
                    className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                      showQR ? 'border-vida-300 bg-vida-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <QrCode className="w-5 h-5 text-gray-600" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {t('share.qrCode', { defaultValue: 'Codigo QR' })}
                    </span>
                  </button>
                </div>

                {/* QR Code Display */}
                {showQR && emergencyUrl && (
                  <div className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-lg">
                    <QRCodeSVG
                      value={emergencyUrl}
                      size={200}
                      level="M"
                      includeMargin
                    />
                    <p className="text-xs text-gray-500 mt-3 text-center">
                      {t('share.qrDescription', { defaultValue: 'Escanea este codigo para acceder al perfil de emergencia' })}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-4 border-t bg-gray-50">
            <button onClick={onClose} className="w-full btn-secondary">
              {t('share.close', { defaultValue: 'Cerrar' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
