export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatAccountType(type: string, subtype: string | null): string {
  if (subtype) {
    return subtype.replace(/_/g, " ");
  }
  return type.replace(/_/g, " ");
}
