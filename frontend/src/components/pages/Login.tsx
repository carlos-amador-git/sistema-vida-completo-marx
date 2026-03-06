// src/components/pages/Login.tsx
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Fingerprint, Sparkles, User, Shield } from 'lucide-react';
import { AnimatedIcon } from '../ui/AnimatedIcon';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../../context/AuthContext';
import { webauthnApi } from '../../services/api';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import MFAVerify from '../auth/MFAVerify';
import type { MFAChallenge } from '../../context/AuthContext';

// Credenciales demo eliminadas del bundle de producción via Vite tree-shaking
// cuando VITE_ENABLE_DEMO_MODE !== 'true' (controlado por __DEMO_ENABLED__ en vite.config.ts)
const DEMO_USERS = __DEMO_ENABLED__ ? [
  {
    email: 'demo@sistemavida.mx',
    password: 'Demo123!',
    name: 'Carlos García',
    description: 'Usuario Premium con perfil completo',
    plan: 'Premium',
    color: 'from-emerald-500 to-teal-500',
  },
] : null;

const getLoginSchema = (t: TFunction) => z.object({
  email: z.string().email(t('validation.invalidEmail')),
  password: z.string().min(1, t('validation.passwordRequired')),
});

type LoginFormData = {
  email: string;
  password: string;
};

