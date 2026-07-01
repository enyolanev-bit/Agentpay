#!/usr/bin/env node

const AGENTPAY_BASE_URL = process.env.AGENTPAY_BASE_URL ?? 'http://localhost:3000';
const AGENTPAY_AGENT_TOKEN = process.env.AGENTPAY_AGENT_TOKEN ?? '';

const encoder = new TextEncoder();
let buffer = Buffer.alloc(0);

const tools = [
  {
    name: 'agentpay.prepare_payment',
    description: 'Prepare a payment before money moves. Prefer provider for server-owned prices; use amountCents only from deterministic application code.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Deterministic credit provider, for example "openrouter". If set, AgentPay owns the amount.' },
        runId: { type: 'string', description: 'Optional agent run id used to derive an idempotency key.' },
        payee: { type: 'string', description: 'Payee or merchant for app-owned generic intents.' },
        amountCents: { type: 'integer', description: 'Positive integer cents. Do not let the LLM invent this value.' },
        currency: { type: 'string', default: 'EUR' },
        reason: { type: 'string', description: 'Why the agent needs this payment.' },
        description: { type: 'string', description: 'Optional payment description. Defaults to reason.' },
        claim: { type: 'string', description: 'Optional agent claim. Defaults to description.' },
        token: { type: 'string', description: 'Optional AgentPay agent token. Defaults to AGENTPAY_AGENT_TOKEN.' },
        idempotencyKey: { type: 'string', description: 'Optional idempotency key for safe retries.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'agentpay.list_spend_options',
    description: 'List deterministic spend options that agents may request without owning prices.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'agentpay.preview_credit_spend',
    description: 'Preview policy, budget, and next action for a deterministic credit provider without moving money.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Deterministic credit provider, for example "openrouter".' },
        token: { type: 'string', description: 'Optional AgentPay agent token. Defaults to AGENTPAY_AGENT_TOKEN.' },
      },
      required: ['provider'],
      additionalProperties: false,
    },
  },
  {
    name: 'agentpay.list_credit_spend_plans',
    description: 'List authenticated no-money-moved policy preflights for all deterministic credit providers.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Optional AgentPay agent token. Defaults to AGENTPAY_AGENT_TOKEN.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'agentpay.create_reversible_intent',
    description: 'Create a ReversiblePaymentIntent. Money does not move until confirm or auto-commit.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Decimal amount, for example "18.00".' },
        currency: { type: 'string', default: 'EUR' },
        merchant: { type: 'string' },
        description: { type: 'string' },
        claim: { type: 'string', description: 'What the agent claims this payment is for.' },
        token: { type: 'string', description: 'Optional AgentPay agent token. Defaults to AGENTPAY_AGENT_TOKEN.' },
        idempotencyKey: { type: 'string', description: 'Optional idempotency key for safe retries.' },
      },
      required: ['amount', 'merchant', 'description'],
      additionalProperties: false,
    },
  },
  {
    name: 'agentpay.list_pending_intents',
    description: 'List pending reversible payment intents.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'agentpay.undo_intent',
    description: 'Cancel a reversible intent before capture. This must not call Mollie.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: { type: 'string' },
      },
      required: ['intentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'agentpay.confirm_intent',
    description: 'Confirm a reversible intent immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        intentId: { type: 'string' },
      },
      required: ['intentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'agentpay.pay_agent',
    description: 'Pay another agent by handle through the AgentPay A2A flow.',
    inputSchema: {
      type: 'object',
      properties: {
        payee: { type: 'string', description: 'Provider handle, for example "@data-provider".' },
        amount: { type: 'string', description: 'Optional decimal amount. If omitted, backend provider price may be used.' },
        service: { type: 'string' },
        token: { type: 'string', description: 'Optional AgentPay agent token. Defaults to AGENTPAY_AGENT_TOKEN.' },
      },
      required: ['payee', 'service'],
      additionalProperties: false,
    },
  },
  {
    name: 'agentpay.get_payment',
    description: 'Get payment status by payment or intent id.',
    inputSchema: {
      type: 'object',
      properties: {
        paymentId: { type: 'string' },
      },
      required: ['paymentId'],
      additionalProperties: false,
    },
  },
];

const send = (message) => {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${encoder.encode(body).length}\r\n\r\n${body}`);
};

const okText = (id, value) => send({
  jsonrpc: '2.0',
  id,
  result: {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
});

const error = (id, code, message, data) => send({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

const parseMessages = () => {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const header = buffer.subarray(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;
    const raw = buffer.subarray(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.subarray(bodyEnd);
    try {
      handle(JSON.parse(raw));
    } catch (err) {
      error(null, -32700, 'Parse error', err.message);
    }
  }
};

const httpJson = async (path, { method = 'GET', token, idempotencyKey, body } = {}) => {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const effectiveToken = token ?? AGENTPAY_AGENT_TOKEN;
  if (effectiveToken) headers.Authorization = `Bearer ${effectiveToken}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(new URL(path, AGENTPAY_BASE_URL), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(json?.error ?? `AgentPay HTTP ${response.status}`);
    err.status = response.status;
    err.body = json;
    throw err;
  }
  return json;
};

