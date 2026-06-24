// Deterministic credit top-up fixtures. The agent chooses a provider by slug;
// the amount, merchant, and claim always come from this server-side catalog —
// the LLM never sets an amount. The providers below are neutral technical
// examples of credit-based services an agent might recharge.
export const CREDIT_TOPUP_SCENARIOS = {
  openrouter: {
    provider: 'openrouter',
    merchant: 'OpenRouter',
    amountCents: 2500,
    currency: 'EUR',
    spendType: 'inference_credits',
    description: 'Inference credits top-up',
    claim: 'OpenRouter inference credits for agent model calls',
    reason: 'agent needs more inference credits to continue routed model work',
  },
  firecrawl: {
    provider: 'firecrawl',
    merchant: 'Firecrawl',
    amountCents: 1600,
    currency: 'EUR',
    spendType: 'web_data_credits',
    description: 'Web-data credits top-up',
    claim: 'Firecrawl credits for scrape, search, crawl, and agent runs',
    reason: 'agent needs web-data credits to complete research tasks',
  },
  browserbase: {
    provider: 'browserbase',
    merchant: 'Browserbase',
    amountCents: 2000,
    currency: 'EUR',
    spendType: 'browser_automation_credits',
    description: 'Browser automation credits top-up',
    claim: 'Browserbase browser hours, search calls, fetch calls, and model tokens',
    reason: 'agent needs browser infrastructure credits for web workflows',
  },
};

export const creditTopupProviders = () => Object.values(CREDIT_TOPUP_SCENARIOS);

export const creditTopupOption = (scenario) => ({
  provider: scenario.provider,
  merchant: scenario.merchant,
  amount: (scenario.amountCents / 100).toFixed(2),
  currency: scenario.currency,
  spendType: scenario.spendType,
  description: scenario.description,
  claim: scenario.claim,
});

export function getCreditTopupScenario(provider) {
  const key = String(provider ?? '').trim().toLowerCase();
  return CREDIT_TOPUP_SCENARIOS[key] ?? null;
}
