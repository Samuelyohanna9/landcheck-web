import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { extractApiErrorMessage } from "../api/client";
import { loginEstate } from "../auth/estateAuth";
import "../styles/estate-portal.css";

export default function EstateLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const from = String((location.state as { from?: string } | null)?.from || "/estates/workspace");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setBusy(true);
    try { await loginEstate(email, password); navigate(from, { replace: true }); }
    catch (err) { setError(await extractApiErrorMessage(err, "Sign-in failed. Check your email and password.")); }
    finally { setBusy(false); }
  };
  return <main className="estate-auth-page"><div className="estate-auth-shell"><Link to="/estates" className="estate-wordmark"><span>LANDCHECK</span><strong>ESTATES</strong></Link><div className="estate-auth-card"><p className="estate-kicker">Company workspace</p><h1>Sign in to Estates</h1><p>Manage your land register, buyers and delivery workflow from one workspace.</p><form onSubmit={submit}><label>Company email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="estate-auth-error" role="alert">{error}</div>}<button className="estate-button" type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button></form><p className="estate-auth-switch">New to LandCheck Estates? <Link to="/estates/register">Register your company</Link></p></div><Link to="/" className="estate-auth-back">Return to LandCheck</Link></div></main>;
}
