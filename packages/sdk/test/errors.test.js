import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SdkError, ConfigError } from "../dist/errors.js";

describe("SdkError", () => {
  it("sets name, message, and default code", () => {
    const err = new SdkError("boom");
    assert.equal(err.name, "SdkError");
    assert.equal(err.message, "boom");
    assert.equal(err.code, "SDK_ERROR");
  });
});

describe("ConfigError", () => {
  it("uses CONFIG_ERROR code", () => {
    const err = new ConfigError("missing contractId");
    assert.equal(err.name, "ConfigError");
    assert.equal(err.code, "CONFIG_ERROR");
    assert.ok(err instanceof SdkError);
  });
});
