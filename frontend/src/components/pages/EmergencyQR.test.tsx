// src/components/pages/EmergencyQR.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Module mocks – must be declared before static imports
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'qr.title': 'Mi Código QR de Emergencia',
        'qr.subtitle': 'Código de acceso de emergencia',
        'qr.loading': 'Cargando código QR...',
        'qr.error_load': 'Error al cargar el código QR',
        'qr.error_regenerate': 'Error al regenerar el código QR',
        'qr.confirm_regenerate':
          '¿Estás seguro de regenerar el código QR? El código anterior dejará de funcionar.',
        'qr.card.header_title': 'Sistema VIDA',
        'qr.card.header_subtitle': 'Código de Acceso de Emergencia',
        'qr.card.token_label': 'Token:',
        'qr.card.generated_label': 'Generado:',
        'qr.buttons.regenerate': 'Regenerar QR',
        'qr.buttons.regenerating': 'Regenerando...',
        'qr.buttons.download': 'Descargar',
        'qr.buttons.retry': 'Reintentar',
        'qr.instructions.title': 'Instrucciones de uso',
        'qr.instructions.step_1': 'Paso 1',
        'qr.instructions.step_2': 'Paso 2',
        'qr.instructions.step_3': 'Paso 3',
        'qr.instructions.step_4': 'Paso 4',
        'qr.security.title': 'Seguridad',
        'qr.security.text': 'Texto de seguridad',
        'qr.nfc.title': 'Grabar en Tag NFC',
        'qr.nfc.badge': 'Nuevo',
        'qr.nfc.description': 'Descripción NFC',
      };
      return map[key] ?? key;
    },
    i18n: { language: 'es', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../hooks/useLocale', () => ({
  useLocale: () => ({
    formatDateTime: (date: string) => `formatted:${date}`,
    formatDate: (date: string) => `formatted:${date}`,
  }),
}));

// QRCodeSVG renders an <svg> element; stub it so it renders something simple
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr-code" data-value={value} />
  ),
}));

