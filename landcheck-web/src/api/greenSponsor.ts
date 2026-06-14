import { api, BACKEND_URL } from "./client";
import type { GreenAuthSession } from "../auth/greenAuth";

export const SPONSOR_TERMS_VERSION = "2026-06-06-v1";

export type SponsorProject = {
  id: number;
  name: string;
  location_text?: string | null;
  sponsor?: string | null;
  organization_name?: string | null;
  organization_logo_url?: string | null;
  public_sponsor_enabled?: boolean | null;
  public_sponsor_title?: string | null;
  public_sponsor_description?: string | null;
  public_description?: string | null;
  sponsor_price_per_tree?: number | null;
  sponsor_currency?: string | null;
  sponsor_capacity?: number | null;
  sponsor_max_per_order?: number | null;
  sponsor_dedication_enabled?: boolean | null;
  sponsor_checkout_ready?: boolean | null;
  sponsor_launch_note?: string | null;
  flutterwave_available?: boolean | null;
  manual_payment_available?: boolean | null;
  slots_reserved?: number | null;
  slots_awaiting_payment?: number | null;
  slots_awaiting_tree?: number | null;
  slots_linked?: number | null;
  slots_available?: number | null;
};

export type SponsorOrder = {
  id: number;
  order_uid?: string | null;
  project_id: number;
  project_name?: string | null;
  location_text?: string | null;
  quantity: number;
  amount_per_tree: number;
  amount_total: number;
  currency?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_status?: string | null;
  order_status?: string | null;
  payment_provider?: string | null;
  payment_link?: string | null;
  payment_gateway_reference?: string | null;
  payment_gateway_transaction_id?: number | null;
  payment_gateway_status?: string | null;
  payment_verified_at?: string | null;
  payment_proof_url?: string | null;
  payment_proof_urls?: string[];
  dedication_type?: string | null;
  dedication_name?: string | null;
  dedication_message?: string | null;
  purchaser_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  linked_units?: number;
  awaiting_tree_units?: number;
  awaiting_payment_units?: number;
  total_units?: number;
};

export type SponsorCarbonSummary = {
  current_co2_kg: number;
  annual_co2_kg: number;
  lifetime_co2_kg: number;
};

export type SponsorTreeTimelineItem = {
  id: number;
  task_type?: string | null;
  status?: string | null;
  review_state?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  photo_urls?: string[];
  completed_at?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  reported_tree_status?: string | null;
  activity_lng?: number | null;
  activity_lat?: number | null;
  activity_recorded_at?: string | null;
};

export type SponsorTreeSummary = {
  unit_id: number;
  unit_uid?: string | null;
  sponsorship_status?: string | null;
  linked_at?: string | null;
  dedication_type?: string | null;
  dedication_name?: string | null;
  dedication_message?: string | null;
  order_id?: number | null;
  order_uid?: string | null;
  payment_status?: string | null;
  order_status?: string | null;
  order_created_at?: string | null;
  project_id: number;
  project_name?: string | null;
  location_text?: string | null;
  tree_id?: number | null;
  project_tree_no?: number | null;
  species?: string | null;
  tree_status?: string | null;
  planting_date?: string | null;
  photo_url?: string | null;
  photo_urls?: string[];
  tree_height_m?: number | null;
  tree_age_months?: number | null;
  inventory_tree_count?: number | null;
  count_in_carbon_scope?: boolean | null;
  tree_created_at?: string | null;
  lng?: number | null;
  lat?: number | null;
  carbon?: SponsorCarbonSummary | null;
};

export type SponsorTreeDetail = SponsorTreeSummary & {
  tree_notes?: string | null;
  created_by?: string | null;
  timeline: SponsorTreeTimelineItem[];
};

export type SponsorAchievements = {
  total_trees: number;
  level: string;
  badge_code: string;
  badge_emoji: string;
  next_level: string | null;
  next_level_threshold: number | null;
  progress_percentage: number;
};

export type SponsorLeaderboardEntry = {
  sponsor_id: number;
  display_name: string;
  entity_category: string;
  monthly_trees: number;
  all_time_trees: number;
  achievement_level: string;
  rank: number;
};

export type SponsorLeaderboardData = {
  top_overall: SponsorLeaderboardEntry[];
  top_schools: SponsorLeaderboardEntry[];
  top_communities: SponsorLeaderboardEntry[];
  top_companies: SponsorLeaderboardEntry[];
};

