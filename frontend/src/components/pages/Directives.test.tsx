// src/components/pages/Directives.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        // Page-level
        title: 'Voluntades Anticipadas',
        subtitle: 'Gestiona tus directivas de voluntad anticipada',
        createButton: 'Crear nueva',
        loading: 'Cargando directivas',

        // Status badges
        'status.DRAFT': 'Borrador',
        'status.PENDING_VALIDATION': 'Pendiente',
        'status.ACTIVE': 'Activa',
        'status.REVOKED': 'Revocada',
        'status.EXPIRED': 'Expirada',

        // Types
        'types.DIGITAL_DRAFT': 'Borrador digital',
        'types.NOTARIZED_DOCUMENT': 'Documento notariado',
        'types.DIGITAL_WITNESSES': 'Con testigos digitales',

        // Active banner
        'activeBanner.title': 'Directiva Activa',
        'activeBanner.description': 'Tu voluntad anticipada está vigente.',
        'activeBanner.validatedAt': `Validada el ${opts?.date ?? ''}`,

        // Directive summary
        'directive.createdAt': `Creado el ${opts?.date ?? ''}`,
        'directive.cpr': 'RCP',
        'directive.intubation': 'Intubación',
        'directive.palliativeOnly': 'Solo paliativo',

        // Actions
        'actions.validate': 'Validar',
        'actions.delete': 'Eliminar',
        'actions.revoke': 'Revocar',

        // Empty state
        'emptyState.title': 'Sin directivas',
        'emptyState.description': 'Aún no has creado ninguna voluntad anticipada',
        'emptyState.createFirst': 'Crear mi primera directiva',

        // Info box
        'infoBox.title': '¿Qué es una voluntad anticipada?',
        'infoBox.description': 'Descripción info box',
        'infoBox.moreInfo': 'Más información →',
        'infoBox.legalFramework': 'Marco legal en México →',

        // Modal
        'modal.title': 'Nueva Voluntad Anticipada',
        'modal.medicalDecisionsTitle': 'Decisiones médicas',
        'modal.medicalDecisionsDesc': 'Indica tus preferencias',
        'modal.decisions.cpr': 'Reanimación cardiopulmonar (RCP)',
        'modal.decisions.intubation': 'Intubación / ventilación mecánica',
        'modal.decisions.dialysis': 'Diálisis',
        'modal.decisions.transfusion': 'Transfusiones sanguíneas',
        'modal.decisions.artificialNutrition': 'Nutrición artificial',
        'modal.decisionValues.yes': 'Sí',
        'modal.decisionValues.no': 'No',
        'modal.decisionValues.noPreference': 'Sin preferencia',
        'modal.palliativeCareOnly': 'Solo deseo recibir cuidados paliativos',
        'modal.stateLabel': 'Estado de origen',
        'modal.statePlaceholder': 'Selecciona tu estado',
        'modal.states.CDMX': 'Ciudad de México',
        'modal.notesLabel': 'Notas adicionales',
        'modal.notesPlaceholder': 'Instrucciones específicas...',
        'modal.cancel': 'Cancelar',
        'modal.saveDraft': 'Guardar borrador',
        'modal.saving': 'Guardando...',
        'modal.close': 'Cerrar modal',

        // Errors
        'errors.loading': 'Error cargando directivas',
        'errors.creating': 'Error creando borrador',
        'errors.validating': 'Error validando directiva',
        'errors.revoking': 'Error revocando directiva',
        'errors.deleting': 'Error eliminando borrador',
        'errors.dismiss': 'Cerrar error',

        // Confirm
        'confirm.revoke': '¿Está seguro de revocar esta directiva?',
        'confirm.delete': '¿Está seguro de eliminar este borrador?',
      };
      return map[key] ?? key;
    },
    i18n: { language: 'es', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../hooks/useLocale', () => ({
  useLocale: () => ({
    formatDate: (date: string) => `formatted:${date}`,
    formatDateTime: (date: string) => `formatted:${date}`,
  }),
}));

