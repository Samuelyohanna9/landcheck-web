import { Link, useNavigate } from "react-router-dom";
import { PRIVACY_CONSENT_VERSION } from "../privacy/privacyConsent";
import "../styles/estate-portal.css";
import "../styles/privacy.css";

const policySections = [
  {
    title: "Products covered by this notice",
    points: [
      "LandCheck Estates helps estate companies manage boundaries, layouts, approved plots, blocks, customers, allocations, payments, commissions, survey outputs, and public estate websites.",
      "LandCheck Survey handles coordinates, scanned plans, georeferencing, AI-assisted digitising, custom or automatic subdivision, geometry review, survey-plan templates, and exports.",
      "LandCheck Green supports tree sponsorship and field operations, including planting, maintenance, evidence capture, monitoring, and environmental reporting.",
      "LandCheck Work supports organization administration, staff and custodian workflows, review queues, project records, reports, exports, and audit history.",
      "LandCheck also provides public websites, map services, feedback and support channels, and hazard or flood-risk analysis where those features are enabled.",
    ],
  },
  {
    title: "Information users and organizations provide",
    points: [
      "Account and company details such as names, email addresses, phone numbers, roles, organization information, workspace details, and login records.",
      "Estate and land information such as estate names, locations, descriptions, boundaries, blocks, plot numbers, areas, addresses, prices, statuses, layout criteria, roads, reserves, and approved geometry.",
      "Survey information such as coordinate points, station names, control points, scanned plans, georeferencing details, digitised features, surveyor details, notes, templates, and generated PDF, CAD, GIS, or coordinate outputs.",
      "Customer and reservation information such as a buyer's name, phone number, email address, message, selected plot, reservation status, allocation details, payment status, and follow-up history.",
      "Subscription, billing, payment, commission, receipt, and installment-plan information entered or managed through an organization workspace. The public Estate reservation page does not take customer payment.",
      "Green and Work information such as tree records, GPS captures, photos, field notes, task assignments, staff or custodian details, reviews, and supporting documents.",
    ],
  },
  {
    title: "Social media accounts and WhatsApp updates (LandCheck Estates)",
    points: [
      "An estate company may connect its own Facebook Page and Instagram Business account so LandCheck Estates can publish marketing posts that the company creates, on the schedule the company chooses. We ask Facebook only for the permissions needed to list the Pages the person chooses to share and to publish posts to them.",
      "We store the connected account's name, its identifier and an access token. The token is encrypted, is never shown in the product, and is used only to publish the company's own posts. We do not read personal profiles, friends, messages or private content.",
      "A company can disconnect an account at any time from its Marketing settings, which deletes the stored token. Anyone can also remove LandCheck from their Facebook settings, or ask us to delete their connection data, using the instructions at /data-deletion.",
      "Buyers can choose to receive WhatsApp updates about an estate by ticking an unticked consent box on the public Estate page. We keep their name, phone number, the wording they agreed to and the time. They receive only pre-approved message templates from the estate company, can reply STOP at any time to stop all messages, and the company can remove them on request.",
    ],
  },
  {
    title: "Public Estate websites and reservations",
    points: [
      "An estate company chooses what to publish. A public Estate website may show its name, logo, introduction, location, contact details, payment-plan information, and approved plot information.",
      "Published plot information can include the plot number, block, boundary, land area, address, availability status, and price when the estate company chooses to show it.",
      "Visitors can browse the live layout and satellite map, select an available plot, and send a short reservation request to the estate company.",
      "Reservation details are sent to the estate company's workspace and may trigger notifications for its staff to contact the prospective customer. The customer's personal details are not displayed publicly as part of the plot map.",
      "The estate company is responsible for the accuracy of published land information, prices, documentation statements, contact details, and reservation terms. Status changes made in the workspace may update the public page.",
    ],
  },
  {
    title: "How LandCheck uses the information",
    points: [
      "To provide accounts, workspaces, maps, plot registers, public Estate websites, reservations, customer follow-up, allocations, payment records, reports, survey plans, and field workflows.",
      "To process uploaded coordinates and scanned plans, assist with georeferencing or digitising, suggest layouts or subdivisions, and produce requested outputs. Automated results must be reviewed by the responsible professional before approval or use.",
      "To send operational messages such as reservation alerts, welcome or follow-up emails, account messages, service notices, and support responses where enabled.",
      "To protect accounts, enforce permissions, maintain audit trails, investigate errors or abuse, provide support, and improve reliability and product performance.",
      "To manage subscriptions and organization access, including plan status, usage, billing records, and platform administration.",
    ],
  },
  {
    title: "Location, device, and field data",
    points: [
      "Location permission is used by LandCheck Green and related field workflows to capture coordinates when a user is actively recording planting, maintenance, or project activity.",
      "Camera and photo-library access are used when users attach evidence photos to Green, Work, survey, or other supported records.",
      "Notifications may be used for operational prompts, reservation alerts, review tasks, or field follow-up where the user or organization enables them.",
      "The mobile app may temporarily cache records, photos, and queued sync actions locally so field work can continue offline and sync when connectivity returns.",
      "Map views may send approximate or project location information to map and tile providers needed to display the selected map layer.",
    ],
  },
  {
    title: "Cookies and browser storage",
    points: [
      "Essential storage keeps secure navigation, login state, consent choices, and core page behavior working.",
      "Experience media storage may enable richer presentation features such as background media or optional visual enhancements.",
      "Measurement and reliability storage may help LandCheck understand page usage and service reliability when enabled. It is not used for advertising.",
      "You can accept all categories, keep essential storage only, or customize optional categories through the cookie controls. Changing optional preferences does not disable essential site functions.",
    ],
  },
  {
    title: "Storage, hosting, and sharing",
    points: [
      "LandCheck processes records through its application services and supporting infrastructure used for hosting, storage, authentication, map delivery, email, notifications, and report generation.",
      "Uploaded plans, images, evidence photos, documents, generated reports, and other assets may be stored in managed storage used to provide the requested workflow.",
      "LandCheck does not sell personal data. Information is shared only as needed to provide the requested service, operate infrastructure, support an organization, display information that an estate company has chosen to publish, or comply with law.",
      "For organization-managed workspaces, the estate company, project organization, or authorized administrator controls access to the records created within its workspace. Authorized staff, reviewers, surveyors, estate administrators, and service providers may access information needed for their assigned work.",
      "For customer reservations, the estate company is normally the organization receiving and following up the enquiry. LandCheck provides the system that collects and routes the request.",
    ],
  },
  {
    title: "Responsibilities and legal position",
    points: [
      "LandCheck acts as a platform provider for organization-managed records. The organization using the platform remains responsible for deciding why it collects personal data, publishing appropriate notices, setting access permissions, and responding to its customers or field participants.",
      "Organizations and users must have authority to upload land records, coordinates, photos, customer information, or other personal data, and should collect only what is necessary for the relevant workflow.",
      "LandCheck supports consent and other lawful processing controls, including records of consent version, scope, source application, actor, organization, and time. Organizations remain responsible for obtaining any additional permissions required for their work.",
      "AI-assisted extraction, layout suggestions, maps, and other automated tools are decision-support features. They do not replace a licensed surveyor, town planner, legal review, statutory approval, or independent verification.",
    ],
  },
  {
    title: "Retention, access, and requests",
    points: [
      "Operational records, reservation history, payment records, review history, exports, and audit events may be retained as long as needed for administration, customer follow-up, reporting, service security, or accountability.",
      "Organizations should review workspace access regularly and deactivate users who no longer need access.",
      "You may request access, correction, export, or deletion support for personal data controlled through LandCheck. Some requests may need to be coordinated with the organization that collected or manages the data.",
      "LandCheck may retain limited information where necessary to meet legal, security, fraud-prevention, dispute-resolution, or audit obligations.",
    ],
  },
];

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="privacy-policy-page estate-portal">
      <header className="privacy-policy-header">
        <div className="privacy-policy-nav">
          <Link to="/estates" className="privacy-policy-brand" aria-label="LandCheck Estates home">
            <img src="/logo.svg" alt="LandCheck" width="120" height="33" />
            <span>PRIVACY</span>
          </Link>
          <button type="button" className="privacy-back-btn" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
        <div className="privacy-policy-heading">
          <p className="privacy-policy-eyebrow">LandCheck privacy policy</p>
          <h1>Privacy and data, clearly handled.</h1>
          <p className="privacy-policy-meta">Last updated: September 17, 2026 · Consent version: {PRIVACY_CONSENT_VERSION}</p>
        </div>
      </header>

      <main className="privacy-policy-card">
        <section>
          <p>
            This notice explains how LandCheck handles information across its public websites and connected products. It
            is written for estate companies, surveyors, organizations, customers, field teams, and visitors using the
            platform in Nigeria and similar jurisdictions.
          </p>
          <p>
            It applies to LandCheck Estates, public Estate websites and reservation pages, LandCheck Survey, LandCheck
            Green mobile and web experiences, LandCheck Work administration workflows, hazard or flood-risk tools, and
            related support and feedback pages.
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
          <p>Email: admin@landcheck.online</p>
          <p>For privacy, access, correction, or deletion requests, contact the address above and reference your organization, estate, project, or reservation.</p>
        </section>
      </main>

      <footer className="privacy-policy-footer">
        <Link to="/estates" className="privacy-policy-footer-brand" aria-label="LandCheck Estates home">
          <img src="/logo.svg" alt="LandCheck" width="100" height="34" loading="lazy" />
          <span>ESTATES</span>
        </Link>
        <span>LandCheck Geospatial Technologies Limited</span>
        <a href="mailto:admin@landcheck.online">admin@landcheck.online</a>
      </footer>
    </div>
  );
}
