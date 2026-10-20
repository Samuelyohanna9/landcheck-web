import { api } from "../../api/client";
import EstateModal from "./EstateModal";

export type DuplicateCustomerMatch = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  match_reason: "phone" | "email" | "name";
  plots: { estate_name: string; plot_number: string; status: string }[];
};

const REASON_LABEL: Record<string, string> = { phone: "the same phone number", email: "the same email address", name: "the same name" };

// Called right before a new customer would be created - from every place that happens (the
// Customers page's "Add customer", the Map & Plots reserve/allocate flow's inline add-customer
// form, and public-reservation conversion) - so a buyer who already has one plot doesn't end up
// with a second, disconnected customer record when they buy another.
export async function findDuplicateCustomers(
  organizationId: number | string,
  params: { full_name?: string; phone?: string; email?: string; exclude_customer_id?: number },
): Promise<DuplicateCustomerMatch[]> {
  try {
    const response = await api.get<{ matches: DuplicateCustomerMatch[] }>(`/estates/organizations/${organizationId}/customers/find-duplicates`, { params });
    return response.data.matches || [];
  } catch {
    return [];
  }
}

export function DuplicateCustomerModal({
  matches,
  onUseExisting,
  onCreateNew,
  onClose,
}: {
  matches: DuplicateCustomerMatch[];
  onUseExisting: (match: DuplicateCustomerMatch) => void;
  onCreateNew: () => void;
  onClose: () => void;
}) {
  return (
    <EstateModal title="This customer may already exist" subtitle="Keep one record per buyer - adding another plot to their existing record keeps their history together instead of splitting it across duplicates." onClose={onClose}>
      {matches.map((match) => (
        <div key={match.id} className="edash-info-card" style={{ flexDirection: "column", alignItems: "stretch", gap: 6, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <strong>{match.name}</strong>
            <span className="edash-status-pill tone-neutral">Matched by {REASON_LABEL[match.match_reason] || match.match_reason}</span>
          </div>
          <p className="edash-field-note" style={{ margin: 0 }}>
            {match.phone || "No phone"} &middot; {match.email || "No email"}{match.address ? ` · ${match.address}` : ""}
          </p>
          <p className="edash-field-note" style={{ margin: 0 }}>
            {match.plots.length > 0
              ? <>Already has: {match.plots.map((plot, index) => <span key={index}>{index > 0 ? ", " : ""}{plot.estate_name} - Plot {plot.plot_number} ({plot.status})</span>)}</>
              : "No plots recorded for this customer yet."}
          </p>
          <button type="button" className="edash-btn-primary" onClick={() => onUseExisting(match)}>Use this customer for the new plot</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8, borderTop: "1px solid var(--edash-border-soft)", paddingTop: 12 }}>
        <button type="button" className="edash-btn-outline" onClick={onCreateNew}>This is a different person - create a new customer</button>
        <button type="button" className="edash-btn-outline" onClick={onClose}>Cancel</button>
      </div>
    </EstateModal>
  );
}
