import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { trendBounce } from '../../lib/animations';

interface TrendIndicatorProps {
  trend: 'up' | 'down' | 'neutral';
  label: string;
  className?: string;
}

export function TrendIndicator({ trend, label, className = '' }: TrendIndicatorProps) {
  const colorMap = {
    up: 'text-salud-600 bg-salud-50',
    down: 'text-coral-600 bg-coral-50',
    neutral: 'text-gray-500 bg-gray-50',
  };

  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <motion.div
      variants={trendBounce}
      initial="initial"
      animate="animate"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[trend]} ${className}`}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </motion.div>
  );
}
