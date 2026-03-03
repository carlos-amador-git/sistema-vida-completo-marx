// src/components/pages/Register.tsx
import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, User, Phone, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';

const getRegisterSchema = (t: TFunction) => z.object({
  name: z.string().min(2, t('validation.nameMinLength')),
  email: z.string().email(t('validation.invalidEmail')),
  curp: z.string()
    .length(18, t('validation.curpLength'))
    .regex(/^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$/, t('validation.curpInvalid')),
  phone: z.string().optional(),
  password: z.string()
    .min(8, t('validation.passwordMinLength'))
    .regex(/[A-Z]/, t('validation.passwordUppercase'))
    .regex(/[a-z]/, t('validation.passwordLowercase'))
    .regex(/[0-9]/, t('validation.passwordNumber'))
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, t('validation.passwordSpecial')),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine(val => val === true, t('validation.termsRequired')),
}).refine(data => data.password === data.confirmPassword, {
  message: t('validation.passwordMismatch'),
  path: ['confirmPassword'],
});

type RegisterFormData = {
  name: string;
  email: string;
  curp: string;
  phone?: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
};

export default function Register() {
  const { t } = useTranslation('auth');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const registerSchema = useMemo(() => getRegisterSchema(t), [t]);

  const passwordRequirements = useMemo(() => [
    { regex: /.{8,}/, text: t('passwordStrength.minChars') },
    { regex: /[A-Z]/, text: t('passwordStrength.uppercase') },
    { regex: /[a-z]/, text: t('passwordStrength.lowercase') },
    { regex: /[0-9]/, text: t('passwordStrength.number') },
    { regex: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, text: t('passwordStrength.special') },
  ], [t]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const password = watch('password', '');

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      await registerUser({
        name: data.name,
        email: data.email,
        password: data.password,
        curp: data.curp.toUpperCase(),
        phone: data.phone,
      });
      toast.success(t('register.accountCreated'));
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || t('toast.registerError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('register.title')}</h1>
        <p className="text-gray-600">
          {t('register.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Nombre */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            {t('register.name')}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="name"
              type="text"
              {...register('name')}
              className={`input pl-10 ${errors.name ? 'input-error' : ''}`}
              placeholder={t('register.namePlaceholder')}
            />
          </div>
          {errors.name && (
            <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.name.message}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            {t('register.email')}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="email"
              type="email"
              {...register('email')}
              className={`input pl-10 ${errors.email ? 'input-error' : ''}`}
              placeholder={t('register.emailPlaceholder')}
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.email.message}
            </p>
          )}
        </div>

        {/* CURP */}
        <div>
          <label htmlFor="curp" className="block text-sm font-medium text-gray-700 mb-1">
            {t('register.curp')}
          </label>
          <input
            id="curp"
            type="text"
            maxLength={18}
            {...register('curp')}
            className={`input uppercase ${errors.curp ? 'input-error' : ''}`}
            placeholder={t('register.curpPlaceholder')}
          />
          {errors.curp && (
            <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.curp.message}
            </p>
          )}
        </div>

        {/* Teléfono (opcional) */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            {t('register.phone')} <span className="text-gray-400">{t('register.phoneOptional')}</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Phone className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="phone"
              type="tel"
              {...register('phone')}
              className="input pl-10"
              placeholder={t('register.phonePlaceholder')}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            {t('register.password')}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              className={`input pl-10 pr-10 ${errors.password ? 'input-error' : ''}`}
              placeholder={t('register.passwordPlaceholder')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              )}
            </button>
          </div>
          {/* Password requirements */}
          <div className="mt-2 grid grid-cols-2 gap-1">
            {passwordRequirements.map((req, index) => (
              <div
                key={index}
                className={`flex items-center gap-1 text-xs ${
                  req.regex.test(password) ? 'text-salud-600' : 'text-gray-400'
                }`}
              >
                <CheckCircle className="w-3 h-3" />
                {req.text}
              </div>
            ))}
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            {t('register.confirmPassword')}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              {...register('confirmPassword')}
              className={`input pl-10 ${errors.confirmPassword ? 'input-error' : ''}`}
              placeholder={t('register.passwordPlaceholder')}
            />
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Terms */}
        <div className="flex items-start gap-3">
          <input
            id="acceptTerms"
            type="checkbox"
            {...register('acceptTerms')}
            className="mt-1 h-4 w-4 text-vida-600 focus:ring-vida-500 border-gray-300 rounded"
          />
          <label htmlFor="acceptTerms" className="text-sm text-gray-600">
            {t('register.termsAccept')}{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-vida-600 hover:underline">
              {t('register.termsLink')}
            </a>{' '}
            {t('register.termsAnd')}{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-vida-600 hover:underline">
              {t('register.privacyLink')}
            </a>
          </label>
        </div>
        {errors.acceptTerms && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            {errors.acceptTerms.message}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full py-3"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              {t('register.submitting')}
            </div>
          ) : (
            t('register.submit')
          )}
        </button>
      </form>

      {/* Login link */}
      <p className="mt-6 text-center text-gray-600">
        {t('register.hasAccount')}{' '}
        <Link to="/login" className="text-vida-600 hover:text-vida-700 font-medium">
          {t('register.loginLink')}
        </Link>
      </p>
    </div>
  );
}
