import { test } from "node:test";
import assert from "node:assert/strict";
import { startMailPump } from "../server/mail-pump.js";

test("mail polling backs off, avoids repeated failure logs, and recovers", async (t) => {
  const previous = process.env.TEST_DEPLOYMENT;
  process.env.TEST_DEPLOYMENT = "false";
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const events: object[] = [];
  const stop = startMailPump(
    async () => {
      calls++;
      if (calls <= 2)
        throw Object.assign(new Error("offline"), { code: "ECONNREFUSED" });
    },
    (event) => events.push(event),
  );
  try {
    t.mock.timers.tick(15000);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 1);
    assert.equal(events.length, 1);
    t.mock.timers.tick(15000);
    await Promise.resolve();
    assert.equal(calls, 1);
    t.mock.timers.tick(15000);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 2);
    assert.equal(events.length, 1);
    t.mock.timers.tick(60000);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls, 3);
    assert.deepEqual(events.at(-1), { event: "mail.poll_recovered" });
    stop();
    t.mock.timers.tick(300000);
    await Promise.resolve();
    assert.equal(calls, 3);
  } finally {
    stop();
    if (previous === undefined) delete process.env.TEST_DEPLOYMENT;
    else process.env.TEST_DEPLOYMENT = previous;
  }
});
