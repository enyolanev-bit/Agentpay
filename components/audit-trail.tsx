"use client"

import { useState } from "react"
import { auditTrail, adversarialAudit, type AuditEvent } from "@/lib/data"
import {
  Bot,
  FileLock2,
  Scale,
  ScanSearch,
  UserCheck,
  CheckCircle2,
  Ban,
} from "lucide-react"

const iconFor = {
  "agent.requested": Bot,
  "intent.created": FileLock2,
  "policy.checked": Scale,
  "verifier.checked": ScanSearch,
  "human.reviewed": UserCheck,
  "payment.committed": CheckCircle2,
  "payment.blocked": Ban,
} as const

function stateColor(state: AuditEvent["state"]) {
  if (state === "blocked") return { ring: "bg-danger text-danger-foreground", line: "bg-danger/40" }
  if (state === "pending") return { ring: "bg-warning text-warning-foreground", line: "bg-warning/40" }
  return { ring: "bg-success text-success-foreground", line: "bg-success/40" }
}

export function AuditTrail() {
  const [scenario, setScenario] = useState<"approved" | "blocked">("approved")
  const events = scenario === "approved" ? auditTrail : adversarialAudit

  return (
    <section className="rounded-[8px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Audit trail</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every state transition, append-only</p>
        </div>
        <div className="inline-flex rounded-[8px] border border-border bg-muted/40 p-0.5">
          <button
            onClick={() => setScenario("approved")}
            className={`rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors ${
              scenario === "approved" ? "bg-success/15 text-success" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Committed
          </button>
          <button
            onClick={() => setScenario("blocked")}
            className={`rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors ${
              scenario === "blocked" ? "bg-danger/15 text-danger" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Blocked
          </button>
        </div>
      </div>

      <ol className="relative">
        {events.map((e, i) => {
          const Icon = iconFor[e.kind]
          const colors = stateColor(e.state)
          const isLast = i === events.length - 1
          return (
            <li key={`${scenario}-${e.kind}`} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast && (
                <span className={`absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px ${colors.line}`} aria-hidden="true" />
              )}
              <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.ring}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-sm font-medium text-foreground">{e.kind}</p>
                  <time className="shrink-0 font-mono text-xs text-muted-foreground">{e.at}</time>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{e.detail}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
