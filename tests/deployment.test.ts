import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import handler from "../api/index.js";

test("Vercel entry preserves API routing and protects the mail cron", async () => {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(base + "/api/v1/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "ok");
    const denied = await fetch(base + "/api/cron/mail");
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(base + "/api/cron/mail", { method: "POST" })).status, 405);
    assert.equal((await fetch(base + "/api/v1/unknown")).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('startup configuration returns JSON with missing setting names and no secret values', async () => {
  const fields = ['NODE_ENV','VERCEL','TEST_DEPLOYMENT','STORAGE_DRIVER','MFA_ENCRYPTION_KEY','DATABASE_URL','APP_ORIGIN','COOKIE_SECURE','CRON_SECRET'];
  const previous = Object.fromEntries(fields.map(key=>[key,process.env[key]]));
  const server = createServer(handler);
  try {
    Object.assign(process.env,{NODE_ENV:'production',VERCEL:'1',TEST_DEPLOYMENT:'true',STORAGE_DRIVER:'disabled',MFA_ENCRYPTION_KEY:'invalid-private-test-value',APP_ORIGIN:'https://vestry-j794.vercel.app',COOKIE_SECURE:'true',CRON_SECRET:'c'.repeat(32)});
    delete process.env.DATABASE_URL;
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address(); assert.ok(address && typeof address!=='string');
    const response=await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
    assert.equal(response.status,503);
    assert.match(response.headers.get('content-type')||'',/application\/json/);
    const body=await response.json();
    assert.equal(body.code,'SERVER_CONFIGURATION_ERROR');
    assert.match(body.error,/MFA_ENCRYPTION_KEY/);
    assert.match(body.error,/Missing DATABASE_URL/);
    assert.ok(!JSON.stringify(body).includes('invalid-private-test-value'));
  } finally {
    for(const key of fields){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});

test('login accepts mapped project origins and rejects unrelated origins before credentials are processed', async()=>{
  const fields=['VERCEL','NODE_ENV','APP_ORIGIN'];
  const previous=Object.fromEntries(fields.map(key=>[key,process.env[key]]));
  const {default:app}=await import('../server/app.js');
  const server=createServer(app);
  try {
    Object.assign(process.env,{VERCEL:'1',NODE_ENV:'production',APP_ORIGIN:'https://vestry-xi.vercel.app'});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address && typeof address!=='string');
    const base=`http://127.0.0.1:${address.port}/api/v1/auth/login`;
    for(const origin of ['https://vestry-xi.vercel.app','https://vestry-git-main-titto-roberts-projects.vercel.app','https://vestry-neh1t94fm-titto-roberts-projects.vercel.app']){
      const response=await fetch(base,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
      assert.equal(response.status,400,origin);
      assert.ok(!(await response.json()).error.includes('origin is not permitted'));
    }
    const denied=await fetch(base,{method:'POST',headers:{Origin:'https://unrelated.vercel.app','Content-Type':'application/json'},body:'{}'});
    assert.equal(denied.status,403);
  }finally{for(const key of fields){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
