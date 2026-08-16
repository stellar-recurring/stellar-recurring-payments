import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSubscriptionDue, secondsUntilDue } from "../dist/client.js";

function sub(overrides = {}) {
  return {
    subscriber: "GSUB",
    merchant: "GMERCHANT",
    token: "CTOKEN",
    amount: 100n,
    intervalSecs: 3_600n,
    lastBilled: 1_000n,
    isActive: true,
    ...overrides,
  };
}

describe("isSubscriptionDue", () => {
  it("returns false when inactive", () => {
    assert.equal(isSubscriptionDue(sub({ isActive: false }), 10_000), false);
  });

  it("is due immediately when lastBilled is zero", () => {
    assert.equal(isSubscriptionDue(sub({ lastBilled: 0n }), 0), true);
  });

  it("is due exactly at lastBilled + interval", () => {
    assert.equal(isSubscriptionDue(sub(), 4_600), true);
  });

  it("is not due one second before the interval elapses", () => {
    assert.equal(isSubscriptionDue(sub(), 4_599), false);
  });

  it("accepts bigint now timestamps", () => {
    assert.equal(isSubscriptionDue(sub(), 4_600n), true);
  });
});

describe("secondsUntilDue", () => {
  it("returns 0 for inactive subscriptions", () => {
    assert.equal(secondsUntilDue(sub({ isActive: false }), 1_000), 0n);
  });

  it("returns 0 when never billed", () => {
    assert.equal(secondsUntilDue(sub({ lastBilled: 0n }), 50), 0n);
  });

  it("returns remaining seconds before the next bill", () => {
    assert.equal(secondsUntilDue(sub(), 4_000), 600n);
  });

  it("returns 0 when already due or overdue", () => {
    assert.equal(secondsUntilDue(sub(), 4_600), 0n);
    assert.equal(secondsUntilDue(sub(), 9_999), 0n);
  });
});
