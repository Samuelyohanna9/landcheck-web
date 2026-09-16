import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { money } from "../../components/estates/FinancialComponents";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstateModal from "../../components/estates/EstateModal";

export default function EstateCustomersPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Array<{ id: number; name: string }>>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [message, setMessage] = useState("");

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => { setEstateName(response.data.name); setOrganizationId(response.data.organization_id); }).catch(() => undefined);
    api.get("/estates/selectors", { params: { estate_id: estateId } }).then((response) => setCustomers(response.data.customers || [])).catch(() => setCustomers([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers.filter((customer) => !query || customer.name.toLowerCase().includes(query));
  }, [customers, search]);

  const selectedCustomer = customers.find((customer) => String(customer.id) === selectedId);

  const chooseCustomer = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setStatement(null);
    if (!id) return;
    try {
      const [financial, statementResponse] = await Promise.all([
        api.get(`/estates/customers/${id}/financial-detail`),
        api.get(`/estates/customers/${id}/statement`),
      ]);
      setDetail(financial.data);
      setStatement(statementResponse.data);
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Customer financial detail could not be loaded."));
    }
  };

  const createCustomer = async () => {
    if (!organizationId || !newName.trim()) { toast.error("Enter the customer name."); return; }
    try {
      await api.post(`/estates/organizations/${organizationId}/customers`, { full_name: newName.trim(), phone: newPhone.trim() || null, email: newEmail.trim() || null });
      setNewName(""); setNewPhone(""); setNewEmail(""); setShowAddCustomer(false);
      toast.success("Customer added.");
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Customer could not be created."));
    }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="customers" search={search} onSearchChange={setSearch} searchPlaceholder="Search customers..." recentActivity={activity}>
      <div className="edash-content-row">
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">Customers ({filtered.length})</h3>
              <button type="button" className="edash-tool-btn" onClick={() => setShowAddCustomer(true)}>
                <EstateIcon name="plus" /> Add customer
              </button>
            </div>
            {filtered.length ? (
              <div className="edash-activity-list">
                {filtered.map((customer) => (
                  <div
                    key={customer.id}
                    className="edash-info-card"
                    style={{ cursor: "pointer", margin: 0, marginBottom: 8, borderColor: selectedId === String(customer.id) ? "var(--edash-brand)" : undefined }}
                    onClick={() => void chooseCustomer(String(customer.id))}
                  >
                    <span className="edash-info-card-icon"><EstateIcon name="customers" /></span>
                    <div className="edash-info-card-body"><p className="edash-info-card-name">{customer.name}</p></div>
                    <button type="button" className="edash-btn-outline edash-info-card-action">View</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="edash-tab-empty">No customers yet. Use "Add customer" to create your first one.</p>
            )}
          </div>
        </div>

        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Financial detail</h3></div>
            {!selectedCustomer ? (
              <p className="edash-tab-empty">Select a customer to see their financial summary and statement.</p>
            ) : (
              <>
                <p className="edash-info-card-name" style={{ marginBottom: 10 }}>{selectedCustomer.name}</p>
                {detail ? (
                  <div className="edash-overview-grid edash-overview-grid--2">
                    <div className="edash-overview-field"><span>Agreed</span><strong>{money(detail.totals?.agreed_price ?? detail.financial?.agreed_price ?? 0)}</strong></div>
                    <div className="edash-overview-field"><span>Outstanding</span><strong>{money(detail.totals?.outstanding ?? detail.financial?.outstanding ?? 0)}</strong></div>
                  </div>
                ) : <p className="edash-tab-empty">Loading...</p>}
                {statement && (
                  <button type="button" className="edash-btn-outline" style={{ marginTop: 12 }} onClick={() => window.print()}>Print statement</button>
                )}
              </>
            )}
            {message && <p className="edash-tab-empty" style={{ padding: "8px 0" }}>{message}</p>}
          </div>
        </div>
      </div>

      {showAddCustomer && (
        <EstateModal title="Add customer" subtitle="Create a customer record before reserving or allocating a plot to them." onClose={() => setShowAddCustomer(false)}>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Full name</span><input value={newName} onChange={(event) => setNewName(event.target.value)} autoFocus /></label>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Phone (optional)</span><input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} /></label>
          <label className="edash-field" style={{ marginBottom: 12 }}><span>Email (optional)</span><input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="Lifecycle updates are sent here" /></label>
          <button type="button" className="edash-btn-primary" onClick={() => void createCustomer()}>Add customer</button>
        </EstateModal>
      )}
    </EstateShell>
  );
}
