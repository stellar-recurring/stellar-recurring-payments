import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EVENT_TOPICS, vaultEventTopicFilter } from "../dist/events.js";

describe("vaultEventTopicFilter", () => {
  it("builds a wildcard filter for created events", () => {
    assert.deepEqual(vaultEventTopicFilter(EVENT_TOPICS.CREATED), [
      "sub",
      "created",
      "*",
      "*",
      "*",
    ]);
  });

  it("rejects unknown kinds at runtime", () => {
    assert.throws(() => vaultEventTopicFilter("paid_typo"), RangeError);
  });
});
