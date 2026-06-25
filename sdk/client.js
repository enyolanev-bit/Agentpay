export class AgentPayError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'AgentPayError';
    this.status = status;
    this.body = body;
  }
}

export class AgentPayClient {
  constructor({ baseUrl = 'http://localhost:3000', agentToken, fetch: fetchImpl = globalThis.fetch } = {}) {
    if (!fetchImpl) throw new AgentPayError('A fetch implementation is required.');
    this.baseUrl = baseUrl;
    this.agentToken = agentToken;
    this.fetch = fetchImpl;
  }

  async createReversibleIntent({ amount, currency = 'EUR', merchant, description, claim, token, idempotencyKey } = {}) {
    return this.#json('/agent/pay-reversible', {
      method: 'POST',
      token,
      idempotencyKey,
      body: { amount, currency, merchant, description, claim: claim ?? description },
    });
  }

  async preparePayment({
    provider,
    runId,
    payee,
    amountCents,
    currency = 'EUR',
    reason,
    description,
    claim,
    token,
    idempotencyKey,
  } = {}) {
    if (provider) {
      if (amountCents !== undefined) {
        throw new AgentPayError('amountCents is not accepted when provider is used; AgentPay resolves provider prices server-side.');
      }
      return this.createCreditTopupIntent({
        provider,
        token,
        idempotencyKey: idempotencyKey ?? idempotencyKeyForRun({ runId, provider }),
      });
    }

    if (!payee) throw new AgentPayError('payee is required when provider is not used.');
    if (!reason && !description) throw new AgentPayError('reason is required when provider is not used.');

    const resolvedDescription = description ?? reason;
    return this.createReversibleIntent({
      amount: centsToDecimalString(amountCents),
      currency,
      merchant: payee,
      description: resolvedDescription,
      claim: claim ?? resolvedDescription,
      token,
      idempotencyKey: idempotencyKey ?? idempotencyKeyForPayment({ runId, payee }),
    });
  }

  async listCreditTopupProviders() {
    return this.#json('/agent/credit-topups');
  }

  async createCreditTopupIntent({ provider, token, idempotencyKey } = {}) {
    return this.#json('/agent/credit-topup', {
      method: 'POST',
      token,
      idempotencyKey,
      body: { provider },
    });
  }

  async listSpendOptions() {
    return this.listCreditTopupProviders();
  }

  async buyCredits({ provider, runId, token, idempotencyKey } = {}) {
    if (!provider) throw new AgentPayError('provider is required.');
    return this.createCreditTopupIntent({
      provider,
      token,
      idempotencyKey: idempotencyKey ?? idempotencyKeyForRun({ runId, provider }),
    });
  }

  async previewCreditSpend({ provider, token } = {}) {
    if (!provider) throw new AgentPayError('provider is required.');
    return this.#json('/agent/credit-plan', {
      method: 'POST',
      token,
      body: { provider },
    });
  }

  async quoteCredits({ provider } = {}) {
    if (!provider) throw new AgentPayError('provider is required.');
    const catalog = await this.listSpendOptions();
    const normalizedProvider = normalizeProvider(provider);
    const option = catalog.providers?.find((item) => normalizeProvider(item.provider) === normalizedProvider);
    if (!option) {
      throw new AgentPayError(`unknown credit provider: ${provider}`, {
        status: 400,
        body: { allowedProviders: catalog.providers?.map((item) => item.provider) ?? [] },
      });
    }
    return option;
  }

  async planCreditSpend({ provider, runId, token } = {}) {
    const effectiveToken = token ?? this.agentToken;
    if (effectiveToken) {
      const plan = await this.previewCreditSpend({ provider, token: effectiveToken });
      return {
        ...plan,
        idempotencyKey: idempotencyKeyForRun({ runId, provider: plan.provider }),
      };
    }

    const option = await this.quoteCredits({ provider });
    return {
      type: 'CreditSpendPlan',
      provider: option.provider,
      amount: option.amount,
      currency: option.currency,
      merchant: option.merchant,
      spendType: option.spendType,
      description: option.description,
      claim: option.claim,
      idempotencyKey: idempotencyKeyForRun({ runId, provider: option.provider }),
      nextAction: 'buyCredits',
      moneyMovement: 'none_until_confirm_or_commit',
      molliePaymentId: null,
    };
  }

  async listPendingIntents() {
    return this.#json('/api/reversible-intents');
  }

  async undoIntent(intentId) {
    return this.#json(`/pay/${encodeURIComponent(intentId)}/undo`, { method: 'POST' });
  }

  async confirmIntent(intentId) {
    return this.#json(`/pay/${encodeURIComponent(intentId)}/confirm`, { method: 'POST' });
  }

  async payAgent({ payee, amount, service, token } = {}) {
    return this.#json('/agent/pay-agent', {
      method: 'POST',
      token,
      body: { payee, amount, service },
    });
  }

  async getPayment(paymentId) {
    return this.#json(`/api/payments/${encodeURIComponent(paymentId)}`);
  }

  async #json(path, { method = 'GET', token, idempotencyKey, body } = {}) {
    const headers = { Accept: 'application/json' };
    const effectiveToken = token ?? this.agentToken;
    if (effectiveToken) headers.Authorization = `Bearer ${effectiveToken}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await this.fetch(new URL(path, this.baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    const parsed = parseJson(text);
    if (!response.ok) {
      throw new AgentPayError(parsed?.error ?? `AgentPay HTTP ${response.status}`, {
        status: response.status,
        body: parsed,
      });
    }
    return parsed;
  }
}

const parseJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const idempotencyKeyForRun = ({ runId, provider }) => {
  if (!runId) return undefined;
  return `agentpay:${runId}:credits:${normalizeProvider(provider)}`;
};

const idempotencyKeyForPayment = ({ runId, payee }) => {
  if (!runId) return undefined;
  return `agentpay:${runId}:payment:${normalizeProvider(payee)}`;
};

const centsToDecimalString = (amountCents) => {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new AgentPayError('amountCents must be a positive safe integer.');
  }
  const euros = Math.trunc(amountCents / 100);
  const cents = String(amountCents % 100).padStart(2, '0');
  return `${euros}.${cents}`;
};

const normalizeProvider = (provider) => String(provider ?? '').trim().toLowerCase();
