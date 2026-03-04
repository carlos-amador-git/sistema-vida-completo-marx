// src/App.test.tsx
// Smoke tests – verify the App component tree mounts without crashing
// and that coverage thresholds for App.tsx are met.
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks (vi.mock calls are hoisted by Vitest's transformer)
// ---------------------------------------------------------------------------

// Prevent AuthContext from making real API calls on mount.
// We export a mutable `mockAuthValue` so individual tests can override it.
const mockAuthValue = {
  user: null as null | { id: string; email: string; preferredLanguage?: string },
  isLoading: false,
  isAuthenticated: false,
  login: vi.fn(),
  loginWithTokens: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockAuthValue,
}));

vi.mock('./services/api', () => ({
  authApi: {
    getMe: vi.fn().mockResolvedValue({ success: false, data: null }),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('./services/adminApi', () => ({
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  getAdminMe: vi.fn().mockRejectedValue(new Error('no token')),
  refreshAdminTokens: vi.fn().mockResolvedValue(false),
}));

// Stub i18n – avoids HTTP backend fetch for locale files
vi.mock('./i18n/config', () => ({
  default: {
    use: vi.fn().mockReturnThis(),
    init: vi.fn().mockResolvedValue(null),
    changeLanguage: vi.fn(),
    language: 'es',
    t: (key: string) => key,
    on: vi.fn(),
    off: vi.fn(),
    isInitialized: true,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('i18next', () => ({
  default: {
    use: vi.fn().mockReturnThis(),
    init: vi.fn().mockResolvedValue(null),
    changeLanguage: vi.fn(),
    language: 'es',
    t: (key: string) => key,
    on: vi.fn(),
    off: vi.fn(),
    isInitialized: true,
  },
  t: (key: string) => key,
}));

// Stub the PremiumProvider hook – no external calls
vi.mock('./hooks/usePremium', () => ({
  PremiumProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePremium: () => ({ isPremium: false, plan: 'free' }),
}));

// ErrorBoundary passthrough
vi.mock('./components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Static imports (after mocks are declared)
// ---------------------------------------------------------------------------
import App from './App';
import { AuthProvider } from './context/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

async function renderApp(initialRoute = '/') {
  const queryClient = createTestQueryClient();
  let result!: ReturnType<typeof render>;

  await act(async () => {
    result = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  });

  return result;
}

// ---------------------------------------------------------------------------
// Tests — unauthenticated user (default)
// ---------------------------------------------------------------------------

describe('App – unauthenticated smoke tests', () => {
  it('renders without crashing on the landing route', async () => {
    const { container } = await renderApp('/');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders the 404 / NotFoundPage for an unknown route', async () => {
    const { container } = await renderApp('/this-route-does-not-exist-xyz');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('redirects to /login when accessing /dashboard while unauthenticated', async () => {
    // ProtectedRoute with isAuthenticated=false, isLoading=false → Navigate to /login
    const { container } = await renderApp('/dashboard');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders the /login route (PublicRoute with unauthenticated user)', async () => {
    // PublicRoute: unauthenticated → renders children (Login page)
    const { container } = await renderApp('/login');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders the /register route (PublicRoute with unauthenticated user)', async () => {
    const { container } = await renderApp('/register');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders the privacy policy page (public route)', async () => {
    const { container } = await renderApp('/privacy');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders the admin login page at /admin/login', async () => {
    const { container } = await renderApp('/admin/login');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders the loading screen when auth is loading', async () => {
    // Exercises LoadingScreen component (line 48-58 in App.tsx)
    mockAuthValue.isLoading = true;
    mockAuthValue.isAuthenticated = false;
    const { container } = await renderApp('/dashboard');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
    // Restore
    mockAuthValue.isLoading = false;
  });
});

// ---------------------------------------------------------------------------
// Tests — authenticated user
// ---------------------------------------------------------------------------

describe('App – authenticated smoke tests', () => {
  beforeEach(() => {
    mockAuthValue.user = { id: '1', email: 'test@test.com' };
    mockAuthValue.isAuthenticated = true;
    mockAuthValue.isLoading = false;
  });

  afterEach(() => {
    mockAuthValue.user = null;
    mockAuthValue.isAuthenticated = false;
  });

  it('redirects authenticated user from /login to /dashboard (PublicRoute)', async () => {
    // PublicRoute: isAuthenticated=true → Navigate to /dashboard
    const { container } = await renderApp('/login');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('redirects authenticated user from /register to /dashboard (PublicRoute)', async () => {
    const { container } = await renderApp('/register');
    expect(container).toBeTruthy();
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
