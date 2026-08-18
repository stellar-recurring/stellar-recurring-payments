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

  it("trims identifiers and rejects invalid fees", () => {
    const client = new SubscriptionClient({
      contractId: "  CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4  ",
      networkPassphrase: `  ${NETWORKS.TESTNET}  `,
      source: "  GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF  ",
    });
    assert.equal(client.contractId, "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4");
    assert.equal(client.networkPassphrase, NETWORKS.TESTNET);
    assert.equal(client.source, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
    assert.throws(
      () =>
        new SubscriptionClient({
          contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          networkPassphrase: NETWORKS.TESTNET,
          source: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
          fee: -1,
        }),
      ConfigError,
    );
    assert.throws(
      () =>
        new SubscriptionClient({
          contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          networkPassphrase: NETWORKS.TESTNET,
          source: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
          fee: 1.5,
        }),
      ConfigError,
    );
  });

  it("rejects invalid create, approve, and bill inputs", () => {
    const client = new SubscriptionClient({
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      networkPassphrase: NETWORKS.TESTNET,
      source: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    });
    const parties = {
      subscriber: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      merchant: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      token: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
    };
    assert.throws(
      () =>
        client.buildCreateSubscriptionOp({
          ...parties,
          merchant: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4",
          amount: 0n,
          intervalSecs: 3_600n,
        }),
      RangeError,
    );
    assert.throws(
      () =>
        client.buildCreateSubscriptionOp({
          ...parties,
          amount: 1n,
          intervalSecs: 3_600n,
        }),
      RangeError,
    );
    assert.throws(() => client.buildProcessPaymentOp(-1n), RangeError);
    assert.throws(
      () =>
        client.buildApproveOp({
          tokenContractId: parties.token,
          subscriber: parties.subscriber,
          amount: 1n,
          expirationLedger: -1,
        }),
      RangeError,
    );
  });
});
