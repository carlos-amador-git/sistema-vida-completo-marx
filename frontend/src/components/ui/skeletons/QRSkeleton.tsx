import { Skeleton } from '../Skeleton';

export function QRSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6" role="status" aria-label="Cargando codigo QR">
      {/* Header */}
      <div>
        <Skeleton className="h-7 w-52 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* QR Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Gradient header */}
        <Skeleton className="h-20 w-full rounded-none" />

        {/* QR area */}
        <div className="p-8 flex flex-col items-center">
          <div className="relative mb-6">
            <Skeleton className="w-[282px] h-[282px] rounded-xl" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-gray-300 border-t-vida-500 rounded-full animate-spin" />
            </div>
          </div>

          <Skeleton className="h-3 w-48 mb-4" />
          <Skeleton className="h-4 w-36 mb-6" />

          {/* Action buttons */}
          <div className="flex gap-4">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Info boxes */}
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}
