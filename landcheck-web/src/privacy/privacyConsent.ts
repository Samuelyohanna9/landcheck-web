import { api } from "../api/client";
import { getGreenAuthSession } from "../auth/greenAuth";
import { getWorkAuthSession } from "../auth/workAuth";

export const PRIVACY_CONSENT_VERSION = "2026-03-23-v1";
export const PRIVACY_POLICY_PATH = "/privacy";
const PRIVACY_STORAGE_PREFIX = "landcheck_privacy_consent";

export type PrivacyScope =
  | "public_site_notice"
  | "feedback_contact_submission"
  | "green_field_data_capture"
  | "work_operational_data_processing";

export type PrivacySourceApp = "public" | "feedback" | "green" | "work";

type ConsentActorContext = {
  actorType: string;
  actorId: number | null;
  actorName: string | null;
  organizationId: number | null;
  organizationName: string | null;
};

type ScopeCopy = {
  title: string;
  summary: string;
  bullets: string[];
  legalBasis: string;
};

const PRIVACY_SCOPE_COPY: Record<PrivacyScope, ScopeCopy> = {
  public_site_notice: {
    title: "Public site notice",
    summary:
      "LandCheck stores essential browser data for navigation, loads map content, and handles contact interactions on the public site.",
    bullets: [
      "Essential browser storage keeps navigation and interface choices working.",
      "Map views may load third-party map content while you browse public pages.",
      "If you contact LandCheck, your message details may be retained for follow-up and service improvement.",
    ],
    legalBasis: "consent",
  },
  feedback_contact_submission: {
    title: "Feedback submission consent",
    summary:
      "Your feedback form may contain professional details, optional contact information, and product comments that LandCheck reviews to improve the platform.",
    bullets: [
      "Optional email addresses are used only for feedback follow-up.",
      "Feedback content may be reviewed internally to improve product quality and support.",
      "Submission history may be retained for audit, product planning, and service accountability.",
    ],
    legalBasis: "consent",
  },
  green_field_data_capture: {
    title: "Green field data consent",
    summary:
      "LandCheck Green records project field data such as GPS location, tree positions, photos, notes, status updates, and review history.",
    bullets: [
      "GPS coordinates and timestamps are captured for planting and maintenance verification.",
      "Photos, notes, species, and tree-condition updates are stored for monitoring, reporting, and audit review.",
      "Uploads may be processed online or queued locally for later sync when connectivity returns.",
    ],
    legalBasis: "consent",
  },
  work_operational_data_processing: {
    title: "Work operational data consent",
    summary:
      "LandCheck Work processes staff, custodian, organization, review, media, and project workflow data to operate the program.",
    bullets: [
      "Staff, custodian, and organization contact details are stored for assignment, supervision, and reporting.",
      "Operational actions, review notes, and supporting photos become part of the project audit trail.",
      "Only authorized personnel should enter, edit, or export this information.",
    ],
    legalBasis: "consent",
  },
};

type AcceptConsentOptions = {
  sourcePath?: string;
  metadata?: Record<string, unknown>;
  consentText?: string;
  legalBasis?: string;
};

export const getPrivacyScopeCopy = (scope: PrivacyScope) => PRIVACY_SCOPE_COPY[scope];

const currentPathname = () => {
  if (typeof window === "undefined") return "";
  return String(window.location.pathname || "").trim();
};

const getConsentActorContext = (sourceApp: PrivacySourceApp): ConsentActorContext => {
  if (sourceApp === "green") {
    const session = getGreenAuthSession();
    const role = String(session?.user?.role || "").trim().toLowerCase();
    return {
      actorType: session?.auth_mode === "env_admin" ? "system_admin" : role.startsWith("custodian_") ? "custodian" : "staff",
      actorId: Number.isFinite(Number(session?.user?.id)) ? Number(session?.user?.id) : null,
      actorName: session?.user?.full_name || null,
      organizationId: Number.isFinite(Number(session?.user?.organization_id)) ? Number(session?.user?.organization_id) : null,
      organizationName: session?.user?.organization_name || null,
    };
  }
  if (sourceApp === "work") {
    const session = getWorkAuthSession();
    return {
      actorType: session?.auth_mode === "env_admin" ? "system_admin" : "staff",
      actorId: Number.isFinite(Number(session?.user?.id)) ? Number(session?.user?.id) : null,
      actorName: session?.user?.full_name || null,
      organizationId: Number.isFinite(Number(session?.user?.organization_id)) ? Number(session?.user?.organization_id) : null,
      organizationName: session?.user?.organization_name || null,
    };
  }
  return {
    actorType: "public_visitor",
    actorId: null,
    actorName: null,
    organizationId: null,
    organizationName: null,
  };
};

const getConsentStorageKey = (scope: PrivacyScope, sourceApp: PrivacySourceApp) => {
  const actor = getConsentActorContext(sourceApp);
  return [
    PRIVACY_STORAGE_PREFIX,
    PRIVACY_CONSENT_VERSION,
    scope,
    sourceApp,
    actor.actorType || "anonymous",
    actor.actorId ?? 0,
    actor.organizationId ?? 0,
  ].join(":");
};

export const hasLocalPrivacyConsent = (scope: PrivacyScope, sourceApp: PrivacySourceApp) => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(getConsentStorageKey(scope, sourceApp)) === "1";
  } catch {
    return false;
  }
};

const setLocalPrivacyConsent = (scope: PrivacyScope, sourceApp: PrivacySourceApp) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getConsentStorageKey(scope, sourceApp), "1");
  } catch {
    // ignore storage failures
  }
};

export const acceptPrivacyConsent = async (
  scope: PrivacyScope,
  sourceApp: PrivacySourceApp,
  options: AcceptConsentOptions = {},
) => {
  const actor = getConsentActorContext(sourceApp);
  const copy = getPrivacyScopeCopy(scope);
  setLocalPrivacyConsent(scope, sourceApp);
  try {
    await api.post("/green/privacy/consents", {
      scope_key: scope,
      consent_version: PRIVACY_CONSENT_VERSION,
      source_app: sourceApp,
      source_path: options.sourcePath || currentPathname(),
      actor_type: actor.actorType,
      actor_id: actor.actorId,
      actor_name: actor.actorName,
      organization_id: actor.organizationId,
      organization_name: actor.organizationName,
      accepted: true,
      legal_basis: options.legalBasis || copy.legalBasis,
      consent_text: options.consentText || copy.summary,
      metadata: options.metadata || {},
    });
    return { accepted: true, synced: true };
  } catch {
    return { accepted: true, synced: false };
  }
};
