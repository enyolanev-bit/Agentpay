import { DashboardHeader } from "@/components/dashboard-header"
import { StatBar } from "@/components/stat-bar"
import { ProtocolFlow } from "@/components/protocol-flow"
import { IntentCard } from "@/components/intent-card"
import { ApprovalMock } from "@/components/approval-mock"
import { AdversarialPanel } from "@/components/adversarial-panel"
import { AuditTrail } from "@/components/audit-trail"
import { primaryIntent } from "@/lib/data"

export default function Page() {
  return (
    <main className="min-h-screen bg-background">
      <DashboardHeader />

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <StatBar />

        <ProtocolFlow />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <IntentCard intent={primaryIntent} />
          </div>
          <div className="lg:col-span-1">
            <ApprovalMock />
          </div>
        </div>

        <AdversarialPanel />

        <div className="grid gap-5 lg:grid-cols-2">
          <AuditTrail />
          <IntentSummary />
        </div>
      </div>
    </main>
  )
}

function IntentSummary() {
  return (
    <section className="rounded-[8px] border border-border bg-card p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">How it works</h2>
      <p className="mt-1 text-sm text-muted-foreground">Agent checkout for controlled AI spend</p>

      <ol className="mt-4 space-y-3">
        {[
          { n: 1, t: "Agent prepares", d: "An AI agent calls preparePayment(...) to buy API credits or a SaaS action." },
          { n: 2, t: "Intent is reversible", d: "AgentPay creates a ReversiblePaymentIntent — nothing is charged yet." },
          { n: 3, t: "Policy + verifier", d: "Deterministic policy checks caps; an independent verifier inspects for injection and merchant mismatch." },
          { n: 4, t: "Human in the loop", d: "An operator can approve, reject, or undo before anything commits." },
          { n: 5, t: "Commit moves money", d: "molliePaymentId stays null until commit. Money does not move before approval." },
        ].map((s) => (
          <li key={s.n} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">
              {s.n}
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">{s.t}</p>
              <p className="text-xs text-muted-foreground text-pretty">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
