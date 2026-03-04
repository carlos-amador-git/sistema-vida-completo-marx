// src/components/panic/PanicButton.test.tsx
//
// Strategy for tests that require the activation flow:
//   1. Use vi.useFakeTimers() to control setInterval/setTimeout.
//   2. Advance timers with act(() => vi.advanceTimersByTime(ms)) — this
//      synchronously flushes pending React state updates.
//   3. Assert IMMEDIATELY after act() — do NOT use waitFor() while
//      fake timers are active, because waitFor() uses setTimeout
//      internally and will hang.
//
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import PanicButton from './PanicButton';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'panic.button.activating': 'Activando alerta...',
        'panic.button.hold_to_activate': 'Mantén presionado para activar',
        'panic.button.holding': 'Mantener presionado...',
        'panic.button.close': 'Cerrar',
        'panic.button.sos_aria_label': 'Activar alerta SOS',
        'panic.button.sos_compact_aria_label': 'Botón SOS',
        'panic.button.expanded_dialog_label': 'Diálogo de emergencia',
        'panic.button.close_aria_label': 'Cerrar diálogo',
        'panic.modal.confirming.title': 'Activando Alerta',
        'panic.modal.confirming.description':
          'Se notificará a tus representantes con tu ubicación actual',
        'panic.modal.confirming.cancel': 'Cancelar',
        'panic.modal.confirming.cancel_aria_label': 'Cancelar alerta',
        'panic.modal.confirming.countdown_announcement':
          `Enviando en ${opts?.count ?? ''} segundos`,
        'panic.button.errors.activation_failed': 'Error al activar alerta de pánico',
        'panic.button.errors.server_error': 'Error del servidor',
        'panic.button.errors.no_data': 'El servidor no devolvió datos',
        'panic.button.errors.invalid_response': 'Respuesta inválida del servidor',
        'panic.button.errors.could_not_activate': 'No se pudo activar la alerta de pánico',
      };
      return map[key] ?? key;
    },
    i18n: { changeLanguage: vi.fn(), language: 'es' },
  }),
}));

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------

const mockVibrate = vi.fn();
const mockGetCurrentPosition = vi.fn();

beforeEach(() => {
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: mockVibrate,
  });

  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: mockGetCurrentPosition,
    },
  });

  // Default: geolocation succeeds immediately
  mockGetCurrentPosition.mockImplementation((success: PositionCallback) => {
    success({
      coords: { latitude: 19.4326, longitude: -99.1332, accuracy: 10 },
    } as GeolocationPosition);
  });

  // Default: fetch succeeds
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ success: true, data: { alertId: 'alert-123' } }),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPanicButton(props = {}) {
  const onPanicActivated = vi.fn();
  const onError = vi.fn();
  const utils = render(
    <PanicButton onPanicActivated={onPanicActivated} onError={onError} {...props} />,
  );
  return { ...utils, onPanicActivated, onError };
}

/**
 * Exhaustively drain the microtask queue. Each call to Promise.resolve()
 * is one microtask tick. The activatePanic function chains:
 * geolocation wrapper → fetch → response.text() → JSON.parse → setState
 * We run 20 ticks to be safe.
 */
