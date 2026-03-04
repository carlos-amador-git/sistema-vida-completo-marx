// src/components/ui/Skeleton.tsx

interface SkeletonProps {
  className?: string;
}

/** Primitive pulsing skeleton block */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200 ${className || ''}`}
      aria-hidden="true"
    />
  );
}

/** Card skeleton: avatar circle + title line + two body lines */
export function CardSkeleton() {
  return (
    <div className="card space-y-4" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/** Single table row skeleton with 4 columns */
export function TableRowSkeleton() {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-0"
      aria-hidden="true"
    >
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
      <Skeleton className="h-3 flex-1" />
      <Skeleton className="h-3 w-24 hidden sm:block" />
      <Skeleton className="h-3 w-20 hidden md:block" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/** Profile skeleton: large avatar + name + two stat chips */
export function ProfileSkeleton() {
  return (
    <div className="card flex flex-col items-center gap-4 py-8" aria-hidden="true">
      <Skeleton className="w-20 h-20 rounded-full" />
      <div className="space-y-2 text-center w-full max-w-xs">
        <Skeleton className="h-5 w-40 mx-auto" />
        <Skeleton className="h-3 w-28 mx-auto" />
      </div>
      <div className="flex gap-6 mt-2">
        <div className="flex flex-col items-center gap-1">
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

/** Dashboard skeleton: welcome banner + 4 stat cards + chart area */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando panel de control">
      {/* Welcome banner */}
      <Skeleton className="h-28 w-full rounded-xl" />

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-start justify-between">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <Skeleton className="w-5 h-5 rounded" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Lower 3-column section */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-center gap-3 mb-1">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="h-4 w-32" />
            </div>
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-2.5 w-12" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