export type SponsorPointsInfo = {
  id: number;
  green_points: number;
  lifetime_points: number;
  referral_code: string;
  referred_by_id: number | null;
  point_booster_multiplier: number;
  point_booster_remaining_uses: number;
  profile_photo_url: string | null;
  unlocked_species: string[];
  unlocked_avatars: string[];
  unlocked_map_icons: string[];
  current_avatar_border: string | null;
  current_map_icon: string | null;
  referral_rules_met: boolean;
  personal_sponsor_met: boolean;
  conversion_rate_met: boolean;
  personal_trees_sponsored: number;
  total_referred_users: number;
  converted_referred_users: number;
};

export type SponsorProfileSettingsPayload = {
  entity_category?: string;
  leaderboard_visibility?: string;
  current_avatar_border?: string | null;
};

type SponsorOrderPaymentInitResult = {
  ok: boolean;
  order_id: number;
  order_uid: string;
  payment_method?: string | null;
  payment_status?: string | null;
  payment_link?: string | null;
};

const normalizePhotoUrl = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return raw;
};

const normalizePhotoUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  value.forEach((item) => {
    const next = normalizePhotoUrl(item);
    if (!next || seen.has(next)) return;
    seen.add(next);
    output.push(next);
  });
  return output;
};

const normalizeProject = (project: any): SponsorProject => ({
  ...(project || {}),
  id: Number(project?.id || 0),
  name: String(project?.name || ""),
  public_sponsor_enabled: Boolean(project?.public_sponsor_enabled),
  sponsor_checkout_ready:
    project?.sponsor_checkout_ready === null || project?.sponsor_checkout_ready === undefined
      ? null
      : Boolean(project.sponsor_checkout_ready),
  sponsor_launch_note: project?.sponsor_launch_note ? String(project.sponsor_launch_note) : null,
  flutterwave_available:
    project?.flutterwave_available === null || project?.flutterwave_available === undefined
      ? null
      : Boolean(project.flutterwave_available),
  manual_payment_available:
    project?.manual_payment_available === null || project?.manual_payment_available === undefined
      ? null
      : Boolean(project.manual_payment_available),
  sponsor_price_per_tree:
    project?.sponsor_price_per_tree === null || project?.sponsor_price_per_tree === undefined
      ? null
      : Number(project.sponsor_price_per_tree || 0),
  sponsor_capacity:
    project?.sponsor_capacity === null || project?.sponsor_capacity === undefined
      ? null
      : Number(project.sponsor_capacity || 0),
  sponsor_max_per_order:
    project?.sponsor_max_per_order === null || project?.sponsor_max_per_order === undefined
      ? null
      : Number(project.sponsor_max_per_order || 0),
  slots_reserved:
    project?.slots_reserved === null || project?.slots_reserved === undefined ? null : Number(project.slots_reserved || 0),
  slots_awaiting_payment:
    project?.slots_awaiting_payment === null || project?.slots_awaiting_payment === undefined
      ? null
      : Number(project.slots_awaiting_payment || 0),
  slots_awaiting_tree:
    project?.slots_awaiting_tree === null || project?.slots_awaiting_tree === undefined
      ? null
      : Number(project.slots_awaiting_tree || 0),
  slots_linked:
    project?.slots_linked === null || project?.slots_linked === undefined ? null : Number(project.slots_linked || 0),
  slots_available:
    project?.slots_available === null || project?.slots_available === undefined ? null : Number(project.slots_available || 0),
});

const normalizeOrder = (row: any): SponsorOrder => ({
  ...(row || {}),
  id: Number(row?.id || 0),
  project_id: Number(row?.project_id || 0),
  quantity: Number(row?.quantity || 0),
  amount_per_tree: Number(row?.amount_per_tree || 0),
  amount_total: Number(row?.amount_total || 0),
  payment_gateway_transaction_id:
    row?.payment_gateway_transaction_id === null || row?.payment_gateway_transaction_id === undefined
      ? null
      : Number(row.payment_gateway_transaction_id || 0),
  linked_units: Number(row?.linked_units || 0),
  awaiting_tree_units: Number(row?.awaiting_tree_units || 0),
  awaiting_payment_units: Number(row?.awaiting_payment_units || 0),
  total_units: Number(row?.total_units || 0),
  payment_proof_urls: normalizePhotoUrls(row?.payment_proof_urls),
});

