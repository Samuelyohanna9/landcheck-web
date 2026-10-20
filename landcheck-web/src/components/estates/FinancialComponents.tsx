import { useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";

export const money = (value: string | number, currency = "NGN") => new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(Number(value || 0));
export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card / POS" },
  { value: "ussd", label: "USSD" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "escrow", label: "Company Escrow Account" },
  { value: "online_paystack", label: "Online - Paystack" },
  { value: "online_flutterwave", label: "Online - Flutterwave" },
  { value: "other", label: "Other" },
];
export const paymentMethodLabel = (value: string) => PAYMENT_METHODS.find((item) => item.value === value)?.label || value.replaceAll("_", " ");
export function PaymentStatusBadge({ status }: { status: string }) { return <span className={`payment-status ${status}`}>{status.replaceAll("_", " ")}</span>; }
export function FinancialSummaryCards({ summary }: { summary: Record<string, string> }) { return <div className="financial-cards">{[["Agreed Price","agreed_price"],["Confirmed","confirmed_paid"],["Pending","pending_paid"],["Outstanding","outstanding"]].map(([label,key]) => <div key={key}><small>{label}</small><strong>{money(summary[key])}</strong></div>)}</div>; }

export type ParsedInstallmentPlan = { installment_amount: string; interval_months: number; next_due_at: string };

// Most Nigerian estates sell on an installment basis, not outright - this is the one shape
// EstateAllocation.payment_plan is ever written in by the reserve/allocate flow, the payment-plan
// editor below, and a "Connect your tools" import (see resolve_installment_plan in
// data_import.py) - everything downstream (the Due Payments board, reminders, this formatter)
// reads the same {type: "installment", installment_amount, interval_months, next_due_at} shape.
export function parsePaymentPlan(value: unknown): ParsedInstallmentPlan | null {
  if (!value) return null;
  try {
    const plan = JSON.parse(String(value)) as Record<string, unknown>;
    if (plan.type === "installment") {
      return {
        installment_amount: String(plan.installment_amount || ""),
        interval_months: Number(plan.interval_months || 1),
        next_due_at: String(plan.next_due_at || ""),
      };
    }
  } catch {
    // Not JSON - a legacy free-text plan, handled below.
  }
  return null;
}

export function formatPaymentPlan(value: unknown) {
  const parsed = parsePaymentPlan(value);
  if (parsed) {
    const dueDate = parsed.next_due_at ? new Date(parsed.next_due_at) : null;
    const due = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "not set";
    const repeat = parsed.interval_months === 1 ? "every month" : `every ${parsed.interval_months} months`;
    return `Installment of ${money(parsed.installment_amount)} ${repeat}; next payment due ${due}.`;
  }
  if (!value) return "Not specified";
  const raw = String(value).trim();
  if (!raw) return "Not specified";
  try {
    JSON.parse(raw);
    return "Payment plan configured";
  } catch {
    return raw;
  }
}

export function isPlanOverdue(nextDueAt: string | null | undefined, outstanding: string | number) {
  if (!nextDueAt || Number(outstanding || 0) <= 0) return false;
  const due = new Date(nextDueAt);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

// A reusable form for setting/editing/removing an allocation's installment plan - used from both
// the Customers page (Financial detail) and the Payments page (allocation record view / Due
// Payments board), so there is exactly one place that calls the payment-plan endpoint.
export function PaymentPlanEditor({ allocationId, currentPlan, onSaved }: { allocationId: number; currentPlan?: string | null; onSaved: () => void }) {
  const existing = parsePaymentPlan(currentPlan);
  const [amount, setAmount] = useState(existing?.installment_amount || "");
  const [intervalMonths, setIntervalMonths] = useState(String(existing?.interval_months || 1));
  const [dueDate, setDueDate] = useState(existing?.next_due_at ? existing.next_due_at.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!amount || Number(amount) <= 0 || !dueDate) { toast.error("Enter the installment amount and next due date."); return; }
    setSaving(true);
    try {
      await api.patch(`/estates/allocations/${allocationId}/payment-plan`, {
        payment_schedule: { installment_amount: Number(amount), interval_months: Number(intervalMonths) || 1, next_due_at: new Date(dueDate).toISOString() },
      });
      toast.success("Payment plan saved.");
      onSaved();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The payment plan could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.patch(`/estates/allocations/${allocationId}/payment-plan`, { payment_schedule: null });
      toast.success("Payment plan removed.");
      onSaved();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The payment plan could not be removed."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="edash-mk-form-grid" style={{ marginTop: 8 }}>
      <label className="edash-field"><span>Installment amount</span><input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 250000" /></label>
      <label className="edash-field"><span>Repeats every</span>
        <select value={intervalMonths} onChange={(event) => setIntervalMonths(event.target.value)}>
          {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n === 1 ? "Month" : `${n} months`}</option>)}
        </select>
      </label>
      <label className="edash-field"><span>Next due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <button type="button" className="edash-btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : existing ? "Update plan" : "Save plan"}</button>
        {existing && <button type="button" className="edash-btn-outline" disabled={saving} onClick={() => void remove()}>Remove plan</button>}
      </div>
    </div>
  );
}
