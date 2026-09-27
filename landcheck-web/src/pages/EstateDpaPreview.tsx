import { Link, useNavigate } from "react-router-dom";
import DpaDocumentText from "../components/estates/DpaDocumentText";
import "../styles/estate-portal.css";
import "../styles/privacy.css";
import "../styles/estate-legal.css";

/** The Data Processing Agreement, readable without an account - what a company checks and agrees
 * to during registration links here, and it's linked again from every company's own dashboard
 * (Settings -> Legal & compliance) once they have one. See DpaDocumentText.tsx for the shared text. */
export default function EstateDpaPreview() {
  const navigate = useNavigate();

  return (
    <div className="privacy-policy-page estate-portal">
      <header className="privacy-policy-header">
        <div className="privacy-policy-nav">
          <Link to="/estates" className="privacy-policy-brand" aria-label="LandCheck Estates home">
            <img src="/logo.svg" alt="LandCheck" width="120" height="33" />
            <span>LEGAL</span>
          </Link>
          <button type="button" className="privacy-back-btn" onClick={() => navigate(-1)}>Back</button>
        </div>
        <div className="privacy-policy-heading">
          <p className="privacy-policy-eyebrow">LandCheck Estates</p>
          <h1>Data Processing Agreement</h1>
          <p className="privacy-policy-meta">This is what you accept when you tick the box on the registration page.</p>
        </div>
      </header>

      <main className="privacy-policy-card">
        <section className="privacy-policy-section edash-legal-doc">
          <p className="edash-legal-note">This is under final legal review. If a material change is made, every company will be asked to accept it again.</p>
          <DpaDocumentText />
        </section>
      </main>

      <footer className="privacy-policy-footer">
        <Link to="/estates" className="privacy-policy-footer-brand" aria-label="LandCheck Estates home">
          <img src="/logo.svg" alt="LandCheck" width="100" height="28" />
        </Link>
        <Link to="/estates/register">Back to registration</Link>
      </footer>
    </div>
  );
}
