import { describe, expect, it } from "vitest";

function canAccessTenant(requestedCompanyId: string, tokenCompanyId?: string) {
  return Boolean(tokenCompanyId && requestedCompanyId === tokenCompanyId);
}

describe("tenant isolation guardrails", () => {
  it("allows access only when the company in the token matches the resolved company", () => {
    expect(canAccessTenant("company-a", "company-a")).toBe(true);
    expect(canAccessTenant("company-a", "company-b")).toBe(false);
  });

  it("denies access when no tenant context exists", () => {
    expect(canAccessTenant("company-a", undefined)).toBe(false);
  });
});
