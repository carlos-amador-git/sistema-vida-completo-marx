// src/components/admin/pages/AdminLogin.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAdminAuth } from '../../../context/AdminAuthContext';

// Credenciales demo eliminadas del bundle de producción via Vite tree-shaking
// cuando VITE_ENABLE_DEMO_MODE !== 'true' (controlado por __DEMO_ENABLED__ en vite.config.ts)
const DEMO_ADMINS = __DEMO_ENABLED__ ? [
  {
    email: 'superadmin@sistemavida.mx',
    password: 'Admin123!',
    name: 'Super Admin',
    role: 'SUPER_ADMIN',
    descriptionKey: 'demo_admins.super_admin_desc',
    color: 'from-rose-500 to-red-600',
  },
  {
    email: 'admin@sistemavida.mx',
    password: 'Admin123!',
    name: 'Administrador',
    role: 'ADMIN',
    descriptionKey: 'demo_admins.admin_desc',
    color: 'from-sky-500 to-blue-600',
  },
  {
    email: 'viewer@sistemavida.mx',
    password: 'Admin123!',
    name: 'Visor',
    role: 'VIEWER',
    descriptionKey: 'demo_admins.viewer_desc',
    color: 'from-slate-500 to-gray-600',
  },
] : null;

const AdminLogin: React.FC = () => {
  const { t } = useTranslation('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login, isAuthenticated, isLoading: authLoading } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/admin/dashboard');
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/admin/dashboard');
    } catch (err: any) {
      setError(err.message || t('login.error_default'));
    } finally {
      setIsLoading(false);
    }
  };

  // Login con admin demo
  const handleDemoLogin = async (demoAdmin: { email: string; password: string; name: string; role: string; descriptionKey: string; color: string }) => {
    setError('');
    setIsLoading(true);

    try {
      await login(demoAdmin.email, demoAdmin.password);
      navigate('/admin/dashboard');
    } catch (err: any) {
      setError(err.message || t('login.error_default'));
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-sky-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-sky-500/30">
            <span className="text-white font-bold text-3xl">V</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Sistema VIDA</h1>
          <p className="text-slate-400">{t('login.subtitle')}</p>
        </div>

        {/* Login form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-white/20">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error message */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('login.email_label')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  placeholder={t('login.email_placeholder')}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('login.password_label')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-12 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  placeholder={t('login.password_placeholder')}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5 text-slate-400 hover:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-slate-400 hover:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-500/50 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('login.submitting')}
                </>
              ) : (
                <>
                  {t('login.submit')}
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Sección de Demo - Acceso Rápido (solo visible si __DEMO_ENABLED__) */}
          {__DEMO_ENABLED__ && DEMO_ADMINS && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <span className="font-semibold text-white">{t('login.demo_section')}</span>
              </div>
              <div className="space-y-2">
                {DEMO_ADMINS.map((admin, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleDemoLogin(admin)}
                    disabled={isLoading}
                    className={`w-full flex items-center gap-3 p-3 bg-gradient-to-r ${admin.color} text-white rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg disabled:opacity-50`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <div className="flex-1 text-left">
                      <div className="font-medium">{admin.name}</div>
                      <div className="text-xs opacity-80">{t(`login.${admin.descriptionKey}`)}</div>
                    </div>
                    <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{admin.role}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 text-center">
                <Link
                  to="/login"
                  className="text-sm text-sky-400 hover:text-sky-300 font-medium"
                >
                  {t('login.user_login_link')}
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-sm mt-6">
          {t('login.footer', { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
