import type { IntentStatus, PolicyDecision, VerifierVerdict } from "@/lib/data"

type Tone = "success" | "warning" | "danger" | "muted"

const toneClasses: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  muted: "border-border bg-muted text-muted-foreground",
}

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  )
}

export function PolicyBadge({ decision }: { decision: PolicyDecision }) {
  const map: Record<PolicyDecision, { tone: Tone; label: string }> = {
    cap_ok: { tone: "success", label: "cap_ok" },
    needs_review: { tone: "warning", label: "needs_review" },
    over_budget: { tone: "danger", label: "over_budget" },
  }
  const { tone, label } = map[decision]
  return <Badge tone={tone}>{label}</Badge>
}

export function VerifierBadge({ verdict }: { verdict: VerifierVerdict }) {
  const map: Record<VerifierVerdict, { tone: Tone; label: string }> = {
    no_injection: { tone: "success", label: "no_injection" },
    review: { tone: "warning", label: "review" },
    injection_blocked: { tone: "danger", label: "injection_blocked" },
  }
  const { tone, label } = map[verdict]
  return <Badge tone={tone}>{label}</Badge>
}

export function StatusBadge({ status }: { status: IntentStatus }) {
  const map: Record<IntentStatus, { tone: Tone; label: string }> = {
    pending_reversible: { tone: "warning", label: "pending_reversible" },
    committed: { tone: "success", label: "committed" },
    blocked_by_verifier: { tone: "danger", label: "blocked_by_verifier" },
    blocked_by_policy: { tone: "danger", label: "blocked_by_policy" },
  }
  const { tone, label } = map[status]
  return <Badge tone={tone}>{label}</Badge>
}
