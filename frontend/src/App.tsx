// src/App.tsx
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useTranslation } from 'react-i18next';

// Layouts — kept as static imports (small, needed on every route)
import MainLayout from './components/layouts/MainLayout';
import AuthLayout from './components/layouts/AuthLayout';

// Context
import { NotificationProvider } from './context/NotificationContext';

// Admin auth context — kept static (guards depend on it before any page renders)
import { AdminAuthProvider, AdminProtectedRoute, useAdminAuth } from './context/AdminAuthContext';
import AdminLayout from './components/admin/layouts/AdminLayout';

// ─── Lazy page imports ─────────────────────────────────────────────────────────

// Public / auth pages
const Landing = lazy(() => import('./components/pages/Landing'));
const Login = lazy(() => import('./components/pages/Login'));
const Register = lazy(() => import('./components/pages/Register'));
const PrivacyPolicy = lazy(() => import('./components/pages/PrivacyPolicy'));
const PrivacyNotice = lazy(() => import('./components/pages/PrivacyNotice'));
const EmergencyView = lazy(() => import('./components/pages/EmergencyView'));

// Protected user pages
const Dashboard = lazy(() => import('./components/pages/Dashboard'));
const Profile = lazy(() => import('./components/pages/Profile'));
const Directives = lazy(() => import('./components/pages/Directives'));
const Representatives = lazy(() => import('./components/pages/Representatives'));
const EmergencyQR = lazy(() => import('./components/pages/EmergencyQR'));
const NFCManager = lazy(() => import('./components/pages/NFCManager'));
const WalletPass = lazy(() => import('./components/pages/WalletPass'));
const AccessHistory = lazy(() => import('./components/pages/AccessHistory'));
const Documents = lazy(() => import('./components/pages/Documents'));
const Notifications = lazy(() => import('./components/pages/Notifications'));
const NotificationSettings = lazy(() => import('./components/pages/NotificationSettings'));
const Subscription = lazy(() => import('./components/pages/Subscription'));
const SubscriptionPlans = lazy(() => import('./components/pages/SubscriptionPlans'));
const SubscriptionSuccess = lazy(() => import('./components/pages/SubscriptionSuccess'));
const MFASetup = lazy(() => import('./components/pages/MFASetup'));

// Admin pages
const AdminLogin = lazy(() => import('./components/admin/pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./components/admin/pages/AdminDashboard'));
const AdminUsers = lazy(() => import('./components/admin/pages/AdminUsers'));
const AdminAuditLog = lazy(() => import('./components/admin/pages/AdminAuditLog'));
const AdminSystemHealth = lazy(() => import('./components/admin/pages/AdminSystemHealth'));
const AdminInstitutions = lazy(() => import('./components/admin/pages/AdminInstitutions'));
const AdminSubscriptions = lazy(() => import('./components/admin/pages/AdminSubscriptions'));

// ─── Loading spinner ───────────────────────────────────────────────────────────

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-vida-50 to-white" role="status" aria-label="Cargando">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-vida-200 border-t-vida-600 rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
      <p className="text-vida-600 font-medium" aria-hidden="true">Cargando...</p>
    </div>
  </div>
);

// ─── Route guards ──────────────────────────────────────────────────────────────

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

const RequirePermission = ({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) => {
  const { hasPermission } = useAdminAuth();

  if (!hasPermission(permission)) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Acceso denegado</h2>
          <p className="text-gray-600">No tienes permiso para acceder a esta sección.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const NotFoundPage = () => {
  const { t } = useTranslation('common');
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50" id="main-content">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-vida-600 mb-4">{t('notFound.title')}</h1>
        <p className="text-gray-600 mb-6">{t('notFound.message')}</p>
        <a href="/" className="btn-primary">
          {t('notFound.backHome')}
        </a>
      </div>
    </main>
  );
};

// ─── App ───────────────────────────────────────────────────────────────────────

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* Landing pública */}
        <Route path="/" element={<Landing />} />

        {/* Rutas de autenticación */}
        <Route element={<AuthLayout />}>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
        </Route>

        {/* Aviso de privacidad legacy */}
        <Route path="/privacy" element={<PrivacyPolicy />} />

        {/* Aviso de privacidad LFPDPPP 2025 (público) */}
        <Route path="/aviso-privacidad" element={<PrivacyNotice />} />

        {/* Acceso de emergencia (público) */}
        <Route path="/emergency/:qrToken" element={<EmergencyView />} />

        {/* Rutas protegidas */}
        <Route
          element={
            <ProtectedRoute>
              <NotificationProvider>
                <MainLayout />
              </NotificationProvider>
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/directives" element={<Directives />} />
          <Route path="/representatives" element={<Representatives />} />
          <Route path="/emergency-qr" element={<EmergencyQR />} />
          <Route path="/nfc" element={<NFCManager />} />
          <Route path="/wallet" element={<WalletPass />} />
          <Route path="/access-history" element={<AccessHistory />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/subscription" element={<Subscription />} />
          <Route path="/subscription/plans" element={<SubscriptionPlans />} />
          <Route path="/subscription/success" element={<SubscriptionSuccess />} />
          <Route path="/mfa-setup" element={<MFASetup />} />
        </Route>

        {/* ==================== RUTAS DE ADMIN ==================== */}

        {/* Login de admin (público) */}
        <Route
          path="/admin/login"
          element={
            <AdminAuthProvider>
              <AdminLogin />
            </AdminAuthProvider>
          }
        />

        {/* Panel de admin (protegido) */}
        <Route
          path="/admin"
          element={
            <AdminAuthProvider>
              <AdminProtectedRoute>
                <AdminLayout />
              </AdminProtectedRoute>
            </AdminAuthProvider>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<RequirePermission permission="metrics:read"><AdminDashboard /></RequirePermission>} />
          <Route path="users" element={<RequirePermission permission="users:read"><AdminUsers /></RequirePermission>} />
          <Route path="institutions" element={<RequirePermission permission="institutions:read"><AdminInstitutions /></RequirePermission>} />
          <Route path="audit" element={<RequirePermission permission="audit:read"><AdminAuditLog /></RequirePermission>} />
          <Route path="subscriptions" element={<RequirePermission permission="metrics:read"><AdminSubscriptions /></RequirePermission>} />
          <Route path="health" element={<RequirePermission permission="health:read"><AdminSystemHealth /></RequirePermission>} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default App;
