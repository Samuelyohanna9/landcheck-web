import { Link, useSearchParams } from "react-router-dom";
import "../styles/estate-portal.css";
import "../styles/privacy.css";

/** Where Facebook sends people after a data-deletion request, and the "how do I delete my data"
 * instructions Meta requires for apps that connect Facebook or Instagram accounts. */
export default function DataDeletion() {
  const [params] = useSearchParams();
  const code = params.get("code");
  return (
    <main className="privacy-page" style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px" }}>
      <h1>Delete your LandCheck data</h1>
      {code && (
        <p role="status"><strong>Your request has been received.</strong> Your Facebook and Instagram connection data has been removed from LandCheck Estates. Reference: <code>{code}</code></p>
      )}
      <h2>Remove a Facebook or Instagram connection</h2>
      <ol>
        <li>Sign in to LandCheck Estates and open <strong>Marketing &rarr; Social posts</strong>.</li>
        <li>Choose <strong>Disconnect</strong> next to the Page or Instagram account. Its stored access token is deleted immediately.</li>
        <li>Optionally, remove LandCheck under <strong>Facebook &rarr; Settings &rarr; Business Integrations</strong>. Facebook then asks us to delete the data linked to your account, and we do so automatically.</li>
      </ol>
      <h2>Stop WhatsApp updates</h2>
      <p>Reply <strong>STOP</strong> to any WhatsApp message from an estate company sent through LandCheck. You will not be messaged again.</p>
      <h2>Ask us to delete anything else</h2>
      <p>Email <a href="mailto:admin@landcheck.online?subject=Data%20deletion%20request">admin@landcheck.online</a> from the address or phone number involved and we will confirm once the data has been deleted.</p>
      <p><Link to="/privacy">Read the privacy policy</Link></p>
    </main>
  );
}
