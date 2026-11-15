import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const sdkRoot = resolve(testDir, "..");
const repoRoot = resolve(sdkRoot, "..", "..");

describe("SDK npm publish workflow & package metadata", () => {
  const pkg = JSON.parse(readFileSync(resolve(sdkRoot, "package.json"), "utf8"));
  const workflow = readFileSync(
    resolve(repoRoot, ".github", "workflows", "publish-sdk.yml"),
    "utf8",
  );
  const readme = readFileSync(resolve(sdkRoot, "README.md"), "utf8");

  it("configures @recurring-subscriptions/sdk public registry metadata and prepublish guard", () => {
    assert.equal(pkg.name, "@recurring-subscriptions/sdk");
    assert.deepEqual(pkg.publishConfig, {
      access: "public",
      registry: "https://registry.npmjs.org/",
    });
    assert.match(pkg.scripts.prepublishOnly, /npm run typecheck/);
    assert.match(pkg.scripts.prepublishOnly, /npm test/);
  });

  it("triggers publish-sdk.yml strictly on workflow_dispatch without push or pull_request triggers", () => {
    assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m);
    assert.doesNotMatch(workflow, /^\s+push\s*:/m);
    assert.doesNotMatch(workflow, /^\s+pull_request\s*:/m);
    assert.doesNotMatch(workflow, /^\s+release\s*:/m);
  });

  it("runs typecheck, build, and unit tests before publishing with NPM_TOKEN and OIDC provenance", () => {
    const typecheckIdx = workflow.indexOf("run: npm run typecheck");
    const buildIdx = workflow.indexOf("run: npm run build");
    const testIdx = workflow.indexOf("run: npm test");
    const publishIdx = workflow.indexOf("npm publish --access public --provenance");

    assert.ok(typecheckIdx > 0, "workflow must run npm run typecheck");
    assert.ok(buildIdx > typecheckIdx, "workflow must run npm run build");
    assert.ok(testIdx > buildIdx, "workflow must run npm test before publish");
    assert.ok(publishIdx > testIdx, "workflow must publish only after tests pass");

    assert.match(workflow, /id-token:\s*write/);
    assert.match(workflow, /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
  });

  it("documents NPM_TOKEN, provenance, and workflow_dispatch inputs in README.md", () => {
    assert.match(readme, /publish-sdk\.yml/);
    assert.match(readme, /NPM_TOKEN/);
    assert.match(readme, /--provenance/);
    assert.match(readme, /workflow_dispatch/);
  });
});
