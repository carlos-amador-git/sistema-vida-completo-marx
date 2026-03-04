// src/components/pages/Directives.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../hooks/useLocale';
import { directivesApi } from '../../services/api';
import type { AdvanceDirective, DirectiveDraft } from '../../types';

type DirectiveStatus = 'DRAFT' | 'PENDING_VALIDATION' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';

const STATUS_COLORS: Record<DirectiveStatus, { color: string; bg: string }> = {
  DRAFT: { color: 'text-gray-700', bg: 'bg-gray-100' },
  PENDING_VALIDATION: { color: 'text-yellow-700', bg: 'bg-yellow-100' },
  ACTIVE: { color: 'text-green-700', bg: 'bg-green-100' },
  REVOKED: { color: 'text-red-700', bg: 'bg-red-100' },
  EXPIRED: { color: 'text-gray-500', bg: 'bg-gray-50' },
};

export default function Directives() {
  const { t } = useTranslation('directives');
  const { formatDate } = useLocale();
  const [directives, setDirectives] = useState<AdvanceDirective[]>([]);
  const [activeDirective, setActiveDirective] = useState<AdvanceDirective | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [draftForm, setDraftForm] = useState<DirectiveDraft>({
    acceptsCPR: null,
    acceptsIntubation: null,
    acceptsDialysis: null,
    acceptsTransfusion: null,
    acceptsArtificialNutrition: null,
    palliativeCareOnly: false,
    additionalNotes: '',
    originState: '',
  });

  useEffect(() => {
    loadDirectives();
  }, []);

  const loadDirectives = async () => {
    try {
      setLoading(true);
      const [listRes, activeRes] = await Promise.all([
        directivesApi.list(),
        directivesApi.getActive(),
      ]);

      if (listRes.success && listRes.data) {
        setDirectives(listRes.data.directives);
      }
      if (activeRes.success && activeRes.data?.directive) {
        setActiveDirective(activeRes.data.directive);
      }
    } catch (err) {
      setError(t('errors.loading'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const res = await directivesApi.createDraft(draftForm);
      if (res.success) {
        setShowCreateModal(false);
        loadDirectives();
        setDraftForm({
          acceptsCPR: null,
          acceptsIntubation: null,
          acceptsDialysis: null,
          acceptsTransfusion: null,
          acceptsArtificialNutrition: null,
          palliativeCareOnly: false,
          additionalNotes: '',
          originState: '',
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('errors.creating'));
    } finally {
      setCreating(false);
    }
  };

  const handleValidate = async (id: string) => {
    try {
      await directivesApi.validate(id, 'EMAIL');
      loadDirectives();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('errors.validating'));
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm(t('confirm.revoke'))) {
      return;
    }

    try {
      await directivesApi.revoke(id);
      loadDirectives();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('errors.revoking'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm.delete'))) {
      return;
    }

    try {
      await directivesApi.delete(id);
      loadDirectives();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('errors.deleting'));
    }
  };

  const DecisionToggle = ({
    label,
    value,
    onChange
  }: {
    label: string;
    value: boolean | null | undefined;
    onChange: (val: boolean | null) => void
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-gray-100">
      <span className="text-gray-700">{label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            value === true
              ? 'bg-green-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('modal.decisionValues.yes')}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            value === false
              ? 'bg-red-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('modal.decisionValues.no')}
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            value === null
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('modal.decisionValues.noPreference')}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status" aria-label={t('loading', { defaultValue: 'Cargando directivas' })}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" aria-hidden="true"></div>
      </div>
    );
  }

  return (
    <section className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
            <p className="mt-2 text-gray-600">
              {t('subtitle')}
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('createButton')}
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg" role="alert" aria-live="polite">
            {error}
            <button onClick={() => setError('')} className="float-right" aria-label={t('errors.dismiss', { defaultValue: 'Cerrar error' })}>&times;</button>
          </div>
        )}

        {/* Active Directive Banner */}
        {activeDirective && (
          <div className="mb-8 bg-green-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-green-800">{t('activeBanner.title')}</h3>
                <p className="text-green-700 mt-1">
                  {t('activeBanner.description')}
                </p>
                <p className="text-sm text-green-600 mt-2">
                  {t('activeBanner.validatedAt', { date: formatDate(activeDirective.validatedAt!) })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Directives List */}
        <div className="space-y-4">
          {directives.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('emptyState.title')}</h3>
              <p className="text-gray-500 mb-6">
                {t('emptyState.description')}
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('emptyState.createFirst')}
              </button>
            </div>
          ) : (
            directives.map((directive) => {
              const statusColors = STATUS_COLORS[directive.status as DirectiveStatus];
              return (
                <div key={directive.id} className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors.color} ${statusColors.bg}`}>
                          {t(`status.${directive.status}`)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {directive.type === 'DIGITAL_DRAFT' ? t('types.DIGITAL_DRAFT') :
                           directive.type === 'NOTARIZED_DOCUMENT' ? t('types.NOTARIZED_DOCUMENT') :
                           t('types.DIGITAL_WITNESSES')}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 mb-4">
                        {t('directive.createdAt', { date: formatDate(directive.createdAt) })}
                      </p>

                      {/* Medical Decisions Summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className={directive.acceptsCPR ? 'text-green-600' : directive.acceptsCPR === false ? 'text-red-600' : 'text-gray-400'}>
                            {directive.acceptsCPR ? '✓' : directive.acceptsCPR === false ? '✗' : '—'}
                          </span>
                          <span className="text-gray-600">{t('directive.cpr')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={directive.acceptsIntubation ? 'text-green-600' : directive.acceptsIntubation === false ? 'text-red-600' : 'text-gray-400'}>
                            {directive.acceptsIntubation ? '✓' : directive.acceptsIntubation === false ? '✗' : '—'}
                          </span>
                          <span className="text-gray-600">{t('directive.intubation')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={directive.palliativeCareOnly ? 'text-blue-600' : 'text-gray-400'}>
                            {directive.palliativeCareOnly ? '✓' : '—'}
                          </span>
                          <span className="text-gray-600">{t('directive.palliativeOnly')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 ml-4">
                      {directive.status === 'DRAFT' && (
                        <>
                          <button
                            onClick={() => handleValidate(directive.id)}
                            className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200 transition-colors"
                          >
                            {t('actions.validate')}
                          </button>
                          <button
                            onClick={() => handleDelete(directive.id)}
                            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors"
                          >
                            {t('actions.delete')}
                          </button>
                        </>
                      )}
                      {directive.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleRevoke(directive.id)}
                          className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors"
                        >
                          {t('actions.revoke')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            {t('infoBox.title')}
          </h3>
          <p className="text-blue-800 text-sm leading-relaxed">
            {t('infoBox.description')}
          </p>
          <div className="mt-4 flex gap-4">
            <Link to="/info/directivas" className="text-sm text-blue-600 hover:underline">
              {t('infoBox.moreInfo')}
            </Link>
            <Link to="/info/marco-legal" className="text-sm text-blue-600 hover:underline">
              {t('infoBox.legalFramework')}
            </Link>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-directive-title"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 id="create-directive-title" className="text-xl font-semibold text-gray-900">
                  {t('modal.title')}
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={t('modal.close', { defaultValue: 'Cerrar modal' })}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateDraft} className="p-6">
              <div className="space-y-2 mb-6">
                <h3 className="font-medium text-gray-900">{t('modal.medicalDecisionsTitle')}</h3>
                <p className="text-sm text-gray-500">
                  {t('modal.medicalDecisionsDesc')}
                </p>
              </div>

              <div className="space-y-1">
                <DecisionToggle
                  label={t('modal.decisions.cpr')}
                  value={draftForm.acceptsCPR}
                  onChange={(val) => setDraftForm({ ...draftForm, acceptsCPR: val })}
                />
                <DecisionToggle
                  label={t('modal.decisions.intubation')}
                  value={draftForm.acceptsIntubation}
                  onChange={(val) => setDraftForm({ ...draftForm, acceptsIntubation: val })}
                />
                <DecisionToggle
                  label={t('modal.decisions.dialysis')}
                  value={draftForm.acceptsDialysis}
                  onChange={(val) => setDraftForm({ ...draftForm, acceptsDialysis: val })}
                />
                <DecisionToggle
                  label={t('modal.decisions.transfusion')}
                  value={draftForm.acceptsTransfusion}
                  onChange={(val) => setDraftForm({ ...draftForm, acceptsTransfusion: val })}
                />
                <DecisionToggle
                  label={t('modal.decisions.artificialNutrition')}
                  value={draftForm.acceptsArtificialNutrition}
                  onChange={(val) => setDraftForm({ ...draftForm, acceptsArtificialNutrition: val })}
                />
              </div>

              <div className="mt-6 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="palliativeCareOnly"
                  checked={draftForm.palliativeCareOnly}
                  onChange={(e) => setDraftForm({ ...draftForm, palliativeCareOnly: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="palliativeCareOnly" className="text-gray-700">
                  {t('modal.palliativeCareOnly')}
                </label>
              </div>

              <div className="mt-6">
                <label htmlFor="originState" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('modal.stateLabel')}
                </label>
                <select
                  id="originState"
                  value={draftForm.originState}
                  onChange={(e) => setDraftForm({ ...draftForm, originState: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('modal.statePlaceholder')}</option>
                  <option value="CDMX">{t('modal.states.CDMX')}</option>
                  <option value="JAL">{t('modal.states.JAL')}</option>
                  <option value="NL">{t('modal.states.NL')}</option>
                  <option value="AGS">{t('modal.states.AGS')}</option>
                  <option value="COAH">{t('modal.states.COAH')}</option>
                  <option value="COL">{t('modal.states.COL')}</option>
                  <option value="GTO">{t('modal.states.GTO')}</option>
                  <option value="GRO">{t('modal.states.GRO')}</option>
                  <option value="HGO">{t('modal.states.HGO')}</option>
                  <option value="MEX">{t('modal.states.MEX')}</option>
                  <option value="MICH">{t('modal.states.MICH')}</option>
                  <option value="NAY">{t('modal.states.NAY')}</option>
                  <option value="OAX">{t('modal.states.OAX')}</option>
                  <option value="SLP">{t('modal.states.SLP')}</option>
                  <option value="YUC">{t('modal.states.YUC')}</option>
                </select>
              </div>

              <div className="mt-6">
                <label htmlFor="additionalNotes" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('modal.notesLabel')}
                </label>
                <textarea
                  id="additionalNotes"
                  value={draftForm.additionalNotes}
                  onChange={(e) => setDraftForm({ ...draftForm, additionalNotes: e.target.value })}
                  rows={4}
                  maxLength={5000}
                  placeholder={t('modal.notesPlaceholder')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="mt-8 flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t('modal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? t('modal.saving') : t('modal.saveDraft')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
