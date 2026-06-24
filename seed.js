// Donnees de demo creees au demarrage : 1 compte humain + 1 agent avec une policy
// calibree pour le scenario en 3 actes (voir README / demo.sh).
//
// Pas d'appel Mollie ici (synchrone au boot). Le moyen de paiement se connecte ensuite
// via l'UI (/onboard). Sans mandat, flow.js simule l'execution -> la demo policy/verifier
// marche immediatement, sans ngrok ni checkout.

import { createAccount, createAgent, addAudit, firstAccount, hasAccounts } from './store.js';

export function seedDemo() {
  if (hasAccounts()) {
    const account = firstAccount();
    console.log(`\n[seed] Store charge : compte ${account.name} (${account.id})\n`);
    return account.id;
  }

  const account = createAccount({ name: 'Demo User', email: 'demo@example.com' });

  const agent = createAgent({
    accountId: account.id,
    name: 'Codex Ops Agent',
    handle: '@codex-ops',
    role: 'payer',
    policyProfile: 'procurement_agent',
  });

  // Providers : marketplace d'agents payables -> cibles des paiements agent-to-agent.
  const dataProvider = createAgent({
    accountId: account.id,
    name: 'Data Provider Agent',
    handle: '@data-provider',
    role: 'provider',
    service: { label: 'Data enrichment (per request)', priceCents: 250 }, // 2,50 EUR
    policyProfile: 'support_agent',
  });

  const kycChecker = createAgent({
    accountId: account.id,
    name: 'KYC Checker Agent',
    handle: '@kyc-checker',
    role: 'provider',
    service: { label: 'KYC verification', priceCents: 500 }, // 5,00 EUR
    policyProfile: 'support_agent',
  });

  const geocoder = createAgent({
    accountId: account.id,
    name: 'Geocoder Agent',
    handle: '@geocoder',
    role: 'provider',
    service: { label: 'Address geocoding', priceCents: 100 }, // 1,00 EUR
    policyProfile: 'support_agent',
  });

  addAudit({
    event: 'seed',
    detail: `Compte ${account.name} + payeur ${agent.handle} + providers ${[dataProvider, kycChecker, geocoder].map((p) => p.handle).join(', ')}`,
  });
  console.log(`\n[seed] Payeur token : ${agent.token}  |  Provider handle : ${dataProvider.handle}\n`);
  return account.id;
}
