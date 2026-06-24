import { stats } from "@/lib/data"

export function StatBar() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-[8px] border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-foreground">{s.value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
        </div>
      ))}
    </div>
  )
}
