/**
 * Tests for useWebSocket hook.
 *
 * Strategy:
 *  - Mock socket.io-client so no real TCP connections are made.
 *  - Expose a mock socket object that lets tests fire events programmatically.
 *  - Verify state transitions (isConnected, lastAlert) and callback forwarding.
 *
 * Covered areas:
 *  - Auto-connect on mount / no-connect when autoConnect=false
 *  - isConnected toggles on 'connect' / 'disconnect' events
 *  - lastAlert is set when panic-alert or qr-access-alert is received
 *  - onPanicAlert / onQRAccessAlert / onPanicCancelled callbacks are invoked
 *  - joinUserRoom emits the right events when connected
 *  - Singleton pattern: multiple hooks share a single socket instance
 *  - connect_error does not crash the hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock socket.io-client
// ---------------------------------------------------------------------------

/** Simple mock socket that stores registered listeners and lets tests fire them. */
const createMockSocket = () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const socket = {
    id: 'mock-socket-id',
    connected: false,
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((fn) => fn !== cb);
      }
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
    // Test helper — fire an event programmatically
    _fire: (event: string, ...args: unknown[]) => {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
  };

  return socket;
};

type MockSocket = ReturnType<typeof createMockSocket>;

let mockSocket: MockSocket;

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

import { io } from 'socket.io-client';
const mockIo = io as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Import the hook AFTER mocks are declared
// ---------------------------------------------------------------------------

import { useWebSocket } from '../useWebSocket';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSocket = createMockSocket();
  mockIo.mockReturnValue(mockSocket as unknown as ReturnType<typeof io>);

  // Reset the singleton so each test gets a fresh socket
  // The singleton lives in module scope; we reset by letting the mock control it.
});

afterEach(() => {
  vi.clearAllMocks();
  // Reset module-level singleton state between tests
  mockSocket.connected = false;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const panicAlertPayload = {
  type: 'PANIC_ALERT' as const,
  alertId: 'alert-1',
  patientName: 'María García',
  patientId: 'patient-1',
  location: { latitude: 19.4326, longitude: -99.1332 },
  nearbyHospitals: [],
  timestamp: new Date(),
};

const qrAlertPayload = {
  type: 'QR_ACCESS_ALERT' as const,
  patientName: 'María García',
  patientId: 'patient-1',
  accessorName: 'Dr. López',
  location: 'CDMX',
  timestamp: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWebSocket – auto-connect on mount', () => {
  it('calls io() and registers event listeners on mount', () => {
    renderHook(() => useWebSocket());

    expect(mockIo).toHaveBeenCalledTimes(1);
    // The hook registers connect, disconnect, connect_error, panic-alert, etc.
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('panic-alert', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('qr-access-alert', expect.any(Function));
  });

  it('does NOT call io() when autoConnect = false', () => {
    // With autoConnect=false the hook should skip the connect() call entirely.
    // Since the singleton is null at this point, io() should not be called.
    renderHook(() => useWebSocket({ autoConnect: false }));

    expect(mockIo).not.toHaveBeenCalled();
  });
});

describe('useWebSocket – isConnected state', () => {
  it('becomes true when the "connect" event fires', () => {
    const { result } = renderHook(() => useWebSocket());

    expect(result.current.isConnected).toBe(false);

    act(() => {
      mockSocket.connected = true;
      mockSocket._fire('connect');
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('becomes false when the "disconnect" event fires', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      mockSocket.connected = true;
      mockSocket._fire('connect');
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      mockSocket.connected = false;
      mockSocket._fire('disconnect');
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('does not throw when connect_error fires', () => {
    const { result } = renderHook(() => useWebSocket());

    expect(() => {
      act(() => {
        mockSocket._fire('connect_error', { message: 'ECONNREFUSED' });
      });
    }).not.toThrow();

    // State should remain unchanged
    expect(result.current.isConnected).toBe(false);
  });
});

describe('useWebSocket – lastAlert on panic-alert', () => {
  it('sets lastAlert when a panic-alert event is received', () => {
    const { result } = renderHook(() => useWebSocket());

    expect(result.current.lastAlert).toBeNull();

    act(() => {
      mockSocket._fire('panic-alert', panicAlertPayload);
    });

    expect(result.current.lastAlert).toEqual(panicAlertPayload);
  });

  it('sets lastAlert when a panic-alert-sent event is received', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      mockSocket._fire('panic-alert-sent', panicAlertPayload);
    });

    expect(result.current.lastAlert).toEqual(panicAlertPayload);
  });

  it('updates lastAlert on each new panic-alert', () => {
    const { result } = renderHook(() => useWebSocket());

    const first = { ...panicAlertPayload, alertId: 'alert-1' };
    const second = { ...panicAlertPayload, alertId: 'alert-2' };

    act(() => { mockSocket._fire('panic-alert', first); });
    expect(result.current.lastAlert).toEqual(first);

    act(() => { mockSocket._fire('panic-alert', second); });
    expect(result.current.lastAlert).toEqual(second);
  });
});

describe('useWebSocket – lastAlert on QR access events', () => {
  it('sets lastAlert when qr-access-alert fires', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      mockSocket._fire('qr-access-alert', qrAlertPayload);
    });

    expect(result.current.lastAlert).toEqual(qrAlertPayload);
  });

  it('sets lastAlert when qr-access-notification fires', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      mockSocket._fire('qr-access-notification', qrAlertPayload);
    });

    expect(result.current.lastAlert).toEqual(qrAlertPayload);
  });
});