export default function Login() {
  const { t } = useTranslation('auth');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<MFAChallenge | null>(null);
  const { login, loginWithTokens, clearMFA } = useAuth();
  const navigate = useNavigate();

  const loginSchema = useMemo(() => getLoginSchema(t), [t]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const emailValue = watch('email');

  // Verificar soporte de WebAuthn
  useEffect(() => {
    setIsWebAuthnSupported(window.PublicKeyCredential !== undefined);
  }, []);

  // Verificar si el usuario tiene credenciales biométricas cuando cambia el email
  useEffect(() => {
    const checkBiometric = async () => {
      if (!emailValue || !isWebAuthnSupported) {
        setHasBiometric(false);
        return;
      }

      // Validar que sea un email válido
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailValue)) {
        setHasBiometric(false);
        return;
      }

      try {
        const response = await webauthnApi.checkBiometric(emailValue);
        setHasBiometric(response.data?.hasBiometricCredentials || false);
      } catch {
        setHasBiometric(false);
      }
    };

    // Debounce para no hacer muchas peticiones
    const timer = setTimeout(checkBiometric, 500);
    return () => clearTimeout(timer);
  }, [emailValue, isWebAuthnSupported]);

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result = await login(data);
      // If MFA is required, show the MFA verification step
      if (result && result.requiresMFA) {
        setMfaChallenge(result);
        return;
      }
      toast.success(t('login.welcomeBack'));
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || t('toast.loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Login con usuario demo
  const handleDemoLogin = async (demoUser: { email: string; password: string; name: string; description: string; plan: string; color: string }) => {
    setIsLoading(true);
    try {
      await login({ email: demoUser.email, password: demoUser.password });
      toast.success(t('login.welcomeUser', { name: demoUser.name }));
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || t('toast.loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!emailValue) {
      toast.error(t('toast.emailRequired'));
      return;
    }

    setIsBiometricLoading(true);
    try {
      // 1. Obtener opciones de autenticación del servidor
      const optionsResponse = await webauthnApi.getAuthenticationOptions(emailValue);

      if (!optionsResponse.success || !optionsResponse.data) {
        throw new Error(t('toast.authOptionsError'));
      }

      const { options, userId } = optionsResponse.data;

      // 2. Iniciar autenticación en el dispositivo (Face ID, Touch ID, etc.)
      const credential = await startAuthentication({ optionsJSON: options });

      // 3. Verificar la autenticación en el servidor
      const verifyResponse = await webauthnApi.verifyAuthentication(userId, credential);

      if (!verifyResponse.success || !verifyResponse.data) {
        throw new Error(t('toast.verifyError'));
      }

      // 4. Guardar tokens y navegar
      const { user, accessToken, refreshToken } = verifyResponse.data;
      loginWithTokens(user, { accessToken, refreshToken });

      toast.success(t('login.welcomeBack'));
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error en login biométrico:', error);

      // Mensajes de error más amigables
      let errorMessage = t('toast.biometricError');

      if (error.name === 'NotAllowedError') {
        errorMessage = t('toast.biometricCancelled');
      } else if (error.name === 'SecurityError') {
        errorMessage = t('toast.biometricSecurityError');
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsBiometricLoading(false);
    }
  };

  // MFA verification step — overlay the normal login form
  if (mfaChallenge) {
    return (
      <MFAVerify
        challenge={mfaChallenge}
        onCancel={() => {
          setMfaChallenge(null);
          clearMFA();
        }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('login.title')}</h1>
        <p className="text-gray-600">
          {t('login.subtitle')}
        </p>
      </div>

      {/* Sección de Demo - Acceso Rápido (solo visible si __DEMO_ENABLED__) */}
      {__DEMO_ENABLED__ && DEMO_USERS && (
        <>
          <div className="mb-8 p-4 bg-vida-50 rounded-xl border border-vida-200">
            <div className="flex items-center gap-2 mb-3">
              <AnimatedIcon icon={Sparkles} animation="draw" trigger="mount" size={20} className="w-5 h-5 text-vida-600" aria-hidden="true" />
              <span className="font-semibold text-vida-800">{t('login.demo')}</span>
            </div>
            <p className="text-sm text-vida-600 mb-4">
              {t('login.demoDescription')}
            </p>
            <div className="space-y-2">
              {DEMO_USERS.map((demoUser, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleDemoLogin(demoUser)}
                  disabled={isLoading}
                  className={`w-full flex items-center gap-3 p-3 bg-gradient-to-r ${demoUser.color} text-white rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg disabled:opacity-50`}
                >
                  <User className="w-5 h-5" aria-hidden="true" />
                  <div className="flex-1 text-left">
                    <div className="font-medium">{demoUser.name}</div>
                    <div className="text-xs opacity-90">{demoUser.description}</div>
                  </div>
                  <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{demoUser.plan}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-vida-200">
              <Link
                to="/admin/login"
                className="flex items-center justify-center gap-2 text-sm text-vida-700 hover:text-vida-900 font-medium"
              >
                <AnimatedIcon icon={Shield} animation="draw" trigger="mount" size={16} className="w-4 h-4" aria-hidden="true" />
                {t('login.adminAccess')}
              </Link>
            </div>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">{t('login.orCredentials')}</span>
            </div>
          </div>
        </>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            {t('login.email')}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" aria-hidden="true">
              <Mail className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className={`input pl-10 ${errors.email ? 'input-error' : ''}`}
              placeholder={t('login.emailPlaceholder')}
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-sm text-red-600 flex items-center gap-1" role="alert">
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Botón de login biométrico - aparece si hay credenciales */}
        {hasBiometric && isWebAuthnSupported && (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={isBiometricLoading || isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBiometricLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                  <span>{t('login.biometricVerifying')}</span>
                </>
              ) : (
                <>
                  <AnimatedIcon icon={Fingerprint} animation="pulse" trigger="hover" size={24} className="w-6 h-6" aria-hidden="true" />
                  <span className="font-medium">{t('login.biometric')}</span>
                </>
              )}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">{t('login.orPassword')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            {t('login.password')}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" aria-hidden="true">
              <Lock className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
              className={`input pl-10 pr-10 ${errors.password ? 'input-error' : ''}`}
              placeholder={t('login.passwordPlaceholder')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              aria-label={showPassword ? t('login.hidePassword', { defaultValue: 'Ocultar contraseña' }) : t('login.showPassword', { defaultValue: 'Mostrar contraseña' })}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" aria-hidden="true" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" aria-hidden="true" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-sm text-red-600 flex items-center gap-1" role="alert">
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Forgot password */}
        <div className="flex items-center justify-end">
          <Link
            to="/forgot-password"
            className="text-sm text-vida-600 hover:text-vida-700 font-medium"
          >
            {t('login.forgotPassword')}
          </Link>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || isBiometricLoading}
          className="btn-primary w-full py-3"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
              {t('login.submitting')}
            </div>
          ) : (
            t('login.submit')
          )}
        </button>
      </form>

      {/* Mensaje informativo sobre biometría */}
      {isWebAuthnSupported && !hasBiometric && emailValue && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 text-center">
            <Fingerprint className="w-4 h-4 inline mr-1" aria-hidden="true" />
            {t('login.biometricSetupHint')}
          </p>
        </div>
      )}

      {/* Register link */}
      <p className="mt-8 text-center text-gray-600">
        {t('login.noAccount')}{' '}
        <Link to="/register" className="text-vida-600 hover:text-vida-700 font-medium">
          {t('login.registerLink')}
        </Link>
      </p>
    </div>
  );
}
