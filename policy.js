// GARDE-FOU N1 : le LLM ne touche JAMAIS a l'argent.
//
// Cette fonction est 100% deterministe (du code, pas de modele). Elle decide si un
// paiement demande par un agent est : auto-approuve, soumis a validation humaine, ou rejete.
// Les montants, plafonds et comparaisons ne passent jamais par un LLM.

import { todaySpentCents, formatMoney } from './store.js';

export const DECISION = {
  AUTO_APPROVE: 'AUTO_APPROVE',
  NEEDS_HUMAN: 'NEEDS_HUMAN',
  REJECTED: 'REJECTED',
};

// decide(agent, request) -> { decision, reasons[] }
// request : { amountCents, currency, merchant, description }
export function decide(agent, request) {
  const p = agent.policy;
  const reasons = [];

  // 1. Plafond par transaction : depasse = REJET sec (au-dela de ce que l'humain a autorise).
  if (request.amountCents > p.maxPerTxCents) {
    reasons.push(
      `Montant ${formatMoney(request.amountCents)} > plafond par transaction ${formatMoney(p.maxPerTxCents)}`,
    );
    return { decision: DECISION.REJECTED, reasons };
  }

  // 2. Plafond journalier : ce qui est deja depense aujourd'hui + cette demande.
  const spent = todaySpentCents(agent.id);
  if (spent + request.amountCents > p.maxPerDayCents) {
    reasons.push(
      `Plafond journalier depasse : deja ${formatMoney(spent)} + ${formatMoney(request.amountCents)} > ${formatMoney(p.maxPerDayCents)}`,
    );
    return { decision: DECISION.REJECTED, reasons };
  }

  // 3. Allowlist marchands : si une liste est definie, le marchand doit en faire partie.
  if (p.allowedMerchants.length > 0) {
    const merchant = String(request.merchant ?? '').trim().toLowerCase();
    const allowed = p.allowedMerchants.map((m) => m.toLowerCase());
    if (!allowed.includes(merchant)) {
      reasons.push(`Marchand "${request.merchant}" absent de l'allowlist (${p.allowedMerchants.join(', ')})`);
      return { decision: DECISION.REJECTED, reasons };
    }
  }

  // 4. Seuil d'approbation humaine : sous les plafonds mais au-dessus du seuil de confiance.
  if (request.amountCents > p.approvalThresholdCents) {
    reasons.push(
      `Montant ${formatMoney(request.amountCents)} > seuil d'approbation ${formatMoney(p.approvalThresholdCents)} : validation humaine requise`,
    );
    return { decision: DECISION.NEEDS_HUMAN, reasons };
  }

  // 5. Tout est dans les clous.
  reasons.push(
    `Dans la policy : <= ${formatMoney(p.approvalThresholdCents)} (seuil), <= ${formatMoney(p.maxPerTxCents)} (tx), reste ${formatMoney(p.maxPerDayCents - spent)} aujourd'hui`,
  );
  return { decision: DECISION.AUTO_APPROVE, reasons };
}
