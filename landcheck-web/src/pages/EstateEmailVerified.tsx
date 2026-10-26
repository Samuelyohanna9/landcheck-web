import { Link } from "react-router-dom";
import "../styles/estate-portal.css";
import "../styles/estate-auth.css";

export default function EstateEmailVerified() {
  const agentMode = typeof window !== "undefined" && (window.location.pathname.startsWith("/agents") || window.sessionStorage.getItem("landcheck_estate_auth_entry") === "agents");
  return (
    <main className="estate-auth-page">
      <div className="estate-auth-shell">
        <Link to={agentMode ? "/agents" : "/estates"} className="estate-auth-brand" aria-label={agentMode ? "LandCheck Agents home" : "LandCheck Estates home"}>
          <span className="estate-auth-brand-logo"><img src="/logo-icon-192.png" alt="LandCheck" width="40" height="40" /></span>
          <span className="estate-auth-brand-tag">{agentMode ? "Agents" : "Estates"}</span>
        </Link>
        <div className="estate-auth-card estate-verified-card">
          <span className="estate-verified-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
              <path d="M7.5 12.5 10.3 15.3 16.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="estate-kicker">{agentMode ? "Agent registration" : "Company registration"}</p>
          <h1>Email verified successfully</h1>
          <p>{agentMode ? "Your address is confirmed. Log in to publish professional land and property listings from your free agent workspace." : "Your address is confirmed. Log in to choose a plan and start your workspace."}</p>
          <Link to={agentMode ? "/agents/login" : "/estates/login"} className="estate-button">Log in</Link>
        </div>
      </div>
    </main>
  );
}
