import { Skeleton } from '../Skeleton';

export function DirectivesSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6" role="status" aria-label="Cargando directivas">
      {/* Header */}
      <div>
        <Skeleton className="h-7 w-56 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Status card */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* Directive sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
