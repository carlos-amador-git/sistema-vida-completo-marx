// src/components/layouts/MainLayout.tsx
import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import {
  Home,
  User,
  FileText,
  Users,
  QrCode,
  History,
  Menu,
  X,
  LogOut,
  Heart,
  Shield,
  CreditCard,
  FolderOpen,
  Bell
} from 'lucide-react';
import PanicButton from '../panic/PanicButton';
import PanicAlertModal from '../panic/PanicAlertModal';
import BottomNav from './BottomNav';
import { panicApi } from '../../services/api';
import LanguageSwitcher from '../LanguageSwitcher';
import { useTranslation } from 'react-i18next';

interface PanicAlertResult {
  alertId: string;
  status: string;
  nearbyHospitals: any[];
  representativesNotified: Array<{
    name: string;
    phone: string;
    smsStatus: 'sent' | 'failed' | 'skipped';
    whatsappStatus: 'sent' | 'failed' | 'skipped';
    emailStatus: 'sent' | 'failed' | 'skipped';
  }>;
  createdAt: string;
}

export default function MainLayout() {
  const { t } = useTranslation('common');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panicResult, setPanicResult] = useState<PanicAlertResult | null>(null);
  const [panicLocation, setPanicLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [panicError, setPanicError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  const navigation = [
    { name: t('nav.home'), href: '/dashboard', icon: Home },
    { name: t('nav.profile'), href: '/profile', icon: User },
    { name: t('nav.directives'), href: '/directives', icon: FileText },
    { name: t('nav.representatives'), href: '/representatives', icon: Users },
    { name: t('nav.documents'), href: '/documents', icon: FolderOpen },
    { name: t('nav.emergencyQR'), href: '/emergency-qr', icon: QrCode },
    { name: t('nav.notifications'), href: '/notifications', icon: Bell },
    { name: t('nav.accessHistory'), href: '/access-history', icon: History },
    { name: t('nav.subscription'), href: '/subscription', icon: CreditCard },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handlePanicActivated = (result: PanicAlertResult & { location?: { lat: number; lng: number } }) => {
    setPanicResult(result);
    // Get current location for map
    navigator.geolocation.getCurrentPosition(
      (pos) => setPanicLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPanicLocation({ lat: 19.4326, lng: -99.1332 }) // Default CDMX
    );
  };

  const handleCancelPanic = async (alertId: string) => {
    try {
      await panicApi.cancel(alertId);
      setPanicResult(null);
    } catch (error) {
      console.error('Error cancelling panic:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-vida-800 focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:font-medium"
      >
        {t('skipToContent')}
      </a>

      {/* Sidebar móvil */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.sidebar_label')}
      >
        <div className="fixed inset-0 bg-gray-900/50" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-xl flex flex-col">
          <div className="flex items-center justify-between h-16 px-6 border-b flex-shrink-0">
            <Link to="/dashboard" className="flex items-center gap-2">
              <Heart className="w-8 h-8 text-vida-600" />
              <span className="text-xl font-bold text-vida-800">VIDA</span>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="p-2" aria-label={t('nav.close_menu')}>
              <X className="w-6 h-6 text-gray-500" aria-hidden="true" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto" aria-label={t('nav.mobile_nav_label')}>
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              const isNotifications = item.href === '/notifications';
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-vida-50 text-vida-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="relative" aria-hidden="true">
                    <item.icon className="w-5 h-5" />
                    {isNotifications && unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </div>
                  {item.name}
                  {isNotifications && unreadCount > 0 && (
                    <span className="sr-only">({unreadCount} {t('nav.unread_notifications')})</span>
                  )}
                </Link>
              );
            })}
          </nav>
          {/* Usuario móvil */}
          <div className="flex-shrink-0 p-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <LanguageSwitcher compact />
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-vida-100">
                <User className="w-5 h-5 text-vida-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { handleLogout(); setSidebarOpen(false); }}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title={t('logoutTitle')}
                aria-label={t('logoutTitle')}
              >
                <LogOut className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
        <div className="flex flex-col flex-1 bg-white border-r">
          {/* Logo */}
          <div className="flex items-center h-16 px-6 border-b">
            <Link to="/dashboard" className="flex items-center gap-2">
              <Heart className="w-8 h-8 text-vida-600" />
              <span className="text-xl font-bold text-vida-800">VIDA</span>
            </Link>
          </div>

          {/* Navegación */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto" aria-label={t('nav.desktop_nav_label')}>
            {navigation.map((item) => {
              const isActive = location.pathname === item.href ||
                              (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
              const isNotifications = item.href === '/notifications';
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-vida-50 text-vida-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="relative" aria-hidden="true">
                    <item.icon className="w-5 h-5" />
                    {isNotifications && unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </div>
                  {item.name}
                  {isNotifications && unreadCount > 0 && (
                    <span className="sr-only">({unreadCount} {t('nav.unread_notifications')})</span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Usuario */}
          <div className="flex-shrink-0 p-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <LanguageSwitcher compact />
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-vida-100">
                <User className="w-5 h-5 text-vida-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title={t('logoutTitle')}
                aria-label={t('logoutTitle')}
              >
                <LogOut className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="lg:pl-72">
        {/* Header móvil */}
        <header className="sticky top-0 z-40 flex items-center h-16 px-4 bg-white border-b lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-500"
            aria-label={t('nav.open_menu')}
            aria-expanded={sidebarOpen}
            aria-controls="mobile-sidebar"
          >
            <Menu className="w-6 h-6" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2 ml-4">
            <Heart className="w-6 h-6 text-vida-600" />
            <span className="text-lg font-bold text-vida-800">VIDA</span>
          </div>
          <div className="ml-auto">
            <LanguageSwitcher compact />
          </div>
        </header>

        {/* Contenido de la página */}
        <main id="main-content" className="p-4 md:p-6 lg:p-8 pb-24 md:pb-6">
          <Outlet />
        </main>

        {/* Footer - hidden on mobile */}
        <footer className="hidden md:block px-4 py-6 mt-8 border-t bg-white">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>{t('footer.encryption')}</span>
            </div>
            <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
          </div>
        </footer>
      </div>

      {/* Bottom Navigation - Mobile only */}
      <BottomNav />

      {/* Panic Button - Fixed position */}
      <PanicButton
        onPanicActivated={handlePanicActivated}
        onError={(error) => setPanicError(error)}
      />

      {/* Panic Alert Modal */}
      {panicResult && panicLocation && (
        <PanicAlertModal
          result={panicResult}
          userLocation={panicLocation}
          onClose={() => setPanicResult(null)}
          onCancel={handleCancelPanic}
        />
      )}

      {/* Error Toast */}
      <div aria-live="assertive" aria-atomic="true" className="pointer-events-none fixed inset-0 z-50">
        {panicError && (
          <div className="pointer-events-auto absolute bottom-6 left-6 bg-red-600 text-white px-6 py-4 rounded-xl shadow-lg max-w-sm" role="alert">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">{t('panicAlert.title')}</p>
                <p className="text-sm text-red-100">{panicError}</p>
              </div>
              <button
                onClick={() => setPanicError(null)}
                className="flex-shrink-0 hover:bg-red-700 p-1 rounded"
                aria-label={t('panicAlert.dismiss')}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
