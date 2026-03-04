/**
 * Tests for usePushNotifications hook.
 *
 * Strategy:
 *  - The hook lives entirely in browser APIs (Notification, serviceWorker, sessionStorage).
 *  - We stub all of those at module-level so jsdom doesn't break.
 *  - We test state transitions via renderHook from @testing-library/react.
 *
 * Covered areas:
 *  - Initial state (permission, supported, notifications from sessionStorage)
 *  - requestPermission (granted, denied, unsupported)
 *  - addNotification (queue builds up, unreadCount, TTL-filtered load)
 *  - markAsRead / markAllAsRead
 *  - clearNotification / clearAllNotifications
 *  - showNotification (permission guard, adds to internal list)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePushNotifications } from '../usePushNotifications';

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------

// Notification API
const mockRequestPermission = vi.fn();
const mockNotificationConstructor = vi.fn();

Object.defineProperty(global, 'Notification', {
  writable: true,
  configurable: true,
  value: Object.assign(mockNotificationConstructor, {
    permission: 'default' as NotificationPermission,
    requestPermission: mockRequestPermission,
  }),
});

// serviceWorker
const mockSwAddEventListener = vi.fn();
const mockSwRemoveEventListener = vi.fn();
const mockSwRegister = vi.fn();

Object.defineProperty(global.navigator, 'serviceWorker', {
  writable: true,
  configurable: true,
  value: {
    register: mockSwRegister,
    addEventListener: mockSwAddEventListener,
    removeEventListener: mockSwRemoveEventListener,
    controller: null,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trigger a message event from the service worker */
function dispatchSwMessage(data: unknown) {
  const handler = mockSwAddEventListener.mock.calls.find(
    ([event]: string[]) => event === 'message'
  )?.[1];
  if (handler) {
    handler({ data } as MessageEvent);
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();

  // Reset Notification.permission to 'default'
  Object.assign(Notification, { permission: 'default' });

  // serviceWorker.register → resolves to a registration object without an active SW
  mockSwRegister.mockResolvedValue({
    active: null,
    installing: null,
    addEventListener: vi.fn(),
  });

  mockRequestPermission.mockResolvedValue('default');
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePushNotifications – initial state', () => {
  it('starts with an empty notifications list and unreadCount 0', () => {
    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('detects browser support (Notification + serviceWorker both present)', () => {
    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.supported).toBe(true);
  });

  it('reads initial permission from Notification.permission', () => {
    Object.assign(Notification, { permission: 'granted' });

    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.permission).toBe('granted');
  });

  it('loads persisted notifications from sessionStorage (within TTL)', () => {
    const now = Date.now();
    const stored = [
      {
        id: 'stored-1',
        type: 'SYSTEM',
        title: 'Stored title',
        body: 'Stored body',
        read: false,
        createdAt: new Date(now - 1000).toISOString(), // 1 second ago — within TTL
      },
    ];
    sessionStorage.setItem('vida_notifications', JSON.stringify(stored));

    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Stored title');
    expect(result.current.unreadCount).toBe(1);
  });

  it('filters out expired notifications from sessionStorage (beyond TTL)', () => {
    const HOUR_MS = 60 * 60 * 1000;
    const old = Date.now() - HOUR_MS - 1000; // just over 1 hour ago
    const stored = [
      {
        id: 'old-1',
        type: 'SYSTEM',
        title: 'Expired',
        body: 'Old body',
        read: false,
        createdAt: new Date(old).toISOString(),
      },
    ];
    sessionStorage.setItem('vida_notifications', JSON.stringify(stored));

    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.notifications).toHaveLength(0);
  });
});

describe('usePushNotifications – requestPermission', () => {
  it('returns granted and updates permission state', async () => {
    mockRequestPermission.mockResolvedValue('granted');

    const { result } = renderHook(() => usePushNotifications());

    let returned: NotificationPermission | undefined;
    await act(async () => {
      returned = await result.current.requestPermission();
    });

    expect(returned).toBe('granted');
    expect(result.current.permission).toBe('granted');
  });

  it('returns denied when user declines', async () => {
    mockRequestPermission.mockResolvedValue('denied');

    const { result } = renderHook(() => usePushNotifications());

    let returned: NotificationPermission | undefined;
    await act(async () => {
      returned = await result.current.requestPermission();
    });

    expect(returned).toBe('denied');
    expect(result.current.permission).toBe('denied');
  });

  it('returns denied when notifications are not supported', async () => {
    // Temporarily remove Notification from window
    const originalNotification = (global as any).Notification;
    delete (global as any).Notification;

    // Rebuild hook without Notification in scope
    const { result } = renderHook(() => usePushNotifications());

    let returned: NotificationPermission | undefined;
    await act(async () => {
      returned = await result.current.requestPermission();
    });

    expect(returned).toBe('denied');

    // Restore
    (global as any).Notification = originalNotification;
  });
});

