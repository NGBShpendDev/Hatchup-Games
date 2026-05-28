import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAccountSuspendedError } from "./suspendedError.ts";

describe("isAccountSuspendedError", () => {
  it("recognizes ApiError-shaped 403 account_suspended", () => {
    assert.equal(
      isAccountSuspendedError({ status: 403, data: { error: "account_suspended" } }),
      true,
    );
  });

  it("recognizes axios-style nested response shape", () => {
    assert.equal(
      isAccountSuspendedError({ response: { status: 403, data: { error: "account_suspended" } } }),
      true,
    );
  });

  it("rejects other 403 error codes", () => {
    assert.equal(
      isAccountSuspendedError({ status: 403, data: { error: "minor_account_restricted" } }),
      false,
    );
  });

  it("rejects non-403 statuses", () => {
    assert.equal(
      isAccountSuspendedError({ status: 422, data: { error: "account_suspended" } }),
      false,
    );
  });

  it("rejects null / non-object / unrelated errors", () => {
    assert.equal(isAccountSuspendedError(null), false);
    assert.equal(isAccountSuspendedError(undefined), false);
    assert.equal(isAccountSuspendedError("oops"), false);
    assert.equal(isAccountSuspendedError(new Error("boom")), false);
  });
});
