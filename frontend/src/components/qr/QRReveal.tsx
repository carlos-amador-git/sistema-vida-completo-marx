import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { revealEffect, glowPulse } from '../../lib/animations';

interface QRRevealProps {
  children: ReactNode;
  glow?: boolean;
  className?: string;
}

export function QRReveal({ children, glow = true, className = '' }: QRRevealProps) {
  return (
    <motion.div
      variants={revealEffect}
      initial="initial"
      animate="animate"
      className={`relative ${className}`}
    >
      {glow && (
        <motion.div
          className="absolute -inset-3 rounded-2xl opacity-60"
          variants={glowPulse}
          animate="animate"
          style={{ zIndex: -1 }}
        />
      )}
      {children}
    </motion.div>
  );
}
