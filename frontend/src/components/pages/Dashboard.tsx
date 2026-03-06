// src/components/pages/Dashboard.tsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../hooks/useLocale';
import { profileApi, directivesApi, representativesApi, emergencyApi, documentsApi } from '../../services/api';
import {
  User,
  FileText,
  Users,
  QrCode,
  AlertTriangle,
  Shield,
  Heart,
  History,
  FolderOpen,
  Eye
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DashboardSkeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { HealthStatCard } from '../dashboard/HealthStatCard';
import { staggerContainer } from '../../lib/animations';
import { AnimatedIcon } from '../ui/AnimatedIcon';

export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { locale } = useLocale();
  const { user } = useAuth();

  // Queries
  const { data: profileData, isLoading: loadingProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.getProfile(),
  });

  const { data: directivesData, isLoading: loadingDirectives } = useQuery({
    queryKey: ['directives', 'active'],
    queryFn: () => directivesApi.getActive(),
  });

  const { data: representativesData, isLoading: loadingReps } = useQuery({
    queryKey: ['representatives'],
    queryFn: () => representativesApi.list(),
  });

  const { data: historyData } = useQuery({
    queryKey: ['emergency', 'history'],
    queryFn: () => emergencyApi.getHistory(),
  });

  const { data: documentsData } = useQuery({
    queryKey: ['documents'],
    queryFn: () => documentsApi.list(),
  });

  const profile = profileData?.data?.profile;
  const hasActiveDirective = directivesData?.data?.hasActiveDirective;
  const representatives = representativesData?.data?.representatives || [];
  const recentAccesses = historyData?.data?.accesses?.slice(0, 3) || [];
  const documents = documentsData?.data?.documents || [];
  const visibleDocuments = documents.filter((doc: any) => doc.isVisible);
  const recentDocuments = documents.slice(0, 3);

  // Calcular estado de completitud del perfil
  const profileCompleteness = (() => {
    if (!profile) return 0;
    let score = 0;
    if (profile.bloodType) score += 25;
    if (profile.allergies?.length > 0 || profile.conditions?.length > 0) score += 25;
    if (profile.medications?.length > 0) score += 25;
    if (representatives?.length > 0) score += 25;
    return score;
  })();

  const isLoading = loadingProfile || loadingDirectives || loadingReps;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <ErrorBoundary>
      <section className="space-y-6 animate-fade-in" aria-label={t('sectionLabel', { defaultValue: 'Panel de control' })}>
        {/* Header de bienvenida */}
        <div className="card bg-gradient-to-r from-vida-600 to-vida-700 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                {t('welcome', { name: user?.name?.split(' ')[0] })}
              </h1>
              <p className="text-vida-100">
                {t('subtitle')}
              </p>
            </div>
            <Link
              to="/emergency-qr"
              className="inline-flex items-center gap-2 bg-white text-vida-700 hover:bg-white/90 px-4 py-2 rounded-lg transition-colors font-medium"
            >
              <QrCode className="w-5 h-5" />
              {t('viewEmergencyQR')}
            </Link>
          </div>
        </div>

        {/* Alertas si falta completar algo */}
        {profileCompleteness < 100 && (
          <div className="alert-warning">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-medium">{t('alerts.incompleteProfile', { percent: profileCompleteness })}</p>
              <p className="text-sm mt-1">
                {t('alerts.completeInfo')}
              </p>
            </div>
            <Link to="/profile" className="btn-secondary text-sm ml-auto whitespace-nowrap">
              {t('alerts.complete')}
            </Link>
          </div>
        )}

        {!hasActiveDirective && (
          <div className="alert-info">
            <FileText className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-medium">{t('alerts.noDirective')}</p>
              <p className="text-sm mt-1">
                {t('alerts.createDirectiveInfo')}
              </p>
            </div>
            <Link to="/directives/new" className="btn-primary text-sm ml-auto whitespace-nowrap">
              {t('alerts.createNow')}
            </Link>
          </div>
        )}

        {/* Cards de estado — animadas */}
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <HealthStatCard
            to="/profile"
            icon={<AnimatedIcon icon={User} trigger="inView" animation="draw" size={24} className="w-6 h-6" />}
            iconBg="bg-vida-100"
            iconColor="text-vida-600"
            title={t('cards.medicalProfile')}
            value={profileCompleteness}
            valueLabel="%"
            progress={profileCompleteness}
            trend={profileCompleteness === 100 ? 'up' : 'neutral'}
            trendLabel={profileCompleteness === 100 ? t('cards.complete') : t('cards.percentComplete', { percent: profileCompleteness })}
            delay={0}
          />

          <HealthStatCard
            to="/directives"
            icon={<AnimatedIcon icon={FileText} trigger="inView" animation="draw" size={24} className="w-6 h-6" />}
            iconBg="bg-coral-100"
            iconColor="text-coral-600"
            title={t('cards.directive')}
            subtitle={hasActiveDirective ? t('cards.directiveProtected') : t('cards.directiveRegister')}
            trend={hasActiveDirective ? 'up' : 'down'}
            trendLabel={hasActiveDirective ? t('cards.active') : t('cards.notRegistered')}
            delay={0.1}
          />

          <HealthStatCard
            to="/representatives"
            icon={<AnimatedIcon icon={Users} trigger="inView" animation="draw" size={24} className="w-6 h-6" />}
            iconBg="bg-salud-100"
            iconColor="text-salud-600"
            title={t('cards.representatives')}
            value={representatives.length}
            valueLabel={t('cards.representativesPrimary', { defaultValue: 'contactos' })}
            trend={representatives.length > 0 ? 'up' : 'down'}
            trendLabel={representatives.length > 0
              ? representatives[0]?.name
              : t('cards.representativesDesignate')}
            delay={0.2}
          />

          <HealthStatCard
            to="/documents"
            icon={<AnimatedIcon icon={FolderOpen} trigger="inView" animation="draw" size={24} className="w-6 h-6" />}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
            title={t('cards.documents')}
            value={documents.length}
            valueLabel={t('cards.documentsCount', { count: documents.length, defaultValue: 'documentos' })}
            delay={0.3}
          >
            {visibleDocuments.length > 0 && (
              <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                <Eye className="w-3 h-3" />
                <span>{t('cards.documentsVisible', { count: visibleDocuments.length })}</span>
              </div>
            )}
          </HealthStatCard>
        </motion.div>

        {/* Sección de información rápida */}
        <h2 className="sr-only">{t('quickInfoTitle', { defaultValue: 'Información rápida de salud' })}</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Info médica destacada */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="w-5 h-5 text-coral-500" />
              <h3 className="font-semibold text-foreground">{t('criticalInfo.title')}</h3>
            </div>
            {profile ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-muted-foreground">{t('criticalInfo.bloodType')}</span>
                  <span className="font-medium text-foreground">
                    {profile.bloodType || <span className="text-gray-400">{t('criticalInfo.notSpecified')}</span>}
                  </span>
                </div>
                <div className="py-2 border-b border-gray-100">
                  <span className="text-muted-foreground">{t('criticalInfo.allergies')}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {profile.allergies?.length > 0 ? (
                      profile.allergies.map((allergy: string, i: number) => (
                        <span key={i} className="badge-danger">{allergy}</span>
                      ))
                    ) : (
                      <span className="text-gray-400 text-sm">{t('criticalInfo.noneRegistered')}</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">{t('criticalInfo.donor')}</span>
                  <span className={`font-medium ${profile.isDonor ? 'text-salud-600' : 'text-foreground'}`}>
                    {profile.isDonor ? t('criticalInfo.yes') : t('criticalInfo.no')}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">{t('criticalInfo.loadInfo')}</p>
            )}
          </div>

          {/* Historial de accesos */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-vida-500" />
                <h3 className="font-semibold text-foreground">{t('recentAccesses.title')}</h3>
              </div>
              <Link to="/access-history" className="text-sm text-vida-600 hover:underline">
                {t('recentAccesses.viewAll')}
              </Link>
            </div>
            {recentAccesses.length > 0 ? (
              <div className="space-y-3">
                {recentAccesses.map((access: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-vida-100 flex items-center justify-center flex-shrink-0">
                      <Shield className="w-4 h-4 text-vida-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {access.accessorName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {access.accessorRole} • {access.institutionName || t('recentAccesses.unknownInstitution')}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(access.accessedAt).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short'
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Shield />}
                title={t('recentAccesses.noAccesses')}
                className="py-6"
              />
            )}
          </div>

          {/* Documentos recientes */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <FolderOpen className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-gray-900">{t('recentDocuments.title')}</h3>
              </div>
              <Link to="/documents" className="text-sm text-amber-600 hover:underline">
                {t('recentDocuments.viewAll')}
              </Link>
            </div>
            {recentDocuments.length > 0 ? (
              <div className="space-y-3">
                {recentDocuments.map((doc: any, i: number) => {
                  const categoryLabel = t(`recentDocuments.categories.${doc.category}`, { defaultValue: doc.category });
                  return (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {doc.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{categoryLabel}</span>
                          {doc.isVisible && (
                            <span className="flex items-center gap-0.5 text-amber-600">
                              <Eye className="w-3 h-3" />
                              {t('recentDocuments.visible')}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(doc.createdAt).toLocaleDateString(locale, {
                          day: 'numeric',
                          month: 'short'
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={<FolderOpen />}
                title={t('recentDocuments.noDocuments')}
                className="py-6"
              />
            )}
          </div>
        </div>
      </section>
    </ErrorBoundary>
  );
}
