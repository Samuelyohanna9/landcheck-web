/** The Data Processing Agreement's text - shown both on the public preview a prospective company
 * reads before registering, and on the dashboard's Legal & compliance page. Keep this the single
 * source of the in-app copy, and keep `landcheck-api/docs/legal/DATA_PROCESSING_AGREEMENT.md` and
 * `app/services/estates/dpa.DPA_VERSION` in step with it - see that folder's README. */
export default function DpaDocumentText() {
  return (
    <>
      <h2>Data Processing Agreement</h2>
      <p>Between <strong>LandCheck</strong> ("we", "LandCheck", the Processor) and your company ("you", the Controller), covering the personal data your company submits to, or collects through, LandCheck Estates.</p>

      <h3>What this covers</h3>
      <p>Your company decides what customer, sales-agent and marketing data it collects and why - you are the Controller. LandCheck processes that data only to run the features you use, and only on your instructions (including the instructions built into the Platform's ordinary functionality, such as generating a marketing flyer from your own plot and price data) - we are your Processor. For your own company's staff accounts and billing details, LandCheck decides why that data is kept, so LandCheck is an independent Controller for that data alone.</p>

      <h3>What LandCheck stores and why</h3>
      <ul>
        <li><strong>Customers &amp; reservations</strong> - name, phone, email, address and any notes your staff add, to manage your sales pipeline.</li>
        <li><strong>Sales agents</strong> - name and contact details, to track and pay commission.</li>
        <li><strong>Billing</strong> - your billing contact and a tokenised card reference; LandCheck never sees or stores a full card number.</li>
        <li><strong>Public Estate page &amp; reservation requests</strong> - the name, phone and/or email a visitor submits with a reservation request.</li>
        <li><strong>Facebook &amp; Instagram posting</strong> - your connected account's access token (stored encrypted) and the posts you approve, if you turn this on.</li>
        <li><strong>WhatsApp updates</strong> - the name and phone number of a buyer who explicitly opts in, and their consent record, if you turn this on. They can reply STOP at any time.</li>
        <li><strong>Survey &amp; documents</strong> - uploaded survey plans, title documents and layout drawings, and any names appearing on them.</li>
        <li><strong>Your staff accounts</strong> - name, email, a securely hashed password (never stored in plain text), and an audit trail of actions taken.</li>
      </ul>

      <h3>Security</h3>
      <p>All traffic to the Platform is encrypted (HTTPS/TLS). Passwords are hashed, never stored in plain text. Third-party connection tokens (Facebook, Instagram, WhatsApp) are encrypted at rest. Your account is isolated from every other company's data, and access within your account follows the staff role you assign. Material actions on your estate are recorded in an audit trail visible to your own staff with permission to see it.</p>

      <h3>Sub-processors</h3>
      <p>To provide the Platform, LandCheck uses these providers, each bound to protect data at least as strongly as this agreement requires:</p>
      <ul>
        <li><strong>Cloudflare</strong> - stores uploaded documents and generated images.</li>
        <li><strong>Flutterwave</strong> - processes your subscription payment; never sees or stores your customers' data.</li>
        <li><strong>Meta Platforms</strong> - Facebook, Instagram and WhatsApp publishing, only if you connect an account.</li>
        <li><strong>Google (Earth Engine)</strong> - satellite hazard and growth analysis, using your estate's boundary only - no personal data.</li>
        <li><strong>Mapbox</strong> - map display only - no personal data.</li>
      </ul>
      <p>We will tell you before adding a new sub-processor with access to your data, and you may object on reasonable data-protection grounds.</p>

      <h3>If something goes wrong</h3>
      <p>If a personal data breach affects your company's data, LandCheck will notify you without undue delay so you can meet your own obligations to your customers and the Nigeria Data Protection Commission. See LandCheck's internal breach-response plan for how we investigate and contain an incident.</p>

      <h3>When your subscription ends</h3>
      <p>Your data remains available to export while your subscription is active. After it ends, LandCheck keeps your data for a limited period to let you reactivate or export it, then deletes it, except where the law requires LandCheck to keep certain records for longer (for example, payment records for tax purposes).</p>

      <h3>Governing law</h3>
      <p>This agreement is governed by the Nigeria Data Protection Act 2023, the NDPC's General Application and Implementation Directive 2025, and the laws of the Federal Republic of Nigeria.</p>
    </>
  );
}
