import type { WeeklyRecap } from "./nutritionRecap.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the weekly recap as a self-contained HTML email. Inline styles only —
 * most mail clients (Gmail, Outlook) strip <style> blocks. Dark-on-light to
 * stay readable across themes; no external assets.
 *
 * Kept in its own module (with no DB / OpenAI imports) so it can be unit
 * tested without spinning up the full server graph.
 */
export function renderRecapEmailHtml(recap: WeeklyRecap, displayName: string): string {
  const name = escapeHtml(displayName || "there");
  const macroRow = (label: string, avg: number, target: number, unit: string) => {
    const gap = avg - target;
    const gapTxt = gap === 0 ? "on target" : gap > 0 ? `+${gap}${unit} over` : `${gap}${unit} under`;
    const color = Math.abs(gap) / Math.max(target, 1) < 0.15 ? "#16a34a" : "#dc2626";
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#0f172a;">${label}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#334155;">${avg}${unit}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${target}${unit}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:${color};font-weight:600;">${gapTxt}</td>
      </tr>`;
  };
  const top = recap.topFoods[0];
  const topBlock = top
    ? `<p style="margin:16px 0 0;color:#334155;">Top food this week: <strong>${escapeHtml(top.emoji)} ${escapeHtml(top.name)}</strong> (${top.count}×)</p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#ec4899,#ef4444);padding:24px;color:#ffffff;">
          <div style="font-size:14px;opacity:0.85;letter-spacing:0.04em;text-transform:uppercase;">HATCHUP · Weekly Nutrition Recap</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px;">${escapeHtml(recap.hatchlingEmoji)} Hey ${name}!</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0;font-size:16px;color:#0f172a;">Your Hatchling is feeling <strong>${escapeHtml(recap.hatchlingMood)}</strong> after watching you log <strong>${recap.daysLogged}/7 days</strong> (${recap.mealsLogged} meals).</p>
          ${topBlock}
          <h3 style="margin:24px 0 8px;font-size:16px;color:#0f172a;">Averages vs targets</h3>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
            <thead><tr style="background:#f8fafc;">
              <th align="left" style="padding:8px 12px;color:#64748b;font-weight:600;">Macro</th>
              <th align="left" style="padding:8px 12px;color:#64748b;font-weight:600;">Avg/day</th>
              <th align="left" style="padding:8px 12px;color:#64748b;font-weight:600;">Target</th>
              <th align="left" style="padding:8px 12px;color:#64748b;font-weight:600;">Gap</th>
            </tr></thead>
            <tbody>
              ${macroRow("Calories", recap.averages.calories, recap.targets.calories, " kcal")}
              ${macroRow("Protein", recap.averages.protein, recap.targets.protein, "g")}
              ${macroRow("Carbs", recap.averages.carbs, recap.targets.carbs, "g")}
              ${macroRow("Fat", recap.averages.fat, recap.targets.fat, "g")}
            </tbody>
          </table>
          <div style="margin-top:24px;padding:16px;background:#fef2f2;border-left:4px solid #ec4899;border-radius:6px;">
            <div style="font-size:12px;font-weight:700;color:#9f1239;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:4px;">Coach tip</div>
            <div style="color:#0f172a;font-size:14px;line-height:1.5;">${escapeHtml(recap.aiTip)}</div>
          </div>
          <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
            You're getting this because you opted in to weekly recap emails. Manage email preferences in HatchUp under Settings → Privacy.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
