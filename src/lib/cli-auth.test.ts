import assert from "node:assert/strict";
import test from "node:test";
import { CLI_TOKEN_PREFIX, generateCliToken, hashCliToken } from "./cli-auth";

test("generateCliToken creates an opaque prefixed token and stores only its hash", () => {
  const generated = generateCliToken();

  assert.ok(generated.token.startsWith(CLI_TOKEN_PREFIX));
  assert.equal(generated.tokenHash, hashCliToken(generated.token));
  assert.match(generated.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(generated.tokenHash, generated.token);
  assert.ok(generated.tokenPrefix.endsWith("..."));
  assert.ok(!generated.tokenPrefix.includes(generated.token));
});

test("generateCliToken uses enough randomness to produce distinct credentials", () => {
  const tokens = new Set(Array.from({ length: 100 }, () => generateCliToken().token));
  assert.equal(tokens.size, 100);
});

test("hashCliToken is deterministic and sensitive to the complete token", () => {
  const token = `${CLI_TOKEN_PREFIX}example`;
  assert.equal(hashCliToken(token), hashCliToken(token));
  assert.notEqual(hashCliToken(token), hashCliToken(`${token}x`));
});
