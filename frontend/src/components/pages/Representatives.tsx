// src/components/pages/Representatives.tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { representativesApi } from '../../services/api';
import type { Representative, CreateRepresentativeInput } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';

const RELATION_VALUES = [
  'Esposa',
  'Esposo',
  'Hijo',
  'Hija',
  'Padre',
  'Madre',
  'Hermano',
  'Hermana',
  'Abuelo',
  'Abuela',
  'Amigo',
  'Apoderado Legal',
  'Otro',
] as const;

export default function Representatives() {
  const { t } = useTranslation('representatives');
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const emptyForm: CreateRepresentativeInput = {
    name: '',
    phone: '',
    email: '',
    relation: 'Esposa',
    notifyOnEmergency: true,
    canMakeMedicalDecisions: true,
    isDonorSpokesperson: false,
  };

  const [form, setForm] = useState<CreateRepresentativeInput>(emptyForm);

  useEffect(() => {
    loadRepresentatives();
  }, []);

  const loadRepresentatives = async () => {
    try {
      setLoading(true);
      const res = await representativesApi.list();
      if (res.success && res.data) {
        setRepresentatives(res.data.representatives);
      }
    } catch (err) {
      setError(t('errors.loading'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const handleOpenEdit = (rep: Representative) => {
    setForm({
      name: rep.name,
      phone: rep.phone,
      email: rep.email || '',
      relation: rep.relation,
      notifyOnEmergency: rep.notifyOnEmergency,
      canMakeMedicalDecisions: rep.canMakeMedicalDecisions,
      isDonorSpokesperson: rep.isDonorSpokesperson,
    });
    setEditingId(rep.id);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (editingId) {
        await representativesApi.update(editingId, form);
      } else {
        await representativesApi.create(form);
      }
      setShowModal(false);
      loadRepresentatives();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('errors.saving'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const doDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await representativesApi.delete(deleteConfirm.id);
      loadRepresentatives();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('errors.deleting'));
    }
  };

  const handleSetDonorSpokesperson = async (id: string) => {
    try {
      await representativesApi.setDonorSpokesperson(id);
      loadRepresentatives();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t('errors.updatingSpokesperson'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status" aria-label={t('loading', { defaultValue: 'Cargando representantes' })}>
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
            onClick={handleOpenCreate}
            disabled={representatives.length >= 5}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('addButton')}
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg" role="alert" aria-live="polite">
            {error}
            <button onClick={() => setError('')} className="float-right" aria-label={t('errors.dismiss', { defaultValue: 'Cerrar error' })}>&times;</button>
          </div>
        )}

        {/* Info banner */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex gap-3">
            <svg className="w-6 h-6 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-blue-800">
                {t('infoBanner')}
              </p>
            </div>
          </div>
        </div>

        {/* Representatives List */}
        <div className="space-y-4">
          {representatives.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('emptyState.title')}</h3>
              <p className="text-gray-500 mb-6">
                {t('emptyState.description')}
              </p>
              <button
                onClick={handleOpenCreate}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('emptyState.addFirst')}
              </button>
            </div>
          ) : (
            representatives.map((rep, index) => (
              <div key={rep.id} className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-vida-100 rounded-full flex items-center justify-center text-vida-600 font-bold text-xl">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{rep.name}</h3>
                      <p className="text-gray-500">
                        {t(`relations.${rep.relation}`, { defaultValue: rep.relation })}
                      </p>

                      <div className="mt-3 space-y-1">
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {rep.phone}
                        </p>
                        {rep.email && (
                          <p className="text-sm text-gray-600 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {rep.email}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {rep.notifyOnEmergency && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                            {t('badges.notifyOnEmergency')}
                          </span>
                        )}
                        {rep.canMakeMedicalDecisions && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {t('badges.medicalDecisions')}
                          </span>
                        )}
                        {rep.isDonorSpokesperson && (
                          <span className="px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded-full">
                            {t('badges.donorSpokesperson')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!rep.isDonorSpokesperson && (
                      <button
                        onClick={() => handleSetDonorSpokesperson(rep.id)}
                        title={t('tooltips.setDonorSpokesperson')}
                        aria-label={t('tooltips.setDonorSpokesperson')}
                        className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEdit(rep)}
                      aria-label={t('tooltips.edit', { name: rep.name, defaultValue: `Editar representante ${rep.name}` })}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(rep.id)}
                      aria-label={t('tooltips.delete', { name: rep.name, defaultValue: `Eliminar representante ${rep.name}` })}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Priority explanation */}
        {representatives.length > 0 && (
          <div className="mt-6 text-sm text-gray-500">
            <p>
              {t('priorityNote')}
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rep-modal-title"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 id="rep-modal-title" className="text-xl font-semibold text-gray-900">
                  {editingId ? t('modal.titleEdit') : t('modal.titleCreate')}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={t('modal.buttons.close', { defaultValue: 'Cerrar modal' })}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="rep-name" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('modal.fields.name')}
                </label>
                <input
                  id="rep-name"
                  type="text"
                  required
                  aria-required="true"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="rep-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('modal.fields.phone')}
                </label>
                <input
                  id="rep-phone"
                  type="tel"
                  required
                  aria-required="true"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder={t('modal.phonePlaceholder')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="rep-email" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('modal.fields.email')}
                </label>
                <input
                  id="rep-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="rep-relation" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('modal.fields.relation')}
                </label>
                <select
                  id="rep-relation"
                  required
                  aria-required="true"
                  value={form.relation}
                  onChange={(e) => setForm({ ...form, relation: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {RELATION_VALUES.map((val) => (
                    <option key={val} value={val}>
                      {t(`relations.${val}`, { defaultValue: val })}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.notifyOnEmergency}
                    onChange={(e) => setForm({ ...form, notifyOnEmergency: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-700">{t('modal.checkboxes.notifyOnEmergency')}</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.canMakeMedicalDecisions}
                    onChange={(e) => setForm({ ...form, canMakeMedicalDecisions: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-700">{t('modal.checkboxes.canMakeMedicalDecisions')}</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.isDonorSpokesperson}
                    onChange={(e) => setForm({ ...form, isDonorSpokesperson: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-gray-700">{t('modal.checkboxes.isDonorSpokesperson')}</span>
                </label>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t('modal.buttons.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving
                    ? t('modal.buttons.saving')
                    : editingId
                    ? t('modal.buttons.update')
                    : t('modal.buttons.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm(s => ({ ...s, open }))}
        title={t('confirm.delete_title', { defaultValue: 'Eliminar representante' })}
        description={t('confirm.delete', { defaultValue: '¿Eliminar este representante? Esta acción no se puede deshacer.' })}
        confirmLabel={t('confirm.delete_confirm', { defaultValue: 'Eliminar' })}
        variant="destructive"
        onConfirm={doDelete}
      />
    </section>
  );
}
