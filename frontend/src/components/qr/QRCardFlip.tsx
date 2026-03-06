import { useState, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface QRCardFlipProps {
  front: ReactNode;
  back: ReactNode;
  className?: string;
}

export function QRCardFlip({ front, back, className = '' }: QRCardFlipProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      className={`relative cursor-pointer ${className}`}
      style={{ perspective: 1000 }}
      onClick={() => setIsFlipped(!isFlipped)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsFlipped(!isFlipped);
        }
      }}
      aria-label={isFlipped ? 'Ver codigo QR' : 'Ver informacion medica'}
    >
      <motion.div
        className="relative w-full"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 200, damping: 25 }}
      >
        {/* Front — QR Code */}
        <div
          className="w-full"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {front}
        </div>

        {/* Back — Info */}
        <div
          className="absolute inset-0 w-full"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {back}
        </div>
      </motion.div>

      <p className="text-center text-xs text-gray-400 mt-3">
        {isFlipped ? 'Toca para ver QR' : 'Toca para ver datos'}
      </p>
    </div>
  );
}
