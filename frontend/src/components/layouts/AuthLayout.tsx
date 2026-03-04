// src/components/layouts/AuthLayout.tsx
import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, Shield, CheckCircle } from 'lucide-react';
import LanguageSwitcher from '../LanguageSwitcher';

export default function AuthLayout() {
  const { t } = useTranslation('auth');

  const features = [
    t('layout.features.identity'),
    t('layout.features.encryption'),
    t('layout.features.emergency'),
    t('layout.features.compliance'),
  ];

  return (
    <div className="min-h-screen flex">
      {/* Panel izquierdo - Info */}
      <aside className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-vida-600 to-vida-800 p-12 flex-col justify-between" aria-label={t('layout.brand_panel_label')}>
        <div>
          <Link to="/" className="flex items-center gap-3">
            <Heart className="w-10 h-10 text-white" />
            <span className="text-2xl font-bold text-white">VIDA</span>
          </Link>
        </div>

        <div className="space-y-8">
          <h1 className="text-4xl font-bold text-white leading-tight">
            {t('layout.heroTitle')}<br />
            {t('layout.heroTitleLine2')}
          </h1>
          <p className="text-vida-100 text-lg">
            {t('layout.heroSubtitle')}
          </p>

          <div className="space-y-4">
            {features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3 text-white">
                <CheckCircle className="w-5 h-5 text-vida-200" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-vida-200 text-sm">
          <Shield className="w-4 h-4" aria-hidden="true" />
          <span>{t('layout.legalNotice')}</span>
        </div>
      </aside>

      {/* Panel derecho - Formulario */}
      <main id="main-content" className="flex-1 flex flex-col p-8 bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md">
            {/* Header: Logo móvil + LanguageSwitcher */}
            <div className="flex items-center justify-between mb-8">
              <div className="lg:hidden">
                <Link to="/" className="flex items-center gap-2">
                  <Heart className="w-10 h-10 text-vida-600" aria-hidden="true" />
                  <span className="text-2xl font-bold text-vida-800">VIDA</span>
                </Link>
              </div>
              <div className="hidden lg:block" />
              <LanguageSwitcher className="border-gray-300 text-gray-600" />
            </div>

            <Outlet />
          </div>
        </div>

        {/* Footer legal */}
        <footer className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            <Shield className="w-3 h-3 inline mr-1 align-middle" aria-hidden="true" />
            Sus datos están protegidos conforme a la{' '}
            <Link
              to="/aviso-privacidad"
              className="text-vida-500 hover:text-vida-700 hover:underline font-medium"
            >
              LFPDPPP — Aviso de Privacidad
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
