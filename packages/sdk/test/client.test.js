import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, NETWORKS, SubscriptionClient } from "../dist/index.js";

describe("SubscriptionClient", () => {
  it("constructs with valid config", () => {
    const client = new SubscriptionClient({
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      networkPassphrase: NETWORKS.TESTNET,
      source: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    });
    assert.equal(client.fee, 100);
    assert.equal(client.networkPassphrase, NETWORKS.TESTNET);
  });

  it("rejects blank contractId, passphrase, and source", () => {
    const base = {
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      networkPassphrase: NETWORKS.TESTNET,
      source: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    };
    assert.throws(() => new SubscriptionClient({ ...base, contractId: "  " }), ConfigError);
    assert.throws(
      () => new SubscriptionClient({ ...base, networkPassphrase: "" }),
      ConfigError,
    );
    assert.throws(() => new SubscriptionClient({ ...base, source: "" }), ConfigError);
  });
});
