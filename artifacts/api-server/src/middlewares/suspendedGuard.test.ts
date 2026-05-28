// Unit tests for the blockSuspendedSocialWrite middleware. The DB is mocked
// via node:test module mocks so we can exercise each branch in isolation.
import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";

const state = {
  players: [] as { id: number; isSuspended: boolean }[],
};

function resetState() {
  state.players = [];
}

mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  },
});

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    db: {
      query: {
        playersTable: {
          findFirst: async (args: any) => {
            const id = args?.where?.val;
            const found = state.players.find((p) => p.id === id);
            if (!found) return undefined;
            return { isSuspended: found.isSuspended };
          },
        },
      },
    },
    playersTable: { id: {} },
  },
});

let blockSuspendedSocialWrite: (req: Request, res: Response, next: NextFunction) => Promise<void>;

before(async () => {
  blockSuspendedSocialWrite = (await import("./suspendedGuard.ts")).blockSuspendedSocialWrite;
});

beforeEach(() => {
  resetState();
});

function makeRes() {
  const calls = { status: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      calls.status = code;
      return this;
    },
    json(body: unknown) {
      calls.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, calls };
}

describe("blockSuspendedSocialWrite", () => {
  it("calls next() when the player is not suspended", async () => {
    state.players.push({ id: 7, isSuspended: false });
    const req = { playerId: 7 } as Request;
    const { res, calls } = makeRes();
    let nextCalled = false;
    await blockSuspendedSocialWrite(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    assert.equal(nextCalled, true);
    assert.equal(calls.status, 0);
    assert.equal(calls.body, undefined);
  });

  it("returns 403 account_suspended when the player is suspended", async () => {
    state.players.push({ id: 9, isSuspended: true });
    const req = { playerId: 9 } as Request;
    const { res, calls } = makeRes();
    let nextCalled = false;
    await blockSuspendedSocialWrite(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    assert.equal(nextCalled, false);
    assert.equal(calls.status, 403);
    assert.equal((calls.body as { error: string }).error, "account_suspended");
    assert.equal(
      typeof (calls.body as { message: string }).message,
      "string",
      "should include a user-facing message",
    );
  });

  it("returns 401 Unauthorized when req.playerId is missing", async () => {
    const req = {} as Request;
    const { res, calls } = makeRes();
    let nextCalled = false;
    await blockSuspendedSocialWrite(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    assert.equal(nextCalled, false);
    assert.equal(calls.status, 401);
    assert.equal((calls.body as { error: string }).error, "Unauthorized");
  });

  it("calls next() when the player row is missing entirely (treated as not suspended)", async () => {
    // No matching player in state — findFirst returns undefined.
    const req = { playerId: 999 } as Request;
    const { res, calls } = makeRes();
    let nextCalled = false;
    await blockSuspendedSocialWrite(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    assert.equal(nextCalled, true);
    assert.equal(calls.status, 0);
  });
});
