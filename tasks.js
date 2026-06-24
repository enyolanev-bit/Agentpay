// Task runner : un agent Codex "live" reçoit une tâche, DÉCIDE s'il doit payer un autre
// agent pour la finir, et déclenche le paiement dans les rails existants.
//
// Garde-fou 1 rappelé ici : le LLM décide QUOI/QUI (payer ? quel provider ?), mais le
// MONTANT vient du prix posté par le provider (déterministe), jamais du LLM.
//
// Fallback : si `codex exec` échoue/timeout, on prend une décision pré-cannée pour que la
// démo ne plante pas en scène.

import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { agentsForAccount, providersForAccount, formatMoney } from './store.js';
import { requestAgentToAgentPayment } from './flow.js';
import { getDeliverable } from './provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECISION_SCHEMA = join(__dirname, 'decision-schema.json');
const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS ?? 90_000);
const DECIDER_MODE = process.env.DECIDER_MODE ?? 'codex'; // 'codex' | 'fallback'

export const EARNING_DEMO_TASKS = [
  'Use @data-provider to enrich a list of companies with firmographic data, score, and segment.',
  'Ask @kyc-checker to verify onboarding risk for a new account.',
  'Use @geocoder to normalize delivery addresses for a paid local commerce lead.',
];

const buildPrompt = (taskText, catalog) => `Tu es un agent autonome qui doit accomplir une tache.
Tache : ${JSON.stringify(taskText)}

Tu ne peux PAS produire ce livrable toi-meme : il faut une donnee fournie par un autre agent.
Catalogue marketplace disponible (handle - service - prix) :
${catalog.map((c) => `- ${c.handle} : ${c.service} (${c.price})`).join('\n')}

Decide : dois-tu payer un de ces agents pour finir la tache, et lequel ?
- needsPayment: true si tu dois payer pour finir, false sinon.
- payee: le handle exact d'un agent du catalogue ci-dessus, ou "" si aucun.
- reason: une phrase, en francais, expliquant ta decision.
Tu ne fixes PAS le prix : c'est le prix poste par le provider qui s'applique. Reponds via le schema.`;

