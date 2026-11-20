import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../server/origin.js";

const canonical = "http://localhost:5173";

test("development accepts loopback aliases on the configured scheme and port", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(
      isAllowedOrigin(`http://${host}:5173`, canonical, "development"),
      true,
    );
  }
  for (const candidate of [
    undefined,
    "null",
    "",
    "invalid",
    "http://localhost:5174",
    "https://localhost:5173",
    "http://localhost.evil.example:5173",
    "http://192.168.1.1:5173",
    "http://localhost:5173/",
    "http://localhost:5173?x=1",
    "http://user@localhost:5173",
  ]) {
    assert.equal(
      isAllowedOrigin(candidate, canonical, "development"),
      false,
      candidate,
    );
  }
  assert.equal(
    isAllowedOrigin(
      "http://127.0.0.1:5173",
      "http://parish.example:5173",
      "development",
    ),
    false,
  );
});

test("production and unspecified environments require the exact configured origin", () => {
  for (const environment of ["production", "test", undefined]) {
    assert.equal(isAllowedOrigin(canonical, canonical, environment), true);
    assert.equal(
      isAllowedOrigin("http://127.0.0.1:5173", canonical, environment),
      false,
    );
  }
  assert.equal(
    isAllowedOrigin(
      "https://parish.example",
      "https://parish.example",
      "production",
    ),
    true,
  );
  assert.equal(
    isAllowedOrigin(
      "https://other.example",
      "https://parish.example",
      "production",
    ),
    false,
  );
});

import { deploymentOrigins, applyDeploymentDefaults } from '../shared/deployment.js';

test('Vercel mapped domains and exact deployment aliases are trusted without a wildcard', () => {
  const fields=['VERCEL','VERCEL_URL','VERCEL_BRANCH_URL','VERCEL_PROJECT_PRODUCTION_URL','APP_ALLOWED_ORIGINS'];
  const previous=Object.fromEntries(fields.map(key=>[key,process.env[key]]));
  try {
    Object.assign(process.env,{VERCEL:'1',VERCEL_URL:'vestry-newdeployment-titto-roberts-projects.vercel.app',VERCEL_BRANCH_URL:'vestry-git-main-titto-roberts-projects.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'vestry-xi.vercel.app',APP_ALLOWED_ORIGINS:''});
    const origins=deploymentOrigins();
    for(const origin of ['https://vestry-xi.vercel.app','https://vestry-git-main-titto-roberts-projects.vercel.app','https://vestry-neh1t94fm-titto-roberts-projects.vercel.app','https://vestry-newdeployment-titto-roberts-projects.vercel.app'])
      assert.equal(isAllowedOrigin(origin,'https://vestry-xi.vercel.app','production',origins),true,origin);
    for(const origin of ['https://other-project.vercel.app','https://vestry-attacker-titto-roberts-projects.vercel.app','https://vestry-xi.vercel.app.attacker.example','http://vestry-xi.vercel.app','https://vestry-xi.vercel.app:444','https://user@vestry-xi.vercel.app','https://vestry-xi.vercel.app/','null','https://vestry-xi.vercel.app?x=1'])
      assert.equal(isAllowedOrigin(origin,'https://vestry-xi.vercel.app','production',origins),false,origin);
  } finally {for(const key of fields){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
test('configured trailing slash is normalized and trusted domains are not inferred outside Vercel',()=>{
  assert.equal(isAllowedOrigin('https://vestry-xi.vercel.app','https://vestry-xi.vercel.app/','production'),true);
  assert.equal(isAllowedOrigin('https://vestry-xi.vercel.app','https://other.example','production'),false);
  assert.equal(isAllowedOrigin('https://vestry-xi.vercel.app','https://other.example','production',['https://vestry-xi.vercel.app/']),true);
  assert.equal(isAllowedOrigin('https://vestry-xi.vercel.app','https://other.example','production',['https://vestry-xi.vercel.app/private']),false);
});
test('retired test-site origin is migrated to this project production URL without overwriting explicit custom domains',()=>{
  const fields=['VERCEL','NODE_ENV','APP_ORIGIN','COOKIE_SECURE','TEST_DEPLOYMENT','STORAGE_DRIVER','VERCEL_PROJECT_PRODUCTION_URL'];
  const previous=Object.fromEntries(fields.map(key=>[key,process.env[key]]));
  try {
    Object.assign(process.env,{VERCEL:'1',VERCEL_PROJECT_PRODUCTION_URL:'vestry-xi.vercel.app',APP_ORIGIN:'https://vestry-j794.vercel.app'});
    applyDeploymentDefaults();assert.equal(process.env.APP_ORIGIN,'https://vestry-xi.vercel.app');
    process.env.APP_ORIGIN='https://church.example';applyDeploymentDefaults();assert.equal(process.env.APP_ORIGIN,'https://church.example');
  } finally {for(const key of fields){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
