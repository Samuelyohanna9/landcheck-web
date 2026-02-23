import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { isGreenAuthed, loginGreen } from "../auth/greenAuth";
import "../styles/green-work-login.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

type LoginOrganization = {
  id: number;
  name: string;
  status?: string | null;
  logo_url?: string | null;
};

export default function GreenLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTo = useMemo(() => {
    const state = (location.state || {}) as { from?: string };
    return state.from || "/green";
  }, [location.state]);

  useEffect(() => {
    if (!isGreenAuthed()) return;
    navigate("/green", { replace: true });
  }, [navigate]);

  useEffect(() => {
    api
      .get("/green/admin/organizations")
      .then((res) => setOrganizations(Array.isArray(res.data) ? res.data : []))
      .catch(() => setOrganizations([]));
  }, []);

  const selectedOrganization = useMemo(
    () => organizations.find((org) => String(org.id) === String(organizationId)) || null,
    [organizations, organizationId],
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const orgIdNum = Number(organizationId || 0);
      await loginGreen({
        username,
        password,
        organization_id: Number.isFinite(orgIdNum) && orgIdNum > 0 ? orgIdNum : null,
      });
      setError("");
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="work-login-page">
      <div className="work-login-card">
        <div className="work-login-brand">
          <div className="work-login-brand-logos">
            <img src={GREEN_LOGO_SRC} alt="LandCheck Green" />
            {selectedOrganization?.logo_url ? (
              <img src={selectedOrganization.logo_url} alt={`${selectedOrganization.name} logo`} className="work-login-partner-logo" />
            ) : null}
          </div>
          <h1>LandCheck Green</h1>
        </div>
        <p className="work-login-subtitle">Field monitoring app login</p>
        <form className="work-login-form" onSubmit={onSubmit}>
          <label htmlFor="green-login-organization">Organization (optional)</label>
          <select
            id="green-login-organization"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            <option value="">System Admin / Any Organization</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} {org.status ? `(${org.status})` : ""}
              </option>
            ))}
          </select>

          <label htmlFor="green-login-username">Username</label>
          <input
            id="green-login-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
          />

          <label htmlFor="green-login-password">Password</label>
          <input
            id="green-login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
          />

          {error && <p className="work-login-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
