import { useNavigate } from "react-router-dom";
import { PRIVACY_CONSENT_VERSION } from "../privacy/privacyConsent";
import "../styles/privacy.css";

const policySections = [
  {
    title: "What LandCheck Processes",
    points: [
      "Public-site interactions, essential browser storage, and map requests needed to operate the website.",
      "Survey-plan and operational records entered by users, including project names, coordinates, notes, and generated outputs.",
      "LandCheck Green field records such as tree locations, maintenance notes, timestamps, GPS captures, and photos.",
      "LandCheck Work records such as staff profiles, custodian details, organization data, task reviews, allocations, exports, and audit history.",
    ],
  },
  {
    title: "Mobile App Permissions and Device Data",
    points: [
      "Location permission is used to capture tree, maintenance, and project coordinates while the user is actively recording field work.",
      "Camera and photo-library access are used only so users can attach evidence photos to tree and maintenance records.",
      "Notifications may be used for operational prompts or field follow-up messages where enabled on the device.",
      "The mobile app may temporarily cache records, photos, and queued sync actions locally on the device so field work can continue offline and sync when connectivity returns.",
    ],
  },
  {
    title: "Why the Data Is Processed",
    points: [
      "To operate LandCheck Green and LandCheck Work for project monitoring, assignment, reporting, and evidence review.",
      "To generate survey-plan, monitoring, donor, custodian, and carbon-report outputs requested by users.",
      "To support product security, audit trails, troubleshooting, and platform improvement.",
    ],
  },
  {
    title: "Sensitive Operational Data",
    points: [
      "GPS coordinates and timestamps are used to verify where planting or maintenance activity happened.",
      "Photos and notes are used as evidence for project review, supervision, and reporting.",
      "Contact details for staff, custodians, and organizations are used only for program operations, coordination, and account management.",
    ],
  },
  {
    title: "Storage, Hosting, and Sharing",
    points: [
      "Operational records are processed through LandCheck application services and supporting cloud infrastructure used for hosting, storage, map delivery, and report generation.",
      "Evidence photos, generated reports, and uploaded assets may be stored in managed object storage used by LandCheck for platform operations.",
      "LandCheck does not sell user data. Data is shared only where necessary to operate the platform for the organization using it, to provide infrastructure services, or to comply with law.",
      "Organization administrators and authorized reviewers may access records created by users working in their organization or project scope.",
    ],
  },
  {
    title: "Legal and Compliance Position",
    points: [
      "LandCheck is implementing privacy controls aligned with consent-based processing expectations under GDPR-style principles and the Nigeria Data Protection Act (NDPA).",
      "Users are required to confirm they are authorized before capturing GPS, photos, or personal/contact data in the product.",
      "Only data necessary for the relevant workflow should be entered into the platform.",
    ],
  },
  {
    title: "Retention and Access",
    points: [
      "Operational records, review history, and exports may be retained as long as needed for project administration, reporting, or audit accountability.",
      "Organizations should review user access regularly and deactivate users who no longer require access.",
      "If you need correction, access, export, or deletion support for data controlled through LandCheck, contact LandCheck using the details below.",
      "Where an account is provisioned by an organization administrator, account closure or deletion requests may also need to be coordinated through that organization.",
    ],
  },
];

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="privacy-policy-page">
      <header className="privacy-policy-header">
        <button type="button" className="privacy-back-btn" onClick={() => navigate(-1)}>
          Back
        </button>
        <div>
          <p className="privacy-policy-eyebrow">LandCheck Privacy Policy</p>
          <h1>Privacy and Data Processing Notice</h1>
          <p className="privacy-policy-meta">Consent version: {PRIVACY_CONSENT_VERSION}</p>
        </div>
      </header>

      <main className="privacy-policy-card">
        <section>
          <p>
            This notice explains how LandCheck handles public-site, survey, Green, and Work data. It is written for
            users, partner organizations, and field teams using the platform in Nigeria and similar jurisdictions.
          </p>
          <p>
            It applies to the LandCheck website, LandCheck Green mobile and PWA experiences, and LandCheck Work
            administration workflows.
          </p>
        </section>

        {policySections.map((section) => (
          <section key={section.title} className="privacy-policy-section">
            <h2>{section.title}</h2>
            <ul>
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="privacy-policy-section">
          <h2>Contact</h2>
          <p>LandCheck Geospatial Technologies Limited</p>
          <p>Email: landchecktech@gmail.com</p>
          <p>For privacy, access, correction, or deletion requests, contact the address above and reference your organization and project.</p>
        </section>
      </main>
    </div>
  );
}
