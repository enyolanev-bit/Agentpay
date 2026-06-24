"use client"

import { useEffect, useState } from "react"
import {
  Bot,
  Code2,
  FileLock2,
  Scale,
  ScanSearch,
  UserCheck,
  CheckCircle2,
  ChevronRight,
  Lock,
} from "lucide-react"

const steps = [
  { key: "agent", label: "Agent request", sub: "agent wants to buy", icon: Bot },
  { key: "prepare", label: "preparePayment(...)", sub: "SDK call", icon: Code2, mono: true },
  { key: "intent", label: "ReversiblePaymentIntent", sub: "created · reversible", icon: FileLock2 },
  { key: "policy", label: "Policy", sub: "deterministic caps", icon: Scale },
  { key: "verifier", label: "Verifier", sub: "independent check", icon: ScanSearch },
  { key: "human", label: "Human review", sub: "approve / reject / undo", icon: UserCheck },
  { key: "commit", label: "Commit", sub: "money moves", icon: CheckCircle2 },
]

export function ProtocolFlow() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setActive((a) => (a + 1) % steps.length)
    }, 1100)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="rounded-[8px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Protocol</h2>
          <p className="mt-1 text-base font-medium text-foreground text-pretty">
            From agent request to commit — money never moves before approval
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Money not moved
        </span>
      </div>

      {/* Flow steps */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {steps.map((step, i) => {
          const Icon = step.icon
          const isActive = i === active
          const isCommit = step.key === "commit"
          return (
            <div key={step.key} className="flex items-center gap-2 lg:flex-1 lg:flex-col">
              <div
                className={`flex w-full items-center gap-3 rounded-[8px] border p-3 transition-colors duration-300 lg:flex-col lg:items-center lg:gap-2 lg:py-4 lg:text-center ${
                  isActive
                    ? isCommit
                      ? "border-success/50 bg-success/10"
                      : "border-primary/50 bg-primary/10"
                    : "border-border bg-muted/40"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] transition-colors duration-300 ${
                    isActive
                      ? isCommit
                        ? "bg-success text-success-foreground"
                        : "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground"
                  } ${isActive ? "animate-pulse-ring" : ""}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 lg:mt-0.5">
                  <p
                    className={`truncate text-sm font-medium ${step.mono ? "font-mono text-[13px]" : ""} ${
                      isActive ? "text-foreground" : "text-foreground/80"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{step.sub}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight
                  className="h-4 w-4 shrink-0 rotate-90 text-muted-foreground lg:rotate-0"
                  aria-hidden="true"
                />
              )}
            </div>
          )
        })}
      </div>

      {/* molliePaymentId field */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-border bg-background/60 px-4 py-3 font-mono text-sm">
        <span className="text-muted-foreground">molliePaymentId</span>
        <span className="flex items-center gap-2">
          <span className="text-danger">null</span>
          <span className="text-xs text-muted-foreground">until commit</span>
        </span>
      </div>
    </section>
  )
}
