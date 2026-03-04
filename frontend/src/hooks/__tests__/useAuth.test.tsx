/**
 * Tests for the useAuth hook (AuthContext).
 *
 * Strategy:
 *  - Mount the real AuthProvider with a mocked authApi so no HTTP requests are made.
 *  - Use renderHook with a wrapper to get access to the hook's return value.
 *  - Each test group exercises a distinct concern: initial state, login, MFA flow,
 *    logout, registration, and the refreshUser helper.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any imports that might trigger them
// ---------------------------------------------------------------------------

vi.mock('../../services/api', () => ({
  authApi: {
    getMe: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock('../../i18n/config', () => ({
  default: {
    changeLanguage: vi.fn(),
    language: 'es',
    t: (key: string) => key,
    on: vi.fn(),
    off: vi.fn(),
    isInitialized: true,
  },
}));

vi.mock('i18next', () => ({
  default: {
    changeLanguage: vi.fn(),
    language: 'es',
    t: (key: string) => key,
  },
  t: (key: string) => key,
}));

// ---------------------------------------------------------------------------
// localStorage stub — jsdom's localStorage can be locked in some vitest
// configurations. We replace it with a simple in-memory map so that
// AuthContext.syncLanguageFromUser(user) can call setItem without throwing.
// ---------------------------------------------------------------------------

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); }),
  get length() { return Object.keys(localStorageStore).length; },
  key: vi.fn((index: number) => Object.keys(localStorageStore)[index] ?? null),
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// ---------------------------------------------------------------------------
// Imports — after mocks are declared so Vitest hoists them correctly
// ---------------------------------------------------------------------------

import { AuthProvider, useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api';
import type { User } from '../../types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockUser: User = {
  id: 'user-1',
  email: 'test@vida.mx',
  name: 'Juan Pérez',
  curp: 'PERJ800101HDFRRN01',
  isVerified: true,
  hasProfile: true,
  preferredLanguage: 'es',
};

const mockAuthApi = authApi as unknown as {
  getMe: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('useAuth – throws outside provider', () => {
  it('throws a descriptive error when used without AuthProvider', () => {
    // renderHook without a wrapper means no context is provided
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth debe usarse dentro de un AuthProvider');
  });
});

describe('useAuth – initial state (unauthenticated)', () => {
  beforeEach(() => {
    // getMe fails on mount → user stays null, loading resolves to false
    mockAuthApi.getMe.mockResolvedValue({ success: false, data: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts with isLoading = true before getMe resolves', async () => {
    // Freeze the promise so we can inspect the loading state
    let resolveFn!: (v: unknown) => void;
    mockAuthApi.getMe.mockReturnValue(new Promise((r) => { resolveFn = r; }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();

    // Resolve to avoid act() warnings
    await act(async () => {
      resolveFn({ success: false, data: null });
    });
  });

  it('is unauthenticated once getMe returns a non-success response', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.pendingMFA).toBeNull();
  });

  it('is unauthenticated when getMe throws', async () => {
    mockAuthApi.getMe.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});

describe('useAuth – login flow', () => {
  beforeEach(() => {
    mockAuthApi.getMe.mockResolvedValue({ success: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets user and isAuthenticated after a successful login', async () => {
    mockAuthApi.login.mockResolvedValue({
      success: true,
      data: { user: mockUser },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login({ email: 'test@vida.mx', password: 'secret' });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.pendingMFA).toBeNull();
  });

  it('throws when the API returns success: false', async () => {
    mockAuthApi.login.mockResolvedValue({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales incorrectas' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login({ email: 'test@vida.mx', password: 'wrong' });
      })
    ).rejects.toThrow('Credenciales incorrectas');

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('throws when the API call itself rejects', async () => {
    mockAuthApi.login.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login({ email: 'test@vida.mx', password: 'secret' });
      })
    ).rejects.toThrow('Network failure');
  });
});

describe('useAuth – MFA flow', () => {
  beforeEach(() => {
    mockAuthApi.getMe.mockResolvedValue({ success: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets pendingMFA challenge when server requires MFA', async () => {
    mockAuthApi.login.mockResolvedValue({
      success: true,
      data: { requiresMFA: true, mfaToken: 'mfa-temp-token-123' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let returnedChallenge: unknown;
    await act(async () => {
      returnedChallenge = await result.current.login({ email: 'test@vida.mx', password: 'secret' });
    });

    expect(returnedChallenge).toEqual({ requiresMFA: true, mfaToken: 'mfa-temp-token-123' });
    expect(result.current.pendingMFA).toEqual({ requiresMFA: true, mfaToken: 'mfa-temp-token-123' });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('completes MFA and authenticates the user', async () => {
    mockAuthApi.login.mockResolvedValue({
      success: true,
      data: { requiresMFA: true, mfaToken: 'mfa-temp-token-123' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login({ email: 'test@vida.mx', password: 'secret' });
    });

    const challenge = result.current.pendingMFA!;

    await act(async () => {
      result.current.completeMFA(challenge, mockUser);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.pendingMFA).toBeNull();
  });

  it('clearMFA resets pendingMFA without logging in', async () => {
    mockAuthApi.login.mockResolvedValue({
      success: true,
      data: { requiresMFA: true, mfaToken: 'mfa-temp-token-123' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login({ email: 'test@vida.mx', password: 'secret' });
    });

    expect(result.current.pendingMFA).not.toBeNull();

    act(() => {
      result.current.clearMFA();
    });

    expect(result.current.pendingMFA).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('useAuth – logout flow', () => {
  beforeEach(() => {
    // Start authenticated
    mockAuthApi.getMe.mockResolvedValue({ success: true, data: { user: mockUser } });
    mockAuthApi.logout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears user and isAuthenticated after logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.pendingMFA).toBeNull();
  });

  it('still clears user even when the API logout call throws', async () => {
    mockAuthApi.logout.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    // logout() swallows API errors but still clears local state
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});

describe('useAuth – register flow', () => {
  beforeEach(() => {
    mockAuthApi.getMe.mockResolvedValue({ success: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets user after successful registration', async () => {
    mockAuthApi.register.mockResolvedValue({
      success: true,
      data: { user: mockUser },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.register({
        email: 'test@vida.mx',
        password: 'Passw0rd!',
        curp: 'PERJ800101HDFRRN01',
        name: 'Juan Pérez',
      });
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('throws when registration API returns success: false', async () => {
    mockAuthApi.register.mockResolvedValue({
      success: false,
      error: { code: 'EMAIL_IN_USE', message: 'El correo ya está registrado' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.register({
          email: 'existing@vida.mx',
          password: 'Passw0rd!',
          curp: 'PERJ800101HDFRRN01',
          name: 'Juan Pérez',
        });
      })
    ).rejects.toThrow('El correo ya está registrado');
  });
});

describe('useAuth – refreshUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates user when manually calling refreshUser after initial unauthenticated mount', async () => {
    // Initial mount returns no user
    mockAuthApi.getMe.mockResolvedValueOnce({ success: false });
    // Second call (explicit refreshUser) returns the user
    mockAuthApi.getMe.mockResolvedValueOnce({ success: true, data: { user: mockUser } });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();

    await act(async () => {
      await result.current.refreshUser();
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('clears user when getMe returns success: false on refresh', async () => {
    // Mount returns the user (authenticated)
    mockAuthApi.getMe.mockResolvedValueOnce({ success: true, data: { user: mockUser } });
    // Explicit refresh call — token expired
    mockAuthApi.getMe.mockResolvedValueOnce({ success: false });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.refreshUser();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('useAuth – loginWithTokens', () => {
  beforeEach(() => {
    mockAuthApi.getMe.mockResolvedValue({ success: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets user immediately without an API call', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.loginWithTokens(mockUser, {
        accessToken: 'access-tok',
        refreshToken: 'refresh-tok',
      });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
  });
});
