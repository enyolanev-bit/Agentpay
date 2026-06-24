// Store en memoire avec persistance JSON optionnelle au boot serveur.
// Suffisant pour le MVP : durable entre redemarrages locaux, sans pretendre remplacer SQL.
//
// L'argent est stocke en CENTIMES (entiers) pour ne JAMAIS faire d'arithmetique
// sur des flottants. On ne formate en string "12.00" qu'au moment de parler a Mollie.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const seq = { account: 0, agent: 0, payment: 0, audit: 0 };
const nextId = (kind, prefix) => `${prefix}-${++seq[kind]}`;
const prefixes = { account: 'acc', agent: 'agt', payment: 'pay', audit: 'log' };
let persistencePath = null;
let saveScheduled = false;
let saveTimer = null;

const parseSeqFromId = (id, prefix) => {
  const match = String(id ?? '').match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? Number(match[1]) : 0;
};

export const db = {
  accounts: new Map(),      // id -> account
  agents: new Map(),        // id -> agent
  agentsByToken: new Map(), // token -> agentId
  payments: new Map(),      // id -> payment request
  paymentsByIdempotencyKey: new Map(), // scoped key -> payment id
  audit: [],                // log append-only (le plus recent en dernier)
};

const snapshot = () => ({
  version: 1,
  seq: { ...seq },
  accounts: [...db.accounts.values()],
  agents: [...db.agents.values()],
  payments: [...db.payments.values()],
  audit: db.audit,
});

const rebuildIndexes = () => {
  db.agentsByToken = new Map([...db.agents.values()].map((agent) => [agent.token, agent.id]));
  db.paymentsByIdempotencyKey = new Map();
  for (const payment of db.payments.values()) {
    const scopedKey = paymentIdempotencyScope({
      agentId: payment.agentId,
      kind: payment.kind,
      idempotencyKey: payment.idempotencyKey,
    });
    if (scopedKey) db.paymentsByIdempotencyKey.set(scopedKey, payment.id);
  }
  for (const kind of Object.keys(seq)) {
    const values = kind === 'audit' ? db.audit : db[`${kind}s`]?.values?.() ?? [];
    const max = kind === 'audit'
      ? db.audit.reduce((n, item) => Math.max(n, parseSeqFromId(item.id, prefixes.audit)), 0)
      : [...values].reduce((n, item) => Math.max(n, parseSeqFromId(item.id, prefixes[kind])), 0);
    seq[kind] = max;
  }
};

