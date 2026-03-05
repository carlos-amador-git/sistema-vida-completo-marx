// src/components/pages/Profile.tsx
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { profileApi, insuranceApi, type InsuranceOption } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  User,
  Heart,
  Pill,
  AlertTriangle,
  Shield,
  Save,
  Plus,
  X,
  Check,
  Building2,
  Phone,
  MapPin,
  ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { ProfileForm } from '../../types';
import BiometricSettings from '../BiometricSettings';

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function Profile() {
  const { t } = useTranslation('profile');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newAllergy, setNewAllergy] = useState('');
  const [newCondition, setNewCondition] = useState('');
  const [newMedication, setNewMedication] = useState('');
  const [insuranceSearch, setInsuranceSearch] = useState('');
  const [showInsuranceDropdown, setShowInsuranceDropdown] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
  });

  // Cargar lista de aseguradoras
  const { data: insuranceData } = useQuery({
    queryKey: ['insurance-options'],
    queryFn: () => insuranceApi.getOptions(),
    staleTime: 1000 * 60 * 30, // Cache por 30 minutos
  });

  const insuranceOptions = insuranceData?.data?.insurances || [];

  const profile = data?.data?.profile;

  const { register, handleSubmit, watch, setValue, formState: { isDirty } } = useForm<ProfileForm>({
    values: profile ? {
      bloodType: profile.bloodType || '',
      allergies: profile.allergies || [],
      conditions: profile.conditions || [],
      medications: profile.medications || [],
      insuranceProvider: profile.insuranceProvider || '',
      insurancePolicy: profile.insurancePolicy || '',
      insurancePhone: profile.insurancePhone || '',
      isDonor: profile.isDonor || false,
    } : undefined,
  });

  const allergies = watch('allergies') || [];
  const conditions = watch('conditions') || [];
  const medications = watch('medications') || [];
  const isDonor = watch('isDonor');
  const selectedInsurance = watch('insuranceProvider');

  // Filtrar aseguradoras según búsqueda
  const filteredInsurances = useMemo(() => {
    if (!insuranceSearch.trim()) return insuranceOptions;
    const search = insuranceSearch.toLowerCase();
    return insuranceOptions.filter((ins: InsuranceOption) =>
      ins.shortName?.toLowerCase().includes(search) ||
      ins.name.toLowerCase().includes(search)
    );
  }, [insuranceOptions, insuranceSearch]);

  // Cargar hospitales en red cuando hay aseguradora seleccionada
  const { data: networkData, isLoading: loadingNetwork } = useQuery({
    queryKey: ['insurance-network', selectedInsurance],
    queryFn: () => insuranceApi.getNetwork(selectedInsurance!),
    enabled: !!selectedInsurance && showNetworkModal,
  });

  const networkHospitals = networkData?.data?.hospitals || [];

  // Función para seleccionar aseguradora
  const selectInsurance = (insurance: InsuranceOption) => {
    setValue('insuranceProvider', insurance.shortName || insurance.name, { shouldDirty: true });
    if (insurance.emergencyPhone) {
      setValue('insurancePhone', insurance.emergencyPhone, { shouldDirty: true });
    }
    setInsuranceSearch('');
    setShowInsuranceDropdown(false);
  };

  const updateMutation = useMutation({
    mutationFn: (data: ProfileForm) => profileApi.updateProfile(data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success(t('toast.saveSuccess'));

      // Generar documento PDF del perfil en background
      try {
        await profileApi.generateDocument();
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        queryClient.invalidateQueries({ queryKey: ['documents-stats'] });
        toast.success(
          (tt) => (
            <div className="flex items-center gap-2">
              <span>{t('toast.documentGenerated', { defaultValue: 'Perfil Medico de Emergencia generado' })}</span>
              <a
                href="/documents"
                onClick={() => toast.dismiss(tt.id)}
                className="text-vida-600 hover:text-vida-700 font-medium underline whitespace-nowrap"
              >
                {t('toast.viewDocuments', { defaultValue: 'Ver' })}
              </a>
            </div>
          ),
          { duration: 5000 }
        );
      } catch (err) {
        console.warn('Error generating profile document:', err);
      }
    },
    onError: () => {
      toast.error(t('toast.saveError'));
    },
  });

  const onSubmit = (data: ProfileForm) => {
    updateMutation.mutate(data);
  };

  const addItem = (field: 'allergies' | 'conditions' | 'medications', value: string, setter: (v: string) => void) => {
    if (value.trim()) {
      const current = watch(field) || [];
      if (!current.includes(value.trim())) {
        setValue(field, [...current, value.trim()], { shouldDirty: true });
      }
      setter('');
    }
  };

  const removeItem = (field: 'allergies' | 'conditions' | 'medications', index: number) => {
    const current = watch(field) || [];
    setValue(field, current.filter((_, i) => i !== index), { shouldDirty: true });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48"></div>
        <div className="card h-96 bg-gray-100"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Información personal (solo lectura) */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-5 h-5 text-vida-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('sections.personalInfo')}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">{t('fields.name')}</label>
              <p className="text-gray-900 font-medium">{user?.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">{t('fields.curp')}</label>
              <p className="text-gray-900 font-mono">{user?.curp}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">{t('fields.email')}</label>
              <p className="text-gray-900">{user?.email}</p>
            </div>
            <div>
              <label htmlFor="bloodType" className="block text-sm font-medium text-gray-500 mb-1">{t('fields.bloodType')}</label>
              <select
                id="bloodType"
                {...register('bloodType')}
                className="input"
              >
                <option value="">{t('placeholders.select')}</option>
                {bloodTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Alergias */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-coral-500" />
            <h2 className="text-lg font-semibold text-gray-900">{t('sections.allergies')}</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            {t('descriptions.allergies')}
          </p>

          <div className="flex gap-2 mb-4">
            <label htmlFor="newAllergy" className="sr-only">{t('placeholders.allergies')}</label>
            <input
              id="newAllergy"
              type="text"
              value={newAllergy}
              onChange={(e) => setNewAllergy(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem('allergies', newAllergy, setNewAllergy))}
              className="input flex-1"
              placeholder={t('placeholders.allergies')}
            />
            <button
              type="button"
              onClick={() => addItem('allergies', newAllergy, setNewAllergy)}
              className="btn-secondary"
              aria-label={t('buttons.addAllergy', { defaultValue: 'Agregar alergia' })}
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {allergies.map((allergy, index) => (
              <span key={index} className="inline-flex items-center gap-1 px-3 py-1.5 bg-coral-100 text-coral-800 rounded-full text-sm">
                {allergy}
                <button
                  type="button"
                  onClick={() => removeItem('allergies', index)}
                  className="hover:bg-coral-200 rounded-full p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            ))}
            {allergies.length === 0 && (
              <p className="text-gray-400 text-sm italic">{t('emptyStates.allergies')}</p>
            )}
          </div>
        </div>

        {/* Condiciones médicas */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Heart className="w-5 h-5 text-vida-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('sections.conditions')}</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            {t('descriptions.conditions')}
          </p>

          <div className="flex gap-2 mb-4">
            <label htmlFor="newCondition" className="sr-only">{t('placeholders.conditions')}</label>
            <input
              id="newCondition"
              type="text"
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem('conditions', newCondition, setNewCondition))}
              className="input flex-1"
              placeholder={t('placeholders.conditions')}
            />
            <button
              type="button"
              onClick={() => addItem('conditions', newCondition, setNewCondition)}
              className="btn-secondary"
              aria-label={t('buttons.addCondition', { defaultValue: 'Agregar condición médica' })}
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {conditions.map((condition, index) => (
              <span key={index} className="inline-flex items-center gap-1 px-3 py-1.5 bg-vida-100 text-vida-800 rounded-full text-sm">
                {condition}
                <button
                  type="button"
                  onClick={() => removeItem('conditions', index)}
                  className="hover:bg-vida-200 rounded-full p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            ))}
            {conditions.length === 0 && (
              <p className="text-gray-400 text-sm italic">{t('emptyStates.conditions')}</p>
            )}
          </div>
        </div>

        {/* Medicamentos */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Pill className="w-5 h-5 text-salud-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('sections.medications')}</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            {t('descriptions.medications')}
          </p>

          <div className="flex gap-2 mb-4">
            <label htmlFor="newMedication" className="sr-only">{t('placeholders.medications')}</label>
            <input
              id="newMedication"
              type="text"
              value={newMedication}
              onChange={(e) => setNewMedication(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem('medications', newMedication, setNewMedication))}
              className="input flex-1"
              placeholder={t('placeholders.medications')}
            />
            <button
              type="button"
              onClick={() => addItem('medications', newMedication, setNewMedication)}
              className="btn-secondary"
              aria-label={t('buttons.addMedication', { defaultValue: 'Agregar medicamento' })}
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {medications.map((medication, index) => (
              <span key={index} className="inline-flex items-center gap-1 px-3 py-1.5 bg-salud-100 text-salud-800 rounded-full text-sm">
                {medication}
                <button
                  type="button"
                  onClick={() => removeItem('medications', index)}
                  className="hover:bg-salud-200 rounded-full p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            ))}
            {medications.length === 0 && (
              <p className="text-gray-400 text-sm italic">{t('emptyStates.medications')}</p>
            )}
          </div>
        </div>

        {/* Seguro médico */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('sections.insurance')}</h2>
            </div>
            {selectedInsurance && (
              <button
                type="button"
                onClick={() => setShowNetworkModal(true)}
                className="text-sm text-vida-600 hover:text-vida-700 font-medium flex items-center gap-1"
              >
                <Building2 className="w-4 h-4" />
                {t('networkModal.viewButton')}
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Selector de Aseguradora */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('fields.insuranceProvider')}</label>
              <div className="relative">
                <input
                  type="text"
                  value={showInsuranceDropdown ? insuranceSearch : (selectedInsurance || '')}
                  onChange={(e) => {
                    setInsuranceSearch(e.target.value);
                    if (!showInsuranceDropdown) setShowInsuranceDropdown(true);
                  }}
                  onFocus={() => setShowInsuranceDropdown(true)}
                  className="input pr-10"
                  placeholder={t('placeholders.insuranceSearch')}
                />
                <button
                  type="button"
                  onClick={() => setShowInsuranceDropdown(!showInsuranceDropdown)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  <ChevronDown className={`w-5 h-5 transition-transform ${showInsuranceDropdown ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Dropdown de aseguradoras */}
              {showInsuranceDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {filteredInsurances.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">
                      {t('emptyStates.insuranceSearch')}
                    </div>
                  ) : (
                    filteredInsurances.map((ins: InsuranceOption) => (
                      <button
                        key={ins.id}
                        type="button"
                        onClick={() => selectInsurance(ins)}
                        className={`w-full px-3 py-2 text-left hover:bg-vida-50 flex items-center justify-between ${
                          selectedInsurance === ins.shortName ? 'bg-vida-50' : ''
                        }`}
                      >
                        <div>
                          <div className="font-medium text-gray-900">{ins.shortName || ins.name}</div>
                          <div className="text-xs text-gray-500">{t(`insuranceTypes.${ins.type}`, { defaultValue: ins.type })}</div>
                        </div>
                        {selectedInsurance === ins.shortName && (
                          <Check className="w-4 h-4 text-vida-600" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Cerrar dropdown al hacer clic fuera */}
              {showInsuranceDropdown && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowInsuranceDropdown(false)}
                />
              )}
            </div>

            <div>
              <label htmlFor="insurancePolicy" className="block text-sm font-medium text-gray-700 mb-1">{t('fields.insurancePolicy')}</label>
              <input
                id="insurancePolicy"
                type="text"
                {...register('insurancePolicy')}
                className="input"
                placeholder={t('placeholders.insurancePolicy')}
              />
            </div>
            <div>
              <label htmlFor="insurancePhone" className="block text-sm font-medium text-gray-700 mb-1">{t('fields.insurancePhone')}</label>
              <input
                id="insurancePhone"
                type="tel"
                {...register('insurancePhone')}
                className="input"
                placeholder={t('placeholders.insurancePhone')}
              />
            </div>
          </div>

          {/* Info de la aseguradora seleccionada */}
          {selectedInsurance && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <span className="font-medium">{t('fields.selectedInsurance')}:</span> {selectedInsurance}
              </p>
            </div>
          )}
        </div>

        {/* Modal de Hospitales en Red */}
        {showNetworkModal && (
          <div
            className="fixed inset-0 z-50 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="network-modal-title"
          >
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
              <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={() => setShowNetworkModal(false)} aria-hidden="true" />

              <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                  <div>
                    <h3 id="network-modal-title" className="text-lg font-semibold text-gray-900">{t('networkModal.title')}</h3>
                    <p className="text-sm text-gray-500">{t('networkModal.subtitle', { name: selectedInsurance, count: networkHospitals.length })}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNetworkModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    aria-label={t('networkModal.close')}
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                </div>

                <div className="p-4 overflow-y-auto max-h-[60vh]">
                  {loadingNetwork ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-8 h-8 border-4 border-vida-200 border-t-vida-600 rounded-full animate-spin" />
                    </div>
                  ) : networkHospitals.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>{t('networkModal.noHospitals')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {networkHospitals.map((hospital: any) => (
                        <div key={hospital.id} className="p-4 border border-gray-200 rounded-lg hover:border-vida-300 transition-colors">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium text-gray-900">{hospital.name}</h4>
                              <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                                <MapPin className="w-4 h-4" />
                                <span>{hospital.address}, {hospital.city}</span>
                              </div>
                              {hospital.emergencyPhone && (
                                <div className="flex items-center gap-1 text-sm text-vida-600 mt-1">
                                  <Phone className="w-4 h-4" />
                                  <a href={`tel:${hospital.emergencyPhone}`} className="hover:underline">
                                    {hospital.emergencyPhone}
                                  </a>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {hospital.hasEmergency && (
                                <span className="px-2 py-0.5 bg-coral-100 text-coral-700 text-xs rounded-full">{t('networkModal.emergency')}</span>
                              )}
                              {hospital.has24Hours && (
                                <span className="px-2 py-0.5 bg-salud-100 text-salud-700 text-xs rounded-full">{t('networkModal.hours24')}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setShowNetworkModal(false)}
                    className="w-full btn-secondary"
                  >
                    {t('networkModal.close')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Donación de órganos */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Heart className="w-5 h-5 text-coral-500" />
            <h2 className="text-lg font-semibold text-gray-900">{t('sections.organDonation')}</h2>
          </div>
          <div className="flex items-center gap-4">
            <label htmlFor="isDonor" className="relative inline-flex items-center cursor-pointer">
              <input
                id="isDonor"
                type="checkbox"
                {...register('isDonor')}
                className="sr-only peer"
                aria-describedby="isDonor-desc"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-vida-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-salud-500" aria-hidden="true"></div>
              <span className="sr-only">{t('sections.organDonation')}</span>
            </label>
            <div>
              <p className="font-medium text-gray-900">
                {isDonor ? t('donor.yes') : t('donor.no')}
              </p>
              <p id="isDonor-desc" className="text-sm text-gray-500">
                {t('descriptions.organDonation')}
              </p>
            </div>
          </div>
        </div>

        {/* Botón guardar */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isDirty || updateMutation.isPending}
            className="btn-primary"
          >
            {updateMutation.isPending ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {t('buttons.saving')}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Save className="w-5 h-5" />
                {t('buttons.save')}
              </div>
            )}
          </button>
        </div>
      </form>

      {/* Autenticación Biométrica - fuera del form porque tiene su propia lógica */}
      <BiometricSettings
        onError={(error) => toast.error(error)}
        onSuccess={(message) => toast.success(message)}
      />
    </div>
  );
}
