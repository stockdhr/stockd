export type SaleAmounts = {
  salePriceCents: number;
  purchasePriceCents: number;
  inboundShippingCents: number;
  authenticationFeeCents: number;
  acquisitionAdditionalCents: number;
  platformFeeCents: number;
  outboundShippingCents: number;
  saleOtherCents: number;
};

export function calculateSale(input: SaleAmounts) {
  const trueCostCents = input.purchasePriceCents + input.inboundShippingCents + input.authenticationFeeCents + input.acquisitionAdditionalCents;
  const sellingCostsCents = input.platformFeeCents + input.outboundShippingCents + input.saleOtherCents;
  const netProfitCents = input.salePriceCents - trueCostCents - sellingCostsCents;
  return {
    trueCostCents,
    sellingCostsCents,
    netProfitCents,
    roiPercent: trueCostCents > 0 ? (netProfitCents / trueCostCents) * 100 : 0,
    marginPercent: input.salePriceCents > 0 ? (netProfitCents / input.salePriceCents) * 100 : 0,
  };
}
