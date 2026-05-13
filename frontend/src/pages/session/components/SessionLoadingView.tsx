interface Props {
  isSlowLoad: boolean
}

export function SessionLoadingView({ isSlowLoad }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="max-w-2xl mx-auto space-y-1.5">
          <div className="h-4 w-36 rounded bg-muted animate-pulse" />
          <div className="h-3 w-52 rounded bg-muted/50 animate-pulse" style={{ animationDelay: '60ms' }} />
        </div>
      </div>
      <div className="border-b">
        <div className="flex max-w-2xl mx-auto">
          {[0,1,2,3,4].map((i) => (
            <div key={i} className="flex-1 flex items-center justify-center gap-1.5 py-2.5">
              <div className="h-4 w-4 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
              <div className="h-2 w-7 rounded bg-muted/50 animate-pulse" style={{ animationDelay: `${i * 40 + 20}ms` }} />
            </div>
          ))}
        </div>
      </div>
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-7 w-24 rounded bg-muted animate-pulse" style={{ animationDelay: '120ms' }} />
          <div className="h-4 w-14 rounded bg-muted/50 animate-pulse" style={{ animationDelay: '150ms' }} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0,1].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-4 space-y-3 animate-pulse"
              style={{ animationDelay: `${180 + i * 80}ms` }}
            >
              <div className="h-3 w-14 rounded bg-muted/60" />
              <div className="space-y-2">
                <div className="h-8 rounded-lg bg-muted" />
                <div className="h-8 rounded-lg bg-muted" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-muted/60" />
                <div className="h-3 w-5 rounded bg-muted/40" />
                <div className="h-px flex-1 bg-muted/60" />
              </div>
              <div className="space-y-2">
                <div className="h-8 rounded-lg bg-muted" />
                <div className="h-8 rounded-lg bg-muted" />
              </div>
            </div>
          ))}
        </div>
        {isSlowLoad && (
          <p className="text-xs text-muted-foreground text-center mt-2">Taking a bit longer than usual…</p>
        )}
      </main>
    </div>
  )
}
