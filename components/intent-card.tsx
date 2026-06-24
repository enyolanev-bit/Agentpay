import type { ReversiblePaymentIntent } from "@/lib/data"
import { PolicyBadge, VerifierBadge, StatusBadge } from "./badges"
import { FileLock2 } from "lucide-react"

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  )
}

export function IntentCard({ intent }: { intent: ReversiblePaymentIntent }) {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: intent.currency,
  }).format(intent.amount)

  return (
    <section className="rounded-[8px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-muted text-primary">
          <FileLock2 className="h-4.5 w-4.5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">ReversiblePaymentIntent</h2>
          <p className="text-xs text-muted-foreground">object</p>
        </div>
      </div>

      <div className="rounded-[8px] border border-border bg-muted px-4">
        <Row label="intentId">
          <span className="font-mono text-foreground">{intent.intentId}</span>
        </Row>
        <Row label="provider">
          <span className="text-foreground">{intent.providerLabel}</span>
        </Row>
        <Row label="amount">
          <span className="font-mono font-semibold text-foreground">{amount}</span>
        </Row>
        <Row label="policyDecision">
          <PolicyBadge decision={intent.policyDecision} />
        </Row>
        <Row label="verifierVerdict">
          <VerifierBadge verdict={intent.verifierVerdict} />
        </Row>
        <Row label="status">
          <StatusBadge status={intent.status} />
        </Row>
        <Row label="commitAfter">
          <span className="font-mono text-foreground">{intent.commitAfter}</span>
        </Row>
        <Row label="molliePaymentId">
          <span className="font-mono text-danger">null</span>
        </Row>
      </div>
    </section>
  )
}
