import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeInUp, easeTransition } from '@/lib/animations';

interface MotionCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
}

export function MotionCard({ children, className, delay = 0, hover = true }: MotionCardProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      transition={{ ...easeTransition, delay }}
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        hover && 'transition-shadow hover:shadow-md',
        className
      )}
    >
      {children}
    </motion.div>
  );
}
