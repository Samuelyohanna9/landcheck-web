export const money = (value: string | number, currency = "NGN") => new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(Number(value || 0));
export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card / POS" },
  { value: "ussd", label: "USSD" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "escrow", label: "Company Escrow Account" },
  { value: "other", label: "Other" },
];
export const paymentMethodLabel = (value: string) => PAYMENT_METHODS.find((item) => item.value === value)?.label || value.replaceAll("_", " ");
export function PaymentStatusBadge({ status }: { status: string }) { return <span className={`payment-status ${status}`}>{status.replaceAll("_", " ")}</span>; }
export function FinancialSummaryCards({ summary }: { summary: Record<string, string> }) { return <div className="financial-cards">{[["Agreed Price","agreed_price"],["Confirmed","confirmed_paid"],["Pending","pending_paid"],["Outstanding","outstanding"]].map(([label,key]) => <div key={key}><small>{label}</small><strong>{money(summary[key])}</strong></div>)}</div>; }