async function flushPromises() {
  for (let i = 0; i < 20; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

/**
 * Advance the countdown timer 3 times, yielding to React between each tick
 * so that the useEffect dependency on `countdown` re-registers the next timer.
 */
async function advanceCountdown() {
  // Tick 1: countdown 3 → 2
  act(() => { vi.advanceTimersByTime(1100); });
  await act(async () => {});
  // Tick 2: countdown 2 → 1
  act(() => { vi.advanceTimersByTime(1100); });
  await act(async () => {});
  // Tick 3: countdown 1 → 0, which calls activatePanic()
  act(() => { vi.advanceTimersByTime(1100); });
  await act(async () => {});
}

/**
 * Opens the expanded dialog then holds the SOS button long enough to
 * fill the progress bar and enter isConfirming=true.
 * MUST be called inside a `vi.useFakeTimers()` context.
 * Does NOT use waitFor — relies on act() flushing synchronously.
 */
async function openExpandedAndHold() {
  // Click compact button to open expanded dialog
  act(() => {
    fireEvent.click(screen.getByLabelText('Botón SOS'));
  });
  // Flush React micro-tasks
  await act(async () => {});

  // Hold SOS button — progress increments by 4 every 100ms; need 26 ticks (2600ms) to reach 104
  const sosBtn = screen.getByLabelText('Activar alerta SOS');
  act(() => {
    fireEvent.mouseDown(sosBtn);
  });
  act(() => {
    vi.advanceTimersByTime(2600);
  });
  await act(async () => {});
}

// ---------------------------------------------------------------------------
// Tests — basic render
// ---------------------------------------------------------------------------

describe('PanicButton – initial render (compact mode)', () => {
  it('renders the compact SOS button', () => {
    renderPanicButton();
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('compact button has accessible aria-label', () => {
    renderPanicButton();
    expect(screen.getByLabelText('Botón SOS')).toBeInTheDocument();
  });

  it('compact button has aria-pressed=false when not holding', () => {
    renderPanicButton();
    expect(screen.getByLabelText('Botón SOS')).toHaveAttribute('aria-pressed', 'false');
  });

  it('does NOT show a dialog initially', () => {
    renderPanicButton();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does NOT show the activating spinner initially', () => {
    renderPanicButton();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('PanicButton – expanded mode', () => {
  it('clicking the compact SOS button opens the expanded dialog', async () => {
    renderPanicButton();
    fireEvent.click(screen.getByLabelText('Botón SOS'));
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: 'Diálogo de emergencia' }),
      ).toBeInTheDocument();
    });
  });

  it('expanded dialog shows the hold-to-activate instruction', async () => {
    renderPanicButton();
    fireEvent.click(screen.getByLabelText('Botón SOS'));
    await waitFor(() => {
      expect(screen.getByText('Mantén presionado para activar')).toBeInTheDocument();
    });
  });

  it('SOS button inside the expanded dialog has an accessible aria-label', async () => {
    renderPanicButton();
    fireEvent.click(screen.getByLabelText('Botón SOS'));
    await waitFor(() => {
      expect(screen.getByLabelText('Activar alerta SOS')).toBeInTheDocument();
    });
  });

  it('close button dismisses the expanded dialog', async () => {
    renderPanicButton();
    fireEvent.click(screen.getByLabelText('Botón SOS'));
    await waitFor(() => screen.getByRole('dialog'));

    fireEvent.click(screen.getByLabelText('Cerrar diálogo'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
describe('PanicButton – hold progress', () => {
  it('aria-pressed is true while holding, false after release', async () => {
    renderPanicButton();
    fireEvent.click(screen.getByLabelText('Botón SOS'));
    await waitFor(() => screen.getByLabelText('Activar alerta SOS'));

    const sosBtn = screen.getByLabelText('Activar alerta SOS');
    fireEvent.mouseDown(sosBtn);
    expect(sosBtn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseUp(sosBtn);
    expect(sosBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('releasing before the hold threshold does NOT trigger confirmation', async () => {
    vi.useFakeTimers();
    renderPanicButton();

    act(() => { fireEvent.click(screen.getByLabelText('Botón SOS')); });
    await act(async () => {});

    const sosBtn = screen.getByLabelText('Activar alerta SOS');
    act(() => { fireEvent.mouseDown(sosBtn); });
    act(() => { vi.advanceTimersByTime(400); }); // well below 2500ms
    act(() => { fireEvent.mouseUp(sosBtn); });
    await act(async () => {});

    // Should stay in expanded mode, not confirmation
    expect(screen.queryByRole('dialog', { name: 'Activando Alerta' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Diálogo de emergencia' })).toBeInTheDocument();
  });

  it('holding for the full ~2.5 seconds triggers the confirmation dialog', async () => {
    vi.useFakeTimers();
    renderPanicButton();
    await openExpandedAndHold();

    // isConfirming=true should now render the confirmation dialog
    expect(screen.getByRole('dialog', { name: 'Activando Alerta' })).toBeInTheDocument();
  });

  it('confirmation dialog shows the initial countdown value (3)', async () => {
    vi.useFakeTimers();
    renderPanicButton();
    await openExpandedAndHold();

    expect(screen.getByRole('dialog', { name: 'Activando Alerta' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('confirmation dialog shows the description text', async () => {
    vi.useFakeTimers();
    renderPanicButton();
    await openExpandedAndHold();

    expect(
      screen.getByText('Se notificará a tus representantes con tu ubicación actual'),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('PanicButton – cancel behavior', () => {
  it('cancel button dismisses the confirmation dialog', async () => {
    vi.useFakeTimers();
    renderPanicButton();
    await openExpandedAndHold();

    expect(screen.getByLabelText('Cancelar alerta')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByLabelText('Cancelar alerta')); });
    await act(async () => {});

    expect(screen.queryByRole('dialog', { name: 'Activando Alerta' })).toBeNull();
  });

  it('after cancelling, the component is no longer in confirming state', async () => {
    vi.useFakeTimers();
    renderPanicButton();
    await openExpandedAndHold();

    act(() => { fireEvent.click(screen.getByLabelText('Cancelar alerta')); });
    await act(async () => {});

    // The confirming overlay is gone; the expanded dialog may still be visible
    expect(screen.queryByRole('dialog', { name: 'Activando Alerta' })).toBeNull();
    // The component is no longer in activating state
    expect(screen.queryByRole('status')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('PanicButton – activating (loading) state', () => {
  it('shows role="status" spinner while the API call is in flight', async () => {
    vi.useFakeTimers();
    // fetch never resolves → stays in isActivating state
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    renderPanicButton();
    await openExpandedAndHold();

    // Advance countdown 3 × 1000ms = 3000ms → countdown reaches 0, calls activatePanic()
    await advanceCountdown();
    await flushPromises();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('activating region has the expected aria-label', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    renderPanicButton();
    await openExpandedAndHold();

    await advanceCountdown();
    await flushPromises();

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Activando alerta...');
  });
});

// ---------------------------------------------------------------------------
describe('PanicButton – success state after activation', () => {
  it('calls onPanicActivated with API response data on success', async () => {
    vi.useFakeTimers();
    const alertData = { alertId: 'alert-123', status: 'ACTIVE' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: alertData }),
    });

    const { onPanicActivated } = renderPanicButton();
    await openExpandedAndHold();

    // Let countdown expire (3 ticks) then flush all async promise chains
    await advanceCountdown();
    await flushPromises();

    expect(onPanicActivated).toHaveBeenCalledWith(alertData);
  });

  it('isActivating resets to false after successful activation completes', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: { alertId: 'a1' } }),
    });

    renderPanicButton();
    await openExpandedAndHold();

    await advanceCountdown();
    await flushPromises();

    // The activating spinner (isActivating state) is gone after completion
    expect(screen.queryByRole('status')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('PanicButton – error state after activation', () => {
  it('calls onError when the server returns a non-OK HTTP status', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({ error: { message: 'Panic system offline' } }),
    });

    const { onError } = renderPanicButton();
    await openExpandedAndHold();

    await advanceCountdown();
    await flushPromises();

    expect(onError).toHaveBeenCalledWith('Panic system offline');
  });

  it('calls onError with a fallback message when server returns non-JSON HTML', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => '<html>502 Bad Gateway</html>',
    });

    const { onError } = renderPanicButton();
    await openExpandedAndHold();

    await advanceCountdown();
    await flushPromises();

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Error del servidor'));
  });

  it('calls onError when fetch itself throws (network failure)', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { onError } = renderPanicButton();
    await openExpandedAndHold();

    await advanceCountdown();
    await flushPromises();

    expect(onError).toHaveBeenCalledWith('Network error');
  });

  it('sends the panic alert with null coords when geolocation fails', async () => {
    vi.useFakeTimers();
    mockGetCurrentPosition.mockImplementation((_: unknown, reject: PositionErrorCallback) => {
      reject({ code: 1, message: 'Geolocation unavailable' } as GeolocationPositionError);
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: { alertId: 'a1' } }),
    });

    const { onPanicActivated } = renderPanicButton();
    await openExpandedAndHold();

    await advanceCountdown();
    await flushPromises();

    expect(onPanicActivated).toHaveBeenCalled();

    // Verify fetch was called with null coordinates
    const fetchBody = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(fetchBody.latitude).toBeNull();
    expect(fetchBody.longitude).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('PanicButton – accessibility', () => {
  it('compact button has role="button"', () => {
    renderPanicButton();
    expect(screen.getByLabelText('Botón SOS')).toHaveAttribute('role', 'button');
  });

  it('confirmation dialog has role="dialog" and aria-modal="true"', async () => {
    vi.useFakeTimers();
    renderPanicButton();
    await openExpandedAndHold();

    const dialog = screen.getByRole('dialog', { name: 'Activando Alerta' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('Space key starts the hold interaction on the expanded SOS button', async () => {
    renderPanicButton();
    fireEvent.click(screen.getByLabelText('Botón SOS'));
    await waitFor(() => screen.getByLabelText('Activar alerta SOS'));

    const sosBtn = screen.getByLabelText('Activar alerta SOS');
    fireEvent.keyDown(sosBtn, { key: ' ' });
    expect(sosBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyUp(sosBtn, { key: ' ' });
    expect(sosBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('Enter key starts the hold interaction on the expanded SOS button', async () => {
    renderPanicButton();
    fireEvent.click(screen.getByLabelText('Botón SOS'));
    await waitFor(() => screen.getByLabelText('Activar alerta SOS'));

    const sosBtn = screen.getByLabelText('Activar alerta SOS');
    fireEvent.keyDown(sosBtn, { key: 'Enter' });
    expect(sosBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyUp(sosBtn, { key: 'Enter' });
    expect(sosBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
