import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

test('client explains plain-text serverless crashes', async t => {
  t.mock.method(globalThis,'fetch',async()=>new Response('FUNCTION_INVOCATION_FAILED',{status:500}));
  await assert.rejects(api('/health'), /API is unavailable \(HTTP 500\).*api\/v1\/health/);
});
test('client preserves actionable setup errors from the API', async t => {
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:'MFA_ENCRYPTION_KEY must be 64 hex characters.'},{status:503}));
  await assert.rejects(api('/health'), /MFA_ENCRYPTION_KEY must be 64 hex characters/);
});
test('client detects HTML fallback instead of treating it as an API response', async t => {
  t.mock.method(globalThis,'fetch',async()=>new Response('<html>Website</html>',{headers:{'content-type':'text/html'}}));
  await assert.rejects(api('/health'), /Check Vercel API routing/);
});