// Stub the API
vi.mock('../../services/api', () => ({
  profileApi: {
    getQR: vi.fn(),
    regenerateQR: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Static imports (after mocks)
// ---------------------------------------------------------------------------
import EmergencyQR from './EmergencyQR';
import { profileApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetQR = profileApi.getQR as ReturnType<typeof vi.fn>;
const mockRegenerateQR = profileApi.regenerateQR as ReturnType<typeof vi.fn>;

const QR_DATA = {
  qrToken: 'abc123token',
  qrDataUrl: 'data:image/png;base64,FAKEDATA',
  generatedAt: '2024-01-15T10:00:00.000Z',
};

function renderQR() {
  return render(
    <MemoryRouter>
      <EmergencyQR />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Default: successful fetch
  mockGetQR.mockResolvedValue({ success: true, data: QR_DATA });
  mockRegenerateQR.mockResolvedValue({
    success: true,
    data: { qrToken: 'newtoken456', qrDataUrl: 'data:image/png;base64,NEWDATA' },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmergencyQR – loading state', () => {
  it('shows a loading spinner while fetching QR data', async () => {
    // Never settle so we stay in loading
    mockGetQR.mockReturnValue(new Promise(() => {}));
    renderQR();

    expect(screen.getByText('Cargando código QR...')).toBeInTheDocument();
  });

  it('does NOT show the QR card while loading', async () => {
    mockGetQR.mockReturnValue(new Promise(() => {}));
    renderQR();

    expect(screen.queryByTestId('qr-code')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('EmergencyQR – success state', () => {
  it('renders the page title after loading', async () => {
    renderQR();
    await waitFor(() => {
      expect(screen.getByText('Mi Código QR de Emergencia')).toBeInTheDocument();
    });
  });

  it('renders the QR SVG with the correct emergency URL as value', async () => {
    renderQR();
    await waitFor(() => {
      const qr = screen.getByTestId('qr-code');
      expect(qr).toBeInTheDocument();
      // The value should contain the qrToken
      expect(qr.getAttribute('data-value')).toContain('abc123token');
    });
  });

  it('displays the QR token and label in the card', async () => {
    renderQR();
    await waitFor(() => {
      // The token label and value are in the same <p> text node
      expect(screen.getByText(/Token:.*abc123token/s)).toBeInTheDocument();
    });
  });

  it('displays the formatted generation date in the card', async () => {
    renderQR();
    await waitFor(() => {
      // The date label and formatted value are in the same <p> text node
      expect(screen.getByText(/Generado:.*formatted:/s)).toBeInTheDocument();
    });
  });

  it('renders the card header title', async () => {
    renderQR();
    await waitFor(() => {
      expect(screen.getByText('Sistema VIDA')).toBeInTheDocument();
    });
  });

  it('renders the regenerate and download buttons', async () => {
    renderQR();
    await waitFor(() => {
      expect(screen.getByText('Regenerar QR')).toBeInTheDocument();
      expect(screen.getByText('Descargar')).toBeInTheDocument();
    });
  });

  it('renders the instructions section', async () => {
    renderQR();
    await waitFor(() => {
      expect(screen.getByText('Instrucciones de uso')).toBeInTheDocument();
    });
  });

  it('renders the security section', async () => {
    renderQR();
    await waitFor(() => {
      expect(screen.getByText('Seguridad')).toBeInTheDocument();
    });
  });

  it('renders the NFC link to /nfc', async () => {
    renderQR();
    await waitFor(() => {
      const nfcLink = screen.getByRole('link', { name: /Tag NFC|Grabar/i });
      expect(nfcLink).toBeInTheDocument();
      expect(nfcLink).toHaveAttribute('href', '/nfc');
    });
  });
});

// ---------------------------------------------------------------------------
describe('EmergencyQR – error state', () => {
  it('shows the error message when the API fails', async () => {
    mockGetQR.mockRejectedValue({
      response: { data: { error: { message: 'No autorizado' } } },
    });
    renderQR();
    await waitFor(() => {
      expect(screen.getByText('No autorizado')).toBeInTheDocument();
    });
  });

  it('falls back to default error text when the error has no message', async () => {
    mockGetQR.mockRejectedValue(new Error('Network'));
    renderQR();
    await waitFor(() => {
      expect(screen.getByText('Error al cargar el código QR')).toBeInTheDocument();
    });
  });

  it('shows a retry button when in error state', async () => {
    mockGetQR.mockRejectedValue(new Error('err'));
    renderQR();
    await waitFor(() => {
      expect(screen.getByText('Reintentar')).toBeInTheDocument();
    });
  });

  it('clicking Reintentar calls getQR a second time', async () => {
    mockGetQR
      .mockRejectedValueOnce(new Error('err'))
      .mockResolvedValueOnce({ success: true, data: QR_DATA });

    renderQR();
    await waitFor(() => screen.getByText('Reintentar'));
    fireEvent.click(screen.getByText('Reintentar'));

    await waitFor(() => {
      expect(mockGetQR).toHaveBeenCalledTimes(2);
    });
  });

  it('does NOT render the QR code in error state', async () => {
    mockGetQR.mockRejectedValue(new Error('err'));
    renderQR();
    await waitFor(() => screen.getByText('Reintentar'));
    expect(screen.queryByTestId('qr-code')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('EmergencyQR – regenerate QR', () => {
  it('calls profileApi.regenerateQR after confirming the prompt', async () => {
    // auto-confirm window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderQR();
    await waitFor(() => screen.getByText('Regenerar QR'));
    fireEvent.click(screen.getByText('Regenerar QR'));

    await waitFor(() => {
      expect(mockRegenerateQR).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT call regenerateQR when the user dismisses the confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderQR();
    await waitFor(() => screen.getByText('Regenerar QR'));
    fireEvent.click(screen.getByText('Regenerar QR'));

    expect(mockRegenerateQR).not.toHaveBeenCalled();
  });

  it('updates the token label after successful regeneration', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRegenerateQR.mockResolvedValue({
      success: true,
      data: { qrToken: 'newtoken456', qrDataUrl: 'data:image/png;base64,NEWDATA' },
    });

    renderQR();
    await waitFor(() => screen.getByText('Regenerar QR'));
    fireEvent.click(screen.getByText('Regenerar QR'));

    await waitFor(() => {
      expect(screen.getByText(/newtoken456/)).toBeInTheDocument();
    });
  });

  it('shows "Regenerando..." while the regenerate request is in flight', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Never settle
    mockRegenerateQR.mockReturnValue(new Promise(() => {}));

    renderQR();
    await waitFor(() => screen.getByText('Regenerar QR'));
    fireEvent.click(screen.getByText('Regenerar QR'));

    await waitFor(() => {
      expect(screen.getByText('Regenerando...')).toBeInTheDocument();
    });
  });

  it('disables the regenerate button while regenerating', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRegenerateQR.mockReturnValue(new Promise(() => {}));

    renderQR();
    await waitFor(() => screen.getByText('Regenerar QR'));
    const regenBtn = screen.getByText('Regenerar QR').closest('button')!;
    fireEvent.click(regenBtn);

    await waitFor(() => {
      const spinningBtn = screen.getByText('Regenerando...').closest('button')!;
      expect(spinningBtn).toBeDisabled();
    });
  });

  it('shows an error message when regeneration fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRegenerateQR.mockRejectedValue(new Error('Server error'));

    renderQR();
    await waitFor(() => screen.getByText('Regenerar QR'));
    fireEvent.click(screen.getByText('Regenerar QR'));

    await waitFor(() => {
      expect(screen.getByText('Error al regenerar el código QR')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
describe('EmergencyQR – download functionality', () => {
  it('renders the download button when QR data is available', async () => {
    renderQR();
    await waitFor(() => {
      expect(screen.getByText('Descargar')).toBeInTheDocument();
    });
  });

  it('clicking download creates a temporary anchor element and clicks it', async () => {
    renderQR();
    await waitFor(() => screen.getByText('Descargar'));

    const createElementSpy = vi.spyOn(document, 'createElement');
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    createElementSpy.mockReturnValueOnce(mockAnchor as unknown as HTMLElement);

    fireEvent.click(screen.getByText('Descargar'));

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(mockAnchor.href).toBe(QR_DATA.qrDataUrl);
    expect(mockAnchor.download).toBe('mi-codigo-qr-vida.png');
    expect(mockAnchor.click).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
  });
});
