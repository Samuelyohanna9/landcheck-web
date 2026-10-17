import { useState } from "react";
import { api, extractApiErrorMessage } from "../../../api/client";

type VerifyResult = {
  plot?: { status: "genuine" | "not_found"; plot_number?: string; commercial_status?: string; title_verified?: boolean };
  agent?: { status: "genuine" | "not_found"; code?: string; agent_name?: string };
  organization_name: string | null;
  organization_email: string | null;
  contact_phone: string | null;
};

export default function PublicVerifySection({ slug, organizationName }: { slug: string; organizationName: string }) {
  const [plotNumber, setPlotNumber] = useState("");
  const [agentCode, setAgentCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");

  const check = async () => {
    if (!plotNumber.trim() && !agentCode.trim()) {
      setError("Enter a plot number or an agent code to check.");
      return;
    }
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const response = await api.get(`/estates/public/${slug}/verify`, {
        params: { plot_number: plotNumber.trim() || undefined, agent_code: agentCode.trim() || undefined },
      });
      setResult(response.data);
    } catch (err) {
      setError(await extractApiErrorMessage(err, "Could not run this check right now."));
    } finally {
      setChecking(false);
    }
  };

  const contactLine = result ? [result.contact_phone, result.organization_email].filter(Boolean).join(" or ") : "";

  return (
    <section id="verify" className="estate-public-verify" aria-labelledby="estate-public-verify-title">
      <div className="estate-public-verify-inner">
        <div className="estate-public-verify-head">
          <p className="estate-public-kicker">Protect yourself from fraud</p>
          <h2 id="estate-public-verify-title">Check a plot or agent before you pay anyone.</h2>
          <p>Were you contacted by someone claiming to sell on behalf of {organizationName || "this developer"}? Check the plot number or agent code they gave you here, on {organizationName || "the developer"}&apos;s own real page.</p>
        </div>
        <div className="estate-public-verify-form">
          <label><span>Plot number</span><input value={plotNumber} onChange={(event) => setPlotNumber(event.target.value)} placeholder="e.g. P-014" /></label>
          <label><span>Agent code</span><input value={agentCode} onChange={(event) => setAgentCode(event.target.value)} placeholder="e.g. AGT-203" /></label>
          <button type="button" className="estate-public-primary" disabled={checking} onClick={() => void check()}>{checking ? "Checking..." : "Check"}</button>
        </div>
        {error && <p className="estate-public-verify-error">{error}</p>}
        {result && (
          <div className="estate-public-verify-results">
            {result.plot && (
              result.plot.status === "genuine"
                ? <p className="estate-public-verify-result is-genuine">&#10003; Plot {result.plot.plot_number} is a genuine listing from {result.organization_name}.{result.plot.title_verified ? " Its title has also been verified by LandCheck." : ""}</p>
                : <p className="estate-public-verify-result is-not-found">&#10007; We couldn&apos;t verify that plot number - do not send money. Contact {result.organization_name || "the developer"} directly{contactLine ? ` (${contactLine})` : ""}.</p>
            )}
            {result.agent && (
              result.agent.status === "genuine"
                ? <p className="estate-public-verify-result is-genuine">&#10003; Agent code {result.agent.code} belongs to {result.agent.agent_name}, an authorized agent for {result.organization_name}.</p>
                : <p className="estate-public-verify-result is-not-found">&#10007; We couldn&apos;t verify that agent code - do not send money. Contact {result.organization_name || "the developer"} directly{contactLine ? ` (${contactLine})` : ""}.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
