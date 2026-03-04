// src/components/pages/MFASetup.tsx
/**
 * MFASetup — Multi-step flow to configure TOTP-based two-factor authentication.
 *
 * Step 1: Show QR code to scan with an authenticator app.
 * Step 2: Enter 6-digit code to confirm the setup.
 * Step 3: Success confirmation with guidance.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  QrCode,
  KeyRound,
  CheckCircle2,
  Copy,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { mfaApi } from '../../services/api';
import toast from 'react-hot-toast';

type Step = 'loading' | 'scan' | 'confirm' | 'done';

const DIGIT_COUNT = 6;

export default function MFASetup() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('loading');
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load QR code on mount
  useEffect(() => {
    const init = async () => {
      try {
        const response = await mfaApi.setup();
        if (response.success && response.data) {
          setQrCode(response.data.qrCode);
          setSecret(response.data.secret);
          setStep('scan');
        } else {
          toast.error('No se pudo iniciar la configuracion de MFA.');
          navigate('/profile');
        }
      } catch {
        toast.error('Error al conectar con el servidor.');
        navigate('/profile');
      }
    };
    init();
  }, [navigate]);

  // ─── Digit input helpers ─────────────────────────────────────────────────

  const focusInput = (index: number) => inputRefs.current[index]?.focus();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (digits[index] !== '') {
        const updated = [...digits];
        updated[index] = '';
        setDigits(updated);
      } else if (index > 0) {
        focusInput(index - 1);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusInput(index - 1);
    } else if (e.key === 'ArrowRight' && index < DIGIT_COUNT - 1) {
      focusInput(index + 1);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) return;

    if (raw.length === DIGIT_COUNT) {
      const updated = raw.split('');
      setDigits(updated);
      focusInput(DIGIT_COUNT - 1);
      return;
    }

    const char = raw[raw.length - 1];
    const updated = [...digits];
    updated[index] = char;
    setDigits(updated);
    if (index < DIGIT_COUNT - 1) focusInput(index + 1);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGIT_COUNT);
    if (!pasted) return;
    const updated = Array(DIGIT_COUNT).fill('');
    pasted.split('').forEach((c, i) => { updated[i] = c; });
    setDigits(updated);
    focusInput(Math.min(pasted.length, DIGIT_COUNT - 1));
  };

  const confirmCode = useCallback(async (code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await mfaApi.verifySetup(code);
      if (response.success) {
        setStep('done');
      } else {
        setError(response.error?.message || 'Codigo invalido. Intenta de nuevo.');
        setDigits(Array(DIGIT_COUNT).fill(''));
        focusInput(0);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Codigo invalido o expirado.';
      setError(msg);
      setDigits(Array(DIGIT_COUNT).fill(''));
      focusInput(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-submit
  useEffect(() => {
    const code = digits.join('');
    if (code.length === DIGIT_COUNT && !isLoading && step === 'confirm') {
      confirmCode(code);
    }
  }, [digits, isLoading, step, confirmCode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length === DIGIT_COUNT) confirmCode(code);
  };

  const copySecret = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Preparando configuracion">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-vida-200 border-t-vida-600 rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
          <p className="text-gray-600" aria-hidden="true">Preparando configuracion...</p>
        </div>
      </div>
    );
  }

  // ─── Layout wrapper ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-vida-100 rounded-full flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <ShieldCheck className="w-8 h-8 text-vida-600" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Autenticacion de dos factores</h1>
          <p className="text-gray-500 text-sm mt-2">
            Protege tu cuenta con un segundo factor de seguridad.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8" role="list" aria-label="Pasos del proceso">
          {(['scan', 'confirm', 'done'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2" role="listitem">
              <div
                aria-current={step === s ? 'step' : undefined}
                aria-label={`Paso ${i + 1}${(['scan', 'confirm', 'done'] as const).indexOf(step) > i ? ' (completado)' : step === s ? ' (actual)' : ''}`}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s
                    ? 'bg-vida-600 text-white'
                    : (['scan', 'confirm', 'done'] as const).indexOf(step) > i
                    ? 'bg-salud-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {(['scan', 'confirm', 'done'] as const).indexOf(step) > i ? (
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && <div className="w-8 h-px bg-gray-200" aria-hidden="true" />}
            </div>
          ))}
        </div>

        {/* ─── Step 1: Scan QR ─── */}
        {step === 'scan' && (
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-vida-100 rounded-lg flex items-center justify-center" aria-hidden="true">
                <QrCode className="w-5 h-5 text-vida-600" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Escanea el codigo QR</h2>
                <p className="text-sm text-gray-500">Usa Google Authenticator, Authy u otra app TOTP</p>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-6">
              <div className="p-3 bg-white border-2 border-gray-100 rounded-xl shadow-sm">
                <img
                  src={qrCode}
                  alt="QR code para autenticador TOTP"
                  className="w-52 h-52"
                />
              </div>
            </div>

            {/* Manual entry fallback */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="w-4 h-4 text-gray-500" aria-hidden="true" />
                <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Clave manual (si no puedes escanear)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 text-sm font-mono text-gray-800 break-all bg-white border border-gray-200 rounded-lg px-3 py-2"
                  aria-label="Clave secreta de autenticacion"
                >
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  aria-label={copied ? 'Clave copiada' : 'Copiar clave'}
                  className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  {copied ? (
                    <CheckCircle2 className="w-4 h-4 text-salud-500" aria-hidden="true" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-500" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep('confirm')}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              Continuar
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* ─── Step 2: Confirm code ─── */}
        {step === 'confirm' && (
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-vida-100 rounded-lg flex items-center justify-center" aria-hidden="true">
                <KeyRound className="w-5 h-5 text-vida-600" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Confirma el codigo</h2>
                <p className="text-sm text-gray-500">Ingresa el codigo de 6 digitos de tu app</p>
              </div>
            </div>

            <form onSubmit={handleManualSubmit}>
              {/* Digit inputs */}
              <div className="flex gap-2 justify-center mb-6">
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="\d"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleChange(e, i)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.select()}
                    disabled={isLoading}
                    aria-label={`Digito ${i + 1}`}
                    className={`
                      w-12 h-14 text-center text-xl font-bold border-2 rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-vida-500 focus:border-transparent
                      transition-all duration-200 disabled:opacity-50
                      ${digit ? 'border-vida-400 bg-vida-50' : 'border-gray-300 bg-white'}
                      ${error ? 'border-red-400' : ''}
                    `}
                  />
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-lg" role="alert" aria-live="polite">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || digits.join('').length < DIGIT_COUNT}
                className="btn-primary w-full py-3"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    Verificando...
                  </div>
                ) : (
                  'Activar autenticacion de dos factores'
                )}
              </button>
            </form>

            <button
              type="button"
              onClick={() => { setDigits(Array(DIGIT_COUNT).fill('')); setError(null); setStep('scan'); }}
              className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Volver al codigo QR
            </button>
          </div>
        )}

        {/* ─── Step 3: Done ─── */}
        {step === 'done' && (
          <div className="card text-center">
            <div className="w-20 h-20 bg-salud-100 rounded-full flex items-center justify-center mx-auto mb-6" aria-hidden="true">
              <CheckCircle2 className="w-10 h-10 text-salud-600" aria-hidden="true" />
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-3">
              Autenticacion activada
            </h2>
            <p className="text-gray-600 text-sm mb-6">
              La autenticacion de dos factores esta activa en tu cuenta.
              A partir de ahora necesitaras tu app de autenticacion para iniciar sesion.
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm font-medium text-amber-800 mb-1">Consejo de seguridad</p>
              <p className="text-sm text-amber-700">
                Guarda la clave manual en un lugar seguro. La necesitaras si pierdes acceso a tu app de autenticacion.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="btn-primary w-full py-3"
            >
              Ir a mi perfil
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
