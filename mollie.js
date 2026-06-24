// Couche Mollie : le "moyen de paiement on file" + la charge declenchee par l'agent.
//
// Mecanique de paiement recurring pour agents :
//   1. createCustomer            -> on cree un client Mollie pour l'humain.
//   2. createFirstPayment        -> 1 paiement avec checkout (sequenceType 'first').
//                                   Une fois paye, Mollie cree un MANDAT (moyen de paiement
//                                   reutilisable). L'humain ne refait JAMAIS de checkout.
//   3. chargeAgentPayment        -> paiement 'recurring' charge sur le mandat, SANS checkout.
//                                   C'est ca qui permet a l'agent de payer tout seul.
//
// Le webhook reste la SOURCE DE VERITE du statut (on re-demande a Mollie, on ne fait pas confiance
// au retour navigateur).

import { createMollieClient } from '@mollie/api-client';
import { centsToMollie } from './store.js';

const { MOLLIE_API_KEY, BASE_URL } = process.env;

export const mollie = createMollieClient({ apiKey: MOLLIE_API_KEY });

const webhookUrl = () => `${BASE_URL}/webhook`;

// 1. Le client Mollie qui represente l'humain proprietaire du compte.
export async function createCustomer({ name, email }) {
  return mollie.customers.create({ name, email: email || undefined });
}

// 2. Le paiement d'onboarding : montant symbolique, AVEC checkout, qui cree le mandat.
export async function createFirstPayment({ account, amountCents = 100 }) {
  return mollie.payments.create({
    amount: { currency: 'EUR', value: centsToMollie(amountCents) },
    description: `Verification du moyen de paiement - ${account.name}`,
    customerId: account.mollieCustomerId,
    sequenceType: 'first', // <- declenche la creation d'un mandat une fois paye
    redirectUrl: `${BASE_URL}/onboard/return?account=${account.id}`,
    webhookUrl: webhookUrl(),
    metadata: { kind: 'onboarding', accountId: account.id },
  });
}

// Recupere un mandat valide pour ce customer (le moyen de paiement "on file").
export async function getValidMandate(customerId) {
  const mandates = await mollie.customerMandates.page({ customerId });
  return mandates.find((m) => m.status === 'valid') ?? null;
}

// 3. La charge declenchee par l'agent : 'recurring', donc AUCUN checkout. Charge le mandat.
export async function chargeAgentPayment({ account, amountCents, currency = 'EUR', description, metadata }) {
  return mollie.payments.create({
    amount: { currency, value: centsToMollie(amountCents) },
    description,
    customerId: account.mollieCustomerId,
    sequenceType: 'recurring', // <- off-session, paye par l'agent sans intervention humaine
    webhookUrl: webhookUrl(),
    metadata: metadata ?? {},
  });
}

// Source de verite : on re-demande le statut a Mollie.
export const getMolliePayment = (id) => mollie.payments.get(id);
