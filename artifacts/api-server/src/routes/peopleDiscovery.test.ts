import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

let hiddenIdsFixture: number[] = [];
mock.module("./safety.ts", {
  namedExports: {
    getHiddenPlayerIds: async (_viewerId: number) => [...hiddenIdsFixture],
    filterDiscoverableCandidates: async (_viewerId: number, rows: any[]) => rows,
  },
});

const { buildPeopleDiscoveryFilter } = await import("./peopleDiscovery.ts");
const { PgDialect } = await import("drizzle-orm/pg-core");

const dialect = new PgDialect();
function sqlOf(clause: any): string {
  return dialect.sqlToQuery(clause).sql;
}

beforeEach(() => {
  hiddenIdsFixture = [];
});

describe("buildPeopleDiscoveryFilter", () => {
  it("always includes visibility and minor predicates in whereClauses", async () => {
    const { whereClauses } = await buildPeopleDiscoveryFilter(1);
    const rendered = whereClauses.map(sqlOf).join(" | ");
    assert.match(rendered, /location_visibility/);
    assert.match(rendered, /is_minor/);
  });

  it("does not add a notInArray clause when hiddenIds is empty", async () => {
    hiddenIdsFixture = [];
    const { whereClauses, hiddenIds } = await buildPeopleDiscoveryFilter(1);
    assert.equal(hiddenIds.size, 0);
    assert.equal(whereClauses.length, 2);
    assert.ok(!whereClauses.map(sqlOf).some((s) => / in /i.test(s)));
  });

  it("adds a notInArray clause when hiddenIds is non-empty", async () => {
    hiddenIdsFixture = [7, 8, 9];
    const { whereClauses, hiddenIds } = await buildPeopleDiscoveryFilter(1);
    assert.deepEqual([...hiddenIds].sort(), [7, 8, 9]);
    assert.equal(whereClauses.length, 3);
    const last = sqlOf(whereClauses[2]);
    assert.match(last, /\bin\b/i);
    assert.match(last, /"id"/);
  });

  it("returns empty hiddenIds and no notInArray clause when viewerId is null", async () => {
    hiddenIdsFixture = [42];
    const { whereClauses, hiddenIds } = await buildPeopleDiscoveryFilter(null);
    assert.equal(hiddenIds.size, 0);
    assert.equal(whereClauses.length, 2);
  });

  it("returns empty hiddenIds and no notInArray clause when viewerId is undefined", async () => {
    hiddenIdsFixture = [42];
    const { whereClauses, hiddenIds } = await buildPeopleDiscoveryFilter(undefined);
    assert.equal(hiddenIds.size, 0);
    assert.equal(whereClauses.length, 2);
  });

  describe("filter()", () => {
    const rows = [
      { id: 1, locationVisibility: "exact", isMinor: false },
      { id: 2, locationVisibility: "hidden", isMinor: false },
      { id: 3, locationVisibility: "city", isMinor: true },
      { id: 4, locationVisibility: "neighborhood", isMinor: false },
      { id: 5, locationVisibility: "city", isMinor: false },
    ];

    it("drops hidden visibility, minors, and blocked ids by default", async () => {
      hiddenIdsFixture = [4];
      const { filter } = await buildPeopleDiscoveryFilter(1);
      const out = filter(rows).map((r) => r.id);
      assert.deepEqual(out, [1, 5]);
    });

    it("respects an allowVisibility override (scope-aware boards)", async () => {
      hiddenIdsFixture = [];
      const { filter } = await buildPeopleDiscoveryFilter(1);
      // Only allow "city" visibility through — simulates a city-scoped board
      // that still excludes neighborhood/exact entries.
      const out = filter(rows, { allowVisibility: (v) => v === "city" }).map((r) => r.id);
      // id 3 still excluded because isMinor=true; id 5 passes; id 2 fails ("hidden").
      assert.deepEqual(out, [5]);
    });

    it("still enforces minor exclusion even when allowVisibility would let the row through", async () => {
      hiddenIdsFixture = [];
      const { filter } = await buildPeopleDiscoveryFilter(1);
      const out = filter(rows, { allowVisibility: () => true }).map((r) => r.id);
      assert.ok(!out.includes(3));
    });

    it("still enforces block exclusion even when allowVisibility would let the row through", async () => {
      hiddenIdsFixture = [1];
      const { filter } = await buildPeopleDiscoveryFilter(99);
      const out = filter(rows, { allowVisibility: () => true }).map((r) => r.id);
      assert.ok(!out.includes(1));
    });
  });
});

