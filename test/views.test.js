import test from 'node:test';
import assert from 'node:assert/strict';

import { createAccount, createAgent, loadStore } from '../store.js';
import { renderDashboard } from '../views.js';

test('agent creation form defaults to developer_agent profile', async () => {
  await loadStore(null);
  const account = createAccount({ name: 'View Test', email: '' });
  createAgent({ accountId: account.id, name: 'Visible Agent' });

  const html = renderDashboard({ account, pending: [], baseUrl: 'http://localhost:3000' });

  assert.match(html, /<select name="policyProfile">/);
  assert.match(html, /<option value="developer_agent" selected>Developer agent<\/option>/);
});