const requireToken = (args) => {
  if (args?.token || AGENTPAY_AGENT_TOKEN) return;
  throw new Error('Missing agent token. Set AGENTPAY_AGENT_TOKEN or pass token.');
};

const normalizeKeyPart = (value) => String(value ?? '').trim().toLowerCase();

const idempotencyKeyForRun = ({ runId, provider }) => {
  if (!runId) return undefined;
  return `agentpay:${runId}:credits:${normalizeKeyPart(provider)}`;
};

const idempotencyKeyForPayment = ({ runId, payee }) => {
  if (!runId) return undefined;
  return `agentpay:${runId}:payment:${normalizeKeyPart(payee)}`;
};

const centsToDecimalString = (amountCents) => {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('amountCents must be a positive safe integer.');
  }
  const euros = Math.trunc(amountCents / 100);
  const cents = String(amountCents % 100).padStart(2, '0');
  return `${euros}.${cents}`;
};

const callTool = async (name, args = {}) => {
  switch (name) {
    case 'agentpay.prepare_payment':
      requireToken(args);
      if (args.provider) {
        if (args.amountCents !== undefined) {
          throw new Error('amountCents is not accepted when provider is used; AgentPay resolves provider prices server-side.');
        }
        return httpJson('/agent/credit-topup', {
          method: 'POST',
          token: args.token,
          idempotencyKey: args.idempotencyKey ?? idempotencyKeyForRun({ runId: args.runId, provider: args.provider }),
          body: { provider: args.provider },
        });
      }
      if (!args.payee) throw new Error('payee is required when provider is not used.');
      if (!args.reason && !args.description) throw new Error('reason is required when provider is not used.');
      return httpJson('/agent/pay-reversible', {
        method: 'POST',
        token: args.token,
        idempotencyKey: args.idempotencyKey ?? idempotencyKeyForPayment({ runId: args.runId, payee: args.payee }),
        body: {
          amount: centsToDecimalString(args.amountCents),
          currency: args.currency ?? 'EUR',
          merchant: args.payee,
          description: args.description ?? args.reason,
          claim: args.claim ?? args.description ?? args.reason,
        },
      });
    case 'agentpay.list_spend_options':
      return httpJson('/agent/credit-topups');
    case 'agentpay.preview_credit_spend':
      requireToken(args);
      return httpJson('/agent/credit-plan', {
        method: 'POST',
        token: args.token,
        body: { provider: args.provider },
      });
    case 'agentpay.list_credit_spend_plans':
      requireToken(args);
      return httpJson('/agent/credit-plans', { token: args.token });
    case 'agentpay.create_reversible_intent':
      requireToken(args);
      return httpJson('/agent/pay-reversible', {
        method: 'POST',
        token: args.token,
        idempotencyKey: args.idempotencyKey,
        body: {
          amount: args.amount,
          currency: args.currency ?? 'EUR',
          merchant: args.merchant,
          description: args.description,
          claim: args.claim ?? args.description,
        },
      });
    case 'agentpay.list_pending_intents':
      return httpJson('/api/reversible-intents');
    case 'agentpay.undo_intent':
      return httpJson(`/pay/${encodeURIComponent(args.intentId)}/undo`, { method: 'POST' });
    case 'agentpay.confirm_intent':
      return httpJson(`/pay/${encodeURIComponent(args.intentId)}/confirm`, { method: 'POST' });
    case 'agentpay.pay_agent':
      requireToken(args);
      return httpJson('/agent/pay-agent', {
        method: 'POST',
        token: args.token,
        body: {
          payee: args.payee,
          amount: args.amount,
          service: args.service,
        },
      });
    case 'agentpay.get_payment':
      return httpJson(`/api/payments/${encodeURIComponent(args.paymentId)}`);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

async function handle(message) {
  if (message.method?.startsWith('notifications/')) return;

  try {
    if (message.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'agentpay-mcp', version: '0.1.0' },
        },
      });
      return;
    }

    if (message.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: message.id, result: { tools } });
      return;
    }

    if (message.method === 'tools/call') {
      const result = await callTool(message.params?.name, message.params?.arguments ?? {});
      okText(message.id, result);
      return;
    }

    if (message.method === 'ping') {
      send({ jsonrpc: '2.0', id: message.id, result: {} });
      return;
    }

    error(message.id, -32601, `Method not found: ${message.method}`);
  } catch (err) {
    error(message.id, -32000, err.message, err.body ?? undefined);
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  parseMessages();
});

process.stdin.resume();
