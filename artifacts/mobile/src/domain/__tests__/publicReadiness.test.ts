import {
  getPublicReadinessItems,
  getPublicReadinessScore,
} from "../publicReadiness";
import { initialHatchUpData } from "../models";

describe("public readiness", () => {
  it("flags missing launch requirements", () => {
    const items = getPublicReadinessItems(initialHatchUpData, {
      isPublicBuild: true,
      privacyPolicyUrl: null,
      supportEmail: "support@example.com",
      termsUrl: null,
    });

    expect(items.find((item) => item.id === "legal-links")?.status).toBe(
      "action",
    );
    expect(getPublicReadinessScore(items)).toBeLessThan(1);
  });

  it("scores required public-readiness items", () => {
    const items = getPublicReadinessItems(
      {
        ...initialHatchUpData,
        healthConnected: true,
        profileHatchlingId: "hatchling-1",
        profileUsername: "sprigfan",
      },
      {
        isPublicBuild: true,
        privacyPolicyUrl: "https://example.com/privacy",
        supportEmail: "support@example.com",
        termsUrl: "https://example.com/terms",
      },
    );

    expect(getPublicReadinessScore(items)).toBe(1);
  });
});
