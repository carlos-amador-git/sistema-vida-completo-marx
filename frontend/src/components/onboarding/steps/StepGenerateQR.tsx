import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { QrCode, Sparkles, Shield } from 'lucide-react';
import { staggerContainer, staggerItem } from '../../../lib/animations';
import { AnimatedIcon } from '../../ui/AnimatedIcon';

interface StepProps {
  onNext: () => void;
}

export default function StepGenerateQR({ onNext: _onNext }: StepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <div className="text-center mb-8">
        <motion.div
          className="w-20 h-20 bg-gradient-to-br from-vida-500 to-vida-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-vida-200"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <AnimatedIcon icon={QrCode} animation="draw" trigger="mount" size={40} className="w-10 h-10 text-white" />
        </motion.div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('steps.qr.title', { defaultValue: 'Tu codigo QR de emergencia' })}
        </h2>
        <p className="text-gray-500 mt-1 text-sm">
          {t('steps.qr.subtitle', { defaultValue: 'Listo para protegerte en cualquier momento' })}
        </p>
      </div>

      <motion.div variants={staggerItem}>
        <div className="bg-gradient-to-br from-vida-50 to-salud-50 dark:from-vida-900/30 dark:to-salud-900/30 rounded-2xl p-6 border border-vida-100 dark:border-vida-800">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <Sparkles className="w-6 h-6 text-vida-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                {t('steps.qr.ready', { defaultValue: 'Todo listo' })}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('steps.qr.readyDesc', { defaultValue: 'Al finalizar se generara automaticamente tu codigo QR unico. Podras imprimirlo, compartirlo o guardarlo en tu wallet.' })}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-salud-500" />
            {t('steps.qr.howItWorks', { defaultValue: 'Como funciona' })}
          </h3>
          <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-vida-100 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-vida-700">1</span>
              {t('steps.qr.step1', { defaultValue: 'Un paramedico escanea tu QR' })}
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-vida-100 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-vida-700">2</span>
              {t('steps.qr.step2', { defaultValue: 'Accede a tu perfil medico de emergencia' })}
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-vida-100 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-vida-700">3</span>
              {t('steps.qr.step3', { defaultValue: 'Tus contactos son notificados automaticamente' })}
            </li>
          </ul>
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <div className="text-center">
          <p className="text-sm text-gray-500">
            {t('steps.qr.clickFinish', { defaultValue: 'Presiona "Finalizar" para completar tu configuracion' })}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
