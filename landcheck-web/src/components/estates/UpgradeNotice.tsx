import { Link } from "react-router-dom";

/** A calm "this needs a higher plan" card that links to billing. Used wherever a plan limit is hit. */
export default function UpgradeNotice({ title, message, cta = "See plans" }: { title: string; message: string; cta?: string }) {
  return (
    <div className="edash-upgrade-notice" role="note">
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <Link className="edash-btn-primary" style={{ display: "inline-flex" }} to="/estates/billing">{cta}</Link>
    </div>
  );
}
