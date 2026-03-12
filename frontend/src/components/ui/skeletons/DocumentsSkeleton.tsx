import { Skeleton } from '../Skeleton';

export function DocumentsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando documentos">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>

      {/* Hero card */}
      <div className="card bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
        <div className="flex items-center gap-4 p-2">
          <Skeleton className="w-14 h-14 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Document list */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full ml-auto" />
          </div>
          {Array.from({ length: 2 }).map((_, j) => (
            <div key={j} className="flex items-center gap-3 py-3 border-t border-gray-100 dark:border-gray-700">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
