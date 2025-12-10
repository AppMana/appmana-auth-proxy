import { test } from "node:test";
import assert from "node:assert";
import { PolicyManager, PolicyContext, PolicyFunction } from "../policy.js";

test("Policy Chain - First Applicable Strategy", async (t) => {
  const manager = new PolicyManager([]);

  // Mock Policies
  const allowPolicy: PolicyFunction = async () => ({
    decision: "ALLOW",
    modifiedRequest: { headers: { "x-test": "allow" } },
  });
  const denyPolicy: PolicyFunction = async () => ({ decision: "DENY" });
  const skipPolicy: PolicyFunction = async () => ({ decision: "SKIP" });
  const modifyPolicy: PolicyFunction = async () => ({
    decision: "SKIP",
    modifiedRequest: { headers: { "x-mod": "skip" } },
  }); // Modifying on SKIP? Usually ignored unless Accumulated. But our engine ignores SKIP results currently?

  // Register them
  manager.registerPolicy(allowPolicy, "allow-policy");
  manager.registerPolicy(denyPolicy, "deny-policy");
  manager.registerPolicy(skipPolicy, "skip-policy");
  manager.registerPolicy(modifyPolicy, "modify-policy");

  const context: PolicyContext = { request: {} };

  await t.test("Should DENY by default if no policies match", async () => {
    // Empty Chain
    manager.setPolicyChain([]);
    // Note: Empty chain -> reorderPolicies uses ALL loaded policies sorted by name.
    // allow-policy is first alphabetically. So it would ALLOW.
    // Let's set a chain explicitly to empty list?
    // Currently `setPolicyChain([])` might revert to default behaviour?
    // Let's check implementation.
    // `if (this.chainConfig.length > 0) ... else { default all }`
    // So passing [] usually means run all.
    // I need a way to say "Run Nothing" if I want default deny?
    // Or just test that if I run a chain with only SKIP, it DENIES.

    manager.setPolicyChain(["skip-policy"]);
    const result = await manager.evaluate(context);
    assert.strictEqual(result.decision, "DENY");
  });

  await t.test("Should ALLOW if first policy ALLOWs", async () => {
    manager.setPolicyChain(["allow-policy", "deny-policy"]);
    const result = await manager.evaluate(context);
    assert.strictEqual(result.decision, "ALLOW");
    assert.deepStrictEqual(result.modifiedRequest?.headers, { "x-test": "allow" });
  });

  await t.test("Should DENY if first policy DENIEs", async () => {
    manager.setPolicyChain(["deny-policy", "allow-policy"]);
    const result = await manager.evaluate(context);
    assert.strictEqual(result.decision, "DENY");
  });

  await t.test("Should SKIP until match", async () => {
    manager.setPolicyChain(["skip-policy", "allow-policy"]);
    const result = await manager.evaluate(context);
    assert.strictEqual(result.decision, "ALLOW");
  });

  await t.test("Should respect explicit chain order", async () => {
    // deny -> allow = DENY
    manager.setPolicyChain(["deny-policy", "allow-policy"]);
    assert.strictEqual((await manager.evaluate(context)).decision, "DENY");

    // allow -> deny = ALLOW
    manager.setPolicyChain(["allow-policy", "deny-policy"]);
    assert.strictEqual((await manager.evaluate(context)).decision, "ALLOW");
  });
});