const normalizeTree = (row: any): SponsorTreeSummary => ({
  ...(row || {}),
  project_id: Number(row?.project_id || 0),
  unit_id: Number(row?.unit_id || 0),
  tree_id: row?.tree_id === null || row?.tree_id === undefined ? null : Number(row.tree_id || 0),
  project_tree_no: row?.project_tree_no === null || row?.project_tree_no === undefined ? null : Number(row.project_tree_no || 0),
  lng: row?.lng === null || row?.lng === undefined ? null : Number(row.lng),
  lat: row?.lat === null || row?.lat === undefined ? null : Number(row.lat),
  photo_url: normalizePhotoUrl(row?.photo_url),
  tree_height_m: row?.tree_height_m === null || row?.tree_height_m === undefined ? null : Number(row.tree_height_m),
  tree_age_months: row?.tree_age_months === null || row?.tree_age_months === undefined ? null : Number(row.tree_age_months),
  inventory_tree_count:
    row?.inventory_tree_count === null || row?.inventory_tree_count === undefined ? null : Number(row.inventory_tree_count),
  photo_urls: normalizePhotoUrls(row?.photo_urls),
  carbon: row?.carbon
    ? {
        current_co2_kg: Number(row.carbon.current_co2_kg || 0),
        annual_co2_kg: Number(row.carbon.annual_co2_kg || 0),
        lifetime_co2_kg: Number(row.carbon.lifetime_co2_kg || 0),
      }
    : null,
});

export const fetchPublicSponsorshipProjects = async () => {
  const response = await api.get("/green/public-projects");
  return (Array.isArray(response.data) ? response.data : []).map(normalizeProject);
};

export const fetchPublicPartnerOrganizations = async (): Promise<
  Array<{ id: number; name: string; logo_url: string | null }>
> => {
  const response = await api.get("/green/public/partner-organizations");
  const items: Array<{ id: number; name: string; logo_url: string | null }> = Array.isArray(response.data)
    ? response.data
    : [];
  return items.map((item) => ({
    ...item,
    logo_url: item.logo_url
      ? item.logo_url.startsWith("/")
        ? `${BACKEND_URL}${item.logo_url}`
        : item.logo_url
      : null,
  }));
};

export const fetchSponsorOrders = async (session: GreenAuthSession) => {
  const response = await api.get("/green/sponsor/orders", {
    params: { sponsor_id: session.user.id },
  });
  return (Array.isArray(response.data) ? response.data : []).map(normalizeOrder);
};

export const fetchSponsorTrees = async (session: GreenAuthSession) => {
  const response = await api.get("/green/sponsor/trees", {
    params: { sponsor_id: session.user.id },
  });
  return (Array.isArray(response.data) ? response.data : []).map(normalizeTree);
};

export const fetchSponsorTreeDetail = async (session: GreenAuthSession, unitId: number): Promise<SponsorTreeDetail> => {
  const response = await api.get(`/green/sponsor/trees/${unitId}`, {
    params: { sponsor_id: session.user.id },
  });
  const payload = response.data || {};
  return {
    ...normalizeTree(payload),
    tree_notes: payload?.tree_notes || null,
    created_by: payload?.created_by || null,
    timeline: Array.isArray(payload?.timeline)
      ? payload.timeline.map((item: any) => ({
          ...(item || {}),
          id: Number(item?.id || 0),
          photo_url: normalizePhotoUrl(item?.photo_url),
          photo_urls: normalizePhotoUrls(item?.photo_urls),
          activity_lat: item?.activity_lat === null || item?.activity_lat === undefined ? null : Number(item.activity_lat),
          activity_lng: item?.activity_lng === null || item?.activity_lng === undefined ? null : Number(item.activity_lng),
        }))
      : [],
  };
};

