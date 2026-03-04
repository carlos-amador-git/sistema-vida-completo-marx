// src/components/auth/MFAVerify.tsx
/**
 * MFAVerify — 6-digit TOTP input used during the login MFA step.
 *
 * Shown when the server returns { requiresMFA: true, mfaToken } after
 * a successful password check.  Once 6 digits are entered the form
 * auto-submits; the user can also click the button manually.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { ShieldCheck, RotateCcw, AlertCircle } from 'lucide-react';
import { mfaApi } from '../../services/api';
import { useAuth, type MFAChallenge } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface MFAVerifyProps {
  challenge: MFAChallenge;
  onCancel: () => void;
}

const DIGIT_COUNT = 6;

export default function MFAVerify({ challenge, onCancel }: MFAVerifyProps) {
  const { completeMFA } = useAuth();
  const navigate = useNavigate();

  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown: TOTP period is 30 s — show seconds left in current window
  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setSecondsLeft(30 - (now % 30));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const focusInput = (index: number) => {
    inputRefs.current[index]?.focus();
  };

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
      // Paste of full code
      const updated = raw.split('');
      setDigits(updated);
      focusInput(DIGIT_COUNT - 1);
      return;
    }

    const char = raw[raw.length - 1];
    const updated = [...digits];
    updated[index] = char;
    setDigits(updated);

    if (index < DIGIT_COUNT - 1) {
      focusInput(index + 1);
    }
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

  const submit = useCallback(async (code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await mfaApi.verify(code, challenge.mfaToken);
      if (response.success && response.data) {
        completeMFA(challenge, response.data.user);
        toast.success('Verificación exitosa. Bienvenido.');
        navigate('/dashboard');
      } else {
        setError(response.error?.message || 'Código inválido. Intenta de nuevo.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Código inválido o expirado.';
      setError(msg);
      // Reset digits on error
      setDigits(Array(DIGIT_COUNT).fill(''));
      focusInput(0);
    } finally {
      setIsLoading(false);
    }
  }, [challenge, completeMFA, navigate]);

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    const code = digits.join('');
    if (code.length === DIGIT_COUNT && !isLoading) {
      submit(code);
    }
  }, [digits, isLoading, submit]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length === DIGIT_COUNT) {
      submit(code);
    }
  };

  // Colour the countdown: green > 10s, yellow 5-10s, red < 5s
  const countdownColor =
    secondsLeft > 10 ? 'text-salud-600' : secondsLeft > 5 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-vida-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-8 h-8 text-vida-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verificacion de dos factores</h1>
        <p className="text-gray-600 text-sm">
          Ingresa el codigo de 6 digitos de tu aplicacion de autenticacion.
        </p>
      </div>

      {/* Countdown hint */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <RotateCcw className={`w-4 h-4 ${countdownColor}`} />
        <span className={`text-sm font-medium ${countdownColor}`}>
          Nuevo codigo en {secondsLeft}s
        </span>
      </div>

      <form onSubmit={handleManualSubmit}>
        {/* 6-digit input row */}
        <div className="flex gap-2 justify-center mb-6" aria-label="Codigo de verificacion">
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

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || digits.join('').length < DIGIT_COUNT}
          className="btn-primary w-full py-3"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Verificando...
            </div>
          ) : (
            'Verificar codigo'
          )}
        </button>
      </form>

      {/* Cancel */}
      <button
        type="button"
        onClick={onCancel}
        className="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        Volver al inicio de sesion
      </button>
    </div>
  );
}