describe('usePushNotifications – addNotification', () => {
  it('prepends a new notification and increments unreadCount', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({
        type: 'SYSTEM',
        title: 'Test title',
        body: 'Test body',
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Test title');
    expect(result.current.notifications[0].read).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it('assigns unique ids to each notification', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({ type: 'SYSTEM', title: 'A', body: '' });
      result.current.addNotification({ type: 'PANIC_ALERT', title: 'B', body: '' });
    });

    const [first, second] = result.current.notifications;
    expect(first.id).toBeDefined();
    expect(second.id).toBeDefined();
    expect(first.id).not.toBe(second.id);
  });

  it('prepends so the newest notification is first', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({ type: 'SYSTEM', title: 'First', body: '' });
      result.current.addNotification({ type: 'SYSTEM', title: 'Second', body: '' });
    });

    expect(result.current.notifications[0].title).toBe('Second');
    expect(result.current.notifications[1].title).toBe('First');
  });

  it('stores optional data payload', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({
        type: 'QR_ACCESS',
        title: 'QR scan',
        body: 'Someone scanned your QR',
        data: { accessorName: 'Dr. García' },
      });
    });

    expect(result.current.notifications[0].data).toEqual({ accessorName: 'Dr. García' });
  });
});

describe('usePushNotifications – markAsRead', () => {
  it('marks a specific notification as read', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({ type: 'SYSTEM', title: 'N1', body: '' });
      result.current.addNotification({ type: 'SYSTEM', title: 'N2', body: '' });
    });

    const targetId = result.current.notifications[0].id;

    act(() => {
      result.current.markAsRead(targetId);
    });

    const target = result.current.notifications.find((n) => n.id === targetId);
    expect(target?.read).toBe(true);

    // The other notification must remain unread
    const other = result.current.notifications.find((n) => n.id !== targetId);
    expect(other?.read).toBe(false);

    expect(result.current.unreadCount).toBe(1);
  });

  it('is a no-op for an unknown id', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({ type: 'SYSTEM', title: 'N1', body: '' });
    });

    act(() => {
      result.current.markAsRead('non-existent-id');
    });

    expect(result.current.unreadCount).toBe(1);
  });
});

describe('usePushNotifications – markAllAsRead', () => {
  it('marks every notification as read and resets unreadCount to 0', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({ type: 'SYSTEM', title: 'A', body: '' });
      result.current.addNotification({ type: 'PANIC_ALERT', title: 'B', body: '' });
      result.current.addNotification({ type: 'QR_ACCESS', title: 'C', body: '' });
    });

    expect(result.current.unreadCount).toBe(3);

    act(() => {
      result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);
    result.current.notifications.forEach((n) => {
      expect(n.read).toBe(true);
    });
  });
});

describe('usePushNotifications – clearNotification', () => {
  it('removes a notification by id', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({ type: 'SYSTEM', title: 'Keep', body: '' });
      result.current.addNotification({ type: 'SYSTEM', title: 'Remove', body: '' });
    });

    const removeId = result.current.notifications[0].id; // newest = "Remove"

    act(() => {
      result.current.clearNotification(removeId);
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Keep');
  });

  it('is a no-op for an unknown id', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({ type: 'SYSTEM', title: 'Keep', body: '' });
    });

    act(() => {
      result.current.clearNotification('bogus-id');
    });

    expect(result.current.notifications).toHaveLength(1);
  });
});

describe('usePushNotifications – clearAllNotifications', () => {
  it('empties the notifications list', () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({ type: 'SYSTEM', title: 'A', body: '' });
      result.current.addNotification({ type: 'SYSTEM', title: 'B', body: '' });
    });

    expect(result.current.notifications).toHaveLength(2);

    act(() => {
      result.current.clearAllNotifications();
    });

    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });
});

describe('usePushNotifications – showNotification permission guard', () => {
  it('does not call Notification constructor when permission is not granted', () => {
    Object.assign(Notification, { permission: 'default' });

    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.showNotification('Should not show');
    });

    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });

  it('does NOT add to internal list when permission is not granted (early return)', () => {
    // The hook returns early at "No hay permiso" before calling addNotification
    Object.assign(Notification, { permission: 'default' });

    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.showNotification('Silent notification', { body: 'body text', type: 'SYSTEM' });
    });

    // showNotification bails out early when permission !== 'granted'
    expect(result.current.notifications).toHaveLength(0);
  });

  it('adds to internal list AND shows system notification when permission is granted', async () => {
    // Grant permission first via requestPermission
    mockRequestPermission.mockResolvedValue('granted');

    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.permission).toBe('granted');

    act(() => {
      result.current.showNotification('Visible notification', { body: 'body text', type: 'SYSTEM' });
    });

    // showNotification calls addNotification internally, so list grows
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Visible notification');
  });
});

describe('usePushNotifications – service worker message handling', () => {
  it('marks notification as read when SW sends NOTIFICATION_CLICKED', async () => {
    const { result } = renderHook(() => usePushNotifications());

    act(() => {
      result.current.addNotification({ type: 'SYSTEM', title: 'Clickable', body: '' });
    });

    const notificationId = result.current.notifications[0].id;
    expect(result.current.notifications[0].read).toBe(false);

    act(() => {
      dispatchSwMessage({ type: 'NOTIFICATION_CLICKED', data: { notificationId } });
    });

    expect(result.current.notifications[0].read).toBe(true);
  });
});
