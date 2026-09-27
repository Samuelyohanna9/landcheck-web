import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
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
    <EstateShell estateId={sidebarEstateId} estateName={sidebarEstateName} activeKey="settings" skipBillingGate>
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

        <h2>Data Processing Agreement</h2>
        <p>Between <strong>LandCheck</strong> ("we", "LandCheck", the Processor) and your company ("you", the Controller), covering the personal data your company submits to, or collects through, LandCheck Estates.</p>

        <h3>What this covers</h3>
        <p>Your company decides what customer, sales-agent and marketing data it collects and why - you are the Controller. LandCheck processes that data only to run the features you use, and only on your instructions (including the instructions built into the Platform's ordinary functionality, such as generating a marketing flyer from your own plot and price data) - we are your Processor. For your own company's staff accounts and billing details, LandCheck decides why that data is kept, so LandCheck is an independent Controller for that data alone.</p>

        <h3>What LandCheck stores and why</h3>
        <ul>
          <li><strong>Customers &amp; reservations</strong> - name, phone, email, address and any notes your staff add, to manage your sales pipeline.</li>
          <li><strong>Sales agents</strong> - name and contact details, to track and pay commission.</li>
          <li><strong>Billing</strong> - your billing contact and a tokenised card reference; LandCheck never sees or stores a full card number.</li>
          <li><strong>Public Estate page &amp; reservation requests</strong> - the name, phone and/or email a visitor submits with a reservation request.</li>
          <li><strong>Facebook &amp; Instagram posting</strong> - your connected account's access token (stored encrypted) and the posts you approve, if you turn this on.</li>
          <li><strong>WhatsApp updates</strong> - the name and phone number of a buyer who explicitly opts in, and their consent record, if you turn this on. They can reply STOP at any time.</li>
          <li><strong>Survey &amp; documents</strong> - uploaded survey plans, title documents and layout drawings, and any names appearing on them.</li>
          <li><strong>Your staff accounts</strong> - name, email, a securely hashed password (never stored in plain text), and an audit trail of actions taken.</li>
        </ul>

        <h3>Security</h3>
        <p>All traffic to the Platform is encrypted (HTTPS/TLS). Passwords are hashed, never stored in plain text. Third-party connection tokens (Facebook, Instagram, WhatsApp) are encrypted at rest. Your account is isolated from every other company's data, and access within your account follows the staff role you assign. Material actions on your estate are recorded in an audit trail visible to your own staff with permission to see it.</p>

        <h3>Sub-processors</h3>
        <p>To provide the Platform, LandCheck uses these providers, each bound to protect data at least as strongly as this agreement requires:</p>
        <ul>
          <li><strong>Cloudflare</strong> - stores uploaded documents and generated images.</li>
          <li><strong>Flutterwave</strong> - processes your subscription payment; never sees or stores your customers' data.</li>
          <li><strong>Meta Platforms</strong> - Facebook, Instagram and WhatsApp publishing, only if you connect an account.</li>
          <li><strong>Google (Earth Engine)</strong> - satellite hazard and growth analysis, using your estate's boundary only - no personal data.</li>
          <li><strong>Mapbox</strong> - map display only - no personal data.</li>
        </ul>
        <p>We will tell you before adding a new sub-processor with access to your data, and you may object on reasonable data-protection grounds.</p>

        <h3>If something goes wrong</h3>
        <p>If a personal data breach affects your company's data, LandCheck will notify you without undue delay so you can meet your own obligations to your customers and the Nigeria Data Protection Commission. See LandCheck's internal breach-response plan for how we investigate and contain an incident.</p>

        <h3>When your subscription ends</h3>
        <p>Your data remains available to export while your subscription is active. After it ends, LandCheck keeps your data for a limited period to let you reactivate or export it, then deletes it, except where the law requires LandCheck to keep certain records for longer (for example, payment records for tax purposes).</p>

        <h3>Governing law</h3>
        <p>This agreement is governed by the Nigeria Data Protection Act 2023, the NDPC's General Application and Implementation Directive 2025, and the laws of the Federal Republic of Nigeria.</p>
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
