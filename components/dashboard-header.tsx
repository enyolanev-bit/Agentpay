import { ShieldCheck, Plus, UserCheck } from "lucide-react"

export function DashboardHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between md:py-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">AgentPay</h1>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                control layer
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
              Agent checkout for controlled AI spend
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex items-center gap-2 rounded-[8px] border border-border bg-transparent px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            Open human review
          </button>
          <button className="inline-flex items-center gap-2 rounded-[8px] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create payment intent
          </button>
        </div>
      </div>
    </header>
  )
}
