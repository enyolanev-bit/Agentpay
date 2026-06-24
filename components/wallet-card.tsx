import { Plus, Wifi, Gift, Check, X, ShieldCheck } from "lucide-react"
import { agentWallet, giftProposal } from "@/lib/data"

function money(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n)
}

export function WalletCard() {
  const w = agentWallet
  const remaining = w.monthlyCap - w.spentThisMonth
  const pct = Math.min(100, Math.round((w.spentThisMonth / w.monthlyCap) * 100))

  return (
    <section className="grid gap-5 lg:grid-cols-5">
      {/* Wallet card */}
      <div className="lg:col-span-3">
        <div className="flex h-full flex-col rounded-[8px] border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Agent wallet</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              approval required
            </span>
          </div>

          {/* Apple Pay style card */}
          <div className="mt-4 rounded-[16px] bg-primary p-5 text-primary-foreground">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs/none opacity-70">Balance</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight">{money(w.balance, w.currency)}</p>
              </div>
              <Wifi className="h-5 w-5 rotate-90 opacity-80" aria-hidden="true" />
            </div>
            <div className="mt-8 flex items-end justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide opacity-60">Agent</p>
                <p className="text-sm font-medium">{w.agentName}</p>
                <p className="text-[11px] opacity-60">owned by {w.ownerName}</p>
              </div>
              <p className="font-mono text-sm opacity-80">{"•••• " + w.cardLast4}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="inline-flex items-center gap-2 rounded-[8px] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add money
            </button>
            <button className="inline-flex items-center gap-2 rounded-[8px] border border-border bg-transparent px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
              Manage limits
            </button>
          </div>

          {/* Monthly cap */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Spent this month</span>
              <span className="font-medium text-foreground">
                {money(w.spentThisMonth, w.currency)} / {money(w.monthlyCap, w.currency)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{money(remaining, w.currency)} left before the monthly cap</p>
          </div>
        </div>
      </div>

      {/* Agent gift proposal */}
      <div className="lg:col-span-2">
        <div className="flex h-full flex-col rounded-[8px] border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-muted text-primary">
              <Gift className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Agent suggests a gift</h2>
              <p className="text-xs text-muted-foreground">Proposed by {agentWallet.agentName} · needs your approval</p>
            </div>
          </div>

          <div className="mt-4 rounded-[8px] border border-border bg-muted p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{giftProposal.item}</span>
              <span className="font-semibold text-foreground">{money(giftProposal.amount, giftProposal.currency)}</span>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Recipient</dt>
                <dd className="font-medium text-foreground">{giftProposal.recipient}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Occasion</dt>
                <dd className="font-medium text-foreground">{giftProposal.occasion}</dd>
              </div>
            </dl>
          </div>

          <p className="mt-3 text-xs text-muted-foreground text-pretty">{giftProposal.reason}</p>

          <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
            <button className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-border bg-transparent px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
              <X className="h-4 w-4" aria-hidden="true" />
              Decline
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
              <Check className="h-4 w-4" aria-hidden="true" />
              Approve gift
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
