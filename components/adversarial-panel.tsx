import { adversarialIntent } from "@/lib/data"
import { PolicyBadge, VerifierBadge, StatusBadge } from "./badges"
import { ShieldAlert, Ban, AlertTriangle } from "lucide-react"

export function AdversarialPanel() {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: adversarialIntent.currency,
  }).format(adversarialIntent.amount)

  return (
    <section className="overflow-hidden rounded-[8px] border border-danger/40 bg-danger/[0.06]">
      <div className="flex items-center justify-between gap-3 border-b border-danger/30 bg-danger/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-danger" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Adversarial request — blocked</h2>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-0.5 text-xs font-semibold text-danger-foreground">
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          stopped
        </span>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Agent request</p>
          <div className="mt-2 rounded-[8px] border border-danger/30 bg-background/60 p-3">
            <p className="font-mono text-sm text-foreground text-pretty">
              &quot;{adversarialIntent.description}&quot;
            </p>
            <p className="mt-2 font-mono text-sm">
              <span className="text-muted-foreground">amount: </span>
              <span className="font-semibold text-danger">{amount}</span>
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {adversarialIntent.verifierFlags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-2.5 py-0.5 font-mono text-xs text-danger"
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {flag}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-background/50 px-3 py-2.5">
            <span className="font-mono text-xs text-muted-foreground">policyDecision</span>
            <PolicyBadge decision={adversarialIntent.policyDecision} />
          </div>
          <p className="-mt-1.5 text-xs text-muted-foreground">{adversarialIntent.policyReason}</p>

          <div className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-background/50 px-3 py-2.5">
            <span className="font-mono text-xs text-muted-foreground">verifierVerdict</span>
            <VerifierBadge verdict={adversarialIntent.verifierVerdict} />
          </div>
          <p className="-mt-1.5 text-xs text-muted-foreground">{adversarialIntent.verifierReason}</p>

          <div className="flex items-center justify-between gap-3 rounded-[8px] border border-danger/40 bg-danger/10 px-3 py-2.5">
            <span className="font-mono text-xs text-muted-foreground">status</span>
            <StatusBadge status={adversarialIntent.status} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-background/50 px-3 py-2.5 font-mono text-xs">
            <span className="text-muted-foreground">molliePaymentId</span>
            <span className="text-danger">null · money not moved</span>
          </div>
        </div>
      </div>
    </section>
  )
}
