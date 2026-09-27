import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import "../styles/not-found.css";

const HELPFUL_LINKS = [
  { to: "/estates", label: "Estate management" },
  { to: "/survey", label: "Survey plans" },
  { to: "/flood", label: "Flood & hazard analysis" },
  { to: "/green-partners", label: "Tree & farm monitoring" },
  { to: "/news", label: "Insights" },
  { to: "/career", label: "Careers" },
];

/** Catches every route that doesn't match one of App.tsx's own <Route> paths - a typo, an old
 * bookmark, a link to a page that moved. Without this, React Router renders nothing at all for an
 * unmatched path, which is a blank white screen with no way back. */
export default function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.title = "Page not found | LandCheck";
  }, []);

  return (
    <div className="nf-page">
      <NavBar />
      <main className="nf-main">
        <p className="nf-eyebrow">Error 404</p>
        <h1>This page doesn't exist.</h1>
        <p className="nf-lead">
          There's nothing at <code>{location.pathname}</code>. It may have moved, or the link you followed is out of date.
        </p>
        <div className="nf-actions">
          <button type="button" className="nf-btn nf-btn--primary" onClick={() => navigate(-1)}>Go back</button>
          <Link className="nf-btn" to="/">Go to homepage</Link>
        </div>
        <div className="nf-links">
          <span>Or find what you were looking for:</span>
          <nav aria-label="Suggested pages">
            {HELPFUL_LINKS.map((item) => (
              <Link key={item.to} to={item.to}>{item.label}</Link>
            ))}
          </nav>
        </div>
      </main>
    </div>
  );
}