export async function loadStore(filePath) {
  if (saveTimer) clearTimeout(saveTimer);
  saveScheduled = false;
  saveTimer = null;
  persistencePath = filePath || null;
  if (!persistencePath) return false;
  try {
    const raw = await readFile(persistencePath, 'utf8');
    const data = JSON.parse(raw);
    for (const kind of Object.keys(seq)) seq[kind] = Number(data.seq?.[kind] ?? 0);
    db.accounts = new Map((data.accounts ?? []).map((account) => [account.id, account]));
    db.agents = new Map((data.agents ?? []).map((agent) => [agent.id, agent]));
    db.payments = new Map((data.payments ?? []).map((payment) => [payment.id, payment]));
    db.audit = data.audit ?? [];
    rebuildIndexes();
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

export async function saveStore(filePath = persistencePath) {
  if (saveTimer) clearTimeout(saveTimer);
  saveScheduled = false;
  saveTimer = null;
  if (!filePath) return;
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(snapshot(), null, 2)}\n`);
  await rename(tmpPath, filePath);
}

export function scheduleSave() {
  if (!persistencePath || saveScheduled) return;
  saveScheduled = true;
  saveTimer = setTimeout(() => {
    saveScheduled = false;
    saveTimer = null;
    saveStore().catch((err) => console.error(`[store] persistence save failed: ${err.message}`));
  }, 0).unref?.();
}

export const hasAccounts = () => db.accounts.size > 0;
export const firstAccount = () => db.accounts.values().next().value ?? null;

// --- Helpers argent -------------------------------------------------------

// "12,50" ou "12.50" ou 12.5 -> 1250 (centimes). Renvoie null si invalide / <= 0.
export const toCents = (value) => {
  const n = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
};

// 1250 -> "12.50" (string a 2 decimales, format exige par Mollie).
export const centsToMollie = (cents) => (cents / 100).toFixed(2);

// 1250 -> "12,50 EUR" pour l'affichage humain.
export const formatMoney = (cents, currency = 'EUR') =>
  `${(cents / 100).toFixed(2).replace('.', ',')} ${currency}`;

// --- Helpers HTML (deplaces depuis l'ancien server.js) --------------------

export const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

// --- Accounts -------------------------------------------------------------

export function createAccount({ name, email }) {
  const id = nextId('account', 'acc');
  const account = {
    id,
    name,
    email: email ?? '',
    mollieCustomerId: null, // rempli a l'onboarding (creation du customer Mollie)
    mandateId: null,        // rempli quand le first payment est paye (moyen de paiement "on file")
    createdAt: new Date().toISOString(),
  };
  db.accounts.set(id, account);
  scheduleSave();
  return account;
}

export const getAccount = (id) => db.accounts.get(id) ?? null;

export const getAccountByCustomer = (customerId) =>
  [...db.accounts.values()].find((a) => a.mollieCustomerId === customerId) ?? null;

// --- Agents ---------------------------------------------------------------

// Un token simple et lisible pour la demo. En prod : secret aleatoire long + hash.
const makeToken = (id) => `agt_${id.replace('agt-', '')}_${Math.random().toString(36).slice(2, 10)}`;

// Handle public d'adressage A2A (ex: "@data-provider"). Slug du nom + suffixe unique.
const slug = (name) => String(name).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function createAgent({ accountId, name, policy, role = 'payer', service = null, handle }) {
  const id = nextId('agent', 'agt');
  const token = makeToken(id);
  const agent = {
    id,
    accountId,
    name,
    token,
    handle: handle ?? `@${slug(name)}-${id.replace('agt-', '')}`, // adresse A2A
    role,            // 'payer' (declenche des paiements) | 'provider' (rend un service paye)
    service,         // { label, priceCents } si provider
    policy: {
      maxPerTxCents: policy?.maxPerTxCents ?? 5000,        // 50 EUR / transaction
      maxPerDayCents: policy?.maxPerDayCents ?? 20000,     // 200 EUR / jour
      approvalThresholdCents: policy?.approvalThresholdCents ?? 10000, // 10000 centimes -> validation humaine au-dela
      allowedMerchants: policy?.allowedMerchants ?? [],    // vide = aucune restriction de marchand
    },
    earningsCents: 0, // total encaisse via A2A (cote provider)
    ledger: [],       // credits A2A recus : { fromAgentId, amountCents, paymentId, at }
    createdAt: new Date().toISOString(),
  };
  db.agents.set(id, agent);
  db.agentsByToken.set(token, id);
  scheduleSave();
  return agent;
}

export const getAgent = (id) => db.agents.get(id) ?? null;

export function findAgentByToken(token) {
  const id = db.agentsByToken.get(token);
  return id ? db.agents.get(id) : null;
}

// Resout un agent par son handle (@xxx) ou son id. Sert a l'adressage A2A.
export function findAgentByHandleOrId(ref) {
  const needle = String(ref ?? '').trim().toLowerCase();
  if (!needle) return null;
  return [...db.agents.values()].find((a) => a.handle.toLowerCase() === needle || a.id.toLowerCase() === needle) ?? null;
}

export const agentsForAccount = (accountId) =>
  [...db.agents.values()].filter((a) => a.accountId === accountId);

export const providersForAccount = (accountId) =>
  agentsForAccount(accountId).filter((a) => a.role === 'provider');

// Credite un agent provider (settlement A2A). Cote payeur, c'est un paiement normal.
export function creditAgent(agentId, { amountCents, fromAgentId, paymentId }) {
  const agent = db.agents.get(agentId);
  if (!agent) return null;
  agent.earningsCents += amountCents;
  agent.ledger.push({ fromAgentId, amountCents, paymentId, at: new Date().toISOString() });
  scheduleSave();
  return agent;
}

// --- Payment requests -----------------------------------------------------

const paymentIdempotencyScope = ({ agentId, kind, idempotencyKey }) =>
  idempotencyKey ? `${agentId}:${kind ?? 'merchant'}:${idempotencyKey}` : null;

export function createPayment({ agentId, accountId, amountCents, currency, merchant, description, category, kind = 'merchant', payeeAgentId = null, claim = '', idempotencyKey = null }) {
  const scopedKey = paymentIdempotencyScope({ agentId, kind, idempotencyKey });
  if (scopedKey) {
    const existingId = db.paymentsByIdempotencyKey.get(scopedKey);
    if (existingId) return db.payments.get(existingId);
  }

  const id = nextId('payment', 'pay');
  const now = new Date().toISOString();
  const payment = {
    id,
    agentId,
    accountId,
    amountCents,
    currency: currency ?? 'EUR',
    merchant: merchant ?? '',
    description: description ?? '',
    category: category ?? '',
    claim,
    idempotencyKey: idempotencyKey ?? null,
    reversibleUntilMs: null,
    kind,                 // 'merchant' | 'a2a'
    payeeAgentId,         // agent provider credite (si a2a)
    status: 'received',     // received -> rejected | needs_human | pending_reversible | cancelled | blocked_by_verifier | paid | failed
    policyDecision: null,   // { decision, reasons[] }
    verifierVerdict: null,  // { allow, risk, reason, flags[], source }
    molliePaymentId: null,
    decidedBy: null,        // 'policy' | 'human:Demo User' ...
    createdAt: now,
    updatedAt: now,
  };
  db.payments.set(id, payment);
  if (scopedKey) db.paymentsByIdempotencyKey.set(scopedKey, id);
  scheduleSave();
  return payment;
}

export function updatePayment(id, patch) {
  const payment = db.payments.get(id);
  if (!payment) return null;
  Object.assign(payment, patch, { updatedAt: new Date().toISOString() });
  scheduleSave();
  return payment;
}

export const getPayment = (id) => db.payments.get(id) ?? null;

export function findPaymentByIdempotencyKey({ agentId, kind = 'merchant', idempotencyKey }) {
  const scopedKey = paymentIdempotencyScope({ agentId, kind, idempotencyKey });
  if (!scopedKey) return null;
  const id = db.paymentsByIdempotencyKey.get(scopedKey);
  return id ? getPayment(id) : null;
}

export const getPaymentByMollieId = (molliePaymentId) =>
  [...db.payments.values()].find((p) => p.molliePaymentId === molliePaymentId) ?? null;

export const paymentsForAgent = (agentId) =>
  [...db.payments.values()].filter((p) => p.agentId === agentId);

export const pendingHumanPayments = () =>
  [...db.payments.values()].filter((p) => p.status === 'needs_human');

export const pendingReversiblePayments = () =>
  [...db.payments.values()].filter((p) => p.status === 'pending_reversible');

export const paymentsForAccount = (accountId) =>
  [...db.payments.values()].filter((p) => p.accountId === accountId);

// Somme deja DEPENSEE aujourd'hui par un agent (paiements 'paid' du jour), en centimes.
// Sert au plafond journalier de la policy.
export function todaySpentCents(agentId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return [...db.payments.values()]
    .filter((p) => p.agentId === agentId && p.status === 'paid' && p.updatedAt.slice(0, 10) === today)
    .reduce((sum, p) => sum + p.amountCents, 0);
}

// --- Audit (append-only) --------------------------------------------------

// Chaque etape de decision est tracee : qui, quoi, pourquoi, valide par qui.
// C'est le coeur de l'argument compliance / liability sink.
export function addAudit({ paymentId, agentId, event, detail }) {
  const entry = {
    id: nextId('audit', 'log'),
    at: new Date().toISOString(),
    paymentId: paymentId ?? null,
    agentId: agentId ?? null,
    event,            // ex: 'policy.auto_approve', 'verifier.blocked', 'human.approved', 'mollie.paid'
    detail: detail ?? '',
  };
  db.audit.push(entry);
  scheduleSave();
  return entry;
}

export const auditLog = ({ limit = 100 } = {}) => db.audit.slice(-limit).reverse();
export const auditForPayment = (paymentId) => db.audit.filter((e) => e.paymentId === paymentId);
