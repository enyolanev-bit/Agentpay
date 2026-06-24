import { ShieldCheck, Check, Scale, ScanSearch, Undo2, X } from "lucide-react"
import { primaryIntent } from "@/lib/data"

export function ApprovalMock() {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: primaryIntent.currency,
  }).format(primaryIntent.amount)

  return (
    <section className="rounded-[8px] border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Human approval</h2>
      <p className="mb-5 text-sm text-muted-foreground text-pretty">
        Operator confirms on their phone before commit
      </p>

      <div className="mx-auto w-full max-w-[300px]">
        <div className="rounded-[28px] border border-border bg-muted p-2.5 shadow-sm">
          <div className="overflow-hidden rounded-[20px] border border-border bg-card">
            {/* phone status bar */}
            <div className="flex items-center justify-between px-4 py-2 text-[11px] text-muted-foreground">
              <span className="font-mono">9:41</span>
              <span className="h-1 w-16 rounded-full bg-muted" />
              <span className="font-mono">AgentPay</span>
            </div>

            <div className="border-t border-border px-4 py-4">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Approval requested
              </div>

              <div className="mt-3 text-center">
                <p className="font-mono text-3xl font-semibold text-foreground">{amount}</p>
                <p className="mt-1 text-sm text-muted-foreground">{primaryIntent.providerLabel}</p>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between rounded-[8px] border border-success/30 bg-success/10 px-3 py-2">
                  <span className="flex items-center gap-2 text-xs text-foreground">
                    <Scale className="h-4 w-4 text-success" aria-hidden="true" />
                    Policy
                  </span>
                  <span className="text-xs font-semibold text-success">cap OK</span>
                </div>
                <div className="flex items-center justify-between rounded-[8px] border border-success/30 bg-success/10 px-3 py-2">
                  <span className="flex items-center gap-2 text-xs text-foreground">
                    <ScanSearch className="h-4 w-4 text-success" aria-hidden="true" />
                    Verifier
                  </span>
                  <span className="text-xs font-semibold text-success">no injection</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button className="flex flex-col items-center gap-1 rounded-[8px] border border-border bg-muted/40 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                  <X className="h-4 w-4 text-danger" aria-hidden="true" />
                  Reject
                </button>
                <button className="flex flex-col items-center gap-1 rounded-[8px] border border-border bg-muted/40 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                  <Undo2 className="h-4 w-4 text-warning" aria-hidden="true" />
                  Undo
                </button>
                <button className="flex flex-col items-center gap-1 rounded-[8px] bg-success py-2.5 text-xs font-semibold text-success-foreground transition-opacity hover:opacity-90">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Commit
                </button>
              </div>

              <p className="mt-3 text-center font-mono text-[11px] text-muted-foreground">
                molliePaymentId: <span className="text-danger">null</span> until commit
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
