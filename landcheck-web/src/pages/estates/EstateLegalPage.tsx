import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
import DpaDocumentText from "../../components/estates/DpaDocumentText";
import EstateShell from "../../components/estates/EstateShell";
import Spinner from "../../components/estates/EstateSpinner";
import "../../styles/estate-legal.css";

type DpaStatus = {
  current_version: string;
  accepted: boolean;
  latest_acceptance: { version: string; accepted_at: string; accepted_by_name: string | null; accepted_by_email: string | null } | null;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function EstateLegalPage() {
  const navigate = useNavigate();
  const session = getEstateAuthSession();
  const organizationId = session?.user.organization_id;
  const canManage = session?.user.role_key === "owner";

  const [sidebarEstateId, setSidebarEstateId] = useState("");
  const [sidebarEstateName, setSidebarEstateName] = useState("");
  const [status, setStatus] = useState<DpaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      setStatus((await api.get<DpaStatus>("/estates/legal/dpa", { params: { organization_id: organizationId } })).data);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The agreement could not be loaded."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [organizationId]);
  useEffect(() => {
    api.get("/estates").then((response) => {
      const first = (response.data || [])[0];
      if (first) { setSidebarEstateId(String(first.id)); setSidebarEstateName(first.name); }
    }).catch(() => undefined);
  }, []);

  const accept = async () => {
    if (!organizationId) return;
    setBusy(true);
    try {
      const response = await api.post<DpaStatus>("/estates/legal/dpa/accept", {}, { params: { organization_id: organizationId } });
      setStatus(response.data);
      toast.success("Recorded. Thank you.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The agreement could not be recorded."));
    } finally {
      setBusy(false);
    }
  };

  if (!organizationId) return null;

  return (
    <EstateShell estateId={sidebarEstateId} estateName={sidebarEstateName} activeKey="settings" pageTitle="Legal & compliance" skipBillingGate>
      <div className="edash-page-head">
        <div>
          <span className="edash-section-kicker">Settings</span>
          <h1>Legal &amp; compliance</h1>
          <p>The Data Processing Agreement between your company and LandCheck for how customer, agent and staff personal data is handled on the Platform.</p>
        </div>
      </div>

      <div className="edash-card" style={{ marginBottom: 16 }}><div className="edash-card-inner">
        {loading ? <Spinner /> : status?.accepted ? (
          <div className="edash-legal-status is-accepted">
            <strong>Accepted</strong>
            <p>
              {status.latest_acceptance?.accepted_by_name || status.latest_acceptance?.accepted_by_email || "Someone at your company"} accepted
              version {status.latest_acceptance?.version} on {formatDateTime(status.latest_acceptance?.accepted_at)}.
            </p>
          </div>
        ) : (
          <div className="edash-legal-status">
            <strong>Not yet accepted</strong>
            <p>{canManage ? "Read the agreement below, then tick the box and accept it." : "Ask a company owner to review and accept this agreement."}</p>
          </div>
        )}
      </div></div>

      <div className="edash-card" style={{ marginBottom: 16 }}><div className="edash-card-inner edash-legal-doc">
        <p className="edash-legal-note">This is under final legal review. If a material change is made, you will be asked to accept it again.</p>
        <DpaDocumentText />
      </div></div>

      {canManage && !status?.accepted && (
        <div className="edash-card"><div className="edash-card-inner">
          <label className="edash-legal-accept">
            <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={busy || loading} />
            <span>I have read this agreement and accept it on behalf of my company.</span>
          </label>
          <button type="button" className="edash-btn-primary" disabled={!checked || busy || loading} onClick={() => void accept()}>{busy ? "Recording..." : "I agree"}</button>
        </div></div>
      )}

      <p className="edash-legal-back"><button type="button" className="edash-sp-back" onClick={() => navigate(-1)}>Back</button></p>
    </EstateShell>
  );
}