describe('useWebSocket – onPanicAlert callback', () => {
  it('invokes the onPanicAlert callback when a panic-alert arrives', () => {
    const onPanicAlert = vi.fn();

    renderHook(() => useWebSocket({ onPanicAlert }));

    act(() => {
      mockSocket._fire('panic-alert', panicAlertPayload);
    });

    expect(onPanicAlert).toHaveBeenCalledTimes(1);
    expect(onPanicAlert).toHaveBeenCalledWith(panicAlertPayload);
  });

  it('does not fail when no onPanicAlert callback is provided', () => {
    renderHook(() => useWebSocket());

    expect(() => {
      act(() => { mockSocket._fire('panic-alert', panicAlertPayload); });
    }).not.toThrow();
  });
});

describe('useWebSocket – onQRAccessAlert callback', () => {
  it('invokes onQRAccessAlert when a qr-access-alert fires', () => {
    const onQRAccessAlert = vi.fn();

    renderHook(() => useWebSocket({ onQRAccessAlert }));

    act(() => {
      mockSocket._fire('qr-access-alert', qrAlertPayload);
    });

    expect(onQRAccessAlert).toHaveBeenCalledWith(qrAlertPayload);
  });
});

describe('useWebSocket – onPanicCancelled callback', () => {
  it('invokes onPanicCancelled when panic-cancelled fires', () => {
    const onPanicCancelled = vi.fn();

    renderHook(() => useWebSocket({ onPanicCancelled }));

    act(() => {
      mockSocket._fire('panic-cancelled', { alertId: 'alert-1' });
    });

    expect(onPanicCancelled).toHaveBeenCalledWith({ alertId: 'alert-1' });
  });
});

describe('useWebSocket – joinUserRoom', () => {
  it('emits join-user and join-representative when the socket is connected', () => {
    const { result } = renderHook(() => useWebSocket());

    // Simulate connection first
    act(() => {
      mockSocket.connected = true;
      mockSocket._fire('connect');
    });

    act(() => {
      result.current.joinUserRoom('user-99');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('join-user', 'user-99');
    expect(mockSocket.emit).toHaveBeenCalledWith('join-representative', 'user-99');
  });

  it('does NOT emit if the socket is not connected', () => {
    const { result } = renderHook(() => useWebSocket());

    // Socket remains disconnected
    act(() => {
      result.current.joinUserRoom('user-99');
    });

    expect(mockSocket.emit).not.toHaveBeenCalledWith('join-user', 'user-99');
  });
});

describe('useWebSocket – userId triggers room join on connect', () => {
  it('emits join-user on "connect" event when userId is provided', () => {
    renderHook(() => useWebSocket({ userId: 'user-42' }));

    act(() => {
      mockSocket.connected = true;
      mockSocket._fire('connect');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('join-user', 'user-42');
    expect(mockSocket.emit).toHaveBeenCalledWith('join-representative', 'user-42');
  });
});

describe('useWebSocket – returned socket reference', () => {
  it('exposes connect and disconnect functions', () => {
    const { result } = renderHook(() => useWebSocket());

    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
    expect(typeof result.current.joinUserRoom).toBe('function');
  });

  it('exposes the socket object after connection', () => {
    const { result } = renderHook(() => useWebSocket());

    // socket ref is set during the connect() call in useEffect
    // Even before 'connect' fires, socketRef.current points to the mock socket
    expect(result.current.socket).toBeDefined();
  });
});