export const createSponsorOrder = async (
  session: GreenAuthSession,
  payload: {
    project_id: number;
    quantity: number;
    dedication_type?: string | null;
    dedication_name?: string | null;
    dedication_message?: string | null;
    purchaser_note?: string | null;
    payment_method?: string | null;
    payment_reference?: string | null;
    payment_proof_url?: string | null;
    accepted_terms?: boolean;
    accepted_policy?: boolean;
    consent_version?: string | null;
  },
): Promise<SponsorOrderPaymentInitResult> => {
  const response = await api.post("/green/sponsor/orders", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return {
    ok: Boolean(response.data?.ok),
    order_id: Number(response.data?.order_id || 0),
    order_uid: String(response.data?.order_uid || ""),
    payment_method: response.data?.payment_method ? String(response.data.payment_method) : null,
    payment_status: response.data?.payment_status ? String(response.data.payment_status) : null,
    payment_link: response.data?.payment_link ? String(response.data.payment_link) : null,
  };
};

export const fetchSponsorOrderPaymentStatus = async (session: GreenAuthSession, orderUid: string, refresh = false) => {
  const response = await api.get(`/green/sponsor/orders/${encodeURIComponent(orderUid)}/payment-status`, {
    params: {
      sponsor_id: session.user.id,
      refresh,
    },
  });
  return normalizeOrder(response.data || {});
};

export const fetchSponsorAchievements = async (session: GreenAuthSession): Promise<SponsorAchievements> => {
  const response = await api.get("/green/sponsor/profile/achievements", {
    params: { sponsor_id: session.user.id },
  });
  return response.data;
};

export const fetchSponsorPoints = async (session: GreenAuthSession): Promise<SponsorPointsInfo> => {
  const response = await api.get("/green/sponsor/points", {
    params: { sponsor_id: session.user.id },
  });
  return response.data;
};

export const fetchPublicLeaderboard = async (): Promise<SponsorLeaderboardData> => {
  const response = await api.get("/green/sponsor/public/leaderboard");
  return response.data;
};

export const updateSponsorProfileSettings = async (session: GreenAuthSession, payload: SponsorProfileSettingsPayload) => {
  const response = await api.patch("/green/sponsor/profile/settings", payload, {
    params: { sponsor_id: session.user.id },
  });
  return response.data;
};

export const uploadSponsorProfilePhoto = async (
  session: GreenAuthSession,
  file: File,
): Promise<{ profile_photo_url: string }> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sponsor_id", String(session.user.id));
  const response = await api.post("/green/sponsor/profile/photo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const buildSponsorCertificateUrl = (session: GreenAuthSession, unitId: number) =>
  `${BACKEND_URL}/green/sponsor/trees/${unitId}/certificate/pdf?sponsor_id=${session.user.id}`;

export const buildSponsorPublicTreeStoryUrl = (unitUid?: string | null) => {
  const normalized = encodeURIComponent(String(unitUid || "").trim());
  return normalized ? `${BACKEND_URL}/green/sponsor/public/trees/${normalized}` : "";
};

export const buildSponsorPublicCertificateUrl = (unitUid?: string | null) => {
  const normalized = encodeURIComponent(String(unitUid || "").trim());
  return normalized ? `${BACKEND_URL}/green/sponsor/public/trees/${normalized}/certificate.pdf` : "";
};

export const buildSponsorTermsUrl = () => `${BACKEND_URL}/green/sponsor/public/terms`;
export const buildSponsorPrivacyUrl = () => "https://landcheck.online/privacy";

// ─── Game actions ─────────────────────────────────────────────────────────────
export type GameActionPayload = {
  game_id: "daily_spin" | "fruit_harvest" | "grow_tree" | "forest_quest" | "wildlife_collector" | "rainmaker" | "climate_defender";
  action: string;
  amount?: number;
  meta?: Record<string, unknown>;
};

export const postSponsorGameAction = async (
  session: GreenAuthSession,
  payload: GameActionPayload,
): Promise<{ ok: boolean; earned: number; new_balance: number; detail?: string }> => {
  const response = await api.post("/green/sponsor/game/action", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return response.data;
};

// ─── Referral ─────────────────────────────────────────────────────────────────
export const redeemReferralCode = async (session: GreenAuthSession, referral_code: string) => {
  const response = await api.post("/green/sponsor/referral/redeem", {
    sponsor_id: session.user.id,
    referral_code,
  });
  return response.data;
};

// ─── School nomination ────────────────────────────────────────────────────────
export type SchoolNominationPayload = {
  school_name: string;
  school_location: string;
  contact_name?: string;
  reason?: string;
};

export const submitSchoolNomination = async (session: GreenAuthSession, payload: SchoolNominationPayload) => {
  const response = await api.post("/green/sponsor/schools/nominate", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return response.data;
};

// ─── Complaints ───────────────────────────────────────────────────────────────
export type ComplaintPayload = {
  tree_unit_id?: number;
  complaint_type: string;
  description: string;
};

export const submitTreeComplaint = async (session: GreenAuthSession, payload: ComplaintPayload) => {
  const response = await api.post("/green/sponsor/complaints", {
    sponsor_id: session.user.id,
    ...payload,
  });
  return response.data;
};