vi.mock('../../services/api', () => ({
  directivesApi: {
    list: vi.fn(),
    getActive: vi.fn(),
    createDraft: vi.fn(),
    validate: vi.fn(),
    revoke: vi.fn(),
    delete: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Static imports (after mocks)
// ---------------------------------------------------------------------------
import Directives from './Directives';
import { directivesApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------
const mockList = directivesApi.list as ReturnType<typeof vi.fn>;
const mockGetActive = directivesApi.getActive as ReturnType<typeof vi.fn>;
const mockCreateDraft = directivesApi.createDraft as ReturnType<typeof vi.fn>;
const mockValidate = directivesApi.validate as ReturnType<typeof vi.fn>;
const mockRevoke = directivesApi.revoke as ReturnType<typeof vi.fn>;
const mockDelete = directivesApi.delete as ReturnType<typeof vi.fn>;

const DRAFT_DIRECTIVE = {
  id: 'dir-1',
  type: 'DIGITAL_DRAFT',
  status: 'DRAFT',
  acceptsCPR: true,
  acceptsIntubation: false,
  palliativeCareOnly: false,
  createdAt: '2024-01-10T00:00:00.000Z',
  updatedAt: '2024-01-10T00:00:00.000Z',
  validatedAt: null,
};

const ACTIVE_DIRECTIVE = {
  id: 'dir-2',
  type: 'DIGITAL_DRAFT',
  status: 'ACTIVE',
  acceptsCPR: true,
  acceptsIntubation: null,
  palliativeCareOnly: true,
  createdAt: '2024-01-05T00:00:00.000Z',
  updatedAt: '2024-01-06T00:00:00.000Z',
  validatedAt: '2024-01-06T00:00:00.000Z',
};

function setupEmptyList() {
  mockList.mockResolvedValue({ success: true, data: { directives: [] } });
  mockGetActive.mockResolvedValue({ success: true, data: { directive: null } });
}

function setupWithDraft() {
  mockList.mockResolvedValue({ success: true, data: { directives: [DRAFT_DIRECTIVE] } });
  mockGetActive.mockResolvedValue({ success: true, data: { directive: null } });
}

function setupWithActive() {
  mockList.mockResolvedValue({
    success: true,
    data: { directives: [ACTIVE_DIRECTIVE] },
  });
  mockGetActive.mockResolvedValue({
    success: true,
    data: { directive: ACTIVE_DIRECTIVE },
  });
}

function renderDirectives() {
  return render(
    <MemoryRouter>
      <Directives />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setupEmptyList();
  mockCreateDraft.mockResolvedValue({ success: true, data: { directive: DRAFT_DIRECTIVE } });
  mockValidate.mockResolvedValue({ success: true, data: { directive: ACTIVE_DIRECTIVE } });
  mockRevoke.mockResolvedValue({ success: true, data: { directive: { ...ACTIVE_DIRECTIVE, status: 'REVOKED' } } });
  mockDelete.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Directives – loading state', () => {
  it('shows a loading spinner while fetching', async () => {
    mockList.mockReturnValue(new Promise(() => {}));
    mockGetActive.mockReturnValue(new Promise(() => {}));
    renderDirectives();
    expect(screen.getByRole('status', { name: 'Cargando directivas' })).toBeInTheDocument();
  });

  it('loading spinner has aria-hidden spinner inside', async () => {
    mockList.mockReturnValue(new Promise(() => {}));
    mockGetActive.mockReturnValue(new Promise(() => {}));
    renderDirectives();
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe('Directives – empty state', () => {
  it('renders the empty state title when no directives exist', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Sin directivas')).toBeInTheDocument();
    });
  });

  it('renders the empty state description', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Aún no has creado ninguna voluntad anticipada')).toBeInTheDocument();
    });
  });

  it('renders the "create first directive" button in the empty state', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Crear mi primera directiva')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
describe('Directives – page structure', () => {
  it('renders the page title', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Voluntades Anticipadas' })).toBeInTheDocument();
    });
  });

  it('renders the "Crear nueva" header button', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Crear nueva')).toBeInTheDocument();
    });
  });

  it('renders the info box section', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('¿Qué es una voluntad anticipada?')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
describe('Directives – directive card with DRAFT status', () => {
  it('renders a card with "Borrador" status badge', async () => {
    setupWithDraft();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Borrador')).toBeInTheDocument();
    });
  });

  it('renders the directive type label', async () => {
    setupWithDraft();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Borrador digital')).toBeInTheDocument();
    });
  });

  it('renders CPR preference with checkmark when acceptsCPR is true', async () => {
    setupWithDraft();
    renderDirectives();
    await waitFor(() => {
      const cprContainer = screen.getByText('RCP').closest('div')!;
      expect(cprContainer).toHaveTextContent('✓');
    });
  });

  it('renders Intubación preference with cross when acceptsIntubation is false', async () => {
    setupWithDraft();
    renderDirectives();
    await waitFor(() => {
      const intubContainer = screen.getByText('Intubación').closest('div')!;
      expect(intubContainer).toHaveTextContent('✗');
    });
  });

  it('renders palliative-only with dash when palliativeCareOnly is false', async () => {
    setupWithDraft();
    renderDirectives();
    await waitFor(() => {
      const palContainer = screen.getByText('Solo paliativo').closest('div')!;
      expect(palContainer).toHaveTextContent('—');
    });
  });

  it('shows "Validar" and "Eliminar" action buttons for DRAFT directives', async () => {
    setupWithDraft();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Validar')).toBeInTheDocument();
      expect(screen.getByText('Eliminar')).toBeInTheDocument();
    });
  });

  it('does NOT show "Revocar" button for DRAFT directives', async () => {
    setupWithDraft();
    renderDirectives();
    await waitFor(() => screen.getByText('Validar'));
    expect(screen.queryByText('Revocar')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('Directives – directive card with ACTIVE status', () => {
  it('renders a card with "Activa" status badge', async () => {
    setupWithActive();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Activa')).toBeInTheDocument();
    });
  });

  it('shows the active directive banner', async () => {
    setupWithActive();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Directiva Activa')).toBeInTheDocument();
    });
  });

  it('shows "Revocar" action button for ACTIVE directives', async () => {
    setupWithActive();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Revocar')).toBeInTheDocument();
    });
  });

  it('does NOT show "Validar" button for ACTIVE directives', async () => {
    setupWithActive();
    renderDirectives();
    await waitFor(() => screen.getByText('Activa'));
    expect(screen.queryByText('Validar')).toBeNull();
  });

  it('shows checkmark for acceptsCPR=true on an ACTIVE directive', async () => {
    setupWithActive();
    renderDirectives();
    await waitFor(() => {
      const cprDiv = screen.getByText('RCP').closest('div')!;
      expect(cprDiv).toHaveTextContent('✓');
    });
  });

  it('shows dash for acceptsIntubation=null on an ACTIVE directive', async () => {
    setupWithActive();
    renderDirectives();
    await waitFor(() => {
      const intubDiv = screen.getByText('Intubación').closest('div')!;
      expect(intubDiv).toHaveTextContent('—');
    });
  });

  it('shows checkmark for palliativeCareOnly=true on an ACTIVE directive', async () => {
    setupWithActive();
    renderDirectives();
    await waitFor(() => {
      const pallDiv = screen.getByText('Solo paliativo').closest('div')!;
      expect(pallDiv).toHaveTextContent('✓');
    });
  });
});

