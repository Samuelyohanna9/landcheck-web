import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_URL, api, extractApiErrorMessage } from "../api/client";
import "../styles/estate-public.css";

type VerifyEstate = { name: string; slug: string; organization_name: string | null; logo_url: string | null };

type VerifyResult = {
  plot?: { status: "genuine" | "not_found"; plot_number?: string; commercial_status?: string; title_verified?: boolean };
  agent?: { status: "genuine" | "not_found"; code?: string; agent_name?: string };
  organization_name: string | null;
  organization_email: string | null;
  contact_phone: string | null;
};

export default function PublicEstateVerifyPage() {
  const { slug } = useParams();
  const [estate, setEstate] = useState<VerifyEstate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [plotNumber, setPlotNumber] = useState("");
  const [agentCode, setAgentCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    api.get(`/estates/public/${slug}`).then((response) => setEstate(response.data as VerifyEstate)).catch(async (err) => setLoadError(await extractApiErrorMessage(err, "This Estate page is not available."))).finally(() => setLoading(false));
  }, [slug]);

  const companyName = estate?.organization_name || "Estate company";

  const check = async () => {
    if (!slug) return;
    if (!plotNumber.trim() && !agentCode.trim()) { setError("Enter a plot number or an agent code to check."); return; }
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

  if (loading) return <main className="estate-public-app"><div className="estate-public-loading">Loading...</div></main>;
  if (loadError || !estate) return <main className="estate-public-app"><div className="estate-public-message"><h1>Page unavailable</h1><p>{loadError || "This page is not available."}</p></div></main>;

  const contactLine = result ? [result.contact_phone, result.organization_email].filter(Boolean).join(" or ") : "";

  return (
    <div className="estate-public-app">
      <header className="estate-public-header">
        <a className="estate-public-company" href={`/estates/public/${estate.slug}`} aria-label={`${companyName} home`}>{estate.logo_url ? <img src={`${API_URL}${estate.logo_url}`} alt={`${companyName} logo`} /> : <strong>{companyName}</strong>}</a>
        <Link className="estate-public-back-link" to={`/estates/public/${estate.slug}`}>Back to plots</Link>
      </header>
      <main>
        <section className="estate-public-verify-page">
          <p className="estate-public-kicker">Protect yourself from fraud</p>
          <h1>Check a plot or agent before you pay anyone.</h1>
          <p className="estate-public-verify-page-intro">
            Were you contacted by someone claiming to sell on behalf of {companyName}? Check the plot number or agent code
            they gave you here, on {companyName}&apos;s own real page.
          </p>
          <div className="estate-public-verify-form">
            <label><span>Plot number</span><input value={plotNumber} onChange={(event) => setPlotNumber(event.target.value)} placeholder="e.g. P-014" /></label>
            <label><span>Agent code</span><input value={agentCode} onChange={(event) => setAgentCode(event.target.value)} placeholder="e.g. agent-samo-whatsapp" /></label>
            <button type="button" className="estate-public-primary" disabled={checking} onClick={() => void check()}>{checking ? "Checking..." : "Check"}</button>
          </div>
          {error && <p className="estate-public-verify-error">{error}</p>}
          {result && (
            <div className="estate-public-verify-results">
              {result.plot && (
                result.plot.status === "genuine"
                  ? <p className="estate-public-verify-result is-genuine">&#10003; Plot {result.plot.plot_number} is a genuine listing from {result.organization_name}.{result.plot.title_verified ? " Its title has also been verified by LandCheck." : ""}</p>
                  : <p className="estate-public-verify-result is-not-found">&#10007; We couldn&apos;t verify that plot number - do not send money. Contact {result.organization_name || companyName} directly{contactLine ? ` (${contactLine})` : ""}.</p>
              )}
              {result.agent && (
                result.agent.status === "genuine"
                  ? <p className="estate-public-verify-result is-genuine">&#10003; Agent code {result.agent.code} belongs to {result.agent.agent_name}, an authorized agent for {result.organization_name}.</p>
                  : <p className="estate-public-verify-result is-not-found">&#10007; We couldn&apos;t verify that agent code - do not send money. Contact {result.organization_name || companyName} directly{contactLine ? ` (${contactLine})` : ""}.</p>
              )}
            </div>
          )}
          <Link className="estate-public-text-link" to={`/estates/public/${estate.slug}`}>Return to the {companyName} page</Link>
        </section>
      </main>
      <footer className="estate-public-footer"><strong>{companyName}</strong><span>Private Estate sales and enquiries</span></footer>
    </div>
  );
}