// Décision réelle via Codex (verdict structuré). Rejette si stdin ouvert -> on ferme stdin.
function runCodexDecision(taskText, catalog) {
  return new Promise((resolve, reject) => {
    const outPath = join(tmpdir(), `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    const child = spawn('codex', [
      'exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only',
      '--output-schema', DECISION_SCHEMA, '-o', outPath,
      buildPrompt(taskText, catalog),
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('codex timeout')); }, CODEX_TIMEOUT_MS);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', async (code) => {
      clearTimeout(timer);
      try {
        const raw = await readFile(outPath, 'utf8');
        await rm(outPath, { force: true });
        resolve({ ...JSON.parse(raw), source: 'codex' });
      } catch (err) {
        reject(new Error(`codex exit ${code}: ${err.message} | ${stderr.slice(-160)}`));
      }
    });
  });
}

const words = (value) =>
  String(value ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3);

// Décision de secours : déterministe, choisit le provider du catalogue le plus proche de la tâche.
const fallbackDecision = (taskText, catalog) => {
  const taskWords = new Set(words(taskText));
  const ranked = catalog
    .map((provider, index) => ({
      provider,
      index,
      score: words(`${provider.handle} ${provider.service}`).filter((w) => taskWords.has(w)).length,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen = ranked[0]?.provider;

  return {
    needsPayment: catalog.length > 0,
    payee: chosen?.handle ?? '',
    reason: 'Decision de secours : un provider est requis pour produire le livrable (Codex indisponible).',
    source: 'fallback',
  };
};

// runTask : orchestre la tâche live et renvoie une timeline pour l'UI / l'API.
export async function runTask({ accountId, taskText, onStep }) {
  const task = taskText?.trim() || 'Enrichir une liste d\'entreprises (societe, score, segment).';
  const timeline = [];
  // onStep (optionnel) : streamé en direct (SSE). Le retour timeline reste complet (compat API/HTML).
  const step = (event, detail, extra = {}) => {
    const s = { event, detail, ...extra };
    timeline.push(s);
    if (onStep) { try { onStep(s); } catch { /* flux ferme : on continue */ } }
    return s;
  };

  // Agent payeur "live" = le premier agent payer du compte (seed: @codex-ops).
  const agents = agentsForAccount(accountId);
  const payer = agents.find((a) => a.role === 'payer') ?? agents[0];
  const providers = providersForAccount(accountId).filter((a) => a.service);
  const catalog = providers.map((p) => ({ handle: p.handle, service: p.service.label, price: formatMoney(p.service.priceCents) }));

  step('task.received', task, { agent: payer?.handle });

  if (!payer) return { task, timeline: [{ event: 'error', detail: 'Aucun agent payeur.' }], deliverable: null, payment: null };

  // 1. Décision Codex (ou fallback).
  step('agent.thinking', 'L’agent réfléchit : Codex décide s’il doit payer un agent pour finir la tâche…');
  let decision;
  if (DECIDER_MODE === 'codex') {
    try { decision = await runCodexDecision(task, catalog); }
    catch (err) {
      const fallback = fallbackDecision(task, catalog);
      decision = { ...fallback, reason: `${fallback.reason} (${err.message})` };
    }
  } else {
    decision = fallbackDecision(task, catalog);
  }
  step('agent.decision', `[${decision.source}] ${decision.reason}`, { decision });

  if (!decision.needsPayment) {
    step('agent.no_payment', 'Aucun paiement requis selon l’agent.');
    return { task, timeline, deliverable: null, payment: null, payer: payer.handle };
  }

  // 2. Résolution du provider + PRIX déterministe (pas le LLM).
  const selectedPayee = String(decision.payee ?? '').trim().toLowerCase();
  const payee = providers.find((provider) =>
    provider.handle.toLowerCase() === selectedPayee || provider.id.toLowerCase() === selectedPayee
  ) ?? providers[0];
  if (!payee || !payee.service) {
    step('error', `Provider "${decision.payee}" introuvable.`);
    return { task, timeline, deliverable: null, payment: null, payer: payer.handle };
  }
  const amountCents = payee.service.priceCents; // prix posté, déterministe
  step('price.resolved', `Prix du service ${payee.handle} : ${formatMoney(amountCents)} (posté par le provider, pas par le LLM).`);

  // 3. Paiement A2A : rejoue policy -> verifier Codex -> exécution -> settlement.
  step('payment.processing', 'Paiement en cours : policy déterministe → vérif Codex → règlement A2A…');
  const payment = await requestAgentToAgentPayment({
    payerAgent: payer, payeeAgent: payee, amountCents, currency: 'EUR', service: payee.service.label,
  });
  step('payment.' + payment.status, `Policy: ${payment.policyDecision?.decision ?? '-'} | Verifier: ${payment.verifierVerdict ? (payment.verifierVerdict.allow ? 'allow' : 'block') + ' (' + payment.verifierVerdict.source + ')' : '-'}`, { payment });

  // 4. Livrable si payé.
  let deliverable = null;
  if (payment.status === 'paid') {
    deliverable = getDeliverable(payee.handle, task);
    step('deliverable.received', `${payee.handle} a livré : ${deliverable.label} (${deliverable.note}). Tâche terminée.`);
  } else {
    step('task.blocked', `Paiement ${payment.status} : la tâche ne peut pas se terminer.`);
  }

  return { task, timeline, deliverable, payment, payer: payer.handle, payee: payee.handle };
}

export async function runEarningDemo({ accountId, tasks = EARNING_DEMO_TASKS, onStep } = {}) {
  const providersBefore = providersForAccount(accountId);
  const earningsBefore = providersBefore.reduce((sum, agent) => sum + agent.earningsCents, 0);
  const runs = [];

  for (const taskText of tasks) {
    if (onStep) onStep({ event: 'earning.task.started', detail: taskText });
    const result = await runTask({
      accountId,
      taskText,
      onStep: (step) => {
        if (onStep) onStep({ ...step, task: taskText });
      },
    });
    runs.push(result);
    if (onStep) {
      onStep({
        event: 'earning.task.finished',
        detail: `${result.payee ?? 'no provider'} -> ${result.payment?.status ?? 'no payment'}`,
        task: taskText,
      });
    }
  }

  const providersAfter = providersForAccount(accountId);
  const earningsAfter = providersAfter.reduce((sum, agent) => sum + agent.earningsCents, 0);
  const paidRuns = runs.filter((run) => run.payment?.status === 'paid');

  return {
    objective: 'Generate revenue through agent-to-agent work without giving the agent control of money.',
    runs,
    paidRuns: paidRuns.length,
    totalRuns: runs.length,
    earnedCents: earningsAfter - earningsBefore,
    earningsBefore,
    earningsAfter,
    providers: providersAfter.map((agent) => ({
      handle: agent.handle,
      service: agent.service?.label ?? '',
      priceCents: agent.service?.priceCents ?? 0,
      earningsCents: agent.earningsCents,
      ledgerCount: agent.ledger.length,
    })),
  };
}
