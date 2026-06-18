export function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="hidden md:block space-y-2">
        <div className="h-8 w-48 bg-slate-200 rounded-lg" />
        <div className="h-4 w-72 bg-slate-100 rounded-lg" />
      </div>

      <div className="app-hero-gradient app-card-elevated p-6 sm:p-7 space-y-5">
        <div className="flex justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="h-3 w-24 bg-slate-200 rounded" />
            <div className="h-6 w-40 bg-slate-200 rounded-lg" />
          </div>
          <div className="h-10 w-28 bg-slate-200 rounded-lg" />
        </div>
        <div className="h-24 bg-white/70 rounded-2xl" />
      </div>

      <div className="app-card p-6 space-y-4">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-16 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="app-card p-6 space-y-3">
        <div className="h-4 w-24 bg-slate-200 rounded" />
        <div className="h-16 bg-slate-100 rounded-xl" />
      </div>
    </div>
  );
}
