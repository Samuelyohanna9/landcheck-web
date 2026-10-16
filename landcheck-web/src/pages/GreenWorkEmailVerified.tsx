import { useNavigate } from "react-router-dom";
import { WorkLoginBackdropArt } from "./GreenWorkLogin";
import "../styles/green-work-login.css";
import "../styles/green-work-login-dashboard.css";

const GREEN_LOGO_SRC = "/logo-icon-192.png";

export default function GreenWorkEmailVerified() {
  const navigate = useNavigate();

  return (
    <div className="work-login-page">
      <div className="work-login-backdrop" aria-hidden="true">
        <WorkLoginBackdropArt />
        <div className="work-login-backdrop-scrim" />
      </div>

      <div className="work-login-shell">
        <div className="work-login-brand">
          <img src={GREEN_LOGO_SRC} alt="" width="34" height="34" />
          <span>
            <strong>LandCheck</strong>
            <small>Work</small>
          </span>
        </div>

        <section className="work-login-card">
          <span className="work-login-card-kicker">Email verified</span>
          <h1>Your email is verified</h1>
          <p className="work-login-card-sub">You can now sign in to your organisation's workspace.</p>
          <button type="button" className="work-login-submit" onClick={() => navigate("/green-work/login", { replace: true })}>
            Log in
          </button>
        </section>

        <p className="work-login-footer">LandCheck Work by LandCheck Green</p>
      </div>
    </div>
  );
}
