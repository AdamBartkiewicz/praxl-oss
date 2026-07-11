import assert from "node:assert/strict";
import test from "node:test";
import {
  CLI_TOKEN_PREFIX,
  generateCliToken,
  hashCliToken,
  isValidCliTokenFormat,
  validateCliTokenState,
} from "./cli-auth";

test("generateCliToken creates an opaque prefixed token and stores only its hash", () => {
  const generated = generateCliToken();

  assert.ok(generated.token.startsWith(CLI_TOKEN_PREFIX));
  assert.equal(generated.tokenHash, hashCliToken(generated.token));
  assert.match(generated.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(generated.tokenHash, generated.token);
  assert.ok(generated.tokenPrefix.endsWith("..."));
  assert.ok(!generated.tokenPrefix.includes(generated.token));
  assert.equal(isValidCliTokenFormat(generated.token), true);
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

test("isValidCliTokenFormat rejects user IDs and malformed credentials", () => {
  assert.equal(isValidCliTokenFormat("9c14a98b-936d-46c6-bd37-d2d37e7f4629"), false);
  assert.equal(isValidCliTokenFormat(`${CLI_TOKEN_PREFIX}too-short`), false);
  assert.equal(isValidCliTokenFormat(`${CLI_TOKEN_PREFIX}${"a".repeat(42)}!`), false);
});

test("validateCliTokenState accepts active tokens with the required scope", () => {
  const rejection = validateCliTokenState(
    { revokedAt: null, expiresAt: new Date("2026-07-13T00:00:00Z"), scopes: ["cli"] },
    "cli",
    new Date("2026-07-12T00:00:00Z"),
  );
  assert.equal(rejection, null);
});

test("validateCliTokenState rejects revoked, expired, and underscoped tokens", () => {
  const now = new Date("2026-07-12T00:00:00Z");

  assert.equal(
    validateCliTokenState({ revokedAt: now, expiresAt: null, scopes: ["cli"] }, "cli", now),
    "revoked",
  );
  assert.equal(
    validateCliTokenState(
      { revokedAt: null, expiresAt: new Date("2026-07-11T23:59:59Z"), scopes: ["cli"] },
      "cli",
      now,
    ),
    "expired",
  );
  assert.equal(
    validateCliTokenState({ revokedAt: null, expiresAt: null, scopes: ["cli"] }, "admin", now),
    "insufficient_scope",
  );
});
