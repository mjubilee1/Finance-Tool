export function applyRuleBasedCategory(
  transactionName: string,
  merchantName: string | null,
  amount: number,
): {
  categoryPrimary: string | null;
  isFoodCandidate: boolean;
  isTransportationCandidate: boolean;
  isUtilityCandidate: boolean;
  isTenantPaymentCandidate: boolean;
} {
  const text = `${transactionName} ${merchantName || ""}`.toLowerCase();
  
  let categoryPrimary = null;
  let isFoodCandidate = false;
  let isTransportationCandidate = false;
  let isUtilityCandidate = false;
  let isTenantPaymentCandidate = false;

  // Rules based on user request
  if (/grocery|chipotle|cava|restaurant|carryout|cafe|food|deli|convenience/i.test(text)) {
    categoryPrimary = "Food and Drink";
    isFoodCandidate = true;
  } else if (/gas|rideshare|parking|toll|auto|hertz|lyft|uber/i.test(text)) {
    categoryPrimary = "Transportation";
    isTransportationCandidate = true;
  } else if (/pepco|washington gas|water|internet|verizon|xfinity|utility/i.test(text)) {
    categoryPrimary = "Utilities";
    isUtilityCandidate = true;
  } else if (/mortgage|escrow|loan servicer/i.test(text)) {
    categoryPrimary = "Housing";
  } else if (/irs|tax|state payment/i.test(text)) {
    categoryPrimary = "Taxes";
  } else if (/credit card|loan payment|minimum payment/i.test(text)) {
    categoryPrimary = "Debt";
  } else if (amount < 0 && /payroll|employer|deposit/i.test(text)) {
    // Plaid amounts are negative for income (money coming in)
    categoryPrimary = "Income";
  }

  // Tenant rent check: incoming (negative amount), $700-$1100, payment apps
  if (amount <= -700 && amount >= -1100) {
    if (/apple pay|venmo|zelle|cash app|paypal|person/i.test(text)) {
      categoryPrimary = "Income";
      isTenantPaymentCandidate = true;
    }
  }

  return {
    categoryPrimary,
    isFoodCandidate,
    isTransportationCandidate,
    isUtilityCandidate,
    isTenantPaymentCandidate,
  };
}
