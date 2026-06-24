import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  addAudit,
  createAccount,
  createAgent,
  createPayment,
  findAgentByToken,
  findPaymentByIdempotencyKey,
  getAccount,
  getPayment,
  loadStore,
  saveStore,
} from '../store.js';

test('saveStore/loadStore preserve accounts, agents, payments, audit and idempotency index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentpay-store-'));
  const file = join(dir, 'agentpay.json');
  try {
    await loadStore(file);
    const account = createAccount({ name: 'Persisted', email: 'p@example.com' });
    const agent = createAgent({ accountId: account.id, name: 'Persist Agent' });
    const payment = createPayment({
      agentId: agent.id,
      accountId: account.id,
      amountCents: 1800,
      currency: 'EUR',
      merchant: 'Bookstore',
      description: 'book',
      claim: 'book',
      idempotencyKey: 'persist-key',
    });
    addAudit({ paymentId: payment.id, agentId: agent.id, event: 'test.persisted', detail: 'roundtrip' });
    await saveStore(file);

    await loadStore(file);

    assert.equal(getAccount(account.id).name, 'Persisted');
    assert.equal(findAgentByToken(agent.token).id, agent.id);
    assert.equal(getPayment(payment.id).amountCents, 1800);
    assert.equal(findPaymentByIdempotencyKey({
      agentId: agent.id,
      kind: 'merchant',
      idempotencyKey: 'persist-key',
    }).id, payment.id);
  } finally {
    await loadStore(null);
    await rm(dir, { recursive: true, force: true });
  }
});