// ---------------------------------------------------------------------------
describe('Directives – active directive banner', () => {
  it('does NOT render the active banner when there is no active directive', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Sin directivas'));
    expect(screen.queryByText('Directiva Activa')).toBeNull();
  });

  it('renders the active banner description', async () => {
    setupWithActive();
    renderDirectives();
    await waitFor(() => {
      expect(screen.getByText('Tu voluntad anticipada está vigente.')).toBeInTheDocument();
    });
  });

  it('renders the validated date in the active banner', async () => {
    setupWithActive();
    renderDirectives();
    await waitFor(() => {
      // activeBanner.validatedAt includes the formatted date
      expect(screen.getByText(/Validada el/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
describe('Directives – create modal', () => {
  it('opens the create modal when clicking "Crear nueva"', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Nueva Voluntad Anticipada' })).toBeInTheDocument();
    });
  });

  it('modal has aria-modal="true"', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: 'Nueva Voluntad Anticipada' });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });

  it('modal shows all five medical decision toggles', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => {
      expect(screen.getByText('Reanimación cardiopulmonar (RCP)')).toBeInTheDocument();
      expect(screen.getByText('Intubación / ventilación mecánica')).toBeInTheDocument();
      expect(screen.getByText('Diálisis')).toBeInTheDocument();
      expect(screen.getByText('Transfusiones sanguíneas')).toBeInTheDocument();
      expect(screen.getByText('Nutrición artificial')).toBeInTheDocument();
    });
  });

  it('closing the modal via the X button hides it', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => screen.getByRole('dialog', { name: 'Nueva Voluntad Anticipada' }));
    fireEvent.click(screen.getByLabelText('Cerrar modal'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nueva Voluntad Anticipada' })).toBeNull();
    });
  });

  it('closing the modal via the Cancel button hides it', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => screen.getByText('Cancelar'));
    fireEvent.click(screen.getByText('Cancelar'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nueva Voluntad Anticipada' })).toBeNull();
    });
  });

  it('clicking "Sí" toggle for CPR applies green active styling', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => screen.getByText('Reanimación cardiopulmonar (RCP)'));

    // Click the first "Sí" button (corresponds to CPR row)
    fireEvent.click(screen.getAllByText('Sí')[0]);

    // Re-query after state update
    await waitFor(() => {
      expect(screen.getAllByText('Sí')[0]).toHaveClass('bg-green-500');
    });
  });

  it('clicking "No" toggle for CPR applies red active styling', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => screen.getByText('Reanimación cardiopulmonar (RCP)'));

    fireEvent.click(screen.getAllByText('No')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('No')[0]).toHaveClass('bg-red-500');
    });
  });

  it('submitting the form calls directivesApi.createDraft', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => screen.getByText('Guardar borrador'));
    fireEvent.click(screen.getByText('Guardar borrador'));

    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    });
  });

  it('shows "Guardando..." on the submit button while saving', async () => {
    mockCreateDraft.mockReturnValue(new Promise(() => {})); // never resolves
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => screen.getByText('Guardar borrador'));
    fireEvent.click(screen.getByText('Guardar borrador'));

    await waitFor(() => {
      expect(screen.getByText('Guardando...')).toBeInTheDocument();
    });
  });

  it('submit button is disabled while saving', async () => {
    mockCreateDraft.mockReturnValue(new Promise(() => {}));
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => screen.getByText('Guardar borrador'));
    const saveBtn = screen.getByText('Guardar borrador').closest('button')!;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const savingBtn = screen.getByText('Guardando...').closest('button')!;
      expect(savingBtn).toBeDisabled();
    });
  });

  it('closes the modal after successful draft creation', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => screen.getByText('Guardar borrador'));
    fireEvent.click(screen.getByText('Guardar borrador'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nueva Voluntad Anticipada' })).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
describe('Directives – validate action', () => {
  it('clicking "Validar" calls directivesApi.validate with the directive id', async () => {
    setupWithDraft();
    renderDirectives();
    await waitFor(() => screen.getByText('Validar'));
    fireEvent.click(screen.getByText('Validar'));

    await waitFor(() => {
      expect(mockValidate).toHaveBeenCalledWith('dir-1', 'EMAIL');
    });
  });
});

// ---------------------------------------------------------------------------
describe('Directives – delete action', () => {
  it('clicking "Eliminar" shows a confirm dialog and calls delete on confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setupWithDraft();
    renderDirectives();
    await waitFor(() => screen.getByText('Eliminar'));
    fireEvent.click(screen.getByText('Eliminar'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('dir-1');
    });
  });

  it('does NOT call delete when user dismisses the confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setupWithDraft();
    renderDirectives();
    await waitFor(() => screen.getByText('Eliminar'));
    fireEvent.click(screen.getByText('Eliminar'));

    expect(mockDelete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('Directives – revoke action', () => {
  it('clicking "Revocar" shows a confirm dialog and calls revoke on confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setupWithActive();
    renderDirectives();
    await waitFor(() => screen.getByText('Revocar'));
    fireEvent.click(screen.getByText('Revocar'));

    await waitFor(() => {
      expect(mockRevoke).toHaveBeenCalledWith('dir-2');
    });
  });

  it('does NOT call revoke when user dismisses the confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setupWithActive();
    renderDirectives();
    await waitFor(() => screen.getByText('Revocar'));
    fireEvent.click(screen.getByText('Revocar'));

    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('Directives – error states', () => {
  it('shows an error alert with role="alert" when loading fails', async () => {
    mockList.mockRejectedValue(new Error('network'));
    mockGetActive.mockResolvedValue({ success: true, data: { directive: null } });
    renderDirectives();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Error cargando directivas')).toBeInTheDocument();
    });
  });

  it('dismissing the error alert clears it', async () => {
    mockList.mockRejectedValue(new Error('network'));
    mockGetActive.mockResolvedValue({ success: true, data: { directive: null } });
    renderDirectives();

    await waitFor(() => screen.getByRole('alert'));
    // The dismiss button has aria-label="Cerrar error"
    fireEvent.click(screen.getByLabelText('Cerrar error'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('shows error message when create draft fails', async () => {
    mockCreateDraft.mockRejectedValue({
      response: { data: { error: { message: 'Cuota superada' } } },
    });
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => screen.getByText('Guardar borrador'));
    fireEvent.click(screen.getByText('Guardar borrador'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Cuota superada')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
describe('Directives – accessibility', () => {
  it('the page uses a <section> semantic element', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Voluntades Anticipadas'));

    const section = document.querySelector('section');
    expect(section).toBeInTheDocument();
  });

  it('the create directive modal is labelled by its title element', async () => {
    setupEmptyList();
    renderDirectives();
    await waitFor(() => screen.getByText('Crear nueva'));
    fireEvent.click(screen.getByText('Crear nueva'));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'create-directive-title');
    });
  });

  it('error alert has aria-live="polite"', async () => {
    mockList.mockRejectedValue(new Error('err'));
    mockGetActive.mockResolvedValue({ success: true, data: { directive: null } });
    renderDirectives();

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'polite');
    });
  });
});
