import { describe, expect, it } from "vitest";
import { calculateSale } from "../src/lib/business";
import { addCalendarMonths, subscriptionState } from "../src/lib/dates";

describe("financijska logika", () => {
  it("računa dobit za točno odabrani Yeezy artikl", () => {
    const result = calculateSale({
      salePriceCents: 11_000,
      purchasePriceCents: 7_000,
      inboundShippingCents: 0,
      authenticationFeeCents: 0,
      acquisitionAdditionalCents: 0,
      platformFeeCents: 0,
      outboundShippingCents: 0,
      saleOtherCents: 0,
    });
    expect(result.netProfitCents).toBe(4_000);
    expect(result.trueCostCents).toBe(7_000);
  });

  it("oduzima sve nabavne i prodajne troškove", () => {
    const result = calculateSale({
      salePriceCents: 15_000,
      purchasePriceCents: 10_000,
      inboundShippingCents: 1_000,
      authenticationFeeCents: 500,
      acquisitionAdditionalCents: 300,
      platformFeeCents: 600,
      outboundShippingCents: 450,
      saleOtherCents: 150,
    });
    expect(result.trueCostCents).toBe(11_800);
    expect(result.sellingCostsCents).toBe(1_200);
    expect(result.netProfitCents).toBe(2_000);
  });
});

describe("kalendarske članarine", () => {
  it("dodaje kalendarski mjesec, a ne 30 dana", () => {
    expect(addCalendarMonths(new Date("2026-09-06T10:00:00Z"), 1).toISOString()).toBe("2026-10-06T10:00:00.000Z");
  });

  it("sigurno obrađuje kraj mjeseca", () => {
    expect(addCalendarMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });

  it("razlikuje aktivnu, uskoro istječuću i isteklu članarinu", () => {
    const now = new Date("2026-09-06T00:00:00Z");
    expect(subscriptionState({ role:"user", account_status:"active", subscription_expires_at:"2026-10-06T00:00:00Z" }, now)).toBe("active");
    expect(subscriptionState({ role:"user", account_status:"active", subscription_expires_at:"2026-09-09T00:00:00Z" }, now)).toBe("expiring_soon");
    expect(subscriptionState({ role:"user", account_status:"active", subscription_expires_at:"2026-09-05T00:00:00Z" }, now)).toBe("expired");
  });
});
