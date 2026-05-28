import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderRecapEmailHtml } from "./nutritionRecapEmail.ts";
import type { WeeklyRecap } from "./nutritionRecap.ts";

const baseRecap: WeeklyRecap = {
  weekStart: new Date().toISOString(),
  daysLogged: 6,
  mealsLogged: 18,
  averages: { calories: 2100, protein: 160, carbs: 220, fat: 60 },
  targets:  { calories: 2200, protein: 170, carbs: 230, fat: 65 },
  gaps:     { calories: -100, protein: -10, carbs: -10, fat: -5 },
  ratios:   { calories: 0.95, protein: 0.94, carbs: 0.96, fat: 0.92 },
  adherence: 0.94,
  topFoods: [{ name: "Grilled chicken", emoji: "🍗", count: 4 }],
  hatchlingMood: "happy",
  hatchlingEmoji: "😊",
  aiTip: "Add a Greek yogurt at breakfast to close the protein gap.",
  aiSource: "ai",
};

describe("renderRecapEmailHtml", () => {
  it("includes the player name, averages, targets, top food, and tip", () => {
    const html = renderRecapEmailHtml(baseRecap, "DragonMaster");
    assert.match(html, /DragonMaster/);
    assert.match(html, /2100/);
    assert.match(html, /2200/);
    assert.match(html, /160g/);
    assert.match(html, /170g/);
    assert.match(html, /Grilled chicken/);
    assert.match(html, /Add a Greek yogurt/);
    assert.match(html, /Weekly Nutrition Recap/i);
  });

  it("escapes HTML in player name and tip to prevent injection", () => {
    const evil: WeeklyRecap = { ...baseRecap, aiTip: "<script>alert(1)</script>" };
    const html = renderRecapEmailHtml(evil, "<b>Hax</b>");
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(!html.includes("<b>Hax</b>"));
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;b&gt;Hax&lt;\/b&gt;/);
  });

  it("falls back gracefully when displayName is empty", () => {
    const html = renderRecapEmailHtml(baseRecap, "");
    assert.match(html, /Hey there/);
  });

  it("omits the top-food line when no foods were logged", () => {
    const empty: WeeklyRecap = { ...baseRecap, topFoods: [] };
    const html = renderRecapEmailHtml(empty, "Alex");
    assert.ok(!html.includes("Top food this week"));
  });
});
