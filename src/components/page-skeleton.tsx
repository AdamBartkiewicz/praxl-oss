export function PageSkeleton({ cards = 6, header = true }: { cards?: number; header?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-5xl p-6 md:p-8 space-y-6 animate-pulse">
      {header && (
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <div className="h-5 w-32 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="flex gap-2 pt-1">
              <div className="h-5 w-16 rounded-full bg-muted" />
              <div className="h-5 w-12 rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6 md:p-8 space-y-6 animate-pulse">
      <div className="rounded-2xl border bg-card p-8 space-y-3">
        <div className="h-7 w-64 rounded-lg bg-muted" />
        <div className="h-4 w-48 rounded bg-muted" />
        <div className="flex gap-2 mt-2">
          <div className="h-7 w-28 rounded-full bg-muted" />
          <div className="h-7 w-24 rounded-full bg-muted" />
          <div className="h-7 w-20 rounded-full bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-7 w-10 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="h-9 w-9 rounded-lg bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg border bg-card" />
        ))}
      </div>
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="flex h-screen animate-pulse">
      <div className="flex-1 p-4 space-y-3">
        <div className="flex items-center gap-3 border-b pb-3">
          <div className="h-8 w-8 rounded bg-muted" />
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="ml-auto flex gap-2">
            <div className="h-8 w-16 rounded bg-muted" />
            <div className="h-8 w-20 rounded bg-muted" />
          </div>
        </div>
        <div className="h-[calc(100vh-120px)] rounded-lg bg-muted" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="mx-auto w-full max-w-5xl p-6 md:p-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-muted" />
        <div className="h-4 w-72 rounded bg-muted" />
      </div>
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3 flex gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-3 w-20 rounded bg-muted" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="border-b last:border-0 px-4 py-3 flex gap-8">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-4 w-24 rounded bg-muted" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
