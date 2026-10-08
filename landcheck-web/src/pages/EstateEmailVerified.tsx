import { Link } from "react-router-dom";
import "../styles/estate-portal.css";
import "../styles/estate-auth.css";

export default function EstateEmailVerified() {
  return (
    <main className="estate-auth-page">
      <div className="estate-auth-shell">
        <Link to="/estates" className="estate-auth-brand" aria-label="LandCheck Estates home">
          <span className="estate-auth-brand-logo"><img src="/logo-icon-192.png" alt="LandCheck" width="40" height="40" /></span>
          <span className="estate-auth-brand-tag">Estates</span>
        </Link>
        <div className="estate-auth-card estate-verified-card">
          <span className="estate-verified-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
              <path d="M7.5 12.5 10.3 15.3 16.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="estate-kicker">Company registration</p>
          <h1>Email verified successfully</h1>
          <p>Your address is confirmed. Log in to choose a plan and start your workspace.</p>
          <Link to="/estates/login" className="estate-button">Log in</Link>
        </div>
      </div>
    </main>
  );
}
