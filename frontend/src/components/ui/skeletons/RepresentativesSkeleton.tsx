import { Skeleton } from '../Skeleton';

export function RepresentativesSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6" role="status" aria-label="Cargando representantes">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      {/* Contact cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card">
          <div className="flex items-start gap-4">
            <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-36" />
                {i === 0 && <Skeleton className="h-5 w-16 rounded-full" />}
              </div>
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-4">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="w-8 h-8 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
