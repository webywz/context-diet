import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REDACTED, redactSecrets } from "../src/redact.ts";
import { diet } from "../src/diet.ts";

function cuts() {
  return { secretsRedacted: 0 };
}

describe("redactSecrets", () => {
  it("redacts PEM private keys", () => {
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF6PZGFwOGK8=",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const c = cuts();
    const out = redactSecrets(`keep\n${pem}\nok\n`, c);
    assert.equal(c.secretsRedacted, 1);
    assert.match(out, /keep/);
    assert.match(out, /ok/);
    assert.doesNotMatch(out, /BEGIN RSA PRIVATE KEY/);
    assert.match(out, new RegExp(REDACTED.replace(/[[\]]/g, "\\$&")));
  });

  it("redacts JWT-ish tokens", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const c = cuts();
    const out = redactSecrets(`token=${jwt}`, c);
    assert.equal(c.secretsRedacted, 1);
    assert.equal(out, `token=${REDACTED}`);
  });

  it("redacts sk- / sk-ant- / sk-proj- keys", () => {
    const c = cuts();
    const out = redactSecrets(
      [
        "a sk-abcdefghijklmnopqrstuvwxyz12",
        "b sk-ant-api03-abcdefghijklmnopqrst",
        "c sk-proj-abcdefghijklmnopqrstuvwx",
      ].join("\n"),
      c,
    );
    assert.equal(c.secretsRedacted, 3);
    assert.doesNotMatch(out, /sk-[a-z]/);
    assert.equal(out.split(REDACTED).length - 1, 3);
  });

  it("redacts GitHub tokens", () => {
    const c = cuts();
    const out = redactSecrets(
      [
        "ghp_abcdefghijklmnopqrstuvwxyzABCDEF",
        "gho_abcdefghijklmnopqrstuvwxyzABCDEF",
        "github_pat_11ABCDEFGHIJKLMNOP_abcdefghijklmnopqrstuvwxyz0123456789ABCDEF",
      ].join(" "),
      c,
    );
    assert.equal(c.secretsRedacted, 3);
    assert.doesNotMatch(out, /ghp_|gho_|github_pat_/);
  });

  it("redacts Slack xoxb-/xoxp- tokens", () => {
    const c = cuts();
    const out = redactSecrets(
      "xoxb-1234567890-abcdefghij xoxp-1234567890-abcdefghij",
      c,
    );
    assert.equal(c.secretsRedacted, 2);
    assert.doesNotMatch(out, /xox[bp]-/);
  });

  it("redacts AWS AKIA keys", () => {
    const c = cuts();
    const out = redactSecrets("AKIAIOSFODNN7EXAMPLE", c);
    assert.equal(c.secretsRedacted, 1);
    assert.equal(out, REDACTED);
  });

  it("redacts Bearer and Basic auth", () => {
    const c = cuts();
    const out = redactSecrets(
      "Authorization: Bearer abcdefghijklmnop\nAuthorization: Basic YWxhZGRpbjpvcGVuc2VzYW1l",
      c,
    );
    assert.equal(c.secretsRedacted, 2);
    assert.doesNotMatch(out, /Bearer abc|Basic YW/);
    assert.equal(out.split(REDACTED).length - 1, 2);
  });

  it("leaves innocent text alone", () => {
    const c = cuts();
    const text = "hello world\nsk-...\nnot a jwt a.b.c\n";
    const out = redactSecrets(text, c);
    assert.equal(c.secretsRedacted, 0);
    assert.equal(out, text);
  });
});

describe("diet with redact", () => {
  it("scrubs secrets before other heuristics and counts them", () => {
    const raw = [
      "DEBUG noise line that may get dropped as chrome",
      "api_key=sk-abcdefghijklmnopqrstuvwxyz12",
      "hello",
      "",
      "",
      "hello",
    ].join("\n");
    const result = diet(raw, { redact: true });
    assert.ok(result.cuts.secretsRedacted >= 1);
    assert.doesNotMatch(result.text, /sk-abcdefgh/);
    assert.match(result.text, /\[redacted\]/);
  });

  it("does not redact when flag is off", () => {
    const raw = "key=sk-abcdefghijklmnopqrstuvwxyz12\n";
    const result = diet(raw);
    assert.equal(result.cuts.secretsRedacted, 0);
    assert.match(result.text, /sk-abcdefgh/);
  });
});
