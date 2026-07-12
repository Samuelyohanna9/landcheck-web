import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { api, BACKEND_URL } from "../api/client";
import TreeMap, { type TreeInspectData } from "../components/TreeMap";
import { clearWorkAuthed, getWorkAuthSession } from "../auth/workAuth";
import { usePrivacyConsentGate } from "../privacy/usePrivacyConsentGate";
import {
  cacheProjectsOffline,
  cacheUsersOffline,
  cacheProjectDetailOffline,
  cacheProjectTreesOffline,
  getCachedProjectsOffline,
  getCachedUsersOffline,
  getCachedProjectDetailOffline,
  getCachedProjectTreesOffline,
  isLikelyNetworkError,
} from "../offline/greenOffline";
import "../styles/green-work.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";
const REMOTE_MONITORING_PROGRESS_STEPS = [
  "Validating selected monitoring area",
  "Counting stored trees inside polygon",
  "Fetching satellite imagery window",
  "Filtering cloud-free vegetation pixels",
  "Calculating NDVI and vegetated area",
  "Preparing vegetation summary",
];
const REMOTE_MONITORING_PROGRESS_STEPS_AGRIC = [
  "Validating selected farm block",
  "Counting mapped plots in farm area",
  "Fetching satellite imagery window",
  "Filtering cloud-free vegetation pixels",
  "Calculating crop vigor and coverage",
  "Preparing farm health summary",
];

type WorkflowProfile = "green" | "agric" | "relief_recovery";
type ProjectAccessModel = "partner_org" | "public_sponsorship";
type AgricConfig = {
  program_type?: string | null;
  focus_commodities?: string | null;
  support_packages?: string | null;
  season_label?: string | null;
};
type ReliefConfig = {
  program_type?: string | null;
  intervention_focus?: string | null;
  package_types?: string | null;
  target_zone?: string | null;
};
type ActivityLogEntry = {
  id: number;
  source?: string | null;
  event_type?: string | null;
  actor?: string | null;
  message?: string | null;
  details?: unknown;
  created_at?: string | null;
};

const normalizeActivityLogDetails = (details: unknown) => {
  if (details == null || details === "") return null;
  if (typeof details === "string") {
    const trimmed = details.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }
  return details;
};

const summarizeActivityLogDetails = (details: unknown) => {
  const normalized = normalizeActivityLogDetails(details);
  if (normalized == null) return "No details";
  if (Array.isArray(normalized)) {
    return `${normalized.length} item${normalized.length === 1 ? "" : "s"}`;
  }
  if (typeof normalized === "object") {
    const keys = Object.keys(normalized as Record<string, unknown>);
    if (!keys.length) return "No details";
    const namedKeys = keys.slice(0, 2).map((key) => key.replace(/_/g, " "));
    const suffix = keys.length === 1 ? "1 field" : `${keys.length} fields`;
    return namedKeys.length ? `${namedKeys.join(" • ")} | ${suffix}` : suffix;
  }
  const value = String(normalized).replace(/\s+/g, " ").trim();
  return value.length > 48 ? `${value.slice(0, 45)}...` : value;
};

const hasActivityLogDetails = (details: unknown) => {
  const normalized = normalizeActivityLogDetails(details);
  if (normalized == null) return false;
  if (Array.isArray(normalized)) return normalized.length > 0;
  if (typeof normalized === "object") return Object.keys(normalized as Record<string, unknown>).length > 0;
  return Boolean(String(normalized).trim());
};

const resolveActivityLogActor = (log: Pick<ActivityLogEntry, "actor" | "details">) => {
  const directActor = String(log.actor || "").trim();
  if (directActor) return directActor;
  const normalized = normalizeActivityLogDetails(log.details);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return "-";
  const detailRecord = normalized as Record<string, unknown>;
  const actorKeys = [
    "actor_name",
    "user_name",
    "full_name",
    "resolved_reviewer",
    "reviewer_name",
    "created_by",
    "updated_by",
    "submitted_by",
    "requested_by",
    "assigned_by",
    "assignee_name",
    "sponsor_name",
    "actor",
    "email",
  ];
  for (const key of actorKeys) {
    const value = String(detailRecord[key] || "").trim();
    if (value) return value;
  }
  return "-";
};

const formatActivityLogDetails = (details: unknown) => {
  const normalized = normalizeActivityLogDetails(details);
  if (normalized == null) return "No details recorded for this entry.";
  if (typeof normalized === "string") return normalized;
  try {
    return JSON.stringify(normalized, null, 2);
  } catch {
    return String(normalized);
  }
};

const normalizeWorkflowProfile = (value?: string | null): WorkflowProfile => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "agric") return "agric";
  if (normalized === "relief_recovery") return "relief_recovery";
  return "green";
};
const isFieldWorkflowProfile = (value?: string | null) => normalizeWorkflowProfile(value) !== "green";
const normalizeProjectAccessModel = (value?: string | null): ProjectAccessModel =>
  String(value || "").trim().toLowerCase() === "public_sponsorship" ? "public_sponsorship" : "partner_org";
const isPublicSponsorshipProject = (accessModel?: string | null, publicSponsorEnabled?: boolean | null) =>
  normalizeProjectAccessModel(accessModel) === "public_sponsorship" || Boolean(publicSponsorEnabled);

const getWorkflowLabels = (profile?: string | null) =>
  normalizeWorkflowProfile(profile) === "agric"
    ? {
        modeLabel: "Agric",
        ownerSingular: "Farmer",
        ownerPlural: "Farmers",
        entitySingular: "Plot",
        entityPlural: "Plots",
        actionTitle: "Map & Add Plots",
        registryTitle: "Farmer Registry",
        liveTableTitle: "Farmer Live Table",
        fieldCaptureTitle: "Field Capture",
        supportVisitTitle: "Support Visits",
        recordTitle: "Plot Records",
      }
    : normalizeWorkflowProfile(profile) === "relief_recovery"
      ? {
          modeLabel: "Relief & Recovery",
          ownerSingular: "Beneficiary",
          ownerPlural: "Beneficiaries",
          entitySingular: "Site",
          entityPlural: "Sites",
          actionTitle: "Map & Assess Sites",
          registryTitle: "Beneficiary Registry",
          liveTableTitle: "Beneficiary Live Table",
          fieldCaptureTitle: "Site Capture",
          supportVisitTitle: "Relief Visits",
          recordTitle: "Site Records",
        }
    : {
        modeLabel: "Green",
        ownerSingular: "Custodian",
        ownerPlural: "Custodians",
        entitySingular: "Tree",
        entityPlural: "Trees",
        actionTitle: "Map & Add Trees",
        registryTitle: "Custodian Hub",
        liveTableTitle: "Live Table",
        fieldCaptureTitle: "Field Capture",
        supportVisitTitle: "Support Visits",
        recordTitle: "Existing Trees",
      };

type Project = {
  id: number;
  organization_id?: number | null;
  organization_name?: string | null;
  organization_slug?: string | null;
  organization_status?: string | null;
  organization_logo_url?: string | null;
  name: string;
  location_text: string;
  sponsor?: string | null;
  workflow_profile?: WorkflowProfile;
  access_model?: ProjectAccessModel | string | null;
  public_sponsor_enabled?: boolean | null;
  public_sponsor_title?: string | null;
  public_sponsor_description?: string | null;
  sponsor_price_per_tree_ngn?: number | null;
  sponsor_price_per_tree_usd?: number | null;
  sponsor_price_per_tree?: number | null;
  sponsor_currency?: string | null;
  sponsor_capacity?: number | null;
  sponsor_max_per_order?: number | null;
  sponsor_dedication_enabled?: boolean | null;
  sponsor_payment_instructions?: string | null;
  public_sponsor_agent_user_ids?: number[] | null;
  sponsor_agent_planting_fee?: number | null;
  sponsor_agent_maintenance_fee?: number | null;
  agric_config?: AgricConfig | null;
  relief_config?: ReliefConfig | null;
  planting_model?: "direct" | "community_distributed" | "mixed";
  allow_existing_tree_link?: boolean;
  default_existing_tree_scope?: "exclude_from_planting_kpi" | "include_in_planting_kpi";
  settings?: {
    workflow_profile?: WorkflowProfile;
    access_model?: ProjectAccessModel | string | null;
    public_sponsor_enabled?: boolean | null;
    public_sponsor_title?: string | null;
    public_sponsor_description?: string | null;
    sponsor_price_per_tree_ngn?: number | null;
    sponsor_price_per_tree_usd?: number | null;
    sponsor_price_per_tree?: number | null;
    sponsor_currency?: string | null;
    sponsor_capacity?: number | null;
    sponsor_max_per_order?: number | null;
    sponsor_dedication_enabled?: boolean | null;
    sponsor_payment_instructions?: string | null;
    public_sponsor_agent_user_ids?: number[] | null;
    sponsor_agent_planting_fee?: number | null;
    sponsor_agent_maintenance_fee?: number | null;
    agric_config?: AgricConfig | null;
    relief_config?: ReliefConfig | null;
    planting_model?: "direct" | "community_distributed" | "mixed";
    allow_existing_tree_link?: boolean;
    default_existing_tree_scope?: "exclude_from_planting_kpi" | "include_in_planting_kpi";
  };
};

type GreenUser = {
  id: number;
  user_uid?: string | null;
  full_name: string;
  role: string;
  role_id?: number | null;
  role_uid?: string | null;
  role_key?: string | null;
  role_name?: string | null;
  organization_id?: number | null;
  organization_name?: string | null;
  organization_slug?: string | null;
  email?: string | null;
  phone?: string | null;
  allow_green?: boolean;
  allow_work?: boolean;
  work_username?: string | null;
  notes?: string | null;
  is_active?: boolean;
  updated_at?: string | null;
};

type Organization = {
  id: number;
  name: string;
  slug: string;
  short_name?: string | null;
  logo_url?: string | null;
  status?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website_url?: string | null;
  country?: string | null;
  state_region?: string | null;
  city?: string | null;
  address_text?: string | null;
  notes?: string | null;
  is_active?: boolean;
  projects_count?: number;
  trees_count?: number;
  tasks_count?: number;
  pending_review_count?: number;
  open_alert_count?: number;
  last_activity_at?: string | null;
};

type SponsorshipOrderRecord = {
  id: number;
  order_uid?: string | null;
  project_id: number;
  quantity?: number | null;
  amount_per_tree?: number | null;
  amount_total?: number | null;
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
  payment_proof_urls?: string[] | null;
  dedication_type?: string | null;
  dedication_name?: string | null;
  dedication_message?: string | null;
  purchaser_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  sponsor_account_id?: number | null;
  sponsor_name?: string | null;
  sponsor_organization_name?: string | null;
  sponsor_email?: string | null;
  sponsor_account_type?: string | null;
  project_name?: string | null;
  location_text?: string | null;
  total_units?: number | null;
  linked_units?: number | null;
  awaiting_tree_units?: number | null;
  awaiting_payment_units?: number | null;
};

type SponsorAccountSummary = {
  id: number;
  full_name: string;
  organization_name: string | null;
  email: string | null;
  account_type: string | null;
  orders_count: number;
  amount_total: number;
  linked_units: number;
  verified_orders_count: number;
  pending_orders_count: number;
  issue_orders_count: number;
  awaiting_tree_units: number;
  entity_category?: string | null;
  leaderboard_visibility?: string | null;
  monthly_trees?: number;
  all_time_trees?: number;
  achievement_level?: string;
  green_points?: number | null;
  lifetime_points?: number | null;
  referral_code?: string | null;
  referral_rules_met?: boolean | null;
  personal_trees_sponsored?: number | null;
  total_referred_users?: number | null;
  converted_referred_users?: number | null;
  referral_conversion_rate?: number | null;
  project_orders_count?: number;
  project_amount_total?: number;
  project_verified_orders_count?: number;
  project_pending_orders_count?: number;
  project_issue_orders_count?: number;
  project_awaiting_tree_units?: number;
  is_guest?: boolean;
  claimed_at?: string | null;
};

type SponsorAgentBankAccountRecord = {
  id: number;
  user_id: number;
  organization_id?: number | null;
  currency?: string | null;
  bank_code?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_number_masked?: string | null;
  account_name?: string | null;
  verified?: boolean;
  verified_at?: string | null;
};

type SponsorAgentPayoutRequestRecord = {
  id: number;
  request_uid?: string | null;
  user_id: number;
  user_name?: string | null;
  user_uid?: string | null;
  organization_id?: number | null;
  currency?: string | null;
  amount_total: number;
  payout_minimum?: number | null;
  status?: string | null;
  bank_code?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_number_masked?: string | null;
  account_name?: string | null;
  earning_keys?: string[];
  earning_count?: number;
  project_ids?: number[];
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  settlement_channel?: string | null;
  settlement_reference?: string | null;
  transfer_reference?: string | null;
  transfer_id?: number | null;
  transfer_status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SponsorAgentProjectRateRecord = {
  project_id: number;
  project_name?: string | null;
  location_text?: string | null;
  currency?: string | null;
  planting_fee?: number | null;
  maintenance_fee?: number | null;
};

type SponsorAgentEarningRecord = {
  earning_key: string;
  work_type?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  currency?: string | null;
  amount?: number | null;
  tree_id?: number | null;
  task_id?: number | null;
  unit_id?: number | null;
  order_id?: number | null;
  order_uid?: string | null;
  project_tree_no?: number | null;
  tree_label?: string | null;
  species?: string | null;
  actor_name?: string | null;
  task_label?: string | null;
  earned_at?: string | null;
  sponsor_name?: string | null;
  sponsor_organization_name?: string | null;
  payout_status?: string | null;
  payout_request_id?: number | null;
  payout_request_uid?: string | null;
  payout_requested_at?: string | null;
  payout_paid_at?: string | null;
};

type SponsorAgentDashboardRecord = {
  eligible?: boolean;
  minimum_payout_amount?: number | null;
  currency?: string | null;
  auto_payout_available?: boolean;
  user?: {
    id: number;
    full_name?: string | null;
    user_uid?: string | null;
    organization_id?: number | null;
    organization_name?: string | null;
  } | null;
  bank_account?: SponsorAgentBankAccountRecord | null;
  projects?: SponsorAgentProjectRateRecord[];
  summary?: {
    eligible_project_count?: number;
    planting_count?: number;
    maintenance_count?: number;
    total_earnings_amount?: number;
    available_amount?: number;
    requested_amount?: number;
    paid_amount?: number;
    pending_request_count?: number;
    paid_request_count?: number;
    payout_eligible?: boolean;
    bank_verified?: boolean;
  } | null;
  project_summaries?: Array<{
    project_id: number;
    project_name?: string | null;
    currency?: string | null;
    available_amount?: number;
    requested_amount?: number;
    paid_amount?: number;
    planting_count?: number;
    maintenance_count?: number;
  }>;
  earnings?: SponsorAgentEarningRecord[];
  requests?: SponsorAgentPayoutRequestRecord[];
};

type SponsorAgentPayoutBoard = {
  project_id: number;
  project_name?: string | null;
  organization_id: number;
  minimum_payout_amount?: number | null;
  currency?: string | null;
  auto_payout_available?: boolean;
  agents: SponsorAgentDashboardRecord[];
  requests: SponsorAgentPayoutRequestRecord[];
  summary?: {
    agent_count?: number;
    request_count?: number;
    pending_request_count?: number;
    available_amount?: number;
    requested_amount?: number;
    paid_amount?: number;
  } | null;
};

type AdminOverview = {
  totals: {
    organizations: number;
    active_organizations: number;
    projects: number;
    unassigned_projects: number;
    trees: number;
    tasks: number;
    pending_reviews: number;
    open_alerts: number;
    users: number;
    roles: number;
  };
  organizations: Organization[];
  recent_activity: Array<{
    id: number;
    project_id?: number | null;
    entity_type?: string | null;
    entity_id?: number | null;
    action?: string | null;
    actor?: string | null;
    created_at: string;
    project_name?: string | null;
    organization_id?: number | null;
    organization_name?: string | null;
    organization_slug?: string | null;
  }>;
};

type RoleDefinition = {
  id: number;
  role_uid: string;
  role_key: string;
  role_name: string;
  description?: string | null;
  scope?: string | null;
  is_system?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

type WorkOrder = {
  id: number;
  project_id: number;
  assignee_name: string;
  work_type: string;
  target_trees: number;
  species_allocations?: Array<{ species: string; count: number }>;
  auto_assign_first_cycle_maintenance?: boolean;
  allow_existing_tree_area_reuse?: boolean;
  due_date: string | null;
  status: string;
  planted_count: number;
  area_enabled?: boolean;
  area_label?: string | null;
  area_geojson?: any;
};

type Tree = {
  id: number;
  project_tree_no?: number | null;
  lng: number;
  lat: number;
  created_by: string | null;
  status: string;
  species?: string | null;
  planting_date?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  photo_urls?: string[] | null;
  tree_origin?: "new_planting" | "existing_inventory" | "natural_regeneration";
  attribution_scope?: "full" | "monitor_only";
  count_in_planting_kpis?: boolean;
  count_in_carbon_scope?: boolean;
  source_project_id?: number | null;
  tree_height_m?: number | null;
  tree_age_months?: number | null;
  inventory_tree_count?: number | null;
  existing_area_geojson?: any;
  existing_area_sqm?: number | null;
  sponsor_linked_units?: number | null;
  sponsor_paid_units?: number | null;
  sponsor_pending_units?: number | null;
  sponsor_problem_units?: number | null;
  sponsor_display_names?: string | null;
  record_profile_data?: {
    plot_code?: string | null;
    plot_name?: string | null;
    commodity?: string | null;
    variety?: string | null;
    season_name?: string | null;
    season_year?: number | null;
    land_use?: string | null;
    irrigation_type?: string | null;
    production_stage?: string | null;
    estimated_yield_kg?: number | null;
    boundary_capture_method?: string | null;
    area_hectares?: number | null;
    support_placeholder?: boolean | null;
    hidden_from_records?: boolean | null;
    placeholder_reason?: string | null;
    asset_code?: string | null;
    asset_name?: string | null;
    asset_type?: string | null;
    damage_level?: string | null;
    occupancy_status?: string | null;
    tenure_status?: string | null;
    response_pathway?: string | null;
    floor_area_sqm?: number | null;
    rooms_count?: number | null;
    estimated_repair_cost?: number | null;
    population_served?: number | null;
    support_package?: string | null;
    safety_risks?: string | null;
    reported_need?: string | null;
  } | null;
  custodian_id?: number | null;
  custodian_name?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
};
type ExistingTreeMetric = {
  tree_id: number;
  project_tree_no?: number | null;
  inventory_tree_count?: number | null;
  existing_area_sqm?: number | null;
  existing_area_ha?: number | null;
  photo_count?: number | null;
  tree_age_months?: number | null;
  age_years?: number | null;
  age_source?: string | null;
  current_co2_kg?: number | null;
  annual_co2_kg?: number | null;
  lifetime_co2_kg?: number | null;
  co2_in_scope?: boolean;
  co2_height_source?: string | null;
  height_used_for_co2?: boolean;
};

type CustodianType = "household" | "school" | "community_group";
type Custodian = {
  id: number;
  project_id: number;
  custodian_type: CustodianType;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  alt_phone?: string | null;
  email?: string | null;
  address_text?: string | null;
  local_government?: string | null;
  community_name?: string | null;
  verification_status?: string | null;
  notes?: string | null;
  profile_data?: {
    farmer_code?: string | null;
    gender?: string | null;
    date_of_birth?: string | null;
    national_id?: string | null;
    state_name?: string | null;
    ward_name?: string | null;
    farmer_group?: string | null;
    household_size?: number | null;
    primary_crop?: string | null;
    secondary_crops?: string | null;
    land_tenure?: string | null;
    irrigation_access?: string | null;
    finance_access?: boolean | null;
    insurance_access?: boolean | null;
    input_support_needs?: string | null;
    beneficiary_code?: string | null;
    government_id?: string | null;
    displacement_status?: string | null;
    origin_location?: string | null;
    current_settlement?: string | null;
    support_category?: string | null;
    priority_needs?: string | null;
    livelihood_type?: string | null;
    vulnerability_flags?: string | null;
    relief_gender?: string | null;
    shelter_status?: string | null;
    women_count?: number | null;
    children_under_five?: number | null;
    elderly_count?: number | null;
    disability_count?: number | null;
  } | null;
  created_by?: string | null;
  created_at?: string;
};

type DistributionEvent = {
  id: number;
  project_id: number;
  event_date: string;
  species?: string | null;
  quantity: number;
  source_batch_ref?: string | null;
  distributed_by?: string | null;
  notes?: string | null;
  created_at?: string;
};

type DistributionAllocation = {
  id: number;
  event_id: number;
  project_id: number;
  custodian_id: number;
  custodian_name?: string | null;
  custodian_type?: CustodianType | null;
  event_date?: string | null;
  species?: string | null;
  event_quantity?: number | null;
  quantity_allocated: number;
  supervision_target?: number;
  supervision_assigned?: number;
  supervision_done?: number;
  supervision_live?: number;
  supervision_remaining?: number;
  expected_planting_start?: string | null;
  expected_planting_end?: string | null;
  followup_cycle_days: number;
  notes?: string | null;
  created_at?: string;
};

type PlantingModel = "direct" | "community_distributed" | "mixed";
type ExistingScopeValue = "exclude_from_planting_kpi" | "include_in_planting_kpi";

type WorkTask = {
  id: number;
  tree_id: number;
  task_type: string;
  assignee_name: string;
  status: string;
  review_state?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  reported_tree_status?: string | null;
  due_date: string | null;
  priority?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  photo_urls?: string[] | null;
  created_at?: string | null;
  completed_at?: string | null;
  activity_lng?: number | null;
  activity_lat?: number | null;
  activity_recorded_at?: string | null;
  tree_lng?: number | null;
  tree_lat?: number | null;
  tree_species?: string | null;
  tree_planting_date?: string | null;
  tree_origin?: string | null;
  tree_height_m?: number | null;
  tree_age_months?: number | null;
  custodian_id?: number | null;
  custodian_name?: string | null;
  custodian_type?: string | null;
  custodian_community_name?: string | null;
  custodian_contact_person?: string | null;
  custodian_phone?: string | null;
  custodian_email?: string | null;
  distribution_allocation_id?: number | null;
  supervision_visit_no?: number | null;
  supervision_total_visits?: number | null;
};

type ReviewQueueTask = WorkTask & {
  tree_status?: string | null;
};

type WorkForm =
  | "super_admin"
  | "project_focus"
  | "create_project"
  | "add_user"
  | "users"
  | "map_view"
  | "remote_monitoring"
  | "assign_work"
  | "assign_task"
  | "review_queue"
  | "overview"
  | "live_table"
  | "verra_reports"
  | "custodian_hub"
  | "farmer_live"
  | "field_capture_assign"
  | "support_visit_assign"
  | "existing_tree_intake"
  | "sponsors"
  | "sponsorship_orders"
  | "sponsor_payouts"
  | "sponsor_feedback"
  | "logs"
  | "share_impact"
  ;

const AGRIC_HIDDEN_PROJECT_FORMS: WorkForm[] = [
  "overview",
  "live_table",
  "assign_work",
  "assign_task",
  "verra_reports",
];

type StaffMenuState = { user: GreenUser; x: number; y: number } | null;
type DrawerFrame = { top: number; left: number; width: number; height: number };
type AgricVisitAssignmentMode = "field_capture" | "support_visit";
type WorkOrderMultiAssignOverride = {
  target_trees: string;
  due_date: string;
};
type VerraExportHistoryItem = {
  id: number;
  season_mode: string;
  assignee_name: string | null;
  output_format: string;
  monitoring_start: string | null;
  monitoring_end: string | null;
  methodology_id: string | null;
  verifier_notes: string | null;
  generated_by: string | null;
  file_name: string | null;
  payload_summary?: {
    tree_inventory_count?: number;
    task_timeline_count?: number;
    live_maintenance_count?: number;
    co2_current_tonnes?: number;
    co2_projected_lifetime_tonnes?: number;
  } | null;
  created_at: string;
};
type VerraExportFormat = "zip" | "json" | "docx";
type RemoteMonitoringAnalysisArea = {
  project_id: number;
  area_geojson: any;
  area_sqm?: number | null;
  tree_count?: number;
  tree_record_count?: number;
  new_planting_tree_count?: number;
  existing_inventory_tree_count?: number;
  other_tree_count?: number;
};
type RemoteMonitoringSeriesPoint = {
  label: string;
  start_date: string;
  end_date: string;
  image_count?: number | null;
  latest_image_date?: string | null;
  mean_ndvi?: number | null;
  vegetation_area_sqm?: number | null;
  vegetation_coverage_pct?: number | null;
  vegetation_area_per_tree_sqm?: number | null;
  clear_area_sqm?: number | null;
  clear_coverage_pct?: number | null;
};
type RemoteMonitoringTreeAnalysis = {
  tree_id: number;
  project_tree_no?: number | null;
  tree_label?: string | null;
  species?: string | null;
  planting_date?: string | null;
  status?: string | null;
  tree_origin?: string | null;
  inventory_tree_count?: number | null;
  lng?: number | null;
  lat?: number | null;
  local_mean_ndvi?: number | null;
  local_vegetated_area_sqm?: number | null;
  local_clear_area_sqm?: number | null;
  local_vegetation_cover_pct?: number | null;
  tree_cover_threshold_ndvi?: number | null;
  satellite_health?: string | null;
  satellite_health_label?: string | null;
  satellite_health_note?: string | null;
  tree_buffer_meters?: number | null;
};
type RemoteMonitoringHealthScale = {
  metric?: string | null;
  buffer_meters?: number | null;
  cover_threshold_ndvi?: number | null;
  note?: string | null;
  bands?: {
    key: string;
    label: string;
    min_ndvi?: number | null;
    max_ndvi?: number | null;
    description?: string | null;
  }[];
};
type RemoteMonitoringReport = {
  area: RemoteMonitoringAnalysisArea;
  summary: {
    image_count?: number | null;
    latest_image_date?: string | null;
    mean_ndvi?: number | null;
    vegetation_area_sqm?: number | null;
    vegetation_coverage_pct?: number | null;
    vegetation_area_per_tree_sqm?: number | null;
    clear_area_sqm?: number | null;
    clear_coverage_pct?: number | null;
    signal?: string | null;
    signal_message?: string | null;
    summary_window_start?: string | null;
    summary_window_end?: string | null;
    vegetation_threshold_ndvi?: number | null;
  };
  series: RemoteMonitoringSeriesPoint[];
  trees: RemoteMonitoringTreeAnalysis[];
  health_scale?: RemoteMonitoringHealthScale | null;
};

const normalizeName = (value: string | null | undefined) => (value || "").trim().toLowerCase();
const generateUiUniqueId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
const normalizeVerraExportFormat = (value: string | null | undefined): VerraExportFormat => {
  const normalized = normalizeName(value);
  if (normalized === "json" || normalized === "docx") return normalized;
  return "zip";
};
const normalizeTreeStatus = (value: string | null | undefined) => {
  const raw = (value || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (raw === "deseas" || raw === "diseased") return "disease";
  if (raw === "needreplacement" || raw === "needsreplacement") return "need_replacement";
  if (raw === "needs_replacement") return "need_replacement";
  return raw || "healthy";
};
const REPLACEMENT_TRIGGER_STATUSES = new Set(["dead", "damaged", "removed", "need_replacement"]);
const HEALTHY_TREE_STATUSES = new Set(["alive", "healthy"]);
const isReplacementTriggerStatus = (value: string | null | undefined) =>
  REPLACEMENT_TRIGGER_STATUSES.has(normalizeTreeStatus(value));
const treeStatusLabel = (value: string | null | undefined) =>
  normalizeTreeStatus(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Unknown";
const formatNdviBandLabel = (band: { min_ndvi?: number | null; max_ndvi?: number | null }) => {
  const min = typeof band.min_ndvi === "number" ? band.min_ndvi.toFixed(2) : null;
  const max = typeof band.max_ndvi === "number" ? band.max_ndvi.toFixed(2) : null;
  if (min !== null && max !== null) return `${min} to ${max}`;
  if (min !== null) return `>= ${min}`;
  if (max !== null) return `< ${max}`;
  return "Any NDVI";
};
const formatRoleLabel = (role: string) =>
  role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
const isCompleteStatus = (status: string | null | undefined, reviewState?: string | null | undefined) => {
  const normalized = normalizeName(status);
  const done = normalized === "done" || normalized === "completed" || normalized === "closed";
  if (!done) return false;
  if (reviewState === undefined) return true;
  const review = normalizeName(reviewState || "none");
  return review === "approved" || review === "none";
};
const isOverdueTask = (task: WorkTask) => {
  if (isCompleteStatus(task.status, task.review_state) || !task.due_date) return false;
  const dueDate = new Date(task.due_date);
  if (Number.isNaN(dueDate.getTime())) return false;
  dueDate.setHours(23, 59, 59, 999);
  return dueDate.getTime() < Date.now();
};
const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};
const formatDateTimeLabel = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};
const toFiniteCoord = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const formatGpsPair = (lng: number | null, lat: number | null) => {
  if (lng === null || lat === null) return "Not captured";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
};
const computeDistanceMeters = (
  fromLng: number | null,
  fromLat: number | null,
  toLng: number | null,
  toLat: number | null,
) => {
  if (fromLng === null || fromLat === null || toLng === null || toLat === null) return null;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const fromLatRad = toRadians(fromLat);
  const toLatRad = toRadians(toLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};
const formatDistanceMeters = (distanceMeters: number | null) => {
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) return "Not available";
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(2)} km`;
};
const formatTaskTypeLabel = (value: string | null | undefined) =>
  (value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Task";
const formatWorkflowTaskTypeLabel = (
  value: string | null | undefined,
  workflowProfile: WorkflowProfile = "green",
) => {
  const key = normalizeName(value);
  if (workflowProfile === "agric") {
    if (key === "existing_inventory_intake") return "Plot Intake";
    if (key === "field_capture") return "Field Capture";
    if (key === "supervision") return "Support Visit";
    if (key === "inspection") return "Field Inspection";
  }
  if (workflowProfile === "relief_recovery") {
    if (key === "existing_inventory_intake") return "Site Assessment";
    if (key === "field_capture") return "Initial Site Capture";
    if (key === "supervision") return "Relief Visit";
    if (key === "inspection") return "Recovery Inspection";
  }
  if (key === "supervision") return "Supervision Visit";
  return formatTaskTypeLabel(value);
};
const taskSortStamp = (task: WorkTask) => {
  const raw = task.completed_at || task.due_date || task.created_at || "";
  const stamp = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(stamp) ? 0 : stamp;
};
const parseDateValue = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.length <= 10 ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};
const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const addDays = (date: Date, days: number) => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
};
const dayDiff = (target: Date, reference: Date) =>
  Math.round((startOfDay(target).getTime() - startOfDay(reference).getTime()) / 86400000);
const toDateInput = (value: Date | null) => {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const parseTreeHeightInput = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 120) return null;
  return Number(parsed.toFixed(2));
};
const formatTreeHeight = (value: number | null | undefined) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "-";
  return `${numeric.toFixed(2)} m`;
};
const formatExistingTreeAgeLabel = (
  tree: Pick<Tree, "tree_age_months">,
  metric?: ExistingTreeMetric | null,
) => {
  const years = Number(metric?.age_years);
  const ageSource = normalizeName(metric?.age_source || "");
  const monthsValue =
    metric?.tree_age_months !== undefined && metric?.tree_age_months !== null
      ? Number(metric.tree_age_months)
      : Number(tree.tree_age_months);
  const hasMonths = Number.isFinite(monthsValue) && monthsValue >= 0;
  const hasYears = Number.isFinite(years) && years >= 0 && ageSource !== "none";
  if (hasYears && hasMonths) return `${years.toFixed(1)}y / ${Math.round(monthsValue)}m`;
  if (hasYears) return `${years.toFixed(1)}y`;
  if (hasMonths) return `${Math.round(monthsValue)}m`;
  return "-";
};
const formatExistingTreeCo2Label = (metric?: ExistingTreeMetric | null) => {
  if (!metric) return "-";
  if (metric.co2_in_scope === false) return "Excluded";
  const kg = Number(metric.current_co2_kg);
  if (!Number.isFinite(kg)) return "-";
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${kg.toFixed(1)} kg`;
};
const formatExistingTreeCountLabel = (tree: Pick<Tree, "inventory_tree_count">, metric?: ExistingTreeMetric | null) => {
  const countValue = Number(metric?.inventory_tree_count ?? tree.inventory_tree_count ?? 1);
  if (!Number.isFinite(countValue) || countValue < 1) return "1";
  return String(Math.max(1, Math.round(countValue)));
};
const formatExistingTreeAreaLabel = (tree: Pick<Tree, "existing_area_sqm">, metric?: ExistingTreeMetric | null) => {
  const sqm = Number(metric?.existing_area_sqm ?? tree.existing_area_sqm);
  if (!Number.isFinite(sqm) || sqm <= 0) return "-";
  if (sqm >= 10000) return `${(sqm / 10000).toFixed(3)} ha`;
  return `${sqm.toFixed(1)} m²`;
};
const formatTreeOriginLabel = (value: string | null | undefined) => {
  const key = normalizeName(value);
  if (key === "existing_inventory") return "Existing inventory";
  if (key === "natural_regeneration") return "Natural regeneration";
  return "New planting";
};
const formatAttributionScopeLabel = (value: string | null | undefined) => {
  return normalizeName(value) === "monitor_only" ? "Monitor only" : "Full attribution";
};
const formatAgricProgramTypeLabel = (value: string | null | undefined) => {
  const key = normalizeName(value);
  if (key === "extension_support") return "Extension support";
  if (key === "input_support") return "Input support";
  if (key === "traceability") return "Traceability";
  if (key === "finance_insurance") return "Finance and insurance";
  if (key === "mixed") return "Mixed";
  return value ? formatTaskTypeLabel(value) : "-";
};
const formatReliefProgramTypeLabel = (value: string | null | undefined) => {
  const key = normalizeName(value);
  if (key === "emergency_relief") return "Emergency relief";
  if (key === "shelter_recovery") return "Shelter recovery";
  if (key === "construction_materials") return "Construction materials";
  if (key === "infrastructure_rehab") return "Infrastructure rehabilitation";
  if (key === "cash_voucher") return "Cash and voucher";
  if (key === "mixed") return "Mixed";
  return value ? formatTaskTypeLabel(value) : "-";
};
const formatBoundaryCaptureMethodLabel = (value: string | null | undefined) => {
  const key = normalizeName(value);
  if (key === "polygon_gps_walk") return "GPS walk";
  if (key === "polygon_map") return "Map polygon";
  if (key === "point") return "Point";
  return value ? formatTaskTypeLabel(value) : "-";
};
const formatPlotRecordLabel = (tree: Tree) => {
  const plotCode = String(tree.record_profile_data?.plot_code || "").trim();
  if (plotCode) return plotCode;
  const plotName = String(tree.record_profile_data?.plot_name || "").trim();
  if (plotName) return plotName;
  const localNo = Number(tree.project_tree_no || 0);
  return `Plot #${localNo > 0 ? localNo : tree.id}`;
};
const getPlotCommodityLabel = (tree: Tree) => {
  const commodity = String(tree.record_profile_data?.commodity || tree.species || "").trim();
  return commodity || "-";
};
const formatReliefSiteLabel = (tree: Tree) => {
  const assetCode = String((tree.record_profile_data as Record<string, unknown> | undefined)?.asset_code || "").trim();
  if (assetCode) return assetCode;
  const assetName = String((tree.record_profile_data as Record<string, unknown> | undefined)?.asset_name || tree.species || "").trim();
  if (assetName) return assetName;
  const localNo = Number(tree.project_tree_no || 0);
  return `Site #${localNo > 0 ? localNo : tree.id}`;
};
const formatReliefDamageLevelLabel = (value: string | null | undefined) => {
  const key = normalizeName(value);
  if (key === "habitable_with_repair") return "Habitable with repair";
  if (key === "not_habitable") return "Not habitable";
  return value ? formatTaskTypeLabel(value) : "-";
};
const formatPlotSeasonLabel = (tree: Tree) => {
  const seasonName = String(tree.record_profile_data?.season_name || "").trim();
  const seasonYear = Number(tree.record_profile_data?.season_year || 0);
  if (seasonName && Number.isFinite(seasonYear) && seasonYear > 0) return `${seasonName} ${seasonYear}`;
  if (seasonName) return seasonName;
  if (Number.isFinite(seasonYear) && seasonYear > 0) return String(seasonYear);
  return "-";
};
const formatPlotAreaLabel = (tree: Tree, metric?: ExistingTreeMetric | null) => {
  const hectares = Number(tree.record_profile_data?.area_hectares);
  if (Number.isFinite(hectares) && hectares > 0) return `${hectares.toFixed(4)} ha`;
  return formatExistingTreeAreaLabel(tree, metric);
};
const isHiddenSupportPlaceholderTree = (tree?: Pick<Tree, "record_profile_data"> | null) => {
  if (!tree?.record_profile_data) return false;
  if (tree.record_profile_data.hidden_from_records === true) return true;
  if (tree.record_profile_data.support_placeholder === true) return true;
  return ["support_visit_before_plot_capture", "field_capture_before_plot_capture"].includes(
    normalizeName(tree.record_profile_data.placeholder_reason),
  );
};
const normalizeSpeciesAllocations = (
  value: unknown,
): Array<{ species: string; count: number }> => {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, { species: string; count: number }>();
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const row = entry as Record<string, any>;
    const species = String(row.species || "").trim();
    const count = Number(row.count || 0);
    if (!species || !Number.isFinite(count) || count <= 0) return;
    const key = normalizeName(species);
    const existing = merged.get(key);
    if (existing) {
      existing.count += Math.round(count);
      return;
    }
    merged.set(key, { species, count: Math.round(count) });
  });
  return Array.from(merged.values());
};
const normalizeMapAreaGeometry = (
  value: any,
): { type: "Point" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon"; coordinates: any } | null => {
  if (!value) return null;
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const geometry = raw?.type === "Feature" ? raw.geometry : raw;
  if (!geometry || !["Point", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(String(geometry.type || ""))) {
    return null;
  }
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) return null;
  return { type: geometry.type, coordinates: geometry.coordinates };
};
const extractMapAreaPoints = (
  geometry: { type: "Point" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon"; coordinates: any } | null,
) => {
  if (!geometry) return [] as { lng: number; lat: number }[];
  const points: { lng: number; lat: number }[] = [];
  if (geometry.type === "Point") {
    const lng = Number(geometry.coordinates?.[0]);
    const lat = Number(geometry.coordinates?.[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) points.push({ lng, lat });
  } else if (geometry.type === "LineString") {
    (geometry.coordinates || []).forEach((point: any) => {
      const lng = Number(point?.[0]);
      const lat = Number(point?.[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) points.push({ lng, lat });
    });
  } else if (geometry.type === "MultiLineString") {
    (geometry.coordinates || []).forEach((line: any) => {
      if (!Array.isArray(line)) return;
      line.forEach((point: any) => {
        const lng = Number(point?.[0]);
        const lat = Number(point?.[1]);
        if (Number.isFinite(lng) && Number.isFinite(lat)) points.push({ lng, lat });
      });
    });
  } else if (geometry.type === "Polygon") {
    (geometry.coordinates || []).forEach((ring: any) => {
      if (!Array.isArray(ring)) return;
      ring.forEach((point: any) => {
        const lng = Number(point?.[0]);
        const lat = Number(point?.[1]);
        if (Number.isFinite(lng) && Number.isFinite(lat)) points.push({ lng, lat });
      });
    });
  } else {
    (geometry.coordinates || []).forEach((polygon: any) => {
      if (!Array.isArray(polygon)) return;
      polygon.forEach((ring: any) => {
        if (!Array.isArray(ring)) return;
        ring.forEach((point: any) => {
          const lng = Number(point?.[0]);
          const lat = Number(point?.[1]);
          if (Number.isFinite(lng) && Number.isFinite(lat)) points.push({ lng, lat });
        });
      });
    });
  }
  return points;
};
const pointInRing = (lng: number, lat: number, ring: any) => {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  let inside = false;
  let j = ring.length - 1;
  for (let i = 0; i < ring.length; i += 1) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    if (![xi, yi, xj, yj].every((value) => Number.isFinite(value))) {
      j = i;
      continue;
    }
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersects) inside = !inside;
    j = i;
  }
  return inside;
};
const pointInMapGeometry = (
  lng: number,
  lat: number,
  geometry: { type: "Point" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon"; coordinates: any } | null,
) => {
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return false;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  return polygons.some((polygon) => {
    if (!Array.isArray(polygon) || polygon.length === 0) return false;
    const [outer, ...holes] = polygon;
    if (!pointInRing(lng, lat, outer)) return false;
    if (holes.some((hole) => pointInRing(lng, lat, hole))) return false;
    return true;
  });
};
const formatMonitoringSignalLabel = (value: string | null | undefined) => {
  const normalized = normalizeName(value);
  if (normalized === "watch") return "Watch";
  if (normalized === "improving") return "Improving";
  if (normalized === "no_data") return "No Data";
  return "Stable";
};

const MAINTENANCE_ACTIVITY_ORDER = ["watering", "weeding", "protection", "inspection", "replacement"] as const;
type MaintenanceActivity = (typeof MAINTENANCE_ACTIVITY_ORDER)[number];
type SeasonMode = "rainy" | "dry";
type TaskDueMode = "model_rainy" | "model_dry" | "manual";
type LiveStatusTone = "danger" | "warning" | "ok" | "info";
type MaintenanceModel = {
  label: string;
  rationale: string;
};

const MAINTENANCE_MODEL: Record<MaintenanceActivity, MaintenanceModel> = {
  watering: {
    label: "Watering",
    rationale: "Early establishment needs frequent moisture checks; interval increases as trees establish.",
  },
  weeding: {
    label: "Weeding",
    rationale: "Heavy control in years 1-2, then reduced cycle once canopy suppression improves.",
  },
  protection: {
    label: "Protection",
    rationale: "Protection checks should be continuous, with tighter monitoring in dry-season risk windows.",
  },
  inspection: {
    label: "Inspection",
    rationale: "Early fortnight check, then monthly in establishment period, then quarterly supervision.",
  },
  replacement: {
    label: "Replacement",
    rationale: "Initial refill around week 6-8 with later mortality checks in follow-up cycles.",
  },
};

const SEASON_LABEL: Record<SeasonMode, string> = {
  rainy: "Rainy Season",
  dry: "Dry Season",
};

const asMaintenanceActivity = (value: string | null | undefined): MaintenanceActivity | null => {
  const key = normalizeName(value) as MaintenanceActivity;
  return MAINTENANCE_ACTIVITY_ORDER.includes(key) ? key : null;
};

const getMaintenanceIntervals = (
  activity: MaintenanceActivity,
  treeAgeDays: number,
  season: SeasonMode,
): { firstDays: number; repeatDays: number } => {
  switch (activity) {
    case "watering":
      return season === "rainy"
        ? { firstDays: 0, repeatDays: treeAgeDays < 90 ? 14 : 21 }
        : { firstDays: 0, repeatDays: treeAgeDays < 90 ? 5 : 7 };
    case "weeding":
      if (season === "rainy") {
        if (treeAgeDays < 365) return { firstDays: 21, repeatDays: 45 };
        if (treeAgeDays < 730) return { firstDays: 30, repeatDays: 90 };
        return { firstDays: 30, repeatDays: 150 };
      }
      if (treeAgeDays < 365) return { firstDays: 35, repeatDays: 90 };
      if (treeAgeDays < 730) return { firstDays: 45, repeatDays: 150 };
      return { firstDays: 45, repeatDays: 210 };
    case "protection":
      return season === "rainy"
        ? { firstDays: 0, repeatDays: 45 }
        : { firstDays: 0, repeatDays: 21 };
    case "inspection":
      return season === "rainy"
        ? { firstDays: 14, repeatDays: treeAgeDays < 180 ? 30 : 90 }
        : { firstDays: 7, repeatDays: treeAgeDays < 180 ? 21 : 60 };
    case "replacement":
      return season === "rainy"
        ? { firstDays: 42, repeatDays: 180 }
        : { firstDays: 56, repeatDays: 210 };
    default:
      return { firstDays: 30, repeatDays: 90 };
  }
};

const dueModeToSeason = (mode: TaskDueMode): SeasonMode | null => {
  if (mode === "model_rainy") return "rainy";
  if (mode === "model_dry") return "dry";
  return null;
};

const getSpeciesMaturityYears = (
  species: string | null | undefined,
  speciesMaturityMap: Record<string, number>,
) => {
  const normalized = normalizeName(species);
  if (!normalized) return null;
  const years = speciesMaturityMap[normalized];
  return Number.isFinite(years) && years > 0 ? years : null;
};

const getLifecycleStartDate = (
  plantingDateObj: Date | null,
  replacementDoneDateObj: Date | null,
) => {
  if (plantingDateObj && replacementDoneDateObj) {
    return replacementDoneDateObj.getTime() > plantingDateObj.getTime() ? replacementDoneDateObj : plantingDateObj;
  }
  return replacementDoneDateObj || plantingDateObj;
};

const coerceTreeAgeMonths = (value: unknown) => {
  const months = Number(value);
  return Number.isFinite(months) && months >= 0 ? months : null;
};

const inferTreeAgeDaysForMaintenance = (tree: Tree, today: Date) => {
  const originKey = normalizeName(tree.tree_origin || "new_planting");
  const ageMonths = coerceTreeAgeMonths(tree.tree_age_months);
  if (originKey === "existing_inventory" && ageMonths !== null) {
    const captureRef = parseDateValue(tree.created_at || tree.submitted_at || tree.reviewed_at || null);
    const elapsedDays = captureRef ? Math.max(dayDiff(today, captureRef), 0) : 0;
    return Math.max(Math.round(ageMonths * 30.4375) + elapsedDays, 0);
  }
  const plantingDateObj = parseDateValue(tree.planting_date || null);
  if (plantingDateObj) {
    return Math.max(dayDiff(today, plantingDateObj), 0);
  }
  if (ageMonths === null) return null;
  const captureRef = parseDateValue(tree.created_at || tree.submitted_at || tree.reviewed_at || null);
  const elapsedDays = captureRef ? Math.max(dayDiff(today, captureRef), 0) : 0;
  return Math.max(Math.round(ageMonths * 30.4375) + elapsedDays, 0);
};

const shouldSkipExistingTreeRoutineActivity = (
  activity: MaintenanceActivity,
  treeOrigin: Tree["tree_origin"],
  treeAgeDays: number | null,
  treeStatus: string,
  hasOpenTask: boolean,
) => {
  const originKey = normalizeName(treeOrigin || "new_planting");
  if (originKey !== "existing_inventory" || hasOpenTask) return false;
  if (activity === "watering") {
    if (normalizeTreeStatus(treeStatus) === "need_watering") return false;
    return treeAgeDays === null || treeAgeDays >= 365;
  }
  if (activity === "weeding") {
    return treeAgeDays === null || treeAgeDays >= 730;
  }
  return false;
};

const LIVE_TABLE_SOURCES = [
  {
    label: "FAO - Forest restoration monitoring and maintenance sequence",
    url: "https://www.fao.org/sustainable-forest-management-toolbox/modules/forest-restoration/en",
  },
  {
    label: "FAO - Post-planting operations (watering, protection, replacement)",
    url: "https://www.fao.org/4/u2247e/u2247e0a.htm",
  },
  {
    label: "FAO - Savanna plantation field maintenance practices (Nigeria-relevant context)",
    url: "https://www.fao.org/4/93269e/93269e03.htm",
  },
  {
    label: "NiMet seasonal outlook context for local onset/dry-period planning",
    url: "https://www.nimet.gov.ng/news?id=94",
  },
];

type LiveMaintenanceRow = {
  key: string;
  treeId: number;
  treeOrigin: "new_planting" | "existing_inventory" | "natural_regeneration";
  assignee: string;
  activity: MaintenanceActivity;
  activityLabel: string;
  plantingDate: string | null;
  treeAgeDays: number | null;
  lastDoneAt: string | null;
  modelDueDate: string | null;
  assignedDueDate: string | null;
  effectiveDueDate: string | null;
  countdownDays: number | null;
  tone: LiveStatusTone;
  indicator: string;
  statusText: string;
  doneCount: number;
  pendingCount: number;
  overdueCount: number;
  openTaskId: number | null;
  modelRationale: string;
};

type MaintenanceBulkAssignMode = "single_staff" | "distribute_evenly" | "group_by_route";
type MaintenanceAssigneeStrategy = "manual" | "tree_planter";
type MaintenanceAttentionFilter =
  | "all"
  | "needs_action"
  | "no_open_task"
  | "overdue"
  | "due_soon"
  | "replacement_required"
  | "inspection_flags";

type LiveTreeMenuState = { treeId: number; x: number; y: number; taskType?: string } | null;

type MaintenanceAssignmentPreviewRow = {
  key: string;
  label: string;
  activityLabel: string;
  indicator: string;
  species: string;
  group: { key: string; label: string };
};

type MaintenanceAssignmentPreviewEntry = {
  assignee: string;
  rows: MaintenanceAssignmentPreviewRow[];
  groups: { label: string; count: number }[];
};

const buildMaintenanceAssignmentPreview = ({
  rows,
  assignees,
  mode,
  treeById,
  describeGroup,
}: {
  rows: LiveMaintenanceRow[];
  assignees: string[];
  mode: MaintenanceBulkAssignMode;
  treeById: Map<number, Tree>;
  describeGroup: (row: Pick<LiveMaintenanceRow, "treeId" | "assignee" | "treeOrigin">) => { key: string; label: string };
}): MaintenanceAssignmentPreviewEntry[] => {
  if (rows.length <= 1) return [];
  if (mode === "single_staff") return [];
  if (assignees.length <= 1) return [];

  const makeRowPreview = (row: LiveMaintenanceRow): MaintenanceAssignmentPreviewRow => {
    const sourceTree = treeById.get(Number(row.treeId));
    const numericTreeId = Number(row.treeId || 0);
    const projectTreeNo = Number((sourceTree as any)?.project_tree_no || 0);
    return {
      key: row.key,
      label: `Tree #${projectTreeNo > 0 ? projectTreeNo : numericTreeId}`,
      activityLabel: row.activityLabel,
      indicator: row.indicator,
      species: String(sourceTree?.species || "").trim(),
      group: describeGroup(row),
  };
};

  if (mode === "distribute_evenly") {
    return assignees
      .map((assignee, index) => ({
        assignee,
        rows: rows.filter((_, rowIndex) => rowIndex % assignees.length === index).map(makeRowPreview),
        groups: [],
      }))
      .filter((entry) => entry.rows.length > 0);
  }

  const grouped = new Map<string, { key: string; label: string; rows: MaintenanceAssignmentPreviewRow[] }>();
  rows.forEach((row) => {
    const previewRow = makeRowPreview(row);
    const existing = grouped.get(previewRow.group.key);
    if (existing) {
      existing.rows.push(previewRow);
      return;
    }
    grouped.set(previewRow.group.key, {
      key: previewRow.group.key,
      label: previewRow.group.label,
      rows: [previewRow],
    });
  });

  const sortedGroups = Array.from(grouped.values()).sort((a, b) => {
    if (a.rows.length !== b.rows.length) return b.rows.length - a.rows.length;
    return a.label.localeCompare(b.label);
  });

  const previewByAssignee = new Map<string, MaintenanceAssignmentPreviewEntry>();
  assignees.forEach((assignee) => {
    previewByAssignee.set(assignee, {
      assignee,
      rows: [],
      groups: [],
    });
  });

  sortedGroups.forEach((group, index) => {
    const assignee = assignees[index % assignees.length] || assignees[0];
    const entry = previewByAssignee.get(assignee);
    if (!entry) return;
    entry.rows.push(...group.rows);
    entry.groups.push({ label: group.label, count: group.rows.length });
  });

  return Array.from(previewByAssignee.values()).filter((entry) => entry.rows.length > 0);
};

const liveToneRank = (tone: LiveStatusTone) => {
  if (tone === "danger") return 0;
  if (tone === "warning") return 1;
  if (tone === "info") return 2;
  return 3;
};

const summarizeLiveRows = (rows: LiveMaintenanceRow[]) =>
  rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.tone === "danger") acc.danger += 1;
      if (row.tone === "warning") acc.warning += 1;
      if (row.tone === "ok") acc.ok += 1;
      if (row.tone === "info") acc.info += 1;
      if (row.countdownDays !== null && row.countdownDays <= 7 && row.countdownDays >= 0) acc.dueSoon += 1;
      return acc;
    },
    { total: 0, danger: 0, warning: 0, ok: 0, info: 0, dueSoon: 0 },
  );

const R2_BUCKET_HINT = "photosgreen";

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeObjectKey = (value: string) => {
  let key = String(value || "").trim().replace(/^\/+/, "");
  if (!key) return "";

  for (let i = 0; i < 3; i += 1) {
    const decoded = safeDecode(key);
    if (decoded === key) break;
    key = decoded;
  }

  if (key.startsWith(`${R2_BUCKET_HINT}/`)) {
    key = key.slice(R2_BUCKET_HINT.length + 1);
  }
  return key;
};

const encodeObjectKeyForProxy = (value: string) =>
  normalizeObjectKey(value)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(safeDecode(part)))
    .join("/");

type PhotoRenderOptions = {
  w?: number;
  h?: number;
  q?: number;
  fm?: "webp" | "jpeg" | "png";
};

type NetworkInfoLike = {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
};

const getReviewPhotoRenderOptions = (): PhotoRenderOptions => {
  const baseline: PhotoRenderOptions = { w: 560, h: 420, q: 64, fm: "webp" };
  if (typeof navigator === "undefined") return baseline;
  const nav = navigator as Navigator & { connection?: NetworkInfoLike };
  const conn = nav.connection;
  const effectiveType = String(conn?.effectiveType || "").toLowerCase();
  const saveData = Boolean(conn?.saveData);
  const downlink = Number(conn?.downlink || 0);

  // Nigeria field conditions: aggressively optimize for constrained links.
  if (saveData || effectiveType === "slow-2g" || effectiveType === "2g" || (downlink > 0 && downlink < 1.2)) {
    return { w: 320, h: 240, q: 52, fm: "webp" };
  }
  if (effectiveType === "3g" || (downlink > 0 && downlink < 2.5)) {
    return { w: 420, h: 315, q: 58, fm: "webp" };
  }
  return baseline;
};

const appendPhotoRenderParams = (baseUrl: string, opts?: PhotoRenderOptions) => {
  if (!opts) return baseUrl;
  const params = new URLSearchParams();
  if (Number.isFinite(Number(opts.w)) && Number(opts.w) > 0) params.set("w", String(Math.round(Number(opts.w))));
  if (Number.isFinite(Number(opts.h)) && Number(opts.h) > 0) params.set("h", String(Math.round(Number(opts.h))));
  if (Number.isFinite(Number(opts.q)) && Number(opts.q) > 0) params.set("q", String(Math.round(Number(opts.q))));
  if (opts.fm) params.set("fm", opts.fm);
  const query = params.toString();
  if (!query) return baseUrl;
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${query}`;
};

const toDisplayPhotoUrl = (url: string | null | undefined, opts?: PhotoRenderOptions) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.includes("/green/uploads/object/")) {
    const absolute = /^https?:\/\//i.test(raw) ? raw : `${BACKEND_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
    return appendPhotoRenderParams(absolute, opts);
  }

  const toProxy = (key: string) => {
    const encoded = encodeObjectKeyForProxy(key);
    return encoded ? appendPhotoRenderParams(`${BACKEND_URL}/green/uploads/object/${encoded}`, opts) : "";
  };

  if (!/^https?:\/\//i.test(raw)) {
    return toProxy(raw) || raw;
  }

  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) return raw;
    const maybeBucket = parts[0]?.toLowerCase() === R2_BUCKET_HINT;
    const key = (maybeBucket ? parts.slice(1) : parts).join("/");
    return toProxy(key) || appendPhotoRenderParams(raw, opts);
  } catch {
    return appendPhotoRenderParams(raw, opts);
  }
};

const normalizePhotoList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rows: string[] = [];
  value.forEach((item) => {
    const raw = String(item || "").trim();
    if (!raw || seen.has(raw)) return;
    seen.add(raw);
    rows.push(raw);
  });
  return rows;
};

const normalizePositiveIntList = (value: unknown): number[] => {
  let parsedValue = value;
  if (typeof parsedValue === "string") {
    try {
      parsedValue = JSON.parse(parsedValue);
    } catch {
      parsedValue = [];
    }
  }
  if (!Array.isArray(parsedValue)) return [];
  const seen = new Set<number>();
  const rows: number[] = [];
  parsedValue.forEach((item) => {
    const numeric = Number(item || 0);
    if (!Number.isInteger(numeric) || numeric <= 0 || seen.has(numeric)) return;
    seen.add(numeric);
    rows.push(numeric);
  });
  return rows;
};

const normalizeSponsorshipOrderRecord = (row: any): SponsorshipOrderRecord => ({
  ...row,
  id: Number(row?.id || 0),
  project_id: Number(row?.project_id || 0),
  quantity: Number(row?.quantity || 0),
  amount_per_tree: Number(row?.amount_per_tree || 0),
  amount_total: Number(row?.amount_total || 0),
  payment_gateway_transaction_id:
    row?.payment_gateway_transaction_id === null || row?.payment_gateway_transaction_id === undefined
      ? null
      : Number(row.payment_gateway_transaction_id || 0),
  total_units: Number(row?.total_units || 0),
  linked_units: Number(row?.linked_units || 0),
  awaiting_tree_units: Number(row?.awaiting_tree_units || 0),
  awaiting_payment_units: Number(row?.awaiting_payment_units || 0),
  sponsor_account_id: row?.sponsor_account_id ? Number(row.sponsor_account_id) : null,
  payment_proof_urls: normalizePhotoList(row?.payment_proof_urls),
});

const normalizeSponsorshipOrderRecords = (rows: any[]): SponsorshipOrderRecord[] => {
  const seen = new Set<number>();
  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeSponsorshipOrderRecord(row))
    .filter((row) => {
      const orderId = Number(row.id || 0);
      if (!(orderId > 0) || seen.has(orderId)) return false;
      seen.add(orderId);
      return true;
    });
};

const normalizeSponsorAccountSummary = (row: any): SponsorAccountSummary => ({
  id: Number(row?.id || 0),
  full_name: String(row?.full_name || "").trim() || `Sponsor #${Number(row?.id || 0)}`,
  organization_name: row?.organization_name ? String(row.organization_name).trim() || null : null,
  email: row?.email ? String(row.email).trim() || null : null,
  account_type: row?.account_type ? String(row.account_type).trim() || null : null,
  orders_count: Number(row?.orders_count || 0),
  amount_total: Number(row?.amount_total || 0),
  linked_units: Number(row?.linked_units || row?.linked_trees || 0),
  verified_orders_count: Number(row?.verified_orders_count || 0),
  pending_orders_count: Number(row?.pending_orders_count || 0),
  issue_orders_count: Number(row?.issue_orders_count || 0),
  awaiting_tree_units: Number(row?.awaiting_tree_units || 0),
  entity_category: row?.entity_category ? String(row.entity_category).trim() || null : null,
  leaderboard_visibility: row?.leaderboard_visibility ? String(row.leaderboard_visibility).trim() || null : null,
  monthly_trees: Number(row?.monthly_trees || 0),
  all_time_trees: Number(row?.all_time_trees || 0),
  achievement_level: row?.achievement_level ? String(row.achievement_level).trim() : undefined,
  project_orders_count: Number(row?.project_orders_count || 0),
  project_amount_total: Number(row?.project_amount_total || 0),
  project_verified_orders_count: Number(row?.project_verified_orders_count || 0),
  project_pending_orders_count: Number(row?.project_pending_orders_count || 0),
  project_issue_orders_count: Number(row?.project_issue_orders_count || 0),
  project_awaiting_tree_units: Number(row?.project_awaiting_tree_units || 0),
});

const normalizeSponsorAgentBankAccountRecord = (row: any): SponsorAgentBankAccountRecord => ({
  id: Number(row?.id || 0),
  user_id: Number(row?.user_id || 0),
  organization_id: row?.organization_id ? Number(row.organization_id) : null,
  currency: row?.currency ? normalizeSponsorCurrencyCode(row.currency) : "NGN",
  bank_code: row?.bank_code ? String(row.bank_code).trim() || null : null,
  bank_name: row?.bank_name ? String(row.bank_name).trim() || null : null,
  account_number: row?.account_number ? String(row.account_number).trim() || null : null,
  account_number_masked: row?.account_number_masked ? String(row.account_number_masked).trim() || null : null,
  account_name: row?.account_name ? String(row.account_name).trim() || null : null,
  verified: Boolean(row?.verified),
  verified_at: row?.verified_at ? String(row.verified_at) : null,
});

const normalizeSponsorAgentPayoutRequestRecord = (row: any): SponsorAgentPayoutRequestRecord => ({
  id: Number(row?.id || 0),
  request_uid: row?.request_uid ? String(row.request_uid).trim() || null : null,
  user_id: Number(row?.user_id || 0),
  user_name: row?.user_name ? String(row.user_name).trim() || null : null,
  user_uid: row?.user_uid ? String(row.user_uid).trim() || null : null,
  organization_id: row?.organization_id ? Number(row.organization_id) : null,
  currency: row?.currency ? normalizeSponsorCurrencyCode(row.currency) : "NGN",
  amount_total: Number(row?.amount_total || 0),
  payout_minimum: row?.payout_minimum === null || row?.payout_minimum === undefined ? null : Number(row.payout_minimum || 0),
  status: row?.status ? String(row.status).trim() || null : null,
  bank_code: row?.bank_code ? String(row.bank_code).trim() || null : null,
  bank_name: row?.bank_name ? String(row.bank_name).trim() || null : null,
  account_number: row?.account_number ? String(row.account_number).trim() || null : null,
  account_number_masked: row?.account_number_masked ? String(row.account_number_masked).trim() || null : null,
  account_name: row?.account_name ? String(row.account_name).trim() || null : null,
  earning_keys: Array.isArray(row?.earning_keys) ? row.earning_keys.map((item: any) => String(item || "").trim()).filter(Boolean) : [],
  earning_count: Number(row?.earning_count || 0),
  project_ids: normalizePositiveIntList(row?.project_ids),
  review_notes: row?.review_notes ? String(row.review_notes).trim() || null : null,
  reviewed_by: row?.reviewed_by ? String(row.reviewed_by).trim() || null : null,
  reviewed_at: row?.reviewed_at ? String(row.reviewed_at) : null,
  settlement_channel: row?.settlement_channel ? String(row.settlement_channel).trim() || null : null,
  settlement_reference: row?.settlement_reference ? String(row.settlement_reference).trim() || null : null,
  transfer_reference: row?.transfer_reference ? String(row.transfer_reference).trim() || null : null,
  transfer_id: row?.transfer_id ? Number(row.transfer_id) : null,
  transfer_status: row?.transfer_status ? String(row.transfer_status).trim() || null : null,
  paid_at: row?.paid_at ? String(row.paid_at) : null,
  created_at: row?.created_at ? String(row.created_at) : null,
  updated_at: row?.updated_at ? String(row.updated_at) : null,
});

const normalizeSponsorAgentProjectRateRecord = (row: any): SponsorAgentProjectRateRecord => ({
  project_id: Number(row?.project_id || 0),
  project_name: row?.project_name ? String(row.project_name).trim() || null : null,
  location_text: row?.location_text ? String(row.location_text).trim() || null : null,
  currency: row?.currency ? normalizeSponsorCurrencyCode(row.currency) : "NGN",
  planting_fee: row?.planting_fee === null || row?.planting_fee === undefined ? null : Number(row.planting_fee || 0),
  maintenance_fee: row?.maintenance_fee === null || row?.maintenance_fee === undefined ? null : Number(row.maintenance_fee || 0),
});

const normalizeSponsorAgentEarningRecord = (row: any): SponsorAgentEarningRecord => ({
  earning_key: String(row?.earning_key || "").trim(),
  work_type: row?.work_type ? String(row.work_type).trim() || null : null,
  project_id: row?.project_id ? Number(row.project_id) : null,
  project_name: row?.project_name ? String(row.project_name).trim() || null : null,
  currency: row?.currency ? normalizeSponsorCurrencyCode(row.currency) : "NGN",
  amount: row?.amount === null || row?.amount === undefined ? null : Number(row.amount || 0),
  tree_id: row?.tree_id ? Number(row.tree_id) : null,
  task_id: row?.task_id ? Number(row.task_id) : null,
  unit_id: row?.unit_id ? Number(row.unit_id) : null,
  order_id: row?.order_id ? Number(row.order_id) : null,
  order_uid: row?.order_uid ? String(row.order_uid).trim() || null : null,
  project_tree_no: row?.project_tree_no ? Number(row.project_tree_no) : null,
  tree_label: row?.tree_label ? String(row.tree_label).trim() || null : null,
  species: row?.species ? String(row.species).trim() || null : null,
  actor_name: row?.actor_name ? String(row.actor_name).trim() || null : null,
  task_label: row?.task_label ? String(row.task_label).trim() || null : null,
  earned_at: row?.earned_at ? String(row.earned_at) : null,
  sponsor_name: row?.sponsor_name ? String(row.sponsor_name).trim() || null : null,
  sponsor_organization_name: row?.sponsor_organization_name ? String(row.sponsor_organization_name).trim() || null : null,
  payout_status: row?.payout_status ? String(row.payout_status).trim() || null : null,
  payout_request_id: row?.payout_request_id ? Number(row.payout_request_id) : null,
  payout_request_uid: row?.payout_request_uid ? String(row.payout_request_uid).trim() || null : null,
  payout_requested_at: row?.payout_requested_at ? String(row.payout_requested_at) : null,
  payout_paid_at: row?.payout_paid_at ? String(row.payout_paid_at) : null,
});

const normalizeSponsorAgentDashboardRecord = (row: any): SponsorAgentDashboardRecord => ({
  eligible: Boolean(row?.eligible),
  minimum_payout_amount:
    row?.minimum_payout_amount === null || row?.minimum_payout_amount === undefined ? null : Number(row.minimum_payout_amount || 0),
  currency: row?.currency ? normalizeSponsorCurrencyCode(row.currency) : "NGN",
  auto_payout_available: Boolean(row?.auto_payout_available),
  user:
    row?.user && typeof row.user === "object"
      ? {
          id: Number(row.user.id || 0),
          full_name: row.user.full_name ? String(row.user.full_name).trim() || null : null,
          user_uid: row.user.user_uid ? String(row.user.user_uid).trim() || null : null,
          organization_id: row.user.organization_id ? Number(row.user.organization_id) : null,
          organization_name: row.user.organization_name ? String(row.user.organization_name).trim() || null : null,
        }
      : null,
  bank_account: row?.bank_account ? normalizeSponsorAgentBankAccountRecord(row.bank_account) : null,
  projects: Array.isArray(row?.projects) ? row.projects.map((item: any) => normalizeSponsorAgentProjectRateRecord(item)) : [],
  summary: row?.summary
    ? {
        eligible_project_count: Number(row.summary.eligible_project_count || 0),
        planting_count: Number(row.summary.planting_count || 0),
        maintenance_count: Number(row.summary.maintenance_count || 0),
        total_earnings_amount: Number(row.summary.total_earnings_amount || 0),
        available_amount: Number(row.summary.available_amount || 0),
        requested_amount: Number(row.summary.requested_amount || 0),
        paid_amount: Number(row.summary.paid_amount || 0),
        pending_request_count: Number(row.summary.pending_request_count || 0),
        paid_request_count: Number(row.summary.paid_request_count || 0),
        payout_eligible: Boolean(row.summary.payout_eligible),
        bank_verified: Boolean(row.summary.bank_verified),
      }
    : null,
  project_summaries: Array.isArray(row?.project_summaries)
    ? row.project_summaries.map((item: any) => ({
        project_id: Number(item?.project_id || 0),
        project_name: item?.project_name ? String(item.project_name).trim() || null : null,
        currency: item?.currency ? normalizeSponsorCurrencyCode(item.currency) : "NGN",
        available_amount: Number(item?.available_amount || 0),
        requested_amount: Number(item?.requested_amount || 0),
        paid_amount: Number(item?.paid_amount || 0),
        planting_count: Number(item?.planting_count || 0),
        maintenance_count: Number(item?.maintenance_count || 0),
      }))
    : [],
  earnings: Array.isArray(row?.earnings) ? row.earnings.map((item: any) => normalizeSponsorAgentEarningRecord(item)) : [],
  requests: Array.isArray(row?.requests) ? row.requests.map((item: any) => normalizeSponsorAgentPayoutRequestRecord(item)) : [],
});

const normalizeSponsorAgentPayoutBoard = (row: any): SponsorAgentPayoutBoard => ({
  project_id: Number(row?.project_id || 0),
  project_name: row?.project_name ? String(row.project_name).trim() || null : null,
  organization_id: Number(row?.organization_id || 0),
  minimum_payout_amount:
    row?.minimum_payout_amount === null || row?.minimum_payout_amount === undefined ? null : Number(row.minimum_payout_amount || 0),
  currency: row?.currency ? normalizeSponsorCurrencyCode(row.currency) : "NGN",
  auto_payout_available: Boolean(row?.auto_payout_available),
  agents: Array.isArray(row?.agents) ? row.agents.map((item: any) => normalizeSponsorAgentDashboardRecord(item)) : [],
  requests: Array.isArray(row?.requests) ? row.requests.map((item: any) => normalizeSponsorAgentPayoutRequestRecord(item)) : [],
  summary: row?.summary
    ? {
        agent_count: Number(row.summary.agent_count || 0),
        request_count: Number(row.summary.request_count || 0),
        pending_request_count: Number(row.summary.pending_request_count || 0),
        available_amount: Number(row.summary.available_amount || 0),
        requested_amount: Number(row.summary.requested_amount || 0),
        paid_amount: Number(row.summary.paid_amount || 0),
      }
    : null,
});

const formatCurrencyAmount = (amount: number | null | undefined, currency?: string | null) => {
  const safeAmount = Number(amount || 0);
  const safeCurrency = normalizeSponsorCurrencyCode(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 0,
    }).format(safeAmount);
  } catch {
    return `${safeCurrency} ${safeAmount.toLocaleString()}`;
  }
};

const normalizeSponsorCurrencyCode = (value?: string | null) => {
  const lettersOnly = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  return lettersOnly.length === 3 ? lettersOnly : "NGN";
};

const getProjectSponsorPriceEntries = (project?: Pick<Project, "sponsor_price_per_tree_ngn" | "sponsor_price_per_tree_usd" | "sponsor_price_per_tree" | "sponsor_currency"> | null) => {
  const entries: Array<{ currency: string; amount: number }> = [];
  const push = (currency: string | null | undefined, amount: number | null | undefined) => {
    const code = normalizeSponsorCurrencyCode(currency);
    const numeric = Number(amount || 0);
    if (!Number.isFinite(numeric) || numeric <= 0 || entries.some((item) => item.currency === code)) {
      return;
    }
    entries.push({ currency: code, amount: numeric });
  };
  push("NGN", project?.sponsor_price_per_tree_ngn);
  push("USD", project?.sponsor_price_per_tree_usd);
  if (entries.length === 0) {
    push(project?.sponsor_currency || "NGN", project?.sponsor_price_per_tree);
  }
  return entries;
};

const formatProjectSponsorPriceChoices = (project?: Pick<Project, "sponsor_price_per_tree_ngn" | "sponsor_price_per_tree_usd" | "sponsor_price_per_tree" | "sponsor_currency"> | null) => {
  const entries = getProjectSponsorPriceEntries(project);
  if (entries.length === 0) return "Pricing not set";
  return entries.map((entry) => `${formatCurrencyAmount(entry.amount, entry.currency)} / tree`).join(" · ");
};

const formatCurrencyBreakdownMap = (value?: Record<string, number> | null) => {
  const entries = Object.entries(value || {})
    .map(([currency, amount]) => ({
      currency: normalizeSponsorCurrencyCode(currency),
      amount: Number(amount || 0),
    }))
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
    .sort((a, b) => a.currency.localeCompare(b.currency));
  if (entries.length === 0) return formatCurrencyAmount(0, "NGN");
  return entries.map((entry) => formatCurrencyAmount(entry.amount, entry.currency)).join(" · ");
};

const getSponsorshipPaymentOutcomeGroup = (paymentStatus?: string | null) => {
  const normalized = normalizeName(paymentStatus);
  if (normalized === "verified") return "successful" as const;
  if (normalized === "rejected" || normalized === "refunded") return "issue" as const;
  return "awaiting" as const;
};

const getTaskPhotoUrls = (task: Partial<WorkTask> | null | undefined): string[] => {
  const urls = normalizePhotoList((task as any)?.photo_urls);
  const primary = String((task as any)?.photo_url || "").trim();
  if (primary && !urls.includes(primary)) urls.push(primary);
  return urls;
};

const renderActionIcon = (form: WorkForm) => {
  switch (form) {
    case "super_admin":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3l2.2 3.5 4.1.9-2.8 3 0.5 4.2-4-1.7-4 1.7 0.5-4.2-2.8-3 4.1-.9L12 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 20h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "overview":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 19h16M7 16V9M12 16V5M17 16v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "live_table":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M6.4 16.8c1-2.4 2.6-3.8 4.9-4.1 1.3-.2 2.4-.9 3-2.1.5 1.1 1.3 1.8 2.6 2.1 1.1.2 2.2.2 3.1.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M4.7 12.7h3.1l1.4-2.4 1.8 4.8 1.5-3h2.1l1.1-1.9 1.2 2.5H20" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17.5 6c-1.8.2-3.2 1-4.2 2.3 1.5.2 2.8-.1 4-.9 1.2-.8 1.9-2 2.2-3.5-1 .2-1.7.5-2 .7z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M13.8 8.6c-.5-1.1-1.4-1.8-2.8-2.2.2 1.2.6 2 1.4 2.7.4.4.9.7 1.4.9" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="8" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="16.5" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M3.5 19c1-2.6 3.3-4 6.5-4s5.5 1.4 6.5 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "sponsor_payouts":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 7.5h16v9H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M4 11h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 15h2.8M15.2 15H16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8.2 4.8h7.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "add_user":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="10" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M4 19c1-2.5 3-4 6-4s5 1.5 6 4M18 8v6M15 11h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "map_view":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4.3 6.6 9.2 4.5l5.1 2 5.4-2.1v13.1l-5.4 2.1-5.1-2-4.9 2.1z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path d="M9.2 4.5v13M14.3 6.5v13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path
            d="M16.8 5.3c-2.35 0-4 1.72-4 3.92 0 2.91 4 6.78 4 6.78s4-3.87 4-6.78c0-2.2-1.65-3.92-4-3.92z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <circle cx="16.8" cy="9.25" r="1.18" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "remote_monitoring":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M10.4 10.1 13.1 7.4 16.6 10.9 13.9 13.6zM8.2 7.9l2 2-3.1 3.1-2-2zM13.8 13.5l2 2-3.1 3.1-2-2z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d="M11.2 12.8 6.1 17.9M12.8 11.2 17.9 6.1M18.9 5.1l.9-.9M4.2 19.8l.9-.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M6.8 16.1c1 .1 1.9.5 2.6 1.2.7.7 1.1 1.6 1.2 2.6M5 17.9c1.5.2 2.8.8 3.9 1.9 1.1 1.1 1.7 2.4 1.9 3.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "assign_work":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5.5 9.2 12 5.7l6.5 3.5-6.5 3.5zM5.5 9.2v6.4L12 19l6.5-3.4V9.2" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
          <path d="M12 12.7V19" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
          <path d="M12 8.6c0-1.4 1-2.6 2.4-2.8-.2 1.5-.8 2.7-1.8 3.7-.9.9-2.1 1.5-3.5 1.7.3-1.5 1-2.8 2.1-3.8.2-.2.5-.4.8-.6z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M12 10.4c-.7-1.5-1.9-2.4-3.6-2.8.2 1.3.7 2.4 1.6 3.2.6.6 1.3 1 2 1.3" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case "assign_task":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8.2 14.8 5.4 17.6M9.7 13.3 15.7 7.3a1.9 1.9 0 1 1 2.7 2.7l-6 6-4.2 1.5z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M12.5 6.2c.4-.8 1.1-1.5 2-1.9-.1 1.4-.6 2.6-1.5 3.5-.8.8-1.8 1.3-3.1 1.5.2-1.4.8-2.5 1.8-3.4.3-.3.5-.5.8-.7z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M17.9 14.7a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zm0-1.7v1M17.9 19.1v1M15.6 16.9h1M19.2 16.9h1M16.3 15.3l.7.7M18.8 18l.7.7M19.5 15.3l-.7.7M17 18l-.7.7" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "review_queue":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 4h12v16H6zM9 9h6M9 13h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 17l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "verra_reports":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 3h9l3 3v15H6zM15 3v3h3M9 10h6M9 14h6M9 18h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "custodian_hub":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 4.6c2.5 2.1 4.9 3.2 7.2 3.5 0 5.7-2.3 9.6-7.2 11.8-4.9-2.2-7.2-6.1-7.2-11.8 2.3-.3 4.7-1.4 7.2-3.5z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
          <path d="M12.2 15.6c1.7-1 2.7-2.5 3.1-4.5-1.7.2-3 .8-4 1.8-.8.8-1.3 1.8-1.5 3 .9-.1 1.7-.3 2.4-.8z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M11.4 12c-.5-1.1-1.4-1.9-2.7-2.3.2 1.2.7 2.1 1.4 2.8.4.4.9.7 1.4.9" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case "farmer_live":
      return renderActionIcon("live_table");
    case "field_capture_assign":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 4.5h12v15H6z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
          <path d="M9 9h6M9 12.5h6M12 16.5v-4" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
          <path d="M10.2 14.7 12 16.5l1.8-1.8" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "support_visit_assign":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="9" cy="8" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.45" />
          <path d="M4.2 18c.9-2.4 2.8-3.7 5.8-3.7S14.9 15.6 15.8 18" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
          <path d="M16.2 7.4h4.3M18.35 5.25v4.3" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
        </svg>
      );
    case "existing_tree_intake":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6.2 14.2c-1.2-.5-2.1-1.6-2.1-3 0-1.9 1.5-3.4 3.5-3.4.4 0 .8.1 1.1.2.9-2.1 3-3.5 5.4-3.5 3.1 0 5.7 2.4 5.9 5.5 1.4.4 2.4 1.7 2.4 3.2 0 1.9-1.5 3.4-3.5 3.4H6.2z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M12 10.2v7.3M12 10.2c-.8 2-2.1 3.3-4 3.9M12 10.2c.8 2 2.1 3.3 4 3.9M8.8 17.5h6.4" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "sponsors":
      return renderActionIcon("users");
    case "sponsorship_orders":
      return renderActionIcon("review_queue");
    case "share_impact":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
};

type SpeciesDailySurvivalPoint = {
  day: number;
  date: string;
  label: string;
  value: number;
  eligible: number;
  survived: number;
  phase: string;
};

type SpeciesDailySurvivalSeries = {
  species: string;
  trees: number;
  startDate: string;
  color: string;
  points: SpeciesDailySurvivalPoint[];
};

type OverviewDonutSegment = {
  label: string;
  value: number;
  color: string;
};

type OverviewSpeciesBarRow = {
  species: string;
  count: number;
  color: string;
};

type OverviewMonthlySurvivalRow = {
  key: string;
  label: string;
  planted: number;
  healthy: number;
  nonHealthy: number;
  healthyRate: number;
};

const OVERVIEW_SPECIES_COLORS = [
  "#15803d",
  "#0ea5e9",
  "#ea580c",
  "#7c3aed",
  "#e11d48",
  "#0891b2",
  "#65a30d",
  "#b45309",
  "#334155",
  "#2563eb",
];

const OverviewDonutCard = ({
  title,
  totalLabel,
  context,
  segments,
}: {
  title: string;
  totalLabel: string;
  context: string;
  segments: OverviewDonutSegment[];
}) => {
  const normalizedSegments = segments
    .map((segment) => ({
      ...segment,
      value: Number.isFinite(Number(segment.value)) ? Math.max(Number(segment.value), 0) : 0,
    }))
    .filter((segment) => segment.value > 0);
  const total = normalizedSegments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 38;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  let arcOffset = 0;

  return (
    <div className="green-work-overview-chart-card">
      <div className="green-work-overview-bar-head">
        <h5>{title}</h5>
        <span>{total} {totalLabel}</span>
      </div>
      {total <= 0 ? (
        <p className="green-work-note">No data yet for this scope.</p>
      ) : (
        <div className="green-work-overview-donut-layout">
          <svg className="green-work-overview-donut-svg" viewBox="0 0 120 120" role="img" aria-label={title}>
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#e3ece6" strokeWidth={strokeWidth} />
            {normalizedSegments.map((segment) => {
              const dash = (segment.value / total) * circumference;
              const node = (
                <circle
                  key={`overview-donut-${title}-${segment.label}`}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="butt"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-arcOffset}
                  transform="rotate(-90 60 60)"
                />
              );
              arcOffset += dash;
              return node;
            })}
            <text x="60" y="56" textAnchor="middle" className="green-work-overview-donut-total">
              {Math.round(total)}
            </text>
            <text x="60" y="72" textAnchor="middle" className="green-work-overview-donut-total-label">
              {totalLabel}
            </text>
          </svg>
          <div className="green-work-overview-donut-legend">
            {normalizedSegments.map((segment) => {
              const pct = total > 0 ? (segment.value / total) * 100 : 0;
              return (
                <div key={`overview-donut-legend-${title}-${segment.label}`} className="green-work-overview-donut-legend-row">
                  <span className="green-work-overview-donut-dot" style={{ backgroundColor: segment.color }} />
                  <span className="green-work-overview-donut-label">{segment.label}</span>
                  <span className="green-work-overview-donut-value">
                    {segment.value} ({pct.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="green-work-chart-context">{context}</p>
    </div>
  );
};

const OverviewSpeciesBarCard = ({
  title,
  context,
  rows,
}: {
  title: string;
  context: string;
  rows: OverviewSpeciesBarRow[];
}) => {
  const visibleRows = rows.slice(0, 10);
  const maxCount = Math.max(1, ...visibleRows.map((row) => Number(row.count || 0)));

  return (
    <div className="green-work-overview-chart-card green-work-overview-species-card">
      <div className="green-work-overview-bar-head">
        <h5>{title}</h5>
        <span>{rows.length} species</span>
      </div>
      {visibleRows.length === 0 ? (
        <p className="green-work-note">No planted trees with species labels yet.</p>
      ) : (
        <div className="green-work-overview-species-bars">
          {visibleRows.map((row) => {
            const widthPct = Math.max(Math.min((Number(row.count || 0) / maxCount) * 100, 100), 0);
            return (
              <div key={`overview-species-bar-${row.species}`} className="green-work-overview-species-row">
                <span className="green-work-overview-species-name" title={row.species}>
                  {row.species}
                </span>
                <div className="green-work-overview-species-track">
                  <span style={{ width: `${widthPct}%`, backgroundColor: row.color }} />
                </div>
                <span className="green-work-overview-species-count">{row.count}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="green-work-chart-context">{context}</p>
    </div>
  );
};

const OverviewMonthlySurvivalCard = ({
  title,
  context,
  rows,
  emptyMessage,
}: {
  title: string;
  context: string;
  rows: OverviewMonthlySurvivalRow[];
  emptyMessage: string;
}) => {
  const [hoveredRow, setHoveredRow] = useState<OverviewMonthlySurvivalRow | null>(null);
  const [selectedRow, setSelectedRow] = useState<OverviewMonthlySurvivalRow | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; row: OverviewMonthlySurvivalRow } | null>(null);
  const hasData = rows.some((row) => row.planted > 0);
  const width = 620;
  const height = 242;
  const left = 42;
  const right = 16;
  const top = 14;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxPlanted = Math.max(1, ...rows.map((row) => Number(row.planted || 0)));
  const yMax = maxPlanted <= 5 ? 5 : Math.ceil(maxPlanted / 5) * 5;
  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, index) => {
    if (index === 0) return 0;
    if (index === tickCount) return yMax;
    return Math.round((yMax / tickCount) * index);
  });
  const xForIndex = (index: number) => {
    if (rows.length <= 1) return left + chartWidth / 2;
    return left + (index / Math.max(rows.length - 1, 1)) * chartWidth;
  };
  const yForValue = (value: number) => {
    const clamped = Math.max(0, Math.min(value, yMax));
    return top + (1 - clamped / Math.max(yMax, 1)) * chartHeight;
  };
  const barWidth = Math.max(10, Math.min(26, chartWidth / Math.max(rows.length * 2.2, 1)));
  const healthyRateAreaPath = rows
    .map((row, index) => {
      const x = xForIndex(index);
      const y = yForValue((row.healthyRate / 100) * yMax);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  const baselineY = top + chartHeight;
  const areaPath = hasData && rows.length > 0
    ? `${healthyRateAreaPath} L${xForIndex(rows.length - 1)},${baselineY} L${xForIndex(0)},${baselineY} Z`
    : "";
  const linePath = hasData ? healthyRateAreaPath : "";
  const latestWithData = [...rows].reverse().find((row) => row.planted > 0) || null;
  const avgRate =
    rows.reduce((sum, row) => sum + row.healthyRate, 0) / Math.max(rows.length, 1);
  const activeRow = hoveredRow || selectedRow || latestWithData;
  const setTooltipForRow = (row: OverviewMonthlySurvivalRow, rowIndex: number) => {
    const x = xForIndex(rowIndex);
    const y = yForValue((row.healthyRate / 100) * yMax);
    setTooltip({ x, y, row });
  };

  return (
    <div className="green-work-trend-card green-work-overview-monthly-card">
      <div className="green-work-overview-bar-head">
        <h5>{title}</h5>
        <span>{rows.length} months</span>
      </div>
      {!hasData ? (
        <p className="green-work-note">{emptyMessage}</p>
      ) : (
        <>
          <div className="green-work-chart-svg-wrap">
            <svg
              className="green-work-overview-monthly-svg"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={title}
            >
            {yTicks.map((tick) => {
              const y = yForValue(tick);
              return (
                <g key={`overview-monthly-y-${tick}`}>
                  <line x1={left} y1={y} x2={left + chartWidth} y2={y} stroke="#d9e4dd" strokeWidth="1" />
                  <text x={left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#2f5545">
                    {tick}
                  </text>
                </g>
              );
            })}
            {areaPath && (
              <path d={areaPath} fill="rgba(109, 202, 78, 0.22)" stroke="none" />
            )}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#68ba49"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {rows.map((row, index) => {
              const x = xForIndex(index);
              const totalHeight = row.planted > 0 ? Math.max(baselineY - yForValue(row.planted), 1) : 0;
              const healthyHeight = row.healthy > 0 ? Math.max(baselineY - yForValue(row.healthy), 1) : 0;
              const selectionHitWidth = Math.max(barWidth * 1.4, chartWidth / Math.max(rows.length * 1.35, 1));
              const isSelected = selectedRow?.key === row.key;
              return (
                <g key={`overview-monthly-bar-${row.key}`}>
                  <rect
                    x={x - selectionHitWidth / 2}
                    y={top}
                    width={selectionHitWidth}
                    height={chartHeight}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => {
                      setHoveredRow(row);
                      setTooltipForRow(row, index);
                    }}
                    onMouseLeave={() => {
                      setHoveredRow(null);
                      setTooltip(null);
                    }}
                    onClick={() =>
                      setSelectedRow((prev) => {
                        setTooltipForRow(row, index);
                        if (prev?.key === row.key) return null;
                        return row;
                      })
                    }
                  />
                  {totalHeight > 0 && (
                    <rect
                      x={x - barWidth / 2}
                      y={baselineY - totalHeight}
                      width={barWidth}
                      height={totalHeight}
                      fill="#d3dad4"
                      rx="1.6"
                    />
                  )}
                  {healthyHeight > 0 && (
                    <rect
                      x={x - barWidth / 2}
                      y={baselineY - healthyHeight}
                      width={barWidth}
                      height={healthyHeight}
                      fill="#71c742"
                      rx="1.6"
                      opacity={isSelected ? 1 : 0.94}
                    />
                  )}
                  <text x={x} y={height - 16} textAnchor="middle" fontSize="10" fill="#2f5545">
                    {row.label}
                  </text>
                </g>
              );
            })}
            {rows.map((row, index) => {
              const x = xForIndex(index);
              const y = yForValue((row.healthyRate / 100) * yMax);
              const isSelected = selectedRow?.key === row.key;
              return (
                <circle
                  key={`overview-monthly-dot-${row.key}`}
                  cx={x}
                  cy={y}
                  r={isSelected ? "3.4" : "2.8"}
                  fill="#ffffff"
                  stroke="#4eac39"
                  strokeWidth={isSelected ? "1.8" : "1.2"}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => {
                    setHoveredRow(row);
                    setTooltipForRow(row, index);
                  }}
                  onMouseLeave={() => {
                    setHoveredRow(null);
                    setTooltip(null);
                  }}
                  onClick={() =>
                    setSelectedRow((prev) => {
                      setTooltipForRow(row, index);
                      if (prev?.key === row.key) return null;
                      return row;
                    })
                  }
                />
              );
            })}
            </svg>
            {tooltip && (
              <div
                className="green-work-chart-tooltip"
                style={{
                  left: `${(tooltip.x / width) * 100}%`,
                  top: `${(tooltip.y / height) * 100}%`,
                }}
              >
                <strong>{tooltip.row.label}</strong>
                <span>
                  Healthy: {tooltip.row.healthy}/{tooltip.row.planted} ({tooltip.row.healthyRate.toFixed(1)}%)
                </span>
                <span>Non-healthy: {tooltip.row.nonHealthy}</span>
              </div>
            )}
          </div>
          <div className="green-work-overview-monthly-legend">
            <span><i className="is-healthy" />Healthy now</span>
            <span><i className="is-total" />Planted cohort</span>
            <span><i className="is-share" />Healthy share trend</span>
          </div>
          {activeRow && (
            <div className="green-work-species-hover">
              <span>
                {selectedRow ? "Pinned" : "Point"} {activeRow.label}: {activeRow.healthy}/{activeRow.planted} healthy (
                {activeRow.healthyRate.toFixed(1)}%) | Non-healthy: {activeRow.nonHealthy}. Average monthly healthy share:{" "}
                {avgRate.toFixed(1)}%.
              </span>
            </div>
          )}
        </>
      )}
      <p className="green-work-chart-context">{context}</p>
    </div>
  );
};

const SpeciesDailySurvivalChart = ({
  title,
  context,
  series,
  emptyMessage,
}: {
  title: string;
  context: string;
  series: SpeciesDailySurvivalSeries[];
  emptyMessage?: string;
}) => {
  const [hovered, setHovered] = useState<{
    species: string;
    trees: number;
    point: SpeciesDailySurvivalPoint;
    color: string;
  } | null>(null);
  const [selected, setSelected] = useState<{
    species: string;
    trees: number;
    point: SpeciesDailySurvivalPoint;
    color: string;
  } | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    species: string;
    color: string;
    point: SpeciesDailySurvivalPoint;
    trees: number;
  } | null>(null);
  const width = 620;
  const height = 246;
  const left = 48;
  const right = 16;
  const top = 18;
  const bottom = 44;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const yTicks = [0, 20, 40, 60, 80, 100];
  const maxDay = Math.max(0, ...series.flatMap((item) => item.points.map((point) => Number(point.day || 0))));
  const dayDomainMax = Math.max(maxDay, 30);
  const markerTicks = Array.from(
    new Set(dayDomainMax <= 30 ? [0, 7, 14, 21, 30] : [0, 30, 60, 90, 120, 150, 180, maxDay, dayDomainMax]),
  )
    .filter((day) => Number.isFinite(day) && day >= 0 && day <= dayDomainMax)
    .sort((a, b) => a - b);
  const overlapOffsets = useMemo(() => {
    const grouped = new Map<string, string[]>();
    series.forEach((item) => {
      const signature = item.points.map((point) => `${point.day}:${point.value.toFixed(1)}`).join("|");
      const key = signature || `single-${item.species}`;
      const members = grouped.get(key) || [];
      members.push(item.species);
      grouped.set(key, members);
    });
    const offsets = new Map<string, number>();
    grouped.forEach((members) => {
      const sorted = [...members].sort((a, b) => a.localeCompare(b));
      const center = (sorted.length - 1) / 2;
      sorted.forEach((speciesName, index) => {
        const offset = sorted.length > 1 ? (index - center) * 0.8 : 0;
        offsets.set(speciesName, offset);
      });
    });
    return offsets;
  }, [series]);
  const displayValue = (speciesName: string, rawValue: number) => {
    const offset = Number(overlapOffsets.get(speciesName) || 0);
    return Math.max(Math.min(rawValue + offset, 100), 0);
  };
  const xForDay = (day: number) => {
    const safeDay = Math.min(Math.max(day, 0), Math.max(dayDomainMax, 1));
    return left + (safeDay / Math.max(dayDomainMax, 1)) * chartWidth;
  };
  const yForValue = (value: number) => top + (1 - value / 100) * chartHeight;
  const activeDetail = hovered || selected;

  return (
    <div className="green-work-trend-card green-work-species-chart-card">
      <div className="green-work-overview-bar-head">
        <h5>{title}</h5>
        <span>{series.length} species</span>
      </div>
      {series.length === 0 ? (
        <p className="green-work-note">{emptyMessage || "No species with planting dates yet."}</p>
      ) : (
        <>
          <div className="green-work-chart-svg-wrap">
            <svg
              className="green-work-species-svg"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={title}
            >
            {yTicks.map((tick) => {
              const y = yForValue(tick);
              return (
                <g key={`species-y-${tick}`}>
                  <line x1={left} y1={y} x2={left + chartWidth} y2={y} stroke="#d6e2db" strokeWidth="1" />
                  <text x={left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#2f5545">
                    {tick}
                  </text>
                </g>
              );
            })}
            {markerTicks.map((day) => {
              const x = xForDay(day);
              return (
                <g key={`species-x-${day}`}>
                  <line x1={x} y1={top} x2={x} y2={top + chartHeight} stroke="#e4ede8" strokeWidth="1" />
                  <text x={x} y={height - 16} textAnchor="middle" fontSize="10" fill="#2f5545">
                    d{day}
                  </text>
                </g>
              );
            })}
            {series.map((item) => {
              const visible = item.points.filter((point) => Number.isFinite(point.value));
              const path = visible
                .map((point, idx) => {
                  const x = xForDay(point.day);
                  const y = yForValue(displayValue(item.species, Number(point.value)));
                  return `${idx === 0 ? "M" : "L"}${x},${y}`;
                })
                .join(" ");
              const markerStep = dayDomainMax > 180 ? Math.max(Math.ceil(dayDomainMax / 90), 1) : 7;
              const markerDays = new Set<number>([0, 30, 90, 180, maxDay, dayDomainMax]);
              const markers = visible.filter((point, idx) => {
                const lastIdx = visible.length - 1;
                if (idx === 0 || idx === lastIdx) return true;
                if (markerDays.has(point.day)) return true;
                return point.day % markerStep === 0;
              });
              return (
                <g key={`species-line-${item.species}`}>
                  {visible.length >= 2 && (
                    <path
                      d={path}
                      fill="none"
                      stroke={item.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.9}
                    />
                  )}
                  {markers.map((point) => {
                    const x = xForDay(point.day);
                    const y = yForValue(displayValue(item.species, Number(point.value)));
                    return (
                      <circle
                        key={`species-dot-${item.species}-${point.day}-${point.date}`}
                        cx={x}
                        cy={y}
                        r={selected?.species === item.species && selected?.point.day === point.day ? "3.5" : "2.8"}
                        fill="#ffffff"
                        stroke={item.color}
                        strokeWidth="1.6"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => {
                          setHovered({
                            species: item.species,
                            trees: item.trees,
                            point,
                            color: item.color,
                          });
                          setTooltip({
                            x,
                            y,
                            species: item.species,
                            color: item.color,
                            point,
                            trees: item.trees,
                          });
                        }}
                        onMouseLeave={() => {
                          setHovered(null);
                          setTooltip(null);
                        }}
                        onClick={() =>
                          setSelected((prev) => {
                            if (
                              prev &&
                              prev.species === item.species &&
                              prev.point.day === point.day &&
                              prev.point.date === point.date
                            ) {
                              return null;
                            }
                            return {
                              species: item.species,
                              trees: item.trees,
                              point,
                              color: item.color,
                            };
                          })
                        }
                        onPointerDown={() =>
                          setTooltip({
                            x,
                            y,
                            species: item.species,
                            color: item.color,
                            point,
                            trees: item.trees,
                          })
                        }
                      />
                    );
                  })}
                </g>
              );
            })}
            </svg>
            {tooltip && (
              <div
                className="green-work-chart-tooltip"
                style={{
                  left: `${(tooltip.x / width) * 100}%`,
                  top: `${(tooltip.y / height) * 100}%`,
                  borderColor: tooltip.color,
                }}
              >
                <strong style={{ color: tooltip.color }}>{tooltip.species}</strong>
                <span>
                  {tooltip.point.label} ({tooltip.point.date}): {tooltip.point.value.toFixed(1)}%
                </span>
                <span>
                  Cohort {tooltip.point.survived}/{tooltip.point.eligible} | Trees {tooltip.trees}
                </span>
              </div>
            )}
          </div>
          <div className="green-work-species-legend">
            {series.map((item) => (
              <span key={`species-chip-${item.species}`} className="green-work-species-chip">
                <span className="green-work-species-chip-dot" style={{ backgroundColor: item.color }} />
                {item.species} ({item.trees})
              </span>
            ))}
          </div>
          <div className="green-work-species-hover">
            {activeDetail ? (
              <span>
                <strong style={{ color: activeDetail.color }}>{activeDetail.species}</strong> | {activeDetail.point.label} (
                {activeDetail.point.date}): {activeDetail.point.value.toFixed(1)}% | Cohort {activeDetail.point.survived}/
                {activeDetail.point.eligible} | Trees {activeDetail.trees} | {activeDetail.point.phase}
              </span>
            ) : (
              <span>Hover or click a point to view daily species survival details.</span>
            )}
          </div>
        </>
      )}
      <p className="green-work-chart-context">{context}</p>
    </div>
  );
};

const SI_COPY_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

type ImpactComment = {
  id: number;
  commenter_name: string;
  commenter_rank?: string | null;
  commenter_org?: string | null;
  project_name?: string | null;
  comment_body: string;
  created_at?: string | null;
};

function ShareImpactPanel({
  orgSlug,
  orgProjects,
  shareProjectId,
  onProjectChange,
  workflowProfile,
}: {
  orgSlug: string | null;
  orgProjects: Project[];
  shareProjectId: string;
  onProjectChange: (id: string) => void;
  workflowProfile: WorkflowProfile;
}) {
  const [orgCopied, setOrgCopied] = useState(false);
  const [projCopied, setProjCopied] = useState(false);
  const [comments, setComments] = useState<ImpactComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);

  useEffect(() => {
    if (!orgSlug) return;
    setCommentsLoading(true);
    api.get<ImpactComment[]>(`/green/public/impact/${encodeURIComponent(orgSlug)}/comments`)
      .then((r) => setComments(r.data))
      .catch(() => {})
      .finally(() => { setCommentsLoading(false); setCommentsLoaded(true); });
  }, [orgSlug]);

  const orgImpactUrl = orgSlug ? `https://landcheck.online/impact/${encodeURIComponent(orgSlug)}` : null;
  const selectedProject = orgProjects.find((p) => String(p.id) === shareProjectId) || null;
  const projImpactUrl = orgSlug && shareProjectId
    ? `https://landcheck.online/impact/${encodeURIComponent(orgSlug)}?project=${encodeURIComponent(shareProjectId)}`
    : null;

  const copyToClipboard = (url: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
    setCopied(true);
    toast.success("Impact link copied to clipboard!", { duration: 3000 });
    setTimeout(() => setCopied(false), 2200);
  };

  const modeLabel = workflowProfile === "agric" ? "Agric Programme" : workflowProfile === "relief_recovery" ? "Relief Programme" : "Tree Planting Programme";
  const entityPl = workflowProfile === "agric" ? "farms" : workflowProfile === "relief_recovery" ? "sites" : "trees";

  return (
    <div className="green-work-card" style={{ maxWidth: 760 }}>
      <h3 style={{ marginBottom: 4 }}>🔗 Share Impact Page</h3>
      <p className="green-work-note" style={{ marginTop: 0 }}>
        Share a public, donor-ready impact page showing your verified {modeLabel} data — supervisor-approved records, GPS maps, evidence photos, and field activities.
      </p>

      {!orgSlug ? (
        <div className="green-work-note" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, padding: "12px 16px", color: "#92400e" }}>
          ⚠️ This organisation does not have a public impact page slug configured. Contact LandCheck support to set one up before sharing with donors.
        </div>
      ) : (
        <>
          {/* ─── Org-wide link ─── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#0c2b1a" }}>
              Organisation-wide Impact Page
            </div>
            <p className="green-work-note" style={{ marginTop: 0, marginBottom: 10 }}>
              Shows all your organisation's approved {entityPl} across all projects — best for sharing with major donors who want the full picture.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200, background: "#f4f7f4", border: "1px solid #d1e8d5", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1a5c2a", fontFamily: "monospace", wordBreak: "break-all" }}>
                {orgImpactUrl}
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(orgImpactUrl!, setOrgCopied)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: orgCopied ? "#16a34a" : "linear-gradient(135deg,#1a5c2a,#2aa852)", color: "#fff", fontWeight: 700, border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap", transition: "background 0.2s" }}
              >
                {SI_COPY_ICON} {orgCopied ? "Copied!" : "Copy Link"}
              </button>
              <a
                href={orgImpactUrl!}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 5, border: "1.5px solid #2aa852", color: "#1a5c2a", background: "#fff", fontWeight: 700, borderRadius: 8, padding: "7px 13px", textDecoration: "none", fontSize: 13, whiteSpace: "nowrap" }}
              >
                ↗ Preview
              </a>
            </div>
          </div>

          {/* ─── Project-specific link ─── */}
          <div style={{ borderTop: "1.5px solid #e4ede6", paddingTop: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#0c2b1a" }}>
              Share a Specific Project
            </div>
            <p className="green-work-note" style={{ marginTop: 0, marginBottom: 10 }}>
              Select a project to generate a focused link that only shows that project's data — useful when you want to update a specific donor on one programme.
            </p>
            <select
              value={shareProjectId}
              onChange={(e) => onProjectChange(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #d1e8d5", borderRadius: 8, fontSize: 14, background: "#fff", marginBottom: 12 }}
            >
              <option value="">— Select a project —</option>
              {orgProjects.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}{p.location_text ? ` · ${p.location_text}` : ""}
                </option>
              ))}
            </select>

            {projImpactUrl && selectedProject ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <div style={{ flex: 1, minWidth: 200, background: "#f4f7f4", border: "1px solid #d1e8d5", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1a5c2a", fontFamily: "monospace", wordBreak: "break-all" }}>
                    {projImpactUrl}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(projImpactUrl, setProjCopied)}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: projCopied ? "#16a34a" : "linear-gradient(135deg,#1a5c2a,#2aa852)", color: "#fff", fontWeight: 700, border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap", transition: "background 0.2s" }}
                  >
                    {SI_COPY_ICON} {projCopied ? "Copied!" : "Copy Link"}
                  </button>
                  <a
                    href={projImpactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 5, border: "1.5px solid #2aa852", color: "#1a5c2a", background: "#fff", fontWeight: 700, borderRadius: 8, padding: "7px 13px", textDecoration: "none", fontSize: 13, whiteSpace: "nowrap" }}
                  >
                    ↗ Preview
                  </a>
                </div>
                <p className="green-work-note" style={{ marginTop: 8 }}>
                  Showing impact for: <strong>{selectedProject.name}</strong>
                  {selectedProject.location_text ? ` · ${selectedProject.location_text}` : ""}
                </p>
              </>
            ) : (
              orgProjects.length === 0 && (
                <p className="green-work-note">No projects available under this organisation.</p>
              )
            )}
          </div>
        </>
      )}

      {/* ─── Endorsements received ─── */}
      {orgSlug && (
        <div style={{ borderTop: "1.5px solid #e4ede6", paddingTop: 28, marginTop: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#0c2b1a" }}>
            Endorsements Received
          </div>
          <p className="green-work-note" style={{ marginTop: 0, marginBottom: 14 }}>
            Public comments and endorsements left by donors, officials, and reviewers on your impact page.
          </p>
          {commentsLoading && <p className="green-work-note">Loading endorsements…</p>}
          {commentsLoaded && comments.length === 0 && (
            <p className="green-work-note" style={{ fontStyle: "italic" }}>No endorsements yet. They will appear here once visitors leave comments on your impact page.</p>
          )}
          {commentsLoaded && comments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 660 }}>
              {comments.map((c) => (
                <div key={c.id} style={{ background: "#f4f7f4", border: "1px solid #d1e8d5", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 34, height: 34, minWidth: 34, background: "#1a5c2a", color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>
                      {c.commenter_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#0c2b1a" }}>{c.commenter_name}</div>
                      {(c.commenter_rank || c.commenter_org) && (
                        <div style={{ fontSize: 12, color: "#5a7a63" }}>
                          {[c.commenter_rank, c.commenter_org].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {c.created_at && (
                      <div style={{ marginLeft: "auto", fontSize: 11, color: "#8aaa93", whiteSpace: "nowrap" }}>
                        {new Date(c.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </div>
                  {c.project_name && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(26,92,42,0.08)", border: "1px solid #c4ddc9", borderRadius: 6, padding: "2px 9px", fontSize: 11, color: "#1a5c2a", fontWeight: 600, marginBottom: 6 }}>
                      📂 {c.project_name}
                    </div>
                  )}
                  <div style={{ fontSize: 13.5, color: "#2d4a35", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{c.comment_body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GreenWork() {
  const workAuthSession = getWorkAuthSession();
  const canAccessSuperAdmin = workAuthSession?.auth_mode === "env_admin";
  const isSuperAdminOnlyForm = (form: WorkForm | null | undefined) => form === "super_admin" || form === "logs";
  const isPartnerWorkSession = workAuthSession?.auth_mode === "partner_user";
  const normalizeOrgLifecycleStatus = (value: unknown) => String(value || "").trim().toLowerCase();
  const workScopedOrganizationId =
    isPartnerWorkSession && Number.isFinite(Number(workAuthSession?.user?.organization_id))
      ? Number(workAuthSession?.user?.organization_id)
      : null;
  const storedProjectIdRaw = typeof window !== "undefined" ? localStorage.getItem("landcheck_work_active_project_id") || "" : "";
  const storedProjectId = Number(storedProjectIdRaw || "0");
  const storedFormRaw = typeof window !== "undefined" ? localStorage.getItem("landcheck_work_active_form") || "" : "";
  const storedFormNormalized =
    storedFormRaw === "custodians" || storedFormRaw === "distribution_events" || storedFormRaw === "custodian_reports"
      ? "custodian_hub"
      : storedFormRaw === "existing_tree_live_table"
        ? "live_table"
      : storedFormRaw;
  const storedAssigneeFilter = typeof window !== "undefined" ? localStorage.getItem("landcheck_work_assignee_filter") || "all" : "all";
  const storedSeason = typeof window !== "undefined" ? localStorage.getItem("landcheck_work_season_mode") || "rainy" : "rainy";
  const storedLiveTreeScope =
    typeof window !== "undefined"
      ? localStorage.getItem("landcheck_work_live_tree_scope") || (storedFormRaw === "existing_tree_live_table" ? "existing_inventory" : "new_planting")
      : "new_planting";
  const allowedForms: WorkForm[] = [
    "super_admin",
    "project_focus",
    "create_project",
    "custodian_hub",
    "existing_tree_intake",
    "add_user",
    "users",
    "map_view",
    "remote_monitoring",
    "assign_work",
    "assign_task",
    "review_queue",
    "overview",
    "live_table",
    "verra_reports",
    "sponsors",
    "sponsorship_orders",
    "sponsor_payouts",
    "sponsor_feedback",
    "logs",
    "share_impact",
  ];

  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mapCardRef = useRef<HTMLDivElement | null>(null);
  const workPauseNoticeShownRef = useRef(false);
  const workSuspendNoticeShownRef = useRef(false);
  const lastLoadedProjectIdRef = useRef<number | null>(null);
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  // Sponsor Feedback state
  const [socialFollowClaims, setSocialFollowClaims] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [schoolNominations, setSchoolNominations] = useState<any[]>([]);
  const [communityProjects, setCommunityProjects] = useState<any[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  // System Logs & Reports state
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [selectedActivityLog, setSelectedActivityLog] = useState<ActivityLogEntry | null>(null);
  const [qrPrintsReport, setQrPrintsReport] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [followClaimNotes, setFollowClaimNotes] = useState<Record<number, string>>({});
  const [complaintNotes, setComplaintNotes] = useState<Record<number, string>>({});
  const [nominationNotes, setNominationNotes] = useState<Record<number, string>>({});
  // Planty assistant escalations (unanswered chat questions from the public sponsor page)
  const [assistantEscalations, setAssistantEscalations] = useState<any[]>([]);
  const [assistantUnreadCount, setAssistantUnreadCount] = useState(0);
  const [assistantEscalationNotes, setAssistantEscalationNotes] = useState<Record<number, string>>({});
  const [assistantEscalationReplies, setAssistantEscalationReplies] = useState<Record<number, string>>({});
  const [resolvingAssistantEscalationId, setResolvingAssistantEscalationId] = useState<number | null>(null);
  const [projectNotes, setProjectNotes] = useState<Record<number, string>>({});
  const [redemptionNotes, setRedemptionNotes] = useState<Record<number, string>>({});
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminOverviewLoading, setAdminOverviewLoading] = useState(false);
  const [users, setUsers] = useState<GreenUser[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(
    Number.isFinite(storedProjectId) && storedProjectId > 0 ? storedProjectId : null
  );
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(storedAssigneeFilter || "all");
  const [newOrder, setNewOrder] = useState({
    assignee_name: "",
    work_type: "planting",
    target_trees: 0,
    auto_assign_first_cycle_maintenance: false,
    allow_existing_tree_area_reuse: false,
    due_date: "",
  });
  const [newOrderSpeciesMode, setNewOrderSpeciesMode] = useState(false);
  const [newOrderSpeciesAllocations, setNewOrderSpeciesAllocations] = useState<Array<{ species: string; count: number }>>([
    { species: "", count: 0 },
  ]);
  const [newOrderAreaEnabled, setNewOrderAreaEnabled] = useState(false);
  const [newOrderAreaLabel, setNewOrderAreaLabel] = useState("");
  const [newOrderAreaGeometry, setNewOrderAreaGeometry] = useState<{ type: "Polygon" | "MultiPolygon"; coordinates: any } | null>(null);
  const [newOrderMultiAssignEnabled, setNewOrderMultiAssignEnabled] = useState(false);
  const [newOrderSelectedAssignees, setNewOrderSelectedAssignees] = useState<string[]>([]);
  const [newOrderMultiAssignTargetMode, setNewOrderMultiAssignTargetMode] = useState<"uniform" | "custom">("uniform");
  const [newOrderMultiAssignDueMode, setNewOrderMultiAssignDueMode] = useState<"uniform" | "custom">("uniform");
  const [newOrderMultiAssignOverrides, setNewOrderMultiAssignOverrides] = useState<Record<string, WorkOrderMultiAssignOverride>>({});
  const [assigningWorkOrder, setAssigningWorkOrder] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: "", role: "field_officer" });
  const [newProject, setNewProject] = useState({
    name: "",
    location_text: "",
    sponsor: "",
    organization_id: workScopedOrganizationId ? String(workScopedOrganizationId) : "",
    workflow_profile: "green",
    access_model: "partner_org" as ProjectAccessModel,
    public_sponsor_enabled: false,
    public_sponsor_title: "",
    public_sponsor_description: "",
    sponsor_price_per_tree_ngn: "",
    sponsor_price_per_tree_usd: "",
    sponsor_capacity: "",
    sponsor_max_per_order: "",
    sponsor_dedication_enabled: true,
    sponsor_payment_instructions: "",
    sponsor_agent_planting_fee: "",
    sponsor_agent_maintenance_fee: "",
    agric_program_type: "extension_support",
    agric_focus_commodities: "",
    agric_support_packages: "",
    agric_season_label: "",
    relief_program_type: "emergency_relief",
    relief_intervention_focus: "",
    relief_package_types: "",
    relief_target_zone: "",
  });
  const [newOrganization, setNewOrganization] = useState({
    name: "",
    slug: "",
    short_name: "",
    logo_url: "",
    status: "pilot",
    contact_email: "",
    contact_phone: "",
    website_url: "",
    country: "Nigeria",
    state_region: "",
    city: "",
    address_text: "",
    notes: "",
    is_active: true,
  });
  const [editingOrganizationId, setEditingOrganizationId] = useState<number | null>(null);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [adminUsers, setAdminUsers] = useState<GreenUser[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [newRoleDraft, setNewRoleDraft] = useState<{
    role_uid: string;
    role_key: string;
    role_name: string;
    description: string;
    scope: string;
    is_active: boolean;
  }>({
    role_uid: "",
    role_key: "",
    role_name: "",
    description: "",
    scope: "platform",
    is_active: true,
  });
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [adminUserDraft, setAdminUserDraft] = useState<{
    user_uid: string;
    full_name: string;
    email: string;
    phone: string;
    organization_id: string;
    role_id: string;
    role: string;
    allow_green: boolean;
    allow_work: boolean;
    work_username: string;
    work_password: string;
    notes: string;
    is_active: boolean;
  }>({
    user_uid: "",
    full_name: "",
    email: "",
    phone: "",
    organization_id: "",
    role_id: "",
    role: "field_officer",
    allow_green: true,
    allow_work: false,
    work_username: "",
    work_password: "",
    notes: "",
    is_active: true,
  });
  const [orgLogoUploading, setOrgLogoUploading] = useState(false);
  const [editingAdminUserId, setEditingAdminUserId] = useState<number | null>(null);
  const [latestGeneratedUserCredentials, setLatestGeneratedUserCredentials] = useState<{
    full_name: string;
    user_uid?: string | null;
    username: string;
    password: string;
  } | null>(null);
  const [adminCredentialOrgId, setAdminCredentialOrgId] = useState<string>("");
  const [adminCredentialIncludeInactive, setAdminCredentialIncludeInactive] = useState(true);
  const [projectSettingsDraft, setProjectSettingsDraft] = useState<{
    workflow_profile: WorkflowProfile;
    access_model: ProjectAccessModel;
    public_sponsor_enabled: boolean;
    public_sponsor_title: string;
    public_sponsor_description: string;
    sponsor_price_per_tree_ngn: string;
    sponsor_price_per_tree_usd: string;
    sponsor_capacity: string;
    sponsor_max_per_order: string;
    sponsor_dedication_enabled: boolean;
    sponsor_payment_instructions: string;
    public_sponsor_agent_user_ids: number[];
    sponsor_agent_planting_fee: string;
    sponsor_agent_maintenance_fee: string;
    agric_program_type: string;
    agric_focus_commodities: string;
    agric_support_packages: string;
    agric_season_label: string;
    relief_program_type: string;
    relief_intervention_focus: string;
    relief_package_types: string;
    relief_target_zone: string;
    planting_model: PlantingModel;
    allow_existing_tree_link: boolean;
    default_existing_tree_scope: ExistingScopeValue;
    status: string;
  }>({
    workflow_profile: "green",
    access_model: "partner_org",
    public_sponsor_enabled: false,
    public_sponsor_title: "",
    public_sponsor_description: "",
    sponsor_price_per_tree_ngn: "",
    sponsor_price_per_tree_usd: "",
    sponsor_capacity: "",
    sponsor_max_per_order: "",
    sponsor_dedication_enabled: true,
    sponsor_payment_instructions: "",
    public_sponsor_agent_user_ids: [],
    sponsor_agent_planting_fee: "",
    sponsor_agent_maintenance_fee: "",
    status: "ongoing",
    agric_program_type: "extension_support",
    agric_focus_commodities: "",
    agric_support_packages: "",
    agric_season_label: "",
    relief_program_type: "emergency_relief",
    relief_intervention_focus: "",
    relief_package_types: "",
    relief_target_zone: "",
    planting_model: "direct",
    allow_existing_tree_link: false,
    default_existing_tree_scope: "exclude_from_planting_kpi",
  });
  const draftWorkflowProfile = normalizeWorkflowProfile(projectSettingsDraft.workflow_profile);
  const activeProjectRecord = useMemo(() => {
    if (!activeProjectId) return null;
    return projects.find((p) => Number(p.id) === Number(activeProjectId)) || null;
  }, [projects, activeProjectId]);
  const activeWorkflowProfile = normalizeWorkflowProfile(
    activeProjectRecord?.settings?.workflow_profile || activeProjectRecord?.workflow_profile || projectSettingsDraft.workflow_profile,
  );
  const activeProjectAccessModel = normalizeProjectAccessModel(
    activeProjectRecord?.settings?.access_model || activeProjectRecord?.access_model || projectSettingsDraft.access_model,
  );
  const activeProjectPublicSponsorEnabled = Boolean(
    activeProjectRecord?.settings?.public_sponsor_enabled ??
      activeProjectRecord?.public_sponsor_enabled ??
      projectSettingsDraft.public_sponsor_enabled,
  );
  const activeWorkflowLabels = getWorkflowLabels(activeWorkflowProfile);
  const fieldWorkflowMode = isFieldWorkflowProfile(activeWorkflowProfile);
  const agricWorkflowMode = activeWorkflowProfile === "agric";
  const reliefWorkflowMode = activeWorkflowProfile === "relief_recovery";
  const publicSponsorshipProject = Boolean(
    activeProjectId && activeWorkflowProfile === "green" && isPublicSponsorshipProject(activeProjectAccessModel, activeProjectPublicSponsorEnabled),
  );
  const publicSponsorAgentUserIds = useMemo(
    () =>
      normalizePositiveIntList(
        activeProjectRecord?.settings?.public_sponsor_agent_user_ids ??
          activeProjectRecord?.public_sponsor_agent_user_ids ??
          projectSettingsDraft.public_sponsor_agent_user_ids,
      ),
    [activeProjectRecord, projectSettingsDraft.public_sponsor_agent_user_ids],
  );
  const projectScopedUsers = useMemo(() => {
    const organizationId = Number(activeProjectRecord?.organization_id || 0);
    if (!(organizationId > 0)) return users;
    return users.filter((user) => Number(user.organization_id || 0) === organizationId);
  }, [activeProjectRecord?.organization_id, users]);
  const eligiblePublicSponsorUsers = useMemo(
    () => projectScopedUsers.filter((user) => user.allow_green !== false && user.is_active !== false),
    [projectScopedUsers],
  );
  const assignmentUsers = useMemo(() => {
    if (!publicSponsorshipProject) return projectScopedUsers;
    const allowed = new Set(publicSponsorAgentUserIds);
    return eligiblePublicSponsorUsers.filter((user) => allowed.has(Number(user.id || 0)));
  }, [eligiblePublicSponsorUsers, projectScopedUsers, publicSponsorAgentUserIds, publicSponsorshipProject]);
  const sponsorQrAgentOptions = useMemo(
    () => assignmentUsers.filter((user) => user.allow_green !== false && user.is_active !== false),
    [assignmentUsers],
  );
  const defaultProjectForm: WorkForm = fieldWorkflowMode ? "custodian_hub" : "overview";
  const isHiddenInFieldProject = (form: WorkForm) =>
    Boolean(activeProjectId && fieldWorkflowMode && AGRIC_HIDDEN_PROJECT_FORMS.includes(form));
  const activeProjectOrgId =
    activeProjectRecord && Number.isFinite(Number(activeProjectRecord.organization_id))
      ? Number(activeProjectRecord.organization_id)
      : null;
  const activeProjectMatchesWorkSessionOrg =
    Boolean(isPartnerWorkSession && workScopedOrganizationId && activeProjectOrgId === workScopedOrganizationId);
  const partnerLogoUrl = isPartnerWorkSession
    ? ((activeProjectMatchesWorkSessionOrg ? activeProjectRecord?.organization_logo_url || null : null) ||
        workAuthSession?.user?.organization_logo_url ||
        null)
    : null;
  const partnerLogoDisplayUrl = partnerLogoUrl ? toDisplayPhotoUrl(partnerLogoUrl) : "";
  const partnerLogoName = isPartnerWorkSession
    ? ((activeProjectMatchesWorkSessionOrg ? activeProjectRecord?.organization_name || null : null) ||
        workAuthSession?.user?.organization_name ||
        "Partner")
    : "Partner";
  const workSessionOrgStatus = normalizeOrgLifecycleStatus(workAuthSession?.user?.organization_status);
  const workRuntimeOrgStatus = normalizeOrgLifecycleStatus(
    activeProjectRecord?.organization_status || projects[0]?.organization_status || ""
  );
  const workEffectiveOrgStatus = isPartnerWorkSession ? (workRuntimeOrgStatus || workSessionOrgStatus) : "";
  const workPartnerOrgInactive = Boolean(isPartnerWorkSession && workAuthSession?.user?.organization_is_active === false);
  const workPartnerOrgSuspended = Boolean(
    isPartnerWorkSession && (workPartnerOrgInactive || workEffectiveOrgStatus === "suspended")
  );
  const workPartnerOrgPaused = Boolean(isPartnerWorkSession && !workPartnerOrgSuspended && workEffectiveOrgStatus === "paused");
  const [sponsorshipOrders, setSponsorshipOrders] = useState<SponsorshipOrderRecord[]>([]);
  const [sponsorshipOrdersLoading, setSponsorshipOrdersLoading] = useState(false);
  const [sponsorshipOrdersError, setSponsorshipOrdersError] = useState<string | null>(null);
  const [sponsorshipOrdersScopeNote, setSponsorshipOrdersScopeNote] = useState<string | null>(null);
  const [sponsorAgentPayoutBoard, setSponsorAgentPayoutBoard] = useState<SponsorAgentPayoutBoard | null>(null);
  const [sponsorAgentPayoutLoading, setSponsorAgentPayoutLoading] = useState(false);
  const [sponsorAgentPayoutError, setSponsorAgentPayoutError] = useState<string | null>(null);
  const [sponsorQrStatusRows, setSponsorQrStatusRows] = useState<any[]>([]);
  const [sponsorQrStatusLoading, setSponsorQrStatusLoading] = useState(false);
  const [sponsorQrStatusError, setSponsorQrStatusError] = useState<string | null>(null);
  const [sponsorQrReissueSelections, setSponsorQrReissueSelections] = useState<Record<number, number>>({});
  const [sponsorshipOrderAgentSelections, setSponsorshipOrderAgentSelections] = useState<Record<number, number>>({});
  const [reissuingSponsorQrUnitId, setReissuingSponsorQrUnitId] = useState<number | null>(null);
  const [assigningSponsorOrderId, setAssigningSponsorOrderId] = useState<number | null>(null);
  const [reviewingSponsorAgentPayoutId, setReviewingSponsorAgentPayoutId] = useState<number | null>(null);
  const [savingPublicSponsorAgents, setSavingPublicSponsorAgents] = useState(false);
  const [fallbackSponsorAccounts, setFallbackSponsorAccounts] = useState<SponsorAccountSummary[]>([]);
  const [custodians, setCustodians] = useState<Custodian[]>([]);
  const [newCustodian, setNewCustodian] = useState<{
    custodian_type: CustodianType;
    name: string;
    contact_person: string;
    phone: string;
    alt_phone: string;
    email: string;
    address_text: string;
    local_government: string;
    community_name: string;
    verification_status: string;
    notes: string;
    farmer_code: string;
    gender: string;
    date_of_birth: string;
    national_id: string;
    state_name: string;
    ward_name: string;
    farmer_group: string;
    household_size: string;
    primary_crop: string;
    secondary_crops: string;
    land_tenure: string;
    irrigation_access: string;
    finance_access: boolean;
    insurance_access: boolean;
    input_support_needs: string;
    beneficiary_code: string;
    government_id: string;
    displacement_status: string;
    origin_location: string;
    current_settlement: string;
    support_category: string;
    priority_needs: string;
    livelihood_type: string;
    vulnerability_flags: string;
    relief_gender: string;
    shelter_status: string;
    women_count: string;
    children_under_five: string;
    elderly_count: string;
    disability_count: string;
  }>({
    custodian_type: "household",
    name: "",
    contact_person: "",
    phone: "",
    alt_phone: "",
    email: "",
    address_text: "",
    local_government: "",
    community_name: "",
    verification_status: "pending",
    notes: "",
    farmer_code: "",
    gender: "",
    date_of_birth: "",
    national_id: "",
    state_name: "",
    ward_name: "",
    farmer_group: "",
    household_size: "",
    primary_crop: "",
    secondary_crops: "",
    land_tenure: "",
    irrigation_access: "",
    finance_access: false,
    insurance_access: false,
    input_support_needs: "",
    beneficiary_code: "",
    government_id: "",
    displacement_status: "",
    origin_location: "",
    current_settlement: "",
    support_category: "",
    priority_needs: "",
    livelihood_type: "",
    vulnerability_flags: "",
    relief_gender: "",
    shelter_status: "",
    women_count: "",
    children_under_five: "",
    elderly_count: "",
    disability_count: "",
  });
  const [distributionEvents, setDistributionEvents] = useState<DistributionEvent[]>([]);
  const [distributionAllocations, setDistributionAllocations] = useState<DistributionAllocation[]>([]);
  const [newDistributionEvent, setNewDistributionEvent] = useState<{
    event_date: string;
    species: string;
    quantity: number;
    source_batch_ref: string;
    distributed_by: string;
    notes: string;
  }>({
    event_date: "",
    species: "",
    quantity: 0,
    source_batch_ref: "",
    distributed_by: "",
    notes: "",
  });
  const [newAllocation, setNewAllocation] = useState<{
    event_id: string;
    custodian_id: string;
    quantity_allocated: number;
    supervision_target: number;
    expected_planting_start: string;
    expected_planting_end: string;
    followup_cycle_days: number;
    notes: string;
  }>({
    event_id: "",
    custodian_id: "",
    quantity_allocated: 0,
    supervision_target: 1,
    expected_planting_start: "",
    expected_planting_end: "",
    followup_cycle_days: 14,
    notes: "",
  });
  const [custodianAssignDraft, setCustodianAssignDraft] = useState<{
    custodian_id: number;
    allocation_id: number;
    assignee_name: string;
    visits_to_assign: number;
    due_date: string;
    priority: string;
    assignment_mode: AgricVisitAssignmentMode | null;
  } | null>(null);
  const [projectSetupExpanded, setProjectSetupExpanded] = useState(false);
  const [custodianOptionsExpanded, setCustodianOptionsExpanded] = useState(false);
  const [shareImpactProjectId, setShareImpactProjectId] = useState<string>("");
  const [agricCustodianHubTab, setAgricCustodianHubTab] = useState<"farmer_form" | "farmer_live" | "support_setup">(
    "farmer_form",
  );
  const [treeMetaDraftById, setTreeMetaDraftById] = useState<
    Record<
      number,
      {
        tree_height_m: string;
        planting_date: string;
        tree_origin: "new_planting" | "existing_inventory" | "natural_regeneration";
        attribution_scope: "full" | "monitor_only";
        count_in_planting_kpis: boolean;
        count_in_carbon_scope: boolean;
      }
    >
  >({});
  const [savingTreeMetaId, setSavingTreeMetaId] = useState<number | null>(null);
  const [treePositionDraft, setTreePositionDraft] = useState<{ treeId: number; lng: number; lat: number } | null>(null);
  const [savingTreePositionId, setSavingTreePositionId] = useState<number | null>(null);
  const [seasonMode, setSeasonMode] = useState<SeasonMode>(storedSeason === "dry" ? "dry" : "rainy");
  const [liveTreeScopeTab, setLiveTreeScopeTab] = useState<"new_planting" | "existing_inventory">(
    storedLiveTreeScope === "existing_inventory" ? "existing_inventory" : "new_planting",
  );
  const [newTask, setNewTask] = useState<{
    tree_id: string;
    task_type: string;
    assignee_name: string;
    due_mode: TaskDueMode;
    due_date: string;
    priority: string;
    notes: string;
  }>({
    tree_id: "",
    task_type: "watering",
    assignee_name: "",
    due_mode: "model_rainy",
    due_date: "",
    priority: "normal",
    notes: "",
  });
  const [newTaskMultiAssignEnabled, setNewTaskMultiAssignEnabled] = useState(false);
  const [newTaskSelectedAssignees, setNewTaskSelectedAssignees] = useState<string[]>([]);
  const [selectedMaintenanceRowKeys, setSelectedMaintenanceRowKeys] = useState<string[]>([]);
  const [maintenanceBulkAssignMode, setMaintenanceBulkAssignMode] = useState<MaintenanceBulkAssignMode>("single_staff");
  const [maintenanceAssigneeStrategy, setMaintenanceAssigneeStrategy] = useState<MaintenanceAssigneeStrategy>("manual");
  const [maintenancePlanterFallbackAssignee, setMaintenancePlanterFallbackAssignee] = useState("");
  const [maintenanceAttentionFilter, setMaintenanceAttentionFilter] = useState<MaintenanceAttentionFilter>("all");
  const [maintenanceMapFocusEnabled, setMaintenanceMapFocusEnabled] = useState(false);
  const [assigningMaintenanceTask, setAssigningMaintenanceTask] = useState(false);
  const [inspectedTree, setInspectedTree] = useState<TreeInspectData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<WorkForm | null>(() => {
    const storedForm = storedFormNormalized as WorkForm;
    if (!allowedForms.includes(storedForm)) return null;
    if (isSuperAdminOnlyForm(storedForm) && !canAccessSuperAdmin) return null;
    return storedForm;
  });
  const activeFormHiddenInAgric = activeForm ? isHiddenInFieldProject(activeForm) : false;
  const [remoteMonitoringReport, setRemoteMonitoringReport] = useState<RemoteMonitoringReport | null>(null);
  const [remoteMonitoringLoading, setRemoteMonitoringLoading] = useState(false);
  const [remoteMonitoringProgressStep, setRemoteMonitoringProgressStep] = useState(0);
  const [remoteMonitoringProgressPct, setRemoteMonitoringProgressPct] = useState(0);
  const [remoteMonitoringDrawActive, setRemoteMonitoringDrawActive] = useState(false);
  const [remoteMonitoringFocusedTreeId, setRemoteMonitoringFocusedTreeId] = useState<number | null>(null);
  const [remoteMonitoringActionTreeId, setRemoteMonitoringActionTreeId] = useState<number | null>(null);
  const remoteMonitoringProgressTimerRef = useRef<number | null>(null);
  const [remoteMonitoringDraftGeometry, setRemoteMonitoringDraftGeometry] = useState<{
    type: "Polygon" | "MultiPolygon";
    coordinates: any;
  } | null>(null);
  const [remoteMonitoringDraft, setRemoteMonitoringDraft] = useState<{
    source_order_id: string;
  }>({
    source_order_id: "",
  });
  const [staffMenu, setStaffMenu] = useState<StaffMenuState>(null);
  const [liveTreeMenu, setLiveTreeMenu] = useState<LiveTreeMenuState>(null);
  const [carbonSummary, setCarbonSummary] = useState<{
    current_co2_tonnes: number;
    annual_co2_tonnes: number;
    projected_lifetime_co2_tonnes: number;
    co2_per_tree_avg_kg: number;
    trees_missing_age_data: number;
    trees_with_fallback_age: number;
    trees_pending_review: number;
    top_species: { species: string; model_species?: string; count: number; co2_kg: number }[];
  } | null>(null);
  const [speciesMaturityByProject, setSpeciesMaturityByProject] = useState<Record<string, Record<string, number>>>({});
  const [selectedMaturitySpecies, setSelectedMaturitySpecies] = useState("");
  const [selectedMaturityYears, setSelectedMaturityYears] = useState("3");
  const [treePhotoUploading, setTreePhotoUploading] = useState(false);
  const [drawerFrame, setDrawerFrame] = useState<DrawerFrame | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueTask[]>([]);
  const [includePhotosInWorkPdf, setIncludePhotosInWorkPdf] = useState(false);
  const [includePhotosInCustodianPdf, setIncludePhotosInCustodianPdf] = useState(true);
  const [includePhotosInExistingTreesPdf, setIncludePhotosInExistingTreesPdf] = useState(true);
  const [existingTreeMetricsById, setExistingTreeMetricsById] = useState<Record<number, ExistingTreeMetric>>({});
  const [existingTreeMetricsLoading, setExistingTreeMetricsLoading] = useState(false);
  const [deletingTreeId, setDeletingTreeId] = useState<number | null>(null);
  const [workPasswordModalOpen, setWorkPasswordModalOpen] = useState(false);
  const [workPasswordModalSaving, setWorkPasswordModalSaving] = useState(false);
  const [workPasswordModalShow, setWorkPasswordModalShow] = useState(false);
  const [workPasswordForm, setWorkPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [deleteProjectModalOpen, setDeleteProjectModalOpen] = useState(false);
  const [deleteProjectConfirmName, setDeleteProjectConfirmName] = useState("");
  const [deletingProject, setDeletingProject] = useState(false);
  const [showProjectDangerOptions, setShowProjectDangerOptions] = useState(false);
  const [alertsSummary, setAlertsSummary] = useState<{ total: number; danger: number; warning: number; info: number }>({
    total: 0,
    danger: 0,
    warning: 0,
    info: 0,
  });
  const [alertsList, setAlertsList] = useState<any[]>([]);
  const [serverLiveRows, setServerLiveRows] = useState<LiveMaintenanceRow[]>([]);
  const [serverLiveSources, setServerLiveSources] = useState<{ label: string; url: string }[]>(LIVE_TABLE_SOURCES);
  const [serverExistingLiveRows, setServerExistingLiveRows] = useState<LiveMaintenanceRow[]>([]);
  const [serverExistingLiveSources, setServerExistingLiveSources] = useState<{ label: string; url: string }[]>(LIVE_TABLE_SOURCES);
  const [reviewNoteByTaskId, setReviewNoteByTaskId] = useState<Record<number, string>>({});
  const [kpiCurrent, setKpiCurrent] = useState<Record<string, any> | null>(null);
  const [speciesDailyTrend, setSpeciesDailyTrend] = useState<Record<string, any> | null>(null);
  const [verraFilters, setVerraFilters] = useState<{
    monitoring_start: string;
    monitoring_end: string;
    methodology_id: string;
    verifier_notes: string;
    generated_by: string;
    season_mode: SeasonMode;
    assignee_name: string;
  }>({
    monitoring_start: "",
    monitoring_end: "",
    methodology_id: "",
    verifier_notes: "",
    generated_by: "supervisor",
    season_mode: storedSeason === "dry" ? "dry" : "rainy",
    assignee_name: "all",
  });
  const [verraHistory, setVerraHistory] = useState<VerraExportHistoryItem[]>([]);
  const { ensureConsent: ensureWorkPrivacyConsent, privacyConsentModal } = usePrivacyConsentGate("work");

  const ensureWorkOperationalConsent = useCallback(
    async (action: string, metadata: Record<string, unknown> = {}) => {
      const accepted = await ensureWorkPrivacyConsent("work_operational_data_processing", {
        title: "Consent required before processing Work data",
        detail:
          "LandCheck Work processes organization, staff, custodian, review, photo, and workflow records. Continue only if you are authorized to enter, edit, or export this data for the organization or project.",
        actionLabel: "I Consent and Continue",
        metadata: {
          action,
          project_id: activeProjectId ?? null,
          organization_id: workScopedOrganizationId ?? null,
          actor_name: workAuthSession?.user?.full_name || "",
          ...metadata,
        },
      });
      if (!accepted) {
        toast.error("Consent is required before processing operational data in LandCheck Work.");
        return false;
      }
      return true;
    },
    [activeProjectId, ensureWorkPrivacyConsent, workAuthSession?.user?.full_name, workScopedOrganizationId],
  );

  const loadProjects = async () => {
    if (isPartnerWorkSession && !workScopedOrganizationId) {
      setProjects([]);
      return;
    }
    try {
      const url = workScopedOrganizationId ? `/green/projects?organization_id=${workScopedOrganizationId}` : "/green/projects";
      const res = await api.get(url);
      const rows = Array.isArray(res.data) ? res.data : [];
      setProjects(rows);
      cacheProjectsOffline(rows).catch(() => {});
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        const cached = await getCachedProjectsOffline().catch(() => []);
        const scopedCached = workScopedOrganizationId
          ? cached.filter((row: any) => Number(row?.organization_id || 0) === Number(workScopedOrganizationId))
          : cached;
        if (scopedCached.length > 0) { setProjects(scopedCached); return; }
      }
      throw error;
    }
  };

  const loadOrganizations = async () => {
    try {
      const res = await api.get("/green/admin/organizations");
      setOrganizations(Array.isArray(res.data) ? res.data : []);
    } catch {
      setOrganizations([]);
      throw new Error("Failed to load organizations");
    }
  };

  const loadAdminOverview = async () => {
    setAdminOverviewLoading(true);
    try {
      const res = await api.get("/green/admin/overview");
      setAdminOverview(res.data || null);
    } catch {
      setAdminOverview(null);
      throw new Error("Failed to load super admin overview");
    } finally {
      setAdminOverviewLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const res = await api.get("/green/admin/roles?include_inactive=true");
      setRoles(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRoles([]);
      throw new Error("Failed to load roles");
    }
  };

  const loadAdminUsers = async () => {
    setAdminUsersLoading(true);
    try {
      const res = await api.get("/green/users?include_inactive=true");
      setAdminUsers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setAdminUsers([]);
      throw new Error("Failed to load admin users");
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const loadExistingTreeMetrics = useCallback(async (projectId: number) => {
    if (!projectId) {
      setExistingTreeMetricsById({});
      return;
    }
    setExistingTreeMetricsLoading(true);
    try {
      const stamp = Date.now();
      const res = await api.get(`/green/projects/${projectId}/existing-trees/metrics?_ts=${stamp}`);
      const rows = Array.isArray(res.data?.items) ? res.data.items : [];
      const next: Record<number, ExistingTreeMetric> = {};
      rows.forEach((row: any) => {
        const treeId = Number(row?.tree_id || 0);
        if (!Number.isFinite(treeId) || treeId <= 0) return;
        next[treeId] = {
          tree_id: treeId,
          project_tree_no: Number.isFinite(Number(row?.project_tree_no)) ? Number(row.project_tree_no) : null,
          inventory_tree_count:
            Number.isFinite(Number(row?.inventory_tree_count)) && Number(row?.inventory_tree_count) > 0
              ? Math.round(Number(row.inventory_tree_count))
              : 1,
          existing_area_sqm:
            Number.isFinite(Number(row?.existing_area_sqm)) && Number(row?.existing_area_sqm) > 0
              ? Number(row.existing_area_sqm)
              : null,
          existing_area_ha:
            Number.isFinite(Number(row?.existing_area_ha)) && Number(row?.existing_area_ha) > 0
              ? Number(row.existing_area_ha)
              : null,
          photo_count: Number.isFinite(Number(row?.photo_count)) ? Math.max(0, Math.round(Number(row.photo_count))) : 0,
          tree_age_months:
            Number.isFinite(Number(row?.tree_age_months)) && Number(row?.tree_age_months) >= 0
              ? Number(row.tree_age_months)
              : null,
          age_years:
            Number.isFinite(Number(row?.age_years)) && Number(row?.age_years) >= 0
              ? Number(row.age_years)
              : null,
          age_source: row?.age_source || "none",
          current_co2_kg: Number.isFinite(Number(row?.current_co2_kg)) ? Number(row.current_co2_kg) : null,
          annual_co2_kg: Number.isFinite(Number(row?.annual_co2_kg)) ? Number(row.annual_co2_kg) : null,
          lifetime_co2_kg: Number.isFinite(Number(row?.lifetime_co2_kg)) ? Number(row.lifetime_co2_kg) : null,
          co2_in_scope: row?.co2_in_scope !== false,
          co2_height_source: row?.co2_height_source || null,
          height_used_for_co2: Boolean(row?.height_used_for_co2),
        };
      });
      setExistingTreeMetricsById(next);
    } catch {
      setExistingTreeMetricsById({});
    } finally {
      setExistingTreeMetricsLoading(false);
    }
  }, []);

  const loadUsers = async () => {
    if (isPartnerWorkSession && !workScopedOrganizationId) {
      setUsers([]);
      return;
    }
    try {
      const url = workScopedOrganizationId ? `/green/users?organization_id=${workScopedOrganizationId}` : "/green/users";
      const res = await api.get(url);
      const rows = Array.isArray(res.data) ? res.data : [];
      setUsers(rows);
      cacheUsersOffline(rows).catch(() => {});
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        const cached = await getCachedUsersOffline().catch(() => []);
        const scopedCached = workScopedOrganizationId
          ? cached.filter((row: any) => Number(row?.organization_id || 0) === Number(workScopedOrganizationId))
          : cached;
        if (scopedCached.length > 0) { setUsers(scopedCached); return; }
      }
      throw error;
    }
  };

  const resetRoleDraft = () => {
    setEditingRoleId(null);
    setNewRoleDraft({
      role_uid: "",
      role_key: "",
      role_name: "",
      description: "",
      scope: "platform",
      is_active: true,
    });
  };

  const resetAdminUserDraft = () => {
    setEditingAdminUserId(null);
    setAdminUserDraft({
      user_uid: "",
      full_name: "",
      email: "",
      phone: "",
      organization_id: "",
      role_id: "",
      role: "field_officer",
      allow_green: true,
      allow_work: false,
      work_username: "",
      work_password: "",
      notes: "",
      is_active: true,
    });
  };

  const copyGeneratedUserCredentials = async () => {
    if (!latestGeneratedUserCredentials) return;
    const lines = [
      `Name: ${latestGeneratedUserCredentials.full_name}`,
      `User ID: ${latestGeneratedUserCredentials.user_uid || "-"}`,
      `Username: ${latestGeneratedUserCredentials.username}`,
      `Temporary Password: ${latestGeneratedUserCredentials.password}`,
    ];
    const textValue = lines.join("\n");
    try {
      await navigator.clipboard.writeText(textValue);
      toast.success("Generated credentials copied");
    } catch {
      window.prompt("Copy generated credentials", textValue);
    }
  };

  const exportAdminCredentialsPdf = () => {
    const orgId = Number(adminCredentialOrgId || 0);
    if (!(orgId > 0)) {
      toast.error("Select an organization first");
      return;
    }
    const params = new URLSearchParams();
    params.set("include_inactive", adminCredentialIncludeInactive ? "true" : "false");
    window.open(
      `${BACKEND_URL}/green/admin/organizations/${orgId}/credentials/export/pdf?${params.toString()}`,
      "_blank"
    );
  };

  const resetAdminUserPasswordAndEmail = async (user: GreenUser) => {
    const label = String(user.full_name || `user #${user.id}`);
    const confirmed = window.confirm(
      `Reset password and send new login credentials to ${label}${user.email ? ` (${user.email})` : ""}?`
    );
    if (!confirmed) return;
    try {
      const res = await api.post(`/green/users/${user.id}/reset-password`, {
        send_credentials_email: true,
      });
      const payload = (res.data || {}) as any;
      const generatedPassword = String(payload.generated_password || "").trim();
      const generatedUsername = String(payload.generated_login_username || payload.work_username || "").trim();
      if (generatedPassword && generatedUsername) {
        setLatestGeneratedUserCredentials({
          full_name: String(payload.full_name || user.full_name || ""),
          user_uid: payload.user_uid || user.user_uid || null,
          username: generatedUsername,
          password: generatedPassword,
        });
      }
      const emailSent = payload?.credentials_email_sent === true;
      const emailError = String(payload?.credentials_email_error || "").trim();
      if (emailSent) {
        toast.success("Password reset and credentials emailed.");
      } else if (emailError) {
        toast.success("Password reset completed.");
        toast.error(`Credential email not sent: ${emailError}`);
      } else {
        toast.success("Password reset completed.");
      }
      await Promise.all([loadUsers(), loadAdminUsers(), loadAdminOverview()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to reset password");
    }
  };

  const saveRoleDefinition = async () => {
    if (!newRoleDraft.role_name.trim()) {
      toast.error("Role name required");
      return;
    }
    const payload = {
      role_uid: newRoleDraft.role_uid.trim() || null,
      role_key: newRoleDraft.role_key.trim() || null,
      role_name: newRoleDraft.role_name.trim(),
      description: newRoleDraft.description.trim() || null,
      scope: newRoleDraft.scope.trim() || "platform",
      is_active: newRoleDraft.is_active,
    };
    try {
      if (editingRoleId) {
        await api.patch(`/green/admin/roles/${editingRoleId}`, payload);
        toast.success("Role updated");
      } else {
        await api.post("/green/admin/roles", payload);
        toast.success("Role created");
      }
      resetRoleDraft();
      await Promise.all([loadRoles(), loadUsers(), loadAdminUsers(), loadAdminOverview()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to save role");
    }
  };

  const editRoleDefinition = (roleDef: RoleDefinition) => {
    setEditingRoleId(Number(roleDef.id));
    setNewRoleDraft({
      role_uid: String(roleDef.role_uid || ""),
      role_key: String(roleDef.role_key || ""),
      role_name: String(roleDef.role_name || ""),
      description: String(roleDef.description || ""),
      scope: String(roleDef.scope || "platform"),
      is_active: roleDef.is_active !== false,
    });
    setActiveForm("super_admin");
  };

  const saveAdminUser = async () => {
    if (!adminUserDraft.full_name.trim()) {
      toast.error("User full name required");
      return;
    }
    const loginEnabled = Boolean(adminUserDraft.allow_green || adminUserDraft.allow_work);
    const isEditing = Boolean(editingAdminUserId);
    if (!isEditing && loginEnabled && !adminUserDraft.email.trim()) {
      toast.error("Email is required so the new user can receive login credentials.");
      return;
    }
    if (
      !(await ensureWorkOperationalConsent("admin_user_save", {
        editing: isEditing,
        target_email: adminUserDraft.email.trim() || null,
        allow_green: adminUserDraft.allow_green,
        allow_work: adminUserDraft.allow_work,
      }))
    ) {
      return;
    }
    const roleIdNum = Number(adminUserDraft.role_id || 0);
    const orgIdNum = Number(adminUserDraft.organization_id || 0);
    const payload = {
      user_uid: adminUserDraft.user_uid.trim() || null,
      full_name: adminUserDraft.full_name.trim(),
      email: adminUserDraft.email.trim() || null,
      phone: adminUserDraft.phone.trim() || null,
      organization_id: Number.isFinite(orgIdNum) && orgIdNum > 0 ? orgIdNum : (isEditing ? 0 : null),
      role_id: Number.isFinite(roleIdNum) && roleIdNum > 0 ? roleIdNum : (isEditing ? 0 : null),
      role: adminUserDraft.role.trim() || "field_officer",
      allow_green: adminUserDraft.allow_green,
      allow_work: adminUserDraft.allow_work,
      work_username: adminUserDraft.work_username.trim() || null,
      work_password: adminUserDraft.work_password,
      notes: adminUserDraft.notes.trim() || null,
      is_active: adminUserDraft.is_active,
    };
    try {
      if (editingAdminUserId) {
        await api.patch(`/green/users/${editingAdminUserId}`, payload);
        setLatestGeneratedUserCredentials(null);
        toast.success("User updated");
      } else {
        const res = await api.post("/green/users", payload);
        const created = (res.data || {}) as any;
        const generatedPassword = String(created.generated_password || "").trim();
        const generatedUsername = String(created.generated_login_username || created.work_username || "").trim();
        const emailSent = created?.credentials_email_sent === true;
        const emailError = String(created?.credentials_email_error || "").trim();
        if (generatedPassword && generatedUsername) {
          setLatestGeneratedUserCredentials({
            full_name: String(created.full_name || payload.full_name),
            user_uid: created.user_uid || payload.user_uid || null,
            username: generatedUsername,
            password: generatedPassword,
          });
          if (emailSent) {
            toast.success("User created. Login credentials generated and emailed.");
          } else if (emailError) {
            toast.success("User created. Temporary login credentials generated.");
            toast.error(`Credential email not sent: ${emailError}`);
          } else {
            toast.success("User created. Temporary login credentials generated.");
          }
        } else {
          setLatestGeneratedUserCredentials(null);
          if (emailSent) {
            toast.success("User created. Login credentials emailed.");
          } else if (emailError) {
            toast.success("User created");
            toast.error(`Credential email not sent: ${emailError}`);
          } else {
            toast.success("User created");
          }
        }
      }
      resetAdminUserDraft();
      await Promise.all([loadUsers(), loadAdminUsers(), loadAdminOverview()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to save user");
    }
  };

  const editAdminUser = (user: GreenUser) => {
    setEditingAdminUserId(Number(user.id));
    setAdminUserDraft({
      user_uid: String(user.user_uid || ""),
      full_name: String(user.full_name || ""),
      email: String(user.email || ""),
      phone: String(user.phone || ""),
      organization_id: user.organization_id ? String(user.organization_id) : "",
      role_id: user.role_id ? String(user.role_id) : "",
      role: String(user.role || "field_officer"),
      allow_green: user.allow_green !== false,
      allow_work: Boolean(user.allow_work),
      work_username: String(user.work_username || ""),
      work_password: "",
      notes: String(user.notes || ""),
      is_active: user.is_active !== false,
    });
    setActiveForm("super_admin");
  };

  const clearActiveProjectContext = () => {
    setActiveProjectId(null);
    lastLoadedProjectIdRef.current = null;
    setOrders([]);
    setNewOrderSpeciesMode(false);
    setNewOrderSpeciesAllocations([{ species: "", count: 0 }]);
    setTrees([]);
    setTasks([]);
    setAssigneeFilter("all");
    setInspectedTree(null);
    setCustodians([]);
    setDistributionEvents([]);
    setDistributionAllocations([]);
    setCustodianAssignDraft(null);
    setServerLiveRows([]);
    setServerExistingLiveRows([]);
    setProjectSettingsDraft({
      workflow_profile: "green",
      access_model: "partner_org",
      public_sponsor_enabled: false,
      public_sponsor_title: "",
      public_sponsor_description: "",
      sponsor_price_per_tree_ngn: "",
      sponsor_price_per_tree_usd: "",
      sponsor_capacity: "",
      sponsor_max_per_order: "",
      sponsor_dedication_enabled: true,
      sponsor_payment_instructions: "",
      public_sponsor_agent_user_ids: [],
      sponsor_agent_planting_fee: "",
      sponsor_agent_maintenance_fee: "",
      status: "ongoing",
      agric_program_type: "extension_support",
      agric_focus_commodities: "",
      agric_support_packages: "",
      agric_season_label: "",
      relief_program_type: "emergency_relief",
      relief_intervention_focus: "",
      relief_package_types: "",
      relief_target_zone: "",
      planting_model: "direct",
      allow_existing_tree_link: false,
      default_existing_tree_scope: "exclude_from_planting_kpi",
    });
    setRemoteMonitoringReport(null);
    setRemoteMonitoringDrawActive(false);
    setRemoteMonitoringDraftGeometry(null);
    setRemoteMonitoringDraft({ source_order_id: "" });
    setSponsorshipOrders([]);
  };

  const toggleNamedSelection = (
    current: string[],
    nextName: string,
  ) => {
    const cleanName = String(nextName || "").trim();
    if (!cleanName) return current;
    return current.includes(cleanName)
      ? current.filter((item) => item !== cleanName)
      : [...current, cleanName];
  };

  const makeDefaultWorkOrderOverride = useCallback(
    (): WorkOrderMultiAssignOverride => ({
      target_trees: Number(newOrder.target_trees || 0) > 0 ? String(newOrder.target_trees) : "",
      due_date: String(newOrder.due_date || ""),
    }),
    [newOrder.due_date, newOrder.target_trees],
  );

  const setWorkOrderSelectedAssigneesWithOverrides = useCallback(
    (nextAssignees: string[]) => {
      const normalized = Array.from(new Set(nextAssignees.map((item) => String(item || "").trim()).filter(Boolean)));
      setNewOrderSelectedAssignees(normalized);
      setNewOrderMultiAssignOverrides((prev) => {
        const next: Record<string, WorkOrderMultiAssignOverride> = {};
        normalized.forEach((assignee) => {
          next[assignee] = prev[assignee] || makeDefaultWorkOrderOverride();
        });
        return next;
      });
    },
    [makeDefaultWorkOrderOverride],
  );

  const updateWorkOrderMultiAssignOverride = useCallback(
    (assignee: string, patch: Partial<WorkOrderMultiAssignOverride>) => {
      const cleanAssignee = String(assignee || "").trim();
      if (!cleanAssignee) return;
      setNewOrderMultiAssignOverrides((prev) => ({
        ...prev,
        [cleanAssignee]: {
          ...(prev[cleanAssignee] || makeDefaultWorkOrderOverride()),
          ...patch,
        },
      }));
    },
    [makeDefaultWorkOrderOverride],
  );

  const currentWorkOrderAssignees = useMemo(() => {
    if (newOrderMultiAssignEnabled) {
      return Array.from(new Set(newOrderSelectedAssignees.map((item) => String(item || "").trim()).filter(Boolean)));
    }
    const single = String(newOrder.assignee_name || "").trim();
    return single ? [single] : [];
  }, [newOrder.assignee_name, newOrderMultiAssignEnabled, newOrderSelectedAssignees]);

  const currentTaskAssignees = useMemo(() => {
    if ((selectedMaintenanceRowKeys.length > 1 && maintenanceBulkAssignMode !== "single_staff") || newTaskMultiAssignEnabled) {
      return Array.from(new Set(newTaskSelectedAssignees.map((item) => String(item || "").trim()).filter(Boolean)));
    }
    const single = String(newTask.assignee_name || "").trim();
    return single ? [single] : [];
  }, [
    maintenanceBulkAssignMode,
    newTask.assignee_name,
    newTaskMultiAssignEnabled,
    newTaskSelectedAssignees,
    selectedMaintenanceRowKeys.length,
  ]);
  const treeById = useMemo(() => new Map(trees.map((tree) => [Number(tree.id), tree])), [trees]);
  const userNameByKnownAlias = useMemo(() => {
    const aliases = new Map<string, string>();
    assignmentUsers.forEach((user) => {
      [user.full_name, user.work_username, user.user_uid, user.email].forEach((value) => {
        const key = normalizeName(String(value || ""));
        if (key && !aliases.has(key)) {
          aliases.set(key, user.full_name);
        }
      });
    });
    return aliases;
  }, [assignmentUsers]);
  const resolveKnownUserName = useCallback(
    (value: string | null | undefined) => {
      const key = normalizeName(String(value || ""));
      return key ? userNameByKnownAlias.get(key) || "" : "";
    },
    [userNameByKnownAlias],
  );
  const buildSponsorDispatchAssigneeName = useCallback((user: GreenUser | null | undefined) => {
    if (!user) return "";
    const fullName = String(user.full_name || "").trim();
    const workUsername = String(user.work_username || "").trim();
    const userUid = String(user.user_uid || "").trim();
    if (fullName && userUid) return `${fullName} (${userUid})`;
    if (workUsername && userUid) return `${workUsername} (${userUid})`;
    return fullName || workUsername || userUid || String(user.email || "").trim();
  }, []);
  const resolveAssignmentUserRecord = useCallback(
    (value: string | null | undefined) => {
      const normalizedValue = normalizeName(String(value || ""));
      if (!normalizedValue) return null;
      return (
        assignmentUsers.find((user) =>
          [
            user.full_name,
            user.work_username,
            user.user_uid,
            user.email,
            buildSponsorDispatchAssigneeName(user),
          ].some((candidate) => normalizeName(String(candidate || "")) === normalizedValue),
        ) || null
      );
    },
    [assignmentUsers, buildSponsorDispatchAssigneeName],
  );

  const toggleMaintenanceRowSelection = useCallback((rowKey: string) => {
    const cleanKey = String(rowKey || "").trim();
    if (!cleanKey) return;
    setSelectedMaintenanceRowKeys((prev) =>
      prev.includes(cleanKey) ? prev.filter((item) => item !== cleanKey) : [...prev, cleanKey],
    );
  }, []);
  const describeMaintenanceRouteGroup = useCallback(
    (row: Pick<LiveMaintenanceRow, "treeId" | "assignee" | "treeOrigin">) => {
      const sourceTree = treeById.get(Number(row.treeId));
      const custodianName = String(sourceTree?.custodian_name || "").trim();
      if (custodianName) {
        return {
          key: `custodian:${normalizeName(custodianName)}`,
          label: `Custodian route: ${custodianName}`,
        };
      }
      const routeOwner = String(row.assignee || sourceTree?.created_by || "").trim();
      if (routeOwner && routeOwner !== "-") {
        return {
          key: `staff:${normalizeName(routeOwner)}`,
          label: `Field route: ${routeOwner}`,
        };
      }
      if (row.treeOrigin === "existing_inventory") {
        return {
          key: "origin:existing_inventory",
          label: "Existing inventory route",
        };
      }
      return {
        key: "origin:new_planting",
        label: "New planting route",
      };
    },
    [treeById],
  );
  const maintenanceMatchesAttentionFilter = useCallback(
    (row: LiveMaintenanceRow) => {
      if (maintenanceAttentionFilter === "all") return true;
      const sourceTree = treeById.get(Number(row.treeId));
      const treeStatus = normalizeTreeStatus(sourceTree?.status || "");
      const hasOpenTask = Number(row.openTaskId || 0) > 0 || row.pendingCount > 0;
      const isOverdue = row.countdownDays !== null && row.countdownDays < 0;
      const isDueSoon = row.countdownDays !== null && row.countdownDays >= 0 && row.countdownDays <= 7;
      const needsReplacement = row.activity === "replacement" || isReplacementTriggerStatus(treeStatus);
      const hasInspectionFlag =
        row.activity === "inspection" ||
        (!HEALTHY_TREE_STATUSES.has(treeStatus) && !isReplacementTriggerStatus(treeStatus));
      switch (maintenanceAttentionFilter) {
        case "needs_action":
          return row.tone !== "ok";
        case "no_open_task":
          return !hasOpenTask;
        case "overdue":
          return isOverdue || row.overdueCount > 0;
        case "due_soon":
          return row.tone === "warning" || isDueSoon;
        case "replacement_required":
          return needsReplacement;
        case "inspection_flags":
          return hasInspectionFlag;
        default:
          return true;
      }
    },
    [maintenanceAttentionFilter, treeById],
  );

  const workOrderUsesCustomTargets = newOrderMultiAssignEnabled && !newOrderSpeciesMode && newOrderMultiAssignTargetMode === "custom";
  const workOrderUsesCustomDueDates = newOrderMultiAssignEnabled && newOrderMultiAssignDueMode === "custom";

  const loadProjectData = async (projectId: number) => {
    const stamp = Date.now();
    let projectRes: PromiseSettledResult<any>,
      ordersRes: PromiseSettledResult<any>,
      treesRes: PromiseSettledResult<any>,
      tasksRes: PromiseSettledResult<any>,
      speciesMaturityRes: PromiseSettledResult<any>;

    try {
      [projectRes, ordersRes, treesRes, tasksRes, speciesMaturityRes] = await Promise.allSettled([
        api.get(`/green/projects/${projectId}?_ts=${stamp}`),
        api.get(`/green/work-orders?project_id=${projectId}&_ts=${stamp}`),
        api.get(`/green/projects/${projectId}/trees?_ts=${stamp}`),
        api.get(`/green/tasks?project_id=${projectId}&_ts=${stamp}`),
        api.get(`/green/projects/${projectId}/species-maturity?_ts=${stamp}`),
      ]);
    } catch {
      // Total failure (unlikely with allSettled, but handle offline gracefully)
      const [cachedProject, cachedTrees] = await Promise.all([
        getCachedProjectDetailOffline(projectId).catch(() => null),
        getCachedProjectTreesOffline(projectId).catch(() => []),
      ]);
      if (cachedProject) {
        setProjects((prev) => {
          const idx = prev.findIndex((item) => Number(item.id) === Number(projectId));
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], ...cachedProject };
          return next;
        });
      }
      if (cachedTrees && cachedTrees.length > 0) {
        setTrees(cachedTrees.filter((t: any) => Number.isFinite(Number(t.lng)) && Number.isFinite(Number(t.lat))));
      }
      return;
    }
    if (projectRes.status === "fulfilled") {
      const projectDetail = projectRes.value.data || {};
      setProjects((prev) => {
        const idx = prev.findIndex((item) => Number(item.id) === Number(projectId));
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...projectDetail };
        return next;
      });
      cacheProjectDetailOffline(projectId, projectDetail).catch(() => {});
      if (Array.isArray(projectDetail?.sponsor_accounts) && projectDetail.sponsor_accounts.length > 0) {
        setFallbackSponsorAccounts(projectDetail.sponsor_accounts.map((row: any) => normalizeSponsorAccountSummary(row)));
      }
      if (Array.isArray(projectDetail?.sponsorship_orders) && projectDetail.sponsorship_orders.length > 0) {
        setSponsorshipOrders(normalizeSponsorshipOrderRecords(projectDetail.sponsorship_orders));
        setSponsorshipOrdersError(null);
        setSponsorshipOrdersScopeNote(
          projectDetail?.sponsorship_scope_note ? String(projectDetail.sponsorship_scope_note) : null,
        );
      }
      const settingsPayload = projectDetail?.settings || projectDetail || {};
      const plantingModel = String(settingsPayload?.planting_model || "direct").trim().toLowerCase() as PlantingModel;
      setProjectSettingsDraft({
        workflow_profile: normalizeWorkflowProfile(settingsPayload?.workflow_profile),
        access_model: normalizeProjectAccessModel(settingsPayload?.access_model || projectDetail?.access_model),
        public_sponsor_enabled: Boolean(settingsPayload?.public_sponsor_enabled ?? projectDetail?.public_sponsor_enabled),
        public_sponsor_title: String(settingsPayload?.public_sponsor_title || projectDetail?.public_sponsor_title || ""),
        public_sponsor_description: String(settingsPayload?.public_sponsor_description || projectDetail?.public_sponsor_description || ""),
        sponsor_price_per_tree_ngn:
          settingsPayload?.sponsor_price_per_tree_ngn === null || settingsPayload?.sponsor_price_per_tree_ngn === undefined
            ? String(projectDetail?.sponsor_price_per_tree_ngn ?? "")
            : String(settingsPayload?.sponsor_price_per_tree_ngn ?? ""),
        sponsor_price_per_tree_usd:
          settingsPayload?.sponsor_price_per_tree_usd === null || settingsPayload?.sponsor_price_per_tree_usd === undefined
            ? String(projectDetail?.sponsor_price_per_tree_usd ?? "")
            : String(settingsPayload?.sponsor_price_per_tree_usd ?? ""),
        sponsor_capacity:
          settingsPayload?.sponsor_capacity === null || settingsPayload?.sponsor_capacity === undefined
            ? String(projectDetail?.sponsor_capacity ?? "")
            : String(settingsPayload?.sponsor_capacity ?? ""),
        sponsor_max_per_order:
          settingsPayload?.sponsor_max_per_order === null || settingsPayload?.sponsor_max_per_order === undefined
            ? String(projectDetail?.sponsor_max_per_order ?? "")
            : String(settingsPayload?.sponsor_max_per_order ?? ""),
        sponsor_dedication_enabled: Boolean(
          settingsPayload?.sponsor_dedication_enabled ?? projectDetail?.sponsor_dedication_enabled ?? true
        ),
        sponsor_payment_instructions: String(
          settingsPayload?.sponsor_payment_instructions || projectDetail?.sponsor_payment_instructions || ""
        ),
        public_sponsor_agent_user_ids: normalizePositiveIntList(
          settingsPayload?.public_sponsor_agent_user_ids ?? projectDetail?.public_sponsor_agent_user_ids,
        ),
        sponsor_agent_planting_fee:
          settingsPayload?.sponsor_agent_planting_fee === null || settingsPayload?.sponsor_agent_planting_fee === undefined
            ? String(projectDetail?.sponsor_agent_planting_fee ?? "")
            : String(settingsPayload?.sponsor_agent_planting_fee ?? ""),
        sponsor_agent_maintenance_fee:
          settingsPayload?.sponsor_agent_maintenance_fee === null || settingsPayload?.sponsor_agent_maintenance_fee === undefined
            ? String(projectDetail?.sponsor_agent_maintenance_fee ?? "")
            : String(settingsPayload?.sponsor_agent_maintenance_fee ?? ""),
        agric_program_type: String(settingsPayload?.agric_config?.program_type || "extension_support"),
        agric_focus_commodities: String(settingsPayload?.agric_config?.focus_commodities || ""),
        agric_support_packages: String(settingsPayload?.agric_config?.support_packages || ""),
        agric_season_label: String(settingsPayload?.agric_config?.season_label || ""),
        relief_program_type: String(settingsPayload?.relief_config?.program_type || "emergency_relief"),
        relief_intervention_focus: String(settingsPayload?.relief_config?.intervention_focus || ""),
        relief_package_types: String(settingsPayload?.relief_config?.package_types || ""),
        relief_target_zone: String(settingsPayload?.relief_config?.target_zone || ""),
        planting_model:
          plantingModel === "community_distributed" || plantingModel === "mixed" || plantingModel === "direct"
            ? plantingModel
            : "direct",
        allow_existing_tree_link: Boolean(settingsPayload?.allow_existing_tree_link),
        status: String(settingsPayload?.status || projectDetail?.status || "ongoing"),
        default_existing_tree_scope:
          String(settingsPayload?.default_existing_tree_scope || "exclude_from_planting_kpi").trim().toLowerCase() ===
          "include_in_planting_kpi"
            ? "include_in_planting_kpi"
            : "exclude_from_planting_kpi",
      });
    }

    if (ordersRes.status === "fulfilled") {
      const normalizedOrders = (Array.isArray(ordersRes.value.data) ? ordersRes.value.data : []).map((row: any) => ({
        ...row,
        target_trees: Number(row?.target_trees || 0),
        planted_count: Number(row?.planted_count || 0),
        auto_assign_first_cycle_maintenance: Boolean(row?.auto_assign_first_cycle_maintenance),
        allow_existing_tree_area_reuse: Boolean(row?.allow_existing_tree_area_reuse),
        species_allocations: normalizeSpeciesAllocations(row?.species_allocations),
      }));
      setOrders(normalizedOrders);
    } else {
      setOrders([]);
    }

    if (treesRes.status === "fulfilled") {
      const normalizedTrees = (treesRes.value.data || [])
        .map((tree: any) => ({
          ...tree,
          lng: Number(tree.lng),
          lat: Number(tree.lat),
          tree_height_m:
            Number.isFinite(Number(tree.tree_height_m)) && Number(tree.tree_height_m) >= 0
              ? Number(tree.tree_height_m)
              : null,
          tree_age_months:
            Number.isFinite(Number(tree.tree_age_months)) && Number(tree.tree_age_months) >= 0
              ? Number(tree.tree_age_months)
              : null,
          tree_origin: String(tree.tree_origin || "new_planting").toLowerCase(),
          attribution_scope: String(tree.attribution_scope || "full").toLowerCase(),
          count_in_planting_kpis: tree.count_in_planting_kpis !== false,
          count_in_carbon_scope: tree.count_in_carbon_scope !== false,
          sponsor_linked_units: Number(tree?.sponsor_linked_units || 0),
          sponsor_paid_units: Number(tree?.sponsor_paid_units || 0),
          sponsor_pending_units: Number(tree?.sponsor_pending_units || 0),
          sponsor_problem_units: Number(tree?.sponsor_problem_units || 0),
          sponsor_display_names: tree?.sponsor_display_names ? String(tree.sponsor_display_names).trim() || null : null,
          record_profile_data:
            tree.record_profile_data && typeof tree.record_profile_data === "object" ? tree.record_profile_data : null,
        }))
        .filter((tree: any) => Number.isFinite(tree.lng) && Number.isFinite(tree.lat));
      setTrees(normalizedTrees);
      cacheProjectTreesOffline(projectId, normalizedTrees).catch(() => {});
    } else {
      // Offline fallback for trees
      const cachedTrees = await getCachedProjectTreesOffline(projectId).catch(() => []);
      setTrees(cachedTrees.length > 0 ? cachedTrees : []);
    }

    if (tasksRes.status === "fulfilled") {
      setTasks(Array.isArray(tasksRes.value.data) ? tasksRes.value.data : []);
    } else {
      setTasks([]);
    }

    if (speciesMaturityRes.status === "fulfilled") {
      const serverMapRaw = speciesMaturityRes.value.data?.map || {};
      const serverMap = Object.entries(serverMapRaw).reduce(
        (acc, [key, value]) => {
          const normalizedKey = normalizeName(key);
          const years = Number(value);
          if (normalizedKey && Number.isFinite(years) && years > 0) {
            acc[normalizedKey] = Math.round(years);
          }
          return acc;
        },
        {} as Record<string, number>,
      );
      setSpeciesMaturityByProject((prev) => ({
        ...prev,
        [String(projectId)]: serverMap,
      }));
    }

    const [reviewQueueRes, alertsRes, carbonRes, kpiRes] = await Promise.allSettled([
      api.get(`/green/tasks/review-queue?project_id=${projectId}&_ts=${stamp}`),
      api.get(`/green/projects/${projectId}/alerts?refresh=true&status=open&_ts=${stamp}`),
      api.get(`/green/projects/${projectId}/carbon-summary?_ts=${stamp}`),
      api.get(`/green/reports/kpi?project_id=${projectId}&days=180&snapshot=true&_ts=${stamp}`),
    ]);

    if (reviewQueueRes.status === "fulfilled") {
      setReviewQueue(Array.isArray(reviewQueueRes.value.data) ? reviewQueueRes.value.data : []);
    } else {
      setReviewQueue([]);
    }

    if (alertsRes.status === "fulfilled") {
      setAlertsList(Array.isArray(alertsRes.value.data?.items) ? alertsRes.value.data.items : []);
      setAlertsSummary({
        total: Number(alertsRes.value.data?.summary?.total || 0),
        danger: Number(alertsRes.value.data?.summary?.danger || 0),
        warning: Number(alertsRes.value.data?.summary?.warning || 0),
        info: Number(alertsRes.value.data?.summary?.info || 0),
      });
    } else {
      setAlertsList([]);
      setAlertsSummary({ total: 0, danger: 0, warning: 0, info: 0 });
    }

    if (carbonRes.status === "fulfilled" && carbonRes.value.data) {
      setCarbonSummary({
        current_co2_tonnes: Number(carbonRes.value.data.current_co2_tonnes || 0),
        annual_co2_tonnes: Number(carbonRes.value.data.annual_co2_tonnes || 0),
        projected_lifetime_co2_tonnes: Number(carbonRes.value.data.projected_lifetime_co2_tonnes || 0),
        co2_per_tree_avg_kg: Number(carbonRes.value.data.co2_per_tree_avg_kg || 0),
        trees_missing_age_data: Number(carbonRes.value.data.trees_missing_age_data || 0),
        trees_with_fallback_age: Number(carbonRes.value.data.trees_with_fallback_age || 0),
        trees_pending_review: Number(carbonRes.value.data.trees_pending_review || 0),
        top_species: Array.isArray(carbonRes.value.data.top_species) ? carbonRes.value.data.top_species : [],
      });
    } else {
      setCarbonSummary(null);
    }

    if (kpiRes.status === "fulfilled" && kpiRes.value.data) {
      setKpiCurrent(kpiRes.value.data.current || null);
      const speciesDailyPayload = kpiRes.value.data?.species_daily_survival;
      setSpeciesDailyTrend(
        speciesDailyPayload && typeof speciesDailyPayload === "object" ? speciesDailyPayload : null,
      );
    } else {
      setKpiCurrent(null);
      setSpeciesDailyTrend(null);
    }
    lastLoadedProjectIdRef.current = projectId;
  };

  const stopRemoteMonitoringProgress = useCallback(() => {
    if (remoteMonitoringProgressTimerRef.current) {
      window.clearInterval(remoteMonitoringProgressTimerRef.current);
      remoteMonitoringProgressTimerRef.current = null;
    }
  }, []);

  const startRemoteMonitoringProgress = useCallback(() => {
    stopRemoteMonitoringProgress();
    setRemoteMonitoringProgressStep(0);
    setRemoteMonitoringProgressPct(10);
    let nextStep = 0;
    remoteMonitoringProgressTimerRef.current = window.setInterval(() => {
      nextStep = Math.min(nextStep + 1, REMOTE_MONITORING_PROGRESS_STEPS.length - 1);
      setRemoteMonitoringProgressStep(nextStep);
      setRemoteMonitoringProgressPct(Math.min(96, 10 + nextStep * 18));
      if (nextStep >= REMOTE_MONITORING_PROGRESS_STEPS.length - 1) {
        stopRemoteMonitoringProgress();
      }
    }, 900);
  }, [stopRemoteMonitoringProgress]);

  const loadRemoteMonitoringAnalysis = useCallback(async () => {
    if (!activeProjectId) return;
    const geometry = normalizeMapAreaGeometry(remoteMonitoringDraftGeometry);
    if (!geometry) {
      toast.error(
        draftWorkflowProfile === "agric"
          ? "Draw a farm block or choose a mapped farm boundary first."
          : "Draw a polygon or choose an existing planting polygon first.",
      );
      return;
    }
    setRemoteMonitoringLoading(true);
    startRemoteMonitoringProgress();
    try {
      const res = await api.post(
        `/green/vegetation-analysis?_ts=${Date.now()}`,
        {
          project_id: activeProjectId,
          area_geojson: geometry,
        },
        { timeout: 180000 },
      );
      stopRemoteMonitoringProgress();
      setRemoteMonitoringProgressStep(REMOTE_MONITORING_PROGRESS_STEPS.length - 1);
      setRemoteMonitoringProgressPct(100);
      setRemoteMonitoringFocusedTreeId(null);
      setRemoteMonitoringActionTreeId(null);
      setRemoteMonitoringReport(res.data || null);
    } catch (error: any) {
      stopRemoteMonitoringProgress();
      setRemoteMonitoringReport(null);
      const isTimeout = error?.code === "ECONNABORTED" || String(error?.message || "").toLowerCase().includes("timeout");
      const defaultMessage = draftWorkflowProfile === "agric" ? "Farm health monitoring" : "Remote monitoring";
      toast.error(
        error?.response?.data?.detail ||
          (isTimeout
            ? `${defaultMessage} timed out. The satellite analysis is taking too long — try a smaller area or retry shortly.`
            : `${defaultMessage} failed. Check your connection and try again.`),
      );
    } finally {
      setRemoteMonitoringLoading(false);
    }
  }, [activeProjectId, draftWorkflowProfile, remoteMonitoringDraftGeometry, startRemoteMonitoringProgress, stopRemoteMonitoringProgress]);

  const buildRemoteMonitoringInspectSeed = useCallback(
    (treeId: number, remoteTree?: RemoteMonitoringTreeAnalysis | null, loading = true): TreeInspectData | null => {
      const baseTree = trees.find((entry) => Number(entry.id) === Number(treeId));
      if (!baseTree && !remoteTree) return null;
      const status = String(remoteTree?.status || baseTree?.status || "unknown");
      const photoCandidates = [
        baseTree?.photo_url,
        ...(Array.isArray(baseTree?.photo_urls) ? baseTree?.photo_urls : []),
      ];
      const photoUrl = photoCandidates.find((value) => String(value || "").trim()) || "";
      return {
        id: treeId,
        project_tree_no: remoteTree?.project_tree_no ?? baseTree?.project_tree_no ?? null,
        status,
        status_label: treeStatusLabel(status),
        species: String(remoteTree?.species || baseTree?.species || "-"),
        planting_date: String(remoteTree?.planting_date || baseTree?.planting_date || ""),
        notes: String(baseTree?.notes || ""),
        created_by: String(baseTree?.created_by || "-"),
        photo_url: String(photoUrl || ""),
        tree_height_m: Number.isFinite(Number(baseTree?.tree_height_m)) ? Number(baseTree?.tree_height_m) : null,
        tree_age_months: Number.isFinite(Number(baseTree?.tree_age_months)) ? Number(baseTree?.tree_age_months) : null,
        tree_origin: String(remoteTree?.tree_origin || baseTree?.tree_origin || "new_planting"),
        attribution_scope: String(baseTree?.attribution_scope || "full"),
        count_in_planting_kpis: baseTree?.count_in_planting_kpis !== false,
        count_in_carbon_scope: baseTree?.count_in_carbon_scope !== false,
        custodian_name: String(baseTree?.custodian_name || ""),
        maintenance: { total: 0, done: 0, pending: 0, overdue: 0 },
        tasks: [],
        visits: [],
        loading,
      };
    },
    [trees],
  );

  const hydrateRemoteMonitoringTreeInspect = useCallback(
    async (treeId: number, remoteTree?: RemoteMonitoringTreeAnalysis | null) => {
      const seed = buildRemoteMonitoringInspectSeed(treeId, remoteTree, true);
      if (seed) setInspectedTree(seed);
      try {
        const [tasksRes, timelineRes] = await Promise.allSettled([
          api.get(`/green/trees/${treeId}/tasks`),
          api.get(`/green/trees/${treeId}/timeline`),
        ]);
        const tasks = tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data) ? tasksRes.value.data : [];
        const timeline = timelineRes.status === "fulfilled" ? timelineRes.value.data : null;
        const visits = Array.isArray(timeline?.visits) ? timeline.visits : [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isTaskDone = (task: any) => normalizeName(task?.status) === "done";
        const isTaskOverdue = (task: any) => {
          if (isTaskDone(task)) return false;
          const dueAt = task?.due_date ? new Date(task.due_date) : null;
          if (!dueAt || Number.isNaN(dueAt.getTime())) return false;
          dueAt.setHours(0, 0, 0, 0);
          return dueAt.getTime() < today.getTime();
        };
        const maintenance = {
          total: tasks.length,
          done: tasks.filter((task: any) => isTaskDone(task)).length,
          pending: tasks.filter((task: any) => !isTaskDone(task)).length,
          overdue: tasks.filter((task: any) => isTaskOverdue(task)).length,
        };
        const taskPhoto = tasks.find((task: any) => String(task?.photo_url || "").trim())?.photo_url || "";
        const visitPhoto = visits.find((visit: any) => String(visit?.photo_url || "").trim())?.photo_url || "";
        setInspectedTree((prev) => {
          if (prev && Number(prev.id) !== Number(treeId)) return prev;
          const base = buildRemoteMonitoringInspectSeed(treeId, remoteTree, false) || prev || seed;
          if (!base) return prev;
          return {
            ...base,
            photo_url: String(base.photo_url || taskPhoto || visitPhoto || ""),
            maintenance,
            tasks,
            visits,
            loading: false,
          };
        });
      } catch {
        setInspectedTree((prev) => {
          if (!prev || Number(prev.id) !== Number(treeId)) return prev;
          return { ...prev, loading: false };
        });
      }
    },
    [buildRemoteMonitoringInspectSeed],
  );

  const focusRemoteMonitoringTree = useCallback(
    (tree: RemoteMonitoringTreeAnalysis) => {
      const treeId = Number(tree.tree_id || 0);
      if (!treeId) return;
      setRemoteMonitoringDrawActive(false);
      setRemoteMonitoringFocusedTreeId(treeId);
      setRemoteMonitoringActionTreeId(null);
      mapCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      void hydrateRemoteMonitoringTreeInspect(treeId, tree);
    },
    [hydrateRemoteMonitoringTreeInspect],
  );

  const loadVerraHistory = useCallback(async (projectId: number) => {
    const res = await api.get(`/green/projects/${projectId}/verra/exports?limit=100`);
    setVerraHistory(Array.isArray(res.data) ? res.data : []);
  }, []);

  const loadServerLiveMaintenance = useCallback(
    async (
      projectId: number,
      season: SeasonMode,
      assignee: string,
      treeScope: "new_planting" | "existing_inventory" = "new_planting",
    ) => {
      const query = new URLSearchParams();
      query.set("season_mode", season);
      query.set("tree_scope", treeScope);
      if (assignee !== "all") {
        query.set("assignee_name", assignee);
      }
      const res = await api.get(`/green/projects/${projectId}/live-maintenance?${query.toString()}`);
      const rows = Array.isArray(res.data?.rows) ? res.data.rows : [];
      const sources =
        Array.isArray(res.data?.sources) && res.data.sources.length ? res.data.sources : LIVE_TABLE_SOURCES;
      if (treeScope === "existing_inventory") {
        setServerExistingLiveRows(rows);
        setServerExistingLiveSources(sources);
        return;
      }
      setServerLiveRows(rows);
      setServerLiveSources(sources);
    },
    [],
  );

  const loadCommunityData = useCallback(async (projectId: number) => {
    const [custodianRes, eventsRes, allocationsRes] = await Promise.allSettled([
      api.get(`/green/projects/${projectId}/custodians`),
      api.get(`/green/projects/${projectId}/distribution-events`),
      api.get(`/green/projects/${projectId}/distribution-allocations`),
    ]);
    setCustodians(
      custodianRes.status === "fulfilled" && Array.isArray(custodianRes.value.data)
        ? custodianRes.value.data
        : [],
    );
    setDistributionEvents(
      eventsRes.status === "fulfilled" && Array.isArray(eventsRes.value.data)
        ? eventsRes.value.data
        : [],
    );
    setDistributionAllocations(
      allocationsRes.status === "fulfilled" && Array.isArray(allocationsRes.value.data)
        ? allocationsRes.value.data
        : [],
    );
  }, []);

  const saveProjectSettings = async () => {
    if (!activeProjectId) return;
    const existingAccessModel = normalizeProjectAccessModel(
      activeProjectRecord?.settings?.access_model || activeProjectRecord?.access_model || projectSettingsDraft.access_model,
    );
    const nextAccessModel = canAccessSuperAdmin
      ? normalizeProjectAccessModel(projectSettingsDraft.access_model)
      : existingAccessModel;
    if (
      !canAccessSuperAdmin &&
      normalizeProjectAccessModel(projectSettingsDraft.access_model) !== existingAccessModel
    ) {
      toast.error("Only super admin can change the public sponsorship route.");
      return;
    }
    if (nextAccessModel === "public_sponsorship" && projectSettingsDraft.workflow_profile !== "green") {
      toast.error("Public sponsorship projects currently run on the Green workflow only.");
      return;
    }
    const nextPublicSponsorshipProject = isPublicSponsorshipProject(
      nextAccessModel,
      nextAccessModel === "public_sponsorship" ? true : projectSettingsDraft.public_sponsor_enabled,
    );
    const existingPublicSponsorTitle = String(
      activeProjectRecord?.settings?.public_sponsor_title ?? activeProjectRecord?.public_sponsor_title ?? "",
    ).trim();
    const existingPublicSponsorDescription = String(
      activeProjectRecord?.settings?.public_sponsor_description ?? activeProjectRecord?.public_sponsor_description ?? "",
    ).trim();
    const existingSponsorPricePerTreeNgn =
      activeProjectRecord?.settings?.sponsor_price_per_tree_ngn ?? activeProjectRecord?.sponsor_price_per_tree_ngn;
    const existingSponsorPricePerTreeUsd =
      activeProjectRecord?.settings?.sponsor_price_per_tree_usd ?? activeProjectRecord?.sponsor_price_per_tree_usd;
    const existingSponsorCapacity = activeProjectRecord?.settings?.sponsor_capacity ?? activeProjectRecord?.sponsor_capacity;
    const existingSponsorMaxPerOrder =
      activeProjectRecord?.settings?.sponsor_max_per_order ?? activeProjectRecord?.sponsor_max_per_order;
    const existingSponsorAgentPlantingFee =
      activeProjectRecord?.settings?.sponsor_agent_planting_fee ?? activeProjectRecord?.sponsor_agent_planting_fee;
    const existingSponsorAgentMaintenanceFee =
      activeProjectRecord?.settings?.sponsor_agent_maintenance_fee ?? activeProjectRecord?.sponsor_agent_maintenance_fee;
    const existingSponsorDedicationEnabled = Boolean(
      activeProjectRecord?.settings?.sponsor_dedication_enabled ?? activeProjectRecord?.sponsor_dedication_enabled,
    );
    const existingSponsorPaymentInstructions = String(
      activeProjectRecord?.settings?.sponsor_payment_instructions ??
        activeProjectRecord?.sponsor_payment_instructions ??
        "",
    ).trim();
    try {
      const res = await api.patch(`/green/projects/${activeProjectId}/settings`, {
        workflow_profile: projectSettingsDraft.workflow_profile,
        access_model: nextAccessModel,
        public_sponsor_enabled:
          nextPublicSponsorshipProject,
        public_sponsor_title:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? projectSettingsDraft.public_sponsor_title.trim() || null
              : existingPublicSponsorTitle || null
            : null,
        public_sponsor_description:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? projectSettingsDraft.public_sponsor_description.trim() || null
              : existingPublicSponsorDescription || null
            : null,
        sponsor_price_per_tree_ngn:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? Number(projectSettingsDraft.sponsor_price_per_tree_ngn || 0)
              : existingSponsorPricePerTreeNgn === null || existingSponsorPricePerTreeNgn === undefined
                ? null
                : Number(existingSponsorPricePerTreeNgn)
            : null,
        sponsor_price_per_tree_usd:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? Number(projectSettingsDraft.sponsor_price_per_tree_usd || 0)
              : existingSponsorPricePerTreeUsd === null || existingSponsorPricePerTreeUsd === undefined
                ? null
                : Number(existingSponsorPricePerTreeUsd)
            : null,
        sponsor_currency:
          nextPublicSponsorshipProject
            ? Number(
                canAccessSuperAdmin
                  ? projectSettingsDraft.sponsor_price_per_tree_ngn || 0
                  : existingSponsorPricePerTreeNgn || 0,
              ) > 0
              ? "NGN"
              : "USD"
            : "NGN",
        sponsor_price_per_tree:
          nextPublicSponsorshipProject
            ? Number(
                canAccessSuperAdmin
                  ? projectSettingsDraft.sponsor_price_per_tree_ngn || 0
                  : existingSponsorPricePerTreeNgn || 0,
              ) > 0
              ? Number(
                  canAccessSuperAdmin
                    ? projectSettingsDraft.sponsor_price_per_tree_ngn || 0
                    : existingSponsorPricePerTreeNgn || 0,
                )
              : Number(
                    canAccessSuperAdmin
                      ? projectSettingsDraft.sponsor_price_per_tree_usd || 0
                      : existingSponsorPricePerTreeUsd || 0,
                  ) > 0
                ? Number(
                    canAccessSuperAdmin
                      ? projectSettingsDraft.sponsor_price_per_tree_usd || 0
                      : existingSponsorPricePerTreeUsd || 0,
                  )
                : null
            : null,
        sponsor_capacity:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? Number(projectSettingsDraft.sponsor_capacity || 0) > 0
                ? Number(projectSettingsDraft.sponsor_capacity)
                : null
              : existingSponsorCapacity === null || existingSponsorCapacity === undefined
                ? null
                : Number(existingSponsorCapacity)
            : null,
        sponsor_max_per_order:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? Number(projectSettingsDraft.sponsor_max_per_order || 0) > 0
                ? Number(projectSettingsDraft.sponsor_max_per_order)
                : null
              : existingSponsorMaxPerOrder === null || existingSponsorMaxPerOrder === undefined
                ? null
                : Number(existingSponsorMaxPerOrder)
            : null,
        sponsor_dedication_enabled:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? Boolean(projectSettingsDraft.sponsor_dedication_enabled)
              : existingSponsorDedicationEnabled
            : false,
        sponsor_payment_instructions:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? projectSettingsDraft.sponsor_payment_instructions.trim() || null
              : existingSponsorPaymentInstructions || null
            : null,
        sponsor_agent_planting_fee:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? Number(projectSettingsDraft.sponsor_agent_planting_fee || 0) > 0
                ? Number(projectSettingsDraft.sponsor_agent_planting_fee)
                : null
              : existingSponsorAgentPlantingFee === null || existingSponsorAgentPlantingFee === undefined
                ? null
                : Number(existingSponsorAgentPlantingFee)
            : null,
        sponsor_agent_maintenance_fee:
          nextPublicSponsorshipProject
            ? canAccessSuperAdmin
              ? Number(projectSettingsDraft.sponsor_agent_maintenance_fee || 0) > 0
                ? Number(projectSettingsDraft.sponsor_agent_maintenance_fee)
                : null
              : existingSponsorAgentMaintenanceFee === null || existingSponsorAgentMaintenanceFee === undefined
                ? null
                : Number(existingSponsorAgentMaintenanceFee)
            : null,
        public_sponsor_agent_user_ids:
          nextPublicSponsorshipProject ? projectSettingsDraft.public_sponsor_agent_user_ids : [],
        agric_config:
          projectSettingsDraft.workflow_profile === "agric"
            ? {
                program_type: projectSettingsDraft.agric_program_type || "extension_support",
                focus_commodities: projectSettingsDraft.agric_focus_commodities || null,
                support_packages: projectSettingsDraft.agric_support_packages || null,
                season_label: projectSettingsDraft.agric_season_label || null,
              }
            : {},
        relief_config:
          projectSettingsDraft.workflow_profile === "relief_recovery"
            ? {
                program_type: projectSettingsDraft.relief_program_type || "emergency_relief",
                intervention_focus: projectSettingsDraft.relief_intervention_focus || null,
                package_types: projectSettingsDraft.relief_package_types || null,
                target_zone: projectSettingsDraft.relief_target_zone || null,
              }
            : {},
        planting_model: projectSettingsDraft.planting_model,
        status: projectSettingsDraft.status,
      });
      setProjects((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(activeProjectId)
            ? {
                ...item,
                ...res.data,
                settings: {
                  ...(item.settings || {}),
                  ...res.data,
                },
              }
            : item,
        )
      );
      setProjectSetupExpanded(false);
      toast.success("Project settings updated");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to update project settings");
    }
  };

  const savePublicSponsorAgents = async () => {
    if (!activeProjectId || !publicSponsorshipProject || !canAccessSuperAdmin) return;
    try {
      setSavingPublicSponsorAgents(true);
      const res = await api.patch(`/green/projects/${activeProjectId}/settings`, {
        public_sponsor_agent_user_ids: projectSettingsDraft.public_sponsor_agent_user_ids,
      });
      const normalizedPublicSponsorAgentUserIds = normalizePositiveIntList(res.data?.public_sponsor_agent_user_ids);
      setProjects((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(activeProjectId)
            ? {
                ...item,
                ...res.data,
                public_sponsor_agent_user_ids: normalizedPublicSponsorAgentUserIds,
                settings: {
                  ...(item.settings || {}),
                  ...res.data,
                  public_sponsor_agent_user_ids: normalizedPublicSponsorAgentUserIds,
                },
              }
            : item,
        )
      );
      setProjectSettingsDraft((prev) => ({
        ...prev,
        public_sponsor_agent_user_ids: normalizedPublicSponsorAgentUserIds,
      }));
      toast.success("Public sponsor agents updated");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to update public sponsor agents");
    } finally {
      setSavingPublicSponsorAgents(false);
    }
  };

  const createCustodian = async () => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Custodian operations are disabled. PDF export only.");
      return;
    }
    if (!activeProjectId) return;
    if (!newCustodian.name.trim()) {
      toast.error(`${activeWorkflowLabels.ownerSingular} name required`);
      return;
    }
    if (
      !(await ensureWorkOperationalConsent("custodian_create", {
        has_phone: Boolean(newCustodian.phone.trim()),
        has_email: Boolean(newCustodian.email.trim()),
      }))
    ) {
      return;
    }
    try {
      await api.post(`/green/projects/${activeProjectId}/custodians`, {
        custodian_type: newCustodian.custodian_type,
        name: newCustodian.name.trim(),
        contact_person: newCustodian.contact_person || null,
        phone: newCustodian.phone || null,
        alt_phone: newCustodian.alt_phone || null,
        email: newCustodian.email || null,
        address_text: newCustodian.address_text || null,
        local_government: newCustodian.local_government || null,
        community_name: newCustodian.community_name || null,
        verification_status: newCustodian.verification_status || "pending",
        notes: newCustodian.notes || null,
        profile_data:
          activeWorkflowProfile === "agric"
            ? {
                farmer_code: newCustodian.farmer_code || null,
                gender: newCustodian.gender || null,
                date_of_birth: newCustodian.date_of_birth || null,
                national_id: newCustodian.national_id || null,
                state_name: newCustodian.state_name || null,
                ward_name: newCustodian.ward_name || null,
                farmer_group: newCustodian.farmer_group || null,
                household_size: newCustodian.household_size ? Number(newCustodian.household_size) : null,
                primary_crop: newCustodian.primary_crop || null,
                secondary_crops: newCustodian.secondary_crops || null,
                land_tenure: newCustodian.land_tenure || null,
                irrigation_access: newCustodian.irrigation_access || null,
                finance_access: newCustodian.finance_access,
                insurance_access: newCustodian.insurance_access,
                input_support_needs: newCustodian.input_support_needs || null,
              }
            : activeWorkflowProfile === "relief_recovery"
              ? {
                  beneficiary_code: newCustodian.beneficiary_code || null,
                  government_id: newCustodian.government_id || null,
                  displacement_status: newCustodian.displacement_status || null,
                  origin_location: newCustodian.origin_location || null,
                  current_settlement: newCustodian.current_settlement || null,
                  support_category: newCustodian.support_category || null,
                  priority_needs: newCustodian.priority_needs || null,
                  livelihood_type: newCustodian.livelihood_type || null,
                  vulnerability_flags: newCustodian.vulnerability_flags || null,
                  relief_gender: newCustodian.relief_gender || null,
                  shelter_status: newCustodian.shelter_status || null,
                  household_size: newCustodian.household_size ? Number(newCustodian.household_size) : null,
                  women_count: newCustodian.women_count ? Number(newCustodian.women_count) : null,
                  children_under_five: newCustodian.children_under_five ? Number(newCustodian.children_under_five) : null,
                  elderly_count: newCustodian.elderly_count ? Number(newCustodian.elderly_count) : null,
                  disability_count: newCustodian.disability_count ? Number(newCustodian.disability_count) : null,
                }
            : {},
      });
      setNewCustodian({
        custodian_type: "household",
        name: "",
        contact_person: "",
        phone: "",
        alt_phone: "",
        email: "",
        address_text: "",
        local_government: "",
        community_name: "",
        verification_status: "pending",
        notes: "",
        farmer_code: "",
        gender: "",
        date_of_birth: "",
        national_id: "",
        state_name: "",
        ward_name: "",
        farmer_group: "",
        household_size: "",
        primary_crop: "",
        secondary_crops: "",
        land_tenure: "",
        irrigation_access: "",
        finance_access: false,
        insurance_access: false,
        input_support_needs: "",
        beneficiary_code: "",
        government_id: "",
        displacement_status: "",
        origin_location: "",
        current_settlement: "",
        support_category: "",
        priority_needs: "",
        livelihood_type: "",
        vulnerability_flags: "",
        relief_gender: "",
        shelter_status: "",
        women_count: "",
        children_under_five: "",
        elderly_count: "",
        disability_count: "",
      });
      await loadCommunityData(activeProjectId);
      toast.success(`${activeWorkflowLabels.ownerSingular} added`);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to add custodian");
    }
  };

  const updateCustodianVerification = async (custodianId: number, nextStatus: string) => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Custodian operations are disabled. PDF export only.");
      return;
    }
    if (!activeProjectId) return;
    try {
      await api.patch(`/green/custodians/${custodianId}`, {
        verification_status: nextStatus,
      });
      setCustodians((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(custodianId) ? { ...item, verification_status: nextStatus } : item
        )
      );
      toast.success("Custodian updated");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to update custodian");
    }
  };

  const createDistributionEvent = async () => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Custodian operations are disabled. PDF export only.");
      return;
    }
    if (!activeProjectId) return;
    if (!newDistributionEvent.event_date) {
      toast.error("Distribution date required");
      return;
    }
    if (Number(newDistributionEvent.quantity || 0) <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (
      !(await ensureWorkOperationalConsent("distribution_event_create", {
        quantity: Number(newDistributionEvent.quantity || 0),
        distributed_by: newDistributionEvent.distributed_by || null,
      }))
    ) {
      return;
    }
    try {
      await api.post(`/green/projects/${activeProjectId}/distribution-events`, {
        event_date: newDistributionEvent.event_date,
        species: newDistributionEvent.species || null,
        quantity: Number(newDistributionEvent.quantity || 0),
        source_batch_ref: newDistributionEvent.source_batch_ref || null,
        distributed_by: newDistributionEvent.distributed_by || null,
        notes: newDistributionEvent.notes || null,
      });
      setNewDistributionEvent({
        event_date: "",
        species: "",
        quantity: 0,
        source_batch_ref: "",
        distributed_by: "",
        notes: "",
      });
      await loadCommunityData(activeProjectId);
      toast.success("Distribution event created");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to create distribution event");
    }
  };

  const upsertDistributionAllocation = async () => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Custodian operations are disabled. PDF export only.");
      return;
    }
    if (!activeProjectId) return;
    const eventId = Number(newAllocation.event_id || 0);
    const custodianId = Number(newAllocation.custodian_id || 0);
    if (!eventId || !custodianId) {
      toast.error("Choose event and custodian");
      return;
    }
    if (Number(newAllocation.quantity_allocated || 0) <= 0) {
      toast.error("Allocated quantity must be greater than 0");
      return;
    }
    if (Number(newAllocation.supervision_target || 0) < 0) {
      toast.error("Supervision target cannot be negative");
      return;
    }
    if (
      !(await ensureWorkOperationalConsent("distribution_allocation_save", {
        event_id: eventId,
        custodian_id: custodianId,
        quantity_allocated: Number(newAllocation.quantity_allocated || 0),
      }))
    ) {
      return;
    }
    try {
      await api.post(`/green/distribution-events/${eventId}/allocations`, {
        custodian_id: custodianId,
        quantity_allocated: Number(newAllocation.quantity_allocated || 0),
        supervision_target: Number(newAllocation.supervision_target || 0),
        expected_planting_start: newAllocation.expected_planting_start || null,
        expected_planting_end: newAllocation.expected_planting_end || null,
        followup_cycle_days: Number(newAllocation.followup_cycle_days || 14),
        notes: newAllocation.notes || null,
      });
      setNewAllocation({
        event_id: "",
        custodian_id: "",
        quantity_allocated: 0,
        supervision_target: 1,
        expected_planting_start: "",
        expected_planting_end: "",
        followup_cycle_days: 14,
        notes: "",
      });
      await loadCommunityData(activeProjectId);
      toast.success("Allocation saved");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to save allocation");
    }
  };

  const openCustodianSupervisionAssign = (
    custodianId: number,
    preferredMode: AgricVisitAssignmentMode | null = null,
  ) => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Custodian operations are disabled. PDF export only.");
      return;
    }
    const hasMappedPlots = visibleProjectTrees.some((tree) => Number(tree.custodian_id || 0) === Number(custodianId));
    const assignmentMode =
      preferredMode ||
      (fieldWorkflowMode && !hasMappedPlots ? "field_capture" : "support_visit");
    const allocationRows = distributionAllocations
      .filter((row) => Number(row.custodian_id) === Number(custodianId))
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    if (assignmentMode === "support_visit" && allocationRows.length === 0) {
      toast.error(
        fieldWorkflowMode
          ? `No support allocation found for this ${activeWorkflowLabels.ownerSingular.toLowerCase()} yet.`
          : "No allocation found for this custodian yet.",
      );
      return;
    }
    const preferred =
      allocationRows.find((row) => Number(row.supervision_remaining || 0) > 0) ||
      allocationRows.find((row) => Number(row.supervision_target || 0) > 0) ||
      allocationRows[0] ||
      null;
    const suggestedAssignee =
      users.find((user) => normalizeName(user.role) === "field_officer") ||
      users.find((user) => normalizeName(user.role) === "supervisor") ||
      users[0];
    setCustodianAssignDraft({
      custodian_id: Number(custodianId),
      allocation_id: Number(preferred?.id || 0),
      assignee_name: suggestedAssignee?.full_name || "",
      visits_to_assign: 1,
      due_date: "",
      priority: "normal",
      assignment_mode: assignmentMode,
    });
  };

  const assignCustodianSupervision = async () => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Custodian operations are disabled. PDF export only.");
      return;
    }
    if (!activeProjectId || !custodianAssignDraft) return;
    const assignmentMode = custodianAssignDraft.assignment_mode || "support_visit";
    const allocationId = Number(custodianAssignDraft.allocation_id || 0);
    if (assignmentMode === "support_visit" && !allocationId) {
      toast.error("Choose an allocation first.");
      return;
    }
    if (!String(custodianAssignDraft.assignee_name || "").trim()) {
      toast.error(
        assignmentMode === "field_capture"
          ? "Select a field capture assignee."
          : fieldWorkflowMode
            ? `Select a ${activeWorkflowLabels.supportVisitTitle.toLowerCase().replace(/s$/, "")} assignee.`
            : "Select a supervision assignee.",
      );
      return;
    }
    if (Number(custodianAssignDraft.visits_to_assign || 0) <= 0) {
      toast.error("Visits to assign must be at least 1.");
      return;
    }
    try {
      const res =
        assignmentMode === "field_capture"
          ? await api.post(`/green/projects/${activeProjectId}/custodians/${custodianAssignDraft.custodian_id}/assign-field-capture`, {
              assignee_name: custodianAssignDraft.assignee_name,
              due_date: custodianAssignDraft.due_date || null,
              priority: custodianAssignDraft.priority || "normal",
              actor_name: "supervisor",
            })
          : await api.post(`/green/distribution-allocations/${allocationId}/assign-supervision`, {
              assignee_name: custodianAssignDraft.assignee_name,
              visits_to_assign: Number(custodianAssignDraft.visits_to_assign || 1),
              due_date: custodianAssignDraft.due_date || null,
              priority: custodianAssignDraft.priority || "normal",
              actor_name: "supervisor",
            });
      await Promise.all([loadProjectData(activeProjectId), loadCommunityData(activeProjectId)]);
      const createdCount = Number(res?.data?.created_count || 0);
      const responseAssignmentMode = String(res?.data?.assignment_mode || "");
      toast.success(
        responseAssignmentMode === "field_capture"
          ? createdCount > 0
            ? `Assigned ${createdCount} first field capture task${createdCount === 1 ? "" : "s"}.`
            : "No new field capture tasks assigned."
          : createdCount > 0
            ? fieldWorkflowMode
              ? `Assigned ${createdCount} ${activeWorkflowLabels.supportVisitTitle.toLowerCase().replace(/s$/, "")}${createdCount === 1 ? "" : "s"}.`
              : `Assigned ${createdCount} supervision visit${createdCount === 1 ? "" : "s"}.`
            : fieldWorkflowMode
              ? `No new ${activeWorkflowLabels.supportVisitTitle.toLowerCase()} assigned.`
              : "No new supervision tasks assigned.",
      );
      setCustodianAssignDraft(null);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.detail ||
          (assignmentMode === "field_capture"
            ? "Failed to assign field capture."
            : fieldWorkflowMode
              ? `Failed to assign ${activeWorkflowLabels.supportVisitTitle.toLowerCase().replace(/s$/, "")}`
              : "Failed to assign supervision"),
      );
    }
  };

  const loadSponsorshipOrders = useCallback(async (projectId: number, options?: { silent?: boolean; forceSync?: boolean }) => {
    const silent = Boolean(options?.silent);
    const forceSync = Boolean(options?.forceSync);
    if (!projectId) {
      setSponsorshipOrders([]);
      setSponsorshipOrdersError(null);
      setSponsorshipOrdersScopeNote(null);
      return;
    }
    if (!silent) setSponsorshipOrdersLoading(true);
    setSponsorshipOrdersError(null);
    setSponsorshipOrdersScopeNote(null);
    const ts = Date.now();
    try {
      const syncQs = forceSync ? "&sync=1" : "";
      const res = await api.get(`/green/admin/sponsorship-orders?project_id=${projectId}${syncQs}&_ts=${ts}`);
      const rows = Array.isArray(res.data) ? res.data : [];
      if (rows.length > 0) {
        setSponsorshipOrders(normalizeSponsorshipOrderRecords(rows));
        return;
      }
      const fallbackRes = await api.get(`/green/admin/sponsorship-orders?${syncQs ? `sync=1&` : ""}_ts=${ts}`);
      const fallbackRows = Array.isArray(fallbackRes.data) ? fallbackRes.data : [];
      if (fallbackRows.length > 0) {
        setSponsorshipOrders(normalizeSponsorshipOrderRecords(fallbackRows));
        setSponsorshipOrdersScopeNote(
          "No sponsorship orders matched this project yet. Showing all public sponsorship payments across projects so paid sponsors are still visible.",
        );
        return;
      }
      setSponsorshipOrders([]);
    } catch (error: any) {
      try {
        // Fallback without sync=1 so we don't trigger a second Flutterwave API call
        const fallbackRes = await api.get(`/green/admin/sponsorship-orders?_ts=${Date.now()}`);
        const fallbackRows = Array.isArray(fallbackRes.data) ? fallbackRes.data : [];
        if (fallbackRows.length > 0) {
          setSponsorshipOrders(normalizeSponsorshipOrderRecords(fallbackRows));
          setSponsorshipOrdersScopeNote(
            "Project-specific sponsorship lookup failed. Showing all public sponsorship payments across projects so paid sponsors are still visible.",
          );
          setSponsorshipOrdersError(null);
          return;
        }
      } catch {
        // keep original error below
      }
      setSponsorshipOrdersError(error?.response?.data?.detail || error?.message || "Failed to load sponsorship records");
    } finally {
      if (!silent) setSponsorshipOrdersLoading(false);
    }
  }, []);

  const loadSponsorAccounts = useCallback(async () => {
    try {
      const res = await api.get(`/green/admin/sponsors?_ts=${Date.now()}`);
      const rows = Array.isArray(res.data) ? res.data : [];
      setFallbackSponsorAccounts(rows.map((row: any) => normalizeSponsorAccountSummary(row)));
    } catch (err: any) {
      // Surface error into the shared sponsorship error state so the user sees it
      const msg = err?.response?.data?.detail || err?.message || "Failed to load sponsor accounts";
      setSponsorshipOrdersError((prev) => prev || msg);
      setFallbackSponsorAccounts([]);
    }
  }, []);

  const loadSponsorFeedback = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const [followClaimsRes, complaintsRes, nominationsRes, projectsRes, redemptionsRes, assistantEscalationsRes] = await Promise.all([
        canAccessSuperAdmin
          ? api.get(`/green/admin/social-follow-claims?_ts=${Date.now()}`)
          : Promise.resolve({ data: [] }),
        api.get(`/green/admin/complaints?_ts=${Date.now()}`),
        api.get(`/green/admin/school-nominations?_ts=${Date.now()}`),
        api.get(`/green/admin/community-projects?_ts=${Date.now()}`),
        api.get(`/green/admin/point-redemptions?_ts=${Date.now()}`),
        api.get(`/green/admin/assistant-escalations?_ts=${Date.now()}`),
      ]);
      setSocialFollowClaims(Array.isArray(followClaimsRes.data) ? followClaimsRes.data : []);
      setComplaints(Array.isArray(complaintsRes.data) ? complaintsRes.data : []);
      setSchoolNominations(Array.isArray(nominationsRes.data) ? nominationsRes.data : []);
      setCommunityProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);
      setRedemptions(Array.isArray(redemptionsRes.data) ? redemptionsRes.data : []);
      setAssistantEscalations(Array.isArray(assistantEscalationsRes.data) ? assistantEscalationsRes.data : []);
    } catch (err: any) {
      setFeedbackError(err?.response?.data?.detail || err?.message || "Failed to load sponsor feedback data");
    } finally {
      if (!silent) setFeedbackLoading(false);
    }
  }, [canAccessSuperAdmin]);

  const handleResolveComplaint = async (complaintId: number, supervisorNote?: string) => {
    try {
      const res = await api.post(`/green/admin/complaints/${complaintId}/resolve`, { supervisor_note: supervisorNote });
      if (res.data.ok || res.status === 200) {
        toast.success("Complaint resolved successfully!");
        void loadSponsorFeedback({ silent: true });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Failed to resolve complaint");
    }
  };

  const handleResolveAssistantEscalation = async (escalationId: number, supervisorNote?: string, adminReply?: string) => {
    setResolvingAssistantEscalationId(escalationId);
    try {
      const res = await api.post(`/green/admin/assistant-escalations/${escalationId}/resolve`, {
        supervisor_note: supervisorNote,
        admin_reply: adminReply,
      });
      if (res.data?.ok || res.status === 200) {
        toast.success(adminReply ? "Reply sent to the visitor by email!" : "Escalation marked resolved!");
        void loadSponsorFeedback({ silent: true });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Failed to resolve this question");
    } finally {
      setResolvingAssistantEscalationId(null);
    }
  };

  const handleReviewSchoolNomination = async (nominationId: number, status: string, supervisorNote?: string) => {
    try {
      const res = await api.post(`/green/admin/school-nominations/${nominationId}/review`, { status, supervisor_note: supervisorNote });
      if (res.data.ok || res.status === 200) {
        toast.success(`School nomination set to ${status}!`);
        void loadSponsorFeedback({ silent: true });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Failed to review school nomination");
    }
  };

  const handleUpdateCommunityProjectStatus = async (projectId: number, status: string, supervisorNote?: string) => {
    try {
      const res = await api.post(`/green/admin/community-projects/${projectId}/status`, { status, supervisor_note: supervisorNote });
      if (res.data.ok || res.status === 200) {
        toast.success(`Community project status updated to ${status}!`);
        void loadSponsorFeedback({ silent: true });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Failed to update community project status");
    }
  };

  const handleReviewPointRedemption = async (redemptionId: number, status: string, supervisorNote?: string) => {
    try {
      const res = await api.post(`/green/admin/point-redemptions/${redemptionId}/review`, { status, supervisor_note: supervisorNote });
      if (res.data.status === "success" || res.status === 200) {
        toast.success(`Reward redemption reviewed successfully!`);
        void loadSponsorFeedback({ silent: true });
        void loadSponsorAccounts();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Failed to review reward redemption");
    }
  };

  const handleReviewSocialFollowClaim = async (claimId: number, status: "approved" | "rejected", supervisorNote?: string) => {
    if (!canAccessSuperAdmin) {
      toast.error("Only super admin can review follow-proof claims.");
      return;
    }
    try {
      const res = await api.post(`/green/admin/social-follow-claims/${claimId}/review`, {
        status,
        supervisor_note: supervisorNote,
        reviewer_name: workAuthSession?.user?.full_name || "super_admin",
      });
      if (res.data?.ok || res.status === 200) {
        toast.success(
          status === "approved"
            ? `Follow proof approved${res.data?.gp_awarded ? " and 20 GP awarded" : ""}.`
            : "Follow proof rejected.",
        );
        void loadSponsorFeedback({ silent: true });
        void loadSponsorAccounts();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "Failed to review social follow proof");
    }
  };

  const loadActivityLogs = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await api.get("/green/admin/logs");
      setActivityLogs(res.data || []);
    } catch (err: any) {
      setLogsError(err.message || "Failed to load activity logs");
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const loadQrPrintsReport = useCallback(async () => {
    try {
      const res = await api.get("/green/admin/qr-prints");
      setQrPrintsReport(res.data || []);
    } catch (err) {
      console.error("Failed to load QR prints report:", err);
    }
  }, []);

  const resetActivityLogs = async () => {
    if (!window.confirm("Are you sure you want to clear/reset all system activity logs? This cannot be undone.")) return;
    try {
      setLogsLoading(true);
      await api.post("/green/admin/logs/reset");
      setActivityLogs([]);
      toast.success("System logs reset successfully.");
    } catch (err: any) {
      toast.error("Error resetting logs: " + (err.message || String(err)));
    } finally {
      setLogsLoading(false);
    }
  };

  const loadSponsorAgentPayoutBoard = useCallback(async (projectId: number, options?: { silent?: boolean; forceSync?: boolean }) => {
    const silent = Boolean(options?.silent);
    const forceSync = options?.forceSync !== false;
    if (!projectId) {
      setSponsorAgentPayoutBoard(null);
      setSponsorAgentPayoutError(null);
      return;
    }
    if (!silent) setSponsorAgentPayoutLoading(true);
    setSponsorAgentPayoutError(null);
    try {
      const syncQs = forceSync ? "&sync=1" : "";
      const res = await api.get(`/green/admin/sponsor-agent-payouts?project_id=${projectId}${syncQs}&_ts=${Date.now()}`);
      setSponsorAgentPayoutBoard(normalizeSponsorAgentPayoutBoard(res.data || {}));
    } catch (error: any) {
      setSponsorAgentPayoutError(error?.response?.data?.detail || error?.message || "Failed to load sponsor-agent payouts");
      setSponsorAgentPayoutBoard(null);
    } finally {
      if (!silent) setSponsorAgentPayoutLoading(false);
    }
  }, []);

  const loadSponsorQrStatus = useCallback(async (projectId: number, options?: { silent?: boolean; forceSync?: boolean }) => {
    const silent = Boolean(options?.silent);
    const forceSync = options?.forceSync !== false;
    if (!projectId) {
      setSponsorQrStatusRows([]);
      setSponsorQrStatusError(null);
      return;
    }
    if (!silent) setSponsorQrStatusLoading(true);
    setSponsorQrStatusError(null);
    try {
      const syncQs = forceSync ? "&sync=1" : "";
      const res = await api.get(`/green/admin/sponsor-qr-status?project_id=${projectId}${syncQs}&_ts=${Date.now()}`);
      setSponsorQrStatusRows(Array.isArray(res.data) ? res.data : []);
    } catch (error: any) {
      setSponsorQrStatusError(error?.response?.data?.detail || error?.message || "Failed to load sponsor QR status");
      setSponsorQrStatusRows([]);
    } finally {
      if (!silent) setSponsorQrStatusLoading(false);
    }
  }, []);

  const reissueSponsorQrUnit = useCallback(
    async (unitId: number, agentUserId: number) => {
      if (!activeProjectId) return;
      if (!canAccessSuperAdmin) {
        toast.error("Only super admin can reissue sponsor QR tags.");
        return;
      }
      const normalizedAgentUserId = Number(agentUserId || 0);
      if (!(normalizedAgentUserId > 0)) {
        toast.error("Select a sponsor agent first.");
        return;
      }
      const agent = sponsorQrAgentOptions.find((item) => Number(item.id || 0) === normalizedAgentUserId);
      const agentLabel = agent?.full_name || agent?.work_username || `User #${normalizedAgentUserId}`;
      if (!window.confirm(`Reissue this sponsor QR tag to ${agentLabel}?`)) return;
      setReissuingSponsorQrUnitId(unitId);
      try {
        await api.post(`/green/admin/sponsor-qr-status/${unitId}/reissue`, {
          agent_user_id: normalizedAgentUserId,
          reviewer_name: workAuthSession?.user?.full_name || "super_admin",
        });
        setSponsorQrReissueSelections((prev) => ({ ...prev, [unitId]: normalizedAgentUserId }));
        await loadSponsorQrStatus(activeProjectId, { forceSync: false });
        toast.success(`Sponsor QR tag reissued to ${agentLabel}`);
      } catch (error: any) {
        toast.error(error?.response?.data?.detail || "Failed to reissue sponsor QR tag");
      } finally {
        setReissuingSponsorQrUnitId(null);
      }
    },
    [activeProjectId, canAccessSuperAdmin, loadSponsorQrStatus, sponsorQrAgentOptions, workAuthSession?.user?.full_name],
  );

  const assignSponsorOrderQrTags = useCallback(
    async (orderId: number, agentUserId: number) => {
      if (!activeProjectId) return;
      if (!canAccessSuperAdmin) {
        toast.error("Only super admin can assign sponsor QR tags.");
        return;
      }
      const normalizedAgentUserId = Number(agentUserId || 0);
      if (!(normalizedAgentUserId > 0)) {
        toast.error("Select a sponsor agent first.");
        return;
      }
      const agent = sponsorQrAgentOptions.find((item) => Number(item.id || 0) === normalizedAgentUserId);
      const agentLabel = agent?.full_name || agent?.work_username || `User #${normalizedAgentUserId}`;
      if (!window.confirm(`Assign all pending sponsor QR tags in this paid order to ${agentLabel}?`)) return;
      setAssigningSponsorOrderId(orderId);
      try {
        await api.post(`/green/admin/sponsorship-orders/${orderId}/assign-agent`, {
          agent_user_id: normalizedAgentUserId,
          reviewer_name: workAuthSession?.user?.full_name || "super_admin",
        });
        setSponsorshipOrderAgentSelections((prev) => ({ ...prev, [orderId]: normalizedAgentUserId }));
        await Promise.all([
          loadSponsorshipOrders(activeProjectId, { forceSync: false }),
          loadSponsorQrStatus(activeProjectId, { forceSync: false }),
        ]);
        toast.success(`Pending sponsor QR tags assigned to ${agentLabel}`);
      } catch (error: any) {
        toast.error(error?.response?.data?.detail || "Failed to assign sponsor QR tags");
      } finally {
        setAssigningSponsorOrderId(null);
      }
    },
    [activeProjectId, canAccessSuperAdmin, loadSponsorQrStatus, loadSponsorshipOrders, sponsorQrAgentOptions, workAuthSession?.user?.full_name],
  );

  const reviewSponsorAgentPayoutRequest = useCallback(
    async (
      requestId: number,
      action: "approve" | "approve_and_pay" | "mark_paid" | "reject" | "cancel" | "retry_transfer",
      options?: { autoTransfer?: boolean },
    ) => {
      if (!activeProjectId) return;
      const rejecting = action === "reject";
      const manualSettlement = action === "mark_paid";
      const autoTransferAction = action === "approve_and_pay" || action === "retry_transfer";
      const reviewPrompt = rejecting
        ? "Enter a short reason for rejecting this payout request."
        : manualSettlement
          ? "Optional accounting note for this manual settlement."
          : autoTransferAction
            ? "Optional accounting note for this automatic payout attempt."
            : action === "cancel"
              ? "Optional reason for cancelling this payout request."
              : "Optional accounting note for this payout request.";
      const reviewNotes = window.prompt(reviewPrompt, "") || "";
      if (rejecting && !reviewNotes.trim()) {
        toast.error("A rejection reason is required.");
        return;
      }
      const settlementReference = manualSettlement
        ? window.prompt("Enter the external bank transfer reference or receipt number for this manual settlement.", "") || ""
        : "";
      if (manualSettlement && !settlementReference.trim()) {
        toast.error("Manual settlement reference is required.");
        return;
      }
      setReviewingSponsorAgentPayoutId(requestId);
      try {
        const res = await api.patch(`/green/admin/sponsor-agent-payouts/${requestId}`, {
          action,
          reviewer_name: workAuthSession?.user?.full_name || "super_admin",
          review_notes: reviewNotes.trim() || null,
          auto_transfer: Boolean(options?.autoTransfer),
          settlement_channel: manualSettlement ? "manual" : autoTransferAction ? "flutterwave" : null,
          settlement_reference: manualSettlement ? settlementReference.trim() || null : null,
        });
        await loadSponsorAgentPayoutBoard(activeProjectId, { forceSync: true });
        const transferError = String(res?.data?.transfer_error || "").trim();
        if (transferError) {
          toast(`Payout reviewed, but transfer needs attention: ${transferError}`);
        } else {
          toast.success(
              action === "approve_and_pay"
                ? "Payout approved and transfer initiated"
                : action === "mark_paid"
                  ? "Manual payout recorded as paid"
                  : action === "reject"
                    ? "Payout request rejected"
                    : action === "cancel"
                      ? "Payout request cancelled"
                      : action === "retry_transfer"
                        ? "Automatic payout retry initiated"
                        : "Payout request approved",
          );
        }
      } catch (error: any) {
        toast.error(error?.response?.data?.detail || "Failed to update payout request");
      } finally {
        setReviewingSponsorAgentPayoutId(null);
      }
    },
    [activeProjectId, loadSponsorAgentPayoutBoard, workAuthSession?.user?.full_name],
  );

  const reviewSponsorshipPayment = async (
    orderId: number,
    paymentStatus: "verified" | "rejected" | "proof_submitted",
  ) => {
    const reviewNotes =
      paymentStatus === "rejected"
        ? window.prompt("Enter a short reason for rejecting this payment proof.", "") || ""
        : window.prompt("Optional review note for this sponsorship order.", "") || "";
    try {
      await api.patch(`/green/admin/sponsorship-orders/${orderId}/payment`, {
        payment_status: paymentStatus,
        reviewed_by: workAuthSession?.user?.full_name || "work_admin",
        review_notes: reviewNotes.trim() || null,
      });
      if (publicSponsorshipProject && activeProjectId) {
        await loadSponsorshipOrders(activeProjectId);
      }
      toast.success(
        paymentStatus === "verified"
          ? "Sponsorship payment verified"
          : paymentStatus === "rejected"
            ? "Sponsorship payment rejected"
            : "Sponsorship order returned to payment review",
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to review sponsorship payment");
    }
  };

  const saveTreeMeta = async (treeId: number) => {
    if (!activeProjectId) return;
    const draft = treeMetaDraftById[treeId];
    if (!draft) return;
    const parsedHeight = parseTreeHeightInput(draft.tree_height_m);
    if (String(draft.tree_height_m || "").trim() && parsedHeight === null) {
      toast.error("Tree height must be a number between 0 and 120.");
      return;
    }
    setSavingTreeMetaId(treeId);
    try {
      await api.patch(`/green/trees/${treeId}`, {
        tree_height_m: parsedHeight,
        planting_date: draft.planting_date || null,
        tree_origin: draft.tree_origin,
        attribution_scope: draft.attribution_scope,
        count_in_planting_kpis: draft.count_in_planting_kpis,
        count_in_carbon_scope: draft.count_in_carbon_scope,
      });
      setTrees((prev) =>
        prev.map((tree) =>
          Number(tree.id) === Number(treeId)
            ? {
                ...tree,
                tree_height_m: parsedHeight,
                planting_date: draft.planting_date || null,
                tree_origin: draft.tree_origin,
                attribution_scope: draft.attribution_scope,
                count_in_planting_kpis: draft.count_in_planting_kpis,
                count_in_carbon_scope: draft.count_in_carbon_scope,
              }
            : tree
        )
      );
      setInspectedTree((prev) =>
        prev && Number(prev.id) === Number(treeId)
          ? {
              ...prev,
              tree_height_m: parsedHeight,
              planting_date: draft.planting_date || "",
              tree_origin: draft.tree_origin,
              attribution_scope: draft.attribution_scope,
              count_in_planting_kpis: draft.count_in_planting_kpis,
              count_in_carbon_scope: draft.count_in_carbon_scope,
            }
          : prev
      );
      toast.success("Tree metadata updated");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to update tree metadata");
    } finally {
      setSavingTreeMetaId(null);
    }
  };

  const startAdjustingTreePosition = (treeId: number) => {
    const coords = treeCoordinatesById.get(Number(treeId));
    if (!coords) {
      toast.error("Tree coordinates not available.");
      return;
    }
    setTreePositionDraft({ treeId: Number(treeId), lng: coords.lng, lat: coords.lat });
    setActiveForm("map_view");
    setMenuOpen(false);
    toast("Drag the marker on the map, then save the new position.");
  };

  const saveTreePosition = async (treeId: number) => {
    if (!activeProjectId || !treePositionDraft || Number(treePositionDraft.treeId) !== Number(treeId)) return;
    setSavingTreePositionId(treeId);
    try {
      await api.patch(`/green/trees/${treeId}`, {
        lng: Number(treePositionDraft.lng.toFixed(6)),
        lat: Number(treePositionDraft.lat.toFixed(6)),
      });
      setTrees((prev) =>
        prev.map((tree) =>
          Number(tree.id) === Number(treeId)
            ? { ...tree, lng: Number(treePositionDraft.lng.toFixed(6)), lat: Number(treePositionDraft.lat.toFixed(6)) }
            : tree,
        ),
      );
      setTreePositionDraft(null);
      toast.success("Tree position updated");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to update tree position");
    } finally {
      setSavingTreePositionId(null);
    }
  };

  const applyMonitoringSourceArea = (value: string) => {
    const orderId = Number(value || 0);
    const sourceArea = monitoringSourceAreas.find((item) => Number(item.id) === orderId) || null;
    setRemoteMonitoringDraft((prev) => ({
      ...prev,
      source_order_id: value,
    }));
    setRemoteMonitoringDraftGeometry(sourceArea?.geojson || null);
    setRemoteMonitoringDrawActive(false);
    setRemoteMonitoringFocusedTreeId(null);
    setRemoteMonitoringActionTreeId(null);
    setRemoteMonitoringReport(null);
  };

  const deleteTreeFromWork = async (treeId: number) => {
    if (!activeProjectId || deletingTreeId !== null) return;
    const confirmValue = window.prompt(
      `Delete ${formatProjectTreeLabelById(treeId)}? Type ${treeId} to confirm. This removes related maintenance/tasks permanently.`,
      "",
    );
    if (confirmValue === null) return;
    if (confirmValue.trim() !== String(treeId)) {
      toast.error("Tree id confirmation did not match.");
      return;
    }
    setDeletingTreeId(treeId);
    try {
      await api.delete(`/green/trees/${treeId}`, {
        params: {
          project_id: activeProjectId,
          confirm_tree_id: treeId,
          actor_name: "supervisor",
        },
      });
      setInspectedTree((prev) => (prev && Number(prev.id) === Number(treeId) ? null : prev));
      setTreeMetaDraftById((prev) => {
        const next = { ...prev };
        delete next[treeId];
        return next;
      });
      await loadProjectData(activeProjectId);
      toast.success(`${formatProjectTreeLabelById(treeId)} deleted`);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to delete tree");
    } finally {
      setDeletingTreeId(null);
    }
  };

  useEffect(() => {
    loadProjects().catch(() => toast.error("Failed to load projects"));
    loadUsers().catch(() => toast.error("Failed to load users"));
    if (canAccessSuperAdmin) {
      loadOrganizations().catch(() => toast.error("Failed to load organizations"));
      loadRoles().catch(() => toast.error("Failed to load roles"));
      loadAdminUsers().catch(() => toast.error("Failed to load user directory"));
      loadAdminOverview().catch(() => toast.error("Failed to load super admin overview"));
    } else {
      setOrganizations([]);
      setAdminOverview(null);
      setAdminUsers([]);
    }
  }, [canAccessSuperAdmin]);

  useEffect(() => {
    if (!canAccessSuperAdmin) return;
    if (adminCredentialOrgId) return;
    if (!organizations.length) return;
    setAdminCredentialOrgId(String(organizations[0].id));
  }, [canAccessSuperAdmin, adminCredentialOrgId, organizations]);

  useEffect(() => {
    if (!projects.length || !activeProjectId) return;
    const exists = projects.some((project) => Number(project.id) === Number(activeProjectId));
    if (!exists) {
      setActiveProjectId(null);
      return;
    }
    if (lastLoadedProjectIdRef.current === activeProjectId) {
      return;
    }
    void loadProjectData(activeProjectId).catch(() => toast.error("Failed to load project data"));
  }, [projects, activeProjectId]);

  useEffect(() => {
    localStorage.setItem("landcheck_work_active_project_id", activeProjectId ? String(activeProjectId) : "");
  }, [activeProjectId]);

  useEffect(() => {
    setRemoteMonitoringReport(null);
    setRemoteMonitoringDrawActive(false);
    setRemoteMonitoringDraftGeometry(null);
    setRemoteMonitoringDraft({ source_order_id: "" });
  }, [activeProjectId]);

  useEffect(() => {
    localStorage.setItem("landcheck_work_active_form", activeForm || "");
  }, [activeForm]);

  useEffect(() => {
    localStorage.setItem("landcheck_work_assignee_filter", assigneeFilter || "all");
  }, [assigneeFilter]);

  useEffect(() => {
    localStorage.setItem("landcheck_work_season_mode", seasonMode);
  }, [seasonMode]);

  useEffect(() => {
    localStorage.setItem("landcheck_work_live_tree_scope", liveTreeScopeTab);
  }, [liveTreeScopeTab]);

  useEffect(() => {
    const handleCrossTabWorkContext = (event: StorageEvent) => {
      if (
        !event.key ||
        (event.key !== "landcheck_work_active_project_id" &&
          event.key !== "landcheck_work_active_form" &&
          event.key !== "landcheck_work_existing_tree_refresh_at")
      ) {
        return;
      }

      const rawForm = localStorage.getItem("landcheck_work_active_form") || "";
      const normalizedForm =
        rawForm === "custodians" || rawForm === "distribution_events" || rawForm === "custodian_reports"
          ? "custodian_hub"
          : rawForm === "existing_tree_live_table"
            ? "live_table"
          : rawForm;
      const validForms: WorkForm[] = [
        "project_focus",
        "create_project",
        "custodian_hub",
        "existing_tree_intake",
        "add_user",
        "users",
        "map_view",
        "remote_monitoring",
        "assign_work",
        "assign_task",
        "review_queue",
        "overview",
        "live_table",
        "verra_reports",
      ];
      const nextForm = validForms.includes(normalizedForm as WorkForm) ? (normalizedForm as WorkForm) : null;
      const nextLiveScope =
        rawForm === "existing_tree_live_table" ? "existing_inventory" : localStorage.getItem("landcheck_work_live_tree_scope");
      const nextProjectId = Number(localStorage.getItem("landcheck_work_active_project_id") || "0");

      if (nextForm && nextForm !== activeForm) {
        setActiveForm(nextForm);
      }
      if (nextForm === "live_table" && nextLiveScope) {
        setLiveTreeScopeTab(nextLiveScope === "existing_inventory" ? "existing_inventory" : "new_planting");
      }

      if (Number.isFinite(nextProjectId) && nextProjectId > 0) {
        if (Number(nextProjectId) !== Number(activeProjectId || 0)) {
          setActiveProjectId(nextProjectId);
        }
        if (nextForm === "existing_tree_intake" || event.key === "landcheck_work_existing_tree_refresh_at") {
          void loadProjectData(nextProjectId).catch(() => {});
        }
      }
    };

    window.addEventListener("storage", handleCrossTabWorkContext);
    return () => window.removeEventListener("storage", handleCrossTabWorkContext);
  }, [activeForm, activeProjectId, loadProjectData]);

  useEffect(() => {
    if (!staffMenu && !liveTreeMenu) return;
    const closeMenu = () => {
      setStaffMenu(null);
      setLiveTreeMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [staffMenu, liveTreeMenu]);

  useEffect(() => {
    if (!deleteProjectModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDeleteProjectModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteProjectModalOpen, deletingProject]);

  useEffect(() => {
    if (!activeProjectId && deleteProjectModalOpen) {
      setDeleteProjectModalOpen(false);
      setDeleteProjectConfirmName("");
    }
  }, [activeProjectId, deleteProjectModalOpen]);

  useEffect(() => {
    if (!activeProjectId || activeForm !== "live_table") return;
    void loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, liveTreeScopeTab).catch(() => {});
    const timer = window.setInterval(() => {
      void Promise.all([
        loadProjectData(activeProjectId),
        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, liveTreeScopeTab),
      ]).catch(() => {});
    }, 20000);
    return () => window.clearInterval(timer);
  }, [activeProjectId, activeForm, seasonMode, assigneeFilter, liveTreeScopeTab, loadServerLiveMaintenance]);

  useEffect(() => {
    if (!activeProjectId || activeForm !== "review_queue") return;
    const timer = window.setInterval(() => {
      void loadProjectData(activeProjectId).catch(() => {});
    }, 12000);
    return () => window.clearInterval(timer);
  }, [activeProjectId, activeForm]);

  useEffect(() => {
    if (!activeProjectId || !publicSponsorshipProject) {
      setSponsorshipOrders([]);
      setSponsorshipOrdersError(null);
      setSponsorshipOrdersScopeNote(null);
      setFallbackSponsorAccounts([]);
      setSponsorAgentPayoutBoard(null);
      setSponsorAgentPayoutError(null);
      setSponsorQrStatusRows([]);
      setSponsorQrStatusError(null);
      return;
    }
    if (!["sponsors", "sponsorship_orders", "project_focus", "assign_work", "assign_task", "sponsor_payouts", "sponsor_feedback"].includes(String(activeForm || ""))) return;
    void loadSponsorshipOrders(activeProjectId);
    void loadSponsorAccounts();
    const timer = window.setInterval(() => {
      void loadSponsorshipOrders(activeProjectId, { silent: true });
      void loadSponsorAccounts();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeProjectId, activeForm, loadSponsorAccounts, loadSponsorshipOrders, publicSponsorshipProject]);

  useEffect(() => {
    if (!activeProjectId || !publicSponsorshipProject) {
      setSponsorQrStatusRows([]);
      setSponsorQrStatusError(null);
      return;
    }
    if (activeForm !== "sponsors") return;
    void loadSponsorQrStatus(activeProjectId, { forceSync: true });
    const timer = window.setInterval(() => {
      void loadSponsorQrStatus(activeProjectId, { silent: true, forceSync: false });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeForm, activeProjectId, loadSponsorQrStatus, publicSponsorshipProject]);

  useEffect(() => {
    if (!activeProjectId || !publicSponsorshipProject) {
      setSocialFollowClaims([]);
      setComplaints([]);
      setSchoolNominations([]);
      setCommunityProjects([]);
      setRedemptions([]);
      setAssistantEscalations([]);
      return;
    }
    if (activeForm !== "sponsor_feedback") return;
    void loadSponsorFeedback();
    // Opening the tab clears the unread badge — mirrors an inbox "mark as read on open".
    setAssistantUnreadCount(0);
    api.post("/green/admin/assistant-escalations/mark-seen").catch(() => {});
    const timer = window.setInterval(() => {
      void loadSponsorFeedback({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeForm, activeProjectId, loadSponsorFeedback, publicSponsorshipProject]);

  // Poll the unread assistant-escalation count regardless of which tab is open, so the
  // red badge on "Feedback & Nominations" shows up even while browsing elsewhere.
  useEffect(() => {
    if (!activeProjectId || !publicSponsorshipProject) {
      setAssistantUnreadCount(0);
      return;
    }
    if (activeForm === "sponsor_feedback") return; // already cleared/tracked by the effect above
    let cancelled = false;
    const poll = () => {
      api
        .get(`/green/admin/assistant-escalations/unread-count?_ts=${Date.now()}`)
        .then((res) => { if (!cancelled) setAssistantUnreadCount(Number(res.data?.count || 0)); })
        .catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 20000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeForm, activeProjectId, publicSponsorshipProject]);

  useEffect(() => {
    if (!activeProjectId || !publicSponsorshipProject) {
      setSponsorAgentPayoutBoard(null);
      setSponsorAgentPayoutError(null);
      return;
    }
    if (activeForm !== "sponsor_payouts") return;
    void loadSponsorAgentPayoutBoard(activeProjectId, { forceSync: true });
    const timer = window.setInterval(() => {
      void loadSponsorAgentPayoutBoard(activeProjectId, { silent: true, forceSync: false });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeForm, activeProjectId, loadSponsorAgentPayoutBoard, publicSponsorshipProject]);

  useEffect(() => {
    if (activeForm !== "remote_monitoring") {
      setRemoteMonitoringReport(null);
    }
  }, [activeForm]);

  useEffect(() => {
    if (!canAccessSuperAdmin || activeForm !== "logs") return;
    void loadActivityLogs();
    void loadQrPrintsReport();
    const timer = window.setInterval(() => {
      void loadActivityLogs({ silent: true });
      void loadQrPrintsReport();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeForm, canAccessSuperAdmin, loadActivityLogs, loadQrPrintsReport]);

  useEffect(() => {
    if (activeForm === "logs") return;
    setSelectedActivityLog(null);
  }, [activeForm]);

  useEffect(() => {
    if (!selectedActivityLog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedActivityLog(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedActivityLog]);

  useEffect(() => {
    return () => {
      if (remoteMonitoringProgressTimerRef.current) {
        window.clearInterval(remoteMonitoringProgressTimerRef.current);
        remoteMonitoringProgressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!activeProjectId || activeForm !== "verra_reports") return;
    void loadVerraHistory(activeProjectId).catch(() => {});
  }, [activeProjectId, activeForm, loadVerraHistory]);

  useEffect(() => {
    if (!activeProjectId) {
      setExistingTreeMetricsById({});
      return;
    }
    if (activeForm !== "existing_tree_intake") return;
    void loadExistingTreeMetrics(activeProjectId).catch(() => {});
  }, [activeProjectId, activeForm, loadExistingTreeMetrics]);

  useEffect(() => {
    setProjectSetupExpanded(false);
  }, [activeProjectId]);

  useEffect(() => {
    setSelectedMaintenanceRowKeys([]);
    setMaintenanceBulkAssignMode("single_staff");
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) {
      setCustodians([]);
      setDistributionEvents([]);
      setDistributionAllocations([]);
      return;
    }
    void loadCommunityData(activeProjectId).catch(() => {});
  }, [activeProjectId, loadCommunityData]);

  useEffect(() => {
    setShowProjectDangerOptions(false);
  }, [activeProjectId]);

  useEffect(() => {
    if (!showProjectDangerOptions) {
      setProjectSetupExpanded(false);
    }
  }, [showProjectDangerOptions]);

  useEffect(() => {
    setTreeMetaDraftById((prev) => {
      const next = { ...prev };
      let changed = false;
      trees.forEach((tree) => {
        const treeId = Number(tree.id);
        if (!treeId || next[treeId]) return;
        next[treeId] = {
          tree_height_m:
            tree.tree_height_m === null || tree.tree_height_m === undefined ? "" : String(tree.tree_height_m),
          planting_date: String(tree.planting_date || ""),
          tree_origin: (tree.tree_origin || "new_planting") as
            | "new_planting"
            | "existing_inventory"
            | "natural_regeneration",
          attribution_scope: (tree.attribution_scope || "full") as "full" | "monitor_only",
          count_in_planting_kpis: tree.count_in_planting_kpis !== false,
          count_in_carbon_scope: tree.count_in_carbon_scope !== false,
        };
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [trees]);

  const onSelectProject = async (id: number) => {
    setActiveProjectId(id);
    setAssigneeFilter("all");
    setInspectedTree(null);
    await loadProjectData(id);
  };

  const createProject = async () => {
    if (!newProject.name.trim()) {
      toast.error("Project name required");
      return;
    }
    const nextAccessModel = canAccessSuperAdmin
      ? normalizeProjectAccessModel(newProject.access_model)
      : "partner_org";
    if (!canAccessSuperAdmin && normalizeProjectAccessModel(newProject.access_model) === "public_sponsorship") {
      toast.error("Only super admin can create public sponsorship projects.");
      return;
    }
    if (nextAccessModel === "public_sponsorship" && normalizeWorkflowProfile(newProject.workflow_profile) !== "green") {
      toast.error("Public sponsorship projects currently run on the Green workflow only.");
      return;
    }
    if (isPartnerWorkSession && !workScopedOrganizationId) {
      toast.error("Your user account is not linked to an organization.");
      return;
    }
    const forcedOrgId = workScopedOrganizationId;
    const orgId = forcedOrgId || Number(newProject.organization_id || 0);
    const payload = {
      ...newProject,
      organization_id: Number.isFinite(orgId) && orgId > 0 ? orgId : null,
      access_model: nextAccessModel,
      public_sponsor_enabled: nextAccessModel === "public_sponsorship" ? true : false,
      public_sponsor_title: nextAccessModel === "public_sponsorship" ? newProject.public_sponsor_title.trim() || null : null,
      public_sponsor_description:
        nextAccessModel === "public_sponsorship" ? newProject.public_sponsor_description.trim() || null : null,
      sponsor_price_per_tree_ngn:
        nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_price_per_tree_ngn || 0) > 0
          ? Number(newProject.sponsor_price_per_tree_ngn)
          : null,
      sponsor_price_per_tree_usd:
        nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_price_per_tree_usd || 0) > 0
          ? Number(newProject.sponsor_price_per_tree_usd)
          : null,
      sponsor_price_per_tree:
        nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_price_per_tree_ngn || 0) > 0
          ? Number(newProject.sponsor_price_per_tree_ngn)
          : nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_price_per_tree_usd || 0) > 0
            ? Number(newProject.sponsor_price_per_tree_usd)
            : null,
      sponsor_currency:
        nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_price_per_tree_ngn || 0) > 0
          ? "NGN"
          : nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_price_per_tree_usd || 0) > 0
            ? "USD"
            : "NGN",
      sponsor_capacity:
        nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_capacity || 0) > 0
          ? Number(newProject.sponsor_capacity)
          : null,
      sponsor_max_per_order:
        nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_max_per_order || 0) > 0
          ? Number(newProject.sponsor_max_per_order)
          : null,
      sponsor_dedication_enabled: nextAccessModel === "public_sponsorship" ? Boolean(newProject.sponsor_dedication_enabled) : false,
      sponsor_payment_instructions:
        nextAccessModel === "public_sponsorship" ? newProject.sponsor_payment_instructions.trim() || null : null,
      sponsor_agent_planting_fee:
        nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_agent_planting_fee || 0) > 0
          ? Number(newProject.sponsor_agent_planting_fee)
          : null,
      sponsor_agent_maintenance_fee:
        nextAccessModel === "public_sponsorship" && Number(newProject.sponsor_agent_maintenance_fee || 0) > 0
          ? Number(newProject.sponsor_agent_maintenance_fee)
          : null,
      agric_config:
        newProject.workflow_profile === "agric"
          ? {
              program_type: newProject.agric_program_type || "extension_support",
              focus_commodities: newProject.agric_focus_commodities || null,
              support_packages: newProject.agric_support_packages || null,
              season_label: newProject.agric_season_label || null,
            }
          : {},
      relief_config:
        newProject.workflow_profile === "relief_recovery"
          ? {
              program_type: newProject.relief_program_type || "emergency_relief",
              intervention_focus: newProject.relief_intervention_focus || null,
              package_types: newProject.relief_package_types || null,
              target_zone: newProject.relief_target_zone || null,
            }
          : {},
    };
    if (
      !(await ensureWorkOperationalConsent("project_create", {
        project_name: payload.name,
        organization_id: payload.organization_id,
      }))
    ) {
      return;
    }
    const res = await api.post("/green/projects", payload);
    setProjects((prev) => [res.data, ...prev]);
    setNewProject({
      name: "",
      location_text: "",
      sponsor: "",
      organization_id: forcedOrgId ? String(forcedOrgId) : "",
      workflow_profile: "green",
      access_model: "partner_org",
      public_sponsor_enabled: false,
      public_sponsor_title: "",
      public_sponsor_description: "",
      sponsor_price_per_tree_ngn: "",
      sponsor_price_per_tree_usd: "",
      sponsor_capacity: "",
      sponsor_max_per_order: "",
      sponsor_dedication_enabled: true,
      sponsor_payment_instructions: "",
      sponsor_agent_planting_fee: "",
      sponsor_agent_maintenance_fee: "",
      agric_program_type: "extension_support",
      agric_focus_commodities: "",
      agric_support_packages: "",
      agric_season_label: "",
      relief_program_type: "emergency_relief",
      relief_intervention_focus: "",
      relief_package_types: "",
      relief_target_zone: "",
    });
    if (canAccessSuperAdmin) {
      void loadAdminOverview().catch(() => {});
    }
    toast.success("Project created");
  };

  const saveOrganization = async () => {
    if (!newOrganization.name.trim()) {
      toast.error("Organization name required");
      return;
    }
    const payload = {
      ...newOrganization,
      status: (newOrganization.status || "pilot").trim().toLowerCase() || "pilot",
    };
    if (
      !(await ensureWorkOperationalConsent("organization_save", {
        editing: Boolean(editingOrganizationId),
        contact_email: payload.contact_email || null,
        contact_phone: payload.contact_phone || null,
      }))
    ) {
      return;
    }
    try {
      if (editingOrganizationId) {
        await api.patch(`/green/admin/organizations/${editingOrganizationId}`, payload);
        toast.success("Organization updated. No email sent.");
      } else {
        const res = await api.post("/green/admin/organizations", payload);
        const created = res?.data || {};
        const welcomeAttempted = Boolean(created?.welcome_email_attempted);
        const welcomeSent = Boolean(created?.welcome_email_sent);
        const welcomeError = String(created?.welcome_email_error || "").trim();
        if (welcomeAttempted && welcomeSent) {
          toast.success("Organization created. Welcome email sent.");
        } else if (welcomeAttempted && welcomeError) {
          toast.success("Organization created.");
          toast.error(`Welcome email not sent: ${welcomeError}`);
        } else if (!String(payload.contact_email || "").trim()) {
          toast.success("Organization created.");
          toast("Add a contact email to send the welcome message automatically.");
        } else {
          toast.success("Organization created");
        }
      }
      setEditingOrganizationId(null);
      setNewOrganization({
        name: "",
        slug: "",
        short_name: "",
        logo_url: "",
        status: "pilot",
        contact_email: "",
        contact_phone: "",
        website_url: "",
        country: "Nigeria",
        state_region: "",
        city: "",
        address_text: "",
        notes: "",
        is_active: true,
      });
      await Promise.all([loadOrganizations(), loadProjects(), loadAdminOverview()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to save organization");
    }
  };

  const editOrganization = (org: Organization) => {
    setEditingOrganizationId(Number(org.id));
    setNewOrganization({
      name: String(org.name || ""),
      slug: String(org.slug || ""),
      short_name: String(org.short_name || ""),
      logo_url: String(org.logo_url || ""),
      status: String(org.status || "pilot"),
      contact_email: String(org.contact_email || ""),
      contact_phone: String(org.contact_phone || ""),
      website_url: String(org.website_url || ""),
      country: String(org.country || ""),
      state_region: String(org.state_region || ""),
      city: String(org.city || ""),
      address_text: String(org.address_text || ""),
      notes: String(org.notes || ""),
      is_active: org.is_active !== false,
    });
    setActiveForm("super_admin");
  };

  const clearOrganizationDraft = () => {
    setEditingOrganizationId(null);
    setNewOrganization({
      name: "",
      slug: "",
      short_name: "",
      logo_url: "",
      status: "pilot",
      contact_email: "",
      contact_phone: "",
      website_url: "",
      country: "Nigeria",
      state_region: "",
      city: "",
      address_text: "",
      notes: "",
      is_active: true,
    });
  };

  const assignProjectOrganization = async (projectId: number, organizationIdValue: string) => {
    try {
      const orgIdNum = Number(organizationIdValue || 0);
      await api.patch(`/green/projects/${projectId}/organization`, {
        organization_id: Number.isFinite(orgIdNum) && orgIdNum > 0 ? orgIdNum : null,
      });
      await Promise.all([loadProjects(), loadAdminOverview()]);
      toast.success("Project organization updated");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to update project organization");
    }
  };

  const openDeleteProjectModal = () => {
    if (!activeProjectRecord) return;
    setDeleteProjectConfirmName("");
    setDeleteProjectModalOpen(true);
  };

  const closeDeleteProjectModal = () => {
    if (deletingProject) return;
    setDeleteProjectModalOpen(false);
    setDeleteProjectConfirmName("");
  };

  const deleteProject = async () => {
    if (!activeProjectRecord) return;
    const projectId = Number(activeProjectRecord.id);
    const projectName = String(activeProjectRecord.name || "").trim();
    const confirmValue = deleteProjectConfirmName.trim();
    if (!confirmValue || confirmValue !== projectName) {
      toast.error("Type the exact project name to confirm deletion.");
      return;
    }
    setDeletingProject(true);
    try {
      await api.delete(`/green/projects/${projectId}`, {
        data: { confirm_name: confirmValue },
      });
      setDeleteProjectModalOpen(false);
      setDeleteProjectConfirmName("");
      clearActiveProjectContext();
      await loadProjects();
      setActiveForm("project_focus");
      toast.success("Project deleted");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to delete project");
    } finally {
      setDeletingProject(false);
    }
  };

  const createWorkOrder = async () => {
    if (!activeProjectId) return;
    const assigneeTargets = currentWorkOrderAssignees
      .map((rawAssignee) => {
        const matchedUser = resolveAssignmentUserRecord(rawAssignee);
        return {
          raw: String(rawAssignee || "").trim(),
          dispatch:
            publicSponsorshipProject && matchedUser
              ? buildSponsorDispatchAssigneeName(matchedUser)
              : String(rawAssignee || "").trim(),
        };
      })
      .filter((item) => item.raw && item.dispatch);
    const assignees = assigneeTargets.map((item) => item.raw);
    const allowedAssigneeNames = new Set(
      assignmentUsers.flatMap((user) =>
        [user.full_name, user.work_username, user.user_uid, user.email, buildSponsorDispatchAssigneeName(user)]
          .map((value) => normalizeName(String(value || "")))
          .filter(Boolean),
      ),
    );
    if (publicSponsorshipProject && assigneeTargets.some((assignee) => !allowedAssigneeNames.has(normalizeName(assignee.dispatch)))) {
      toast.error("Only saved public sponsor agents can receive sponsor-funded planting work.");
      return;
    }
    if (!assignees.length) {
      toast.error(newOrderMultiAssignEnabled ? "Select at least one assignee" : "Assignee name required");
      return;
    }
    if (newOrderSpeciesMode && normalizedNewOrderSpeciesAllocations.length === 0) {
      toast.error("Add at least one species with tree count.");
      return;
    }
    if (!newOrderSpeciesMode && Number(newOrder.target_trees || 0) <= 0) {
      toast.error("Target trees must be greater than 0");
      return;
    }
    if (newOrderSpeciesMode && Number(newOrderSpeciesTargetTotal || 0) <= 0) {
      toast.error("Species allocation total must be greater than 0.");
      return;
    }
    if (newOrderAreaEnabled && !newOrderAreaGeometry) {
      toast.error("Draw the planting area polygon in this tab before assigning.");
      return;
    }
    const targetTrees = newOrderSpeciesMode ? newOrderSpeciesTargetTotal : Number(newOrder.target_trees || 0);
    if (workOrderUsesCustomTargets) {
      const invalidAssignees = assignees.filter((assignee) => Number(newOrderMultiAssignOverrides[assignee]?.target_trees || 0) <= 0);
      if (invalidAssignees.length) {
        toast.error(`Set tree targets for: ${invalidAssignees.join(", ")}`);
        return;
      }
    }
    const totalTargetTreesForConsent = workOrderUsesCustomTargets
      ? assignees.reduce((sum, assignee) => sum + Number(newOrderMultiAssignOverrides[assignee]?.target_trees || 0), 0)
      : targetTrees;
    if (
      !(await ensureWorkOperationalConsent("work_order_create", {
        assignee_name: assignees.length === 1 ? assignees[0] : `${assignees.length} staff`,
        target_trees: totalTargetTreesForConsent,
        area_enabled: newOrderAreaEnabled,
      }))
    ) {
      return;
    }
    const loadingId = toast.loading(
      assignees.length > 1 ? `Assigning planting orders to ${assignees.length} staff...` : "Assigning planting order...",
    );
    setAssigningWorkOrder(true);
    try {
      const payloadBase = {
        project_id: activeProjectId,
        ...newOrder,
        work_type: "planting",
        species_allocations: newOrderSpeciesMode ? normalizedNewOrderSpeciesAllocations : null,
        area_enabled: newOrderAreaEnabled,
        area_label: newOrderAreaEnabled ? (newOrderAreaLabel || "").trim() || null : null,
        area_geojson: newOrderAreaEnabled ? newOrderAreaGeometry : null,
        allow_existing_tree_area_reuse: newOrderAreaEnabled ? Boolean(newOrder.allow_existing_tree_area_reuse) : false,
      };
      const results = await Promise.allSettled(
        assigneeTargets.map(({ raw, dispatch }) => {
          const override = newOrderMultiAssignOverrides[raw];
          const assigneeTargetTrees = workOrderUsesCustomTargets
            ? Number(override?.target_trees || 0)
            : targetTrees;
          const assigneeDueDate = workOrderUsesCustomDueDates
            ? String(override?.due_date || "").trim() || null
            : String(newOrder.due_date || "").trim() || null;
          return api.post("/green/work-orders", {
            ...payloadBase,
            assignee_name: dispatch,
            target_trees: assigneeTargetTrees,
            due_date: assigneeDueDate,
          });
        }),
      );
      const successCount = results.filter((item) => item.status === "fulfilled").length;
      const failedAssignees = results
        .map((item, index) => ({ item, assignee: assigneeTargets[index]?.raw || assigneeTargets[index]?.dispatch || "" }))
        .filter((entry): entry is { item: PromiseRejectedResult; assignee: string } => entry.item.status === "rejected")
        .map((entry) => entry.assignee);
      if (successCount > 0 && failedAssignees.length === 0) {
        setNewOrder({
          assignee_name: "",
          work_type: "planting",
          target_trees: 0,
          auto_assign_first_cycle_maintenance: false,
          allow_existing_tree_area_reuse: false,
          due_date: "",
        });
        setNewOrderSpeciesMode(false);
        setNewOrderSpeciesAllocations([{ species: "", count: 0 }]);
        setNewOrderAreaEnabled(false);
        setNewOrderAreaLabel("");
        setNewOrderAreaGeometry(null);
        setNewOrderMultiAssignEnabled(false);
        setNewOrderMultiAssignTargetMode("uniform");
        setNewOrderMultiAssignDueMode("uniform");
        setWorkOrderSelectedAssigneesWithOverrides([]);
      } else if (failedAssignees.length > 0 && newOrderMultiAssignEnabled) {
        setWorkOrderSelectedAssigneesWithOverrides(failedAssignees);
      } else if (failedAssignees[0]) {
        setNewOrder((prev) => ({
          ...prev,
          assignee_name: failedAssignees[0],
        }));
      }
      await loadProjectData(activeProjectId);
      toast.dismiss(loadingId);
      if (failedAssignees.length === 0) {
        toast.success(
          successCount === 1 ? "Planting order assigned" : `Planting orders assigned to ${successCount} staff`,
        );
      } else if (successCount > 0) {
        toast.success(`Assigned planting orders to ${successCount} staff`);
        toast.error(`Failed for: ${failedAssignees.join(", ")}`);
      } else {
        const firstFailure = results.find((item): item is PromiseRejectedResult => item.status === "rejected");
        const failureDetail =
          (firstFailure?.reason as any)?.response?.data?.detail ||
          (firstFailure?.reason as any)?.message ||
          `Failed to assign planting order${assignees.length > 1 ? "s" : ""}`;
        toast.error(String(failureDetail));
      }
    } catch (error: any) {
      toast.dismiss(loadingId);
      toast.error(error?.response?.data?.detail || "Failed to assign planting order");
    } finally {
      setAssigningWorkOrder(false);
    }
  };

  const createUser = async () => {
    if (!newUser.full_name.trim()) {
      toast.error("Full name required");
      return;
    }
    await api.post("/green/users", newUser);
    setNewUser({ full_name: "", role: "field_officer" });
    await loadUsers();
    toast.success("User added");
  };

  const getModelDueForTreeActivity = (
    treeId: number,
    activity: MaintenanceActivity,
    season: SeasonMode,
    speciesMaturityMap: Record<string, number>,
  ): { dueDate: Date | null; detail: string; blocked: boolean } => {
    const tree = trees.find((item) => Number(item.id) === Number(treeId));
    const plantingDateObj = parseDateValue(tree?.planting_date || null);
    const treeStatus = normalizeTreeStatus(tree?.status || "healthy");
    const replacementRequired = isReplacementTriggerStatus(treeStatus);
    const today = startOfDay(new Date());
    const replacementDoneTasks = tasks
      .filter((task) => Number(task.tree_id) === Number(treeId))
      .filter((task) => asMaintenanceActivity(task.task_type) === "replacement")
      .filter((task) => isCompleteStatus(task.status, task.review_state))
      .sort((a, b) => taskSortStamp(b) - taskSortStamp(a));
    const latestReplacementDoneDate = parseDateValue(
      replacementDoneTasks[0]?.completed_at || replacementDoneTasks[0]?.due_date || replacementDoneTasks[0]?.created_at || null,
    );
    const lifecycleStartDate = getLifecycleStartDate(plantingDateObj, latestReplacementDoneDate);
    const treeAgeDays = lifecycleStartDate ? Math.max(dayDiff(today, lifecycleStartDate), 0) : 0;
    const maturityYears = getSpeciesMaturityYears(tree?.species || null, speciesMaturityMap);
    const maturityReached = HEALTHY_TREE_STATUSES.has(treeStatus) && maturityYears !== null && treeAgeDays >= maturityYears * 365;

    if (replacementRequired && activity !== "replacement") {
      return {
        dueDate: null,
        detail: `Tree status is '${treeStatusLabel(treeStatus)}'. Assign replacement first, then continue maintenance after replanting.`,
        blocked: true,
      };
    }

    if (replacementRequired && activity === "replacement") {
      return {
        dueDate: today,
        detail: `Tree status is '${treeStatusLabel(treeStatus)}'. Replacement is due immediately (today).`,
        blocked: false,
      };
    }

    if (!replacementRequired && activity === "replacement") {
      return {
        dueDate: null,
        detail: `Replacement is condition-triggered only. Current tree status is '${treeStatusLabel(treeStatus)}'.`,
        blocked: true,
      };
    }

    if (maturityReached) {
      return {
        dueDate: null,
        detail: `Tree reached self-sustaining stage (~${maturityYears || "-"} years). Model schedule is closed unless you use custom intervention.`,
        blocked: true,
      };
    }

    const intervals = getMaintenanceIntervals(activity, treeAgeDays, season);
    const doneTasks = tasks
      .filter((task) => Number(task.tree_id) === Number(treeId))
      .filter((task) => asMaintenanceActivity(task.task_type) === activity)
      .filter((task) => isCompleteStatus(task.status, task.review_state))
      .sort((a, b) => taskSortStamp(b) - taskSortStamp(a));

    const latestDone = doneTasks[0] || null;
    const latestDoneDate = parseDateValue(
      latestDone?.completed_at || latestDone?.due_date || latestDone?.created_at || null,
    );

    const dueDate = latestDoneDate
      ? addDays(latestDoneDate, intervals.repeatDays)
      : lifecycleStartDate
        ? addDays(lifecycleStartDate, intervals.firstDays)
        : null;

    const detail = latestDoneDate
      ? `${formatTaskTypeLabel(activity)} model from last completed cycle (+${intervals.repeatDays} days, ${SEASON_LABEL[season]}).`
      : lifecycleStartDate
        ? `${formatTaskTypeLabel(activity)} model from lifecycle start (+${intervals.firstDays} days, ${SEASON_LABEL[season]}).`
        : `No planting date found; choose custom date or set planting date.`;

    return { dueDate, detail, blocked: false };
  };

  const assignTask = async () => {
    if (!activeProjectId) return;
    const bulkRows = selectedMaintenanceRows;
    const isBulkMaintenanceAssign = bulkRows.length > 0;
    const usePlanterStrategy = maintenanceAssigneeStrategy === "tree_planter";
    const singleActivity = asMaintenanceActivity(newTask.task_type);
    if (!isBulkMaintenanceAssign && !newTask.tree_id) {
      toast.error("Select a tree");
      return;
    }
    if (!isBulkMaintenanceAssign && !singleActivity) {
      toast.error("Select a valid maintenance type");
      return;
    }
    const candidates = isBulkMaintenanceAssign
      ? bulkRows.map((row) => ({
          key: row.key,
          treeId: row.treeId,
          activity: row.activity,
          label: `${formatProjectTreeLabelById(row.treeId)} | ${row.activityLabel}`,
        }))
      : [
          {
            key: `single-${newTask.tree_id}-${singleActivity}`,
            treeId: Number(newTask.tree_id || 0),
            activity: singleActivity as MaintenanceActivity,
            label: `${formatProjectTreeLabelById(newTask.tree_id)} | ${formatTaskTypeLabel(singleActivity)}`,
          },
        ];

    const bulkUsesMultipleStaff =
      !usePlanterStrategy && isBulkMaintenanceAssign && bulkRows.length > 1 && maintenanceBulkAssignMode !== "single_staff";
    const planterAssignmentPlan = usePlanterStrategy
      ? candidates.map((candidate) => {
          const tree = treeById.get(Number(candidate.treeId || 0));
          const planterName = String(tree?.created_by || "").trim();
          const matchedAssignee = resolveKnownUserName(planterName);
          const fallbackAssignee = matchedAssignee ? "" : String(maintenancePlanterFallbackAssignee || "").trim();
          return {
            candidate,
            planterName,
            assignee_name: matchedAssignee || fallbackAssignee,
          };
        })
      : [];
    const assignees = usePlanterStrategy
      ? Array.from(new Set(planterAssignmentPlan.map((item) => item.assignee_name).filter(Boolean)))
      : bulkUsesMultipleStaff
        ? currentTaskAssignees
        : [String(newTask.assignee_name || "").trim()].filter(Boolean);
    const allowedAssigneeNames = new Set(assignmentUsers.map((user) => normalizeName(user.full_name)));
    if (
      publicSponsorshipProject &&
      !usePlanterStrategy &&
      assignees.some((assignee) => !allowedAssigneeNames.has(normalizeName(assignee)))
    ) {
      toast.error("Only saved public sponsor agents can receive sponsor-funded maintenance work.");
      return;
    }
    if (usePlanterStrategy) {
      const unresolvedPlanterRows = planterAssignmentPlan.filter((item) => !item.assignee_name);
      if (unresolvedPlanterRows.length) {
        toast.error(
          unresolvedPlanterRows.length === 1
            ? `${unresolvedPlanterRows[0].candidate.label}: choose a fallback assignee because the original planter does not match an active staff account.`
            : `${unresolvedPlanterRows.length} selected trees do not match an active planter account. Choose a fallback assignee.`,
        );
        return;
      }
    }
    if (!assignees.length) {
      toast.error(
        usePlanterStrategy
          ? "No original planter match found. Choose a fallback assignee."
          : bulkUsesMultipleStaff
            ? "Select staff for distribution"
            : "Assign a user",
      );
      return;
    }
    const duePlans = candidates.map((candidate) => ({
      candidate,
      due: resolveTaskDueDateForCandidate(candidate.treeId, candidate.activity),
    }));
    const blockedDuePlan = duePlans.find((item) => item.due.blocked);
    if (blockedDuePlan) {
      toast.error(`${blockedDuePlan.candidate.label}: ${blockedDuePlan.due.detail}`);
      return;
    }
    const pastDuePlan = duePlans.find((item) => item.due.isPastDue);
    if (pastDuePlan) {
      toast.error(`${pastDuePlan.candidate.label}: model date has passed. Choose Other Date (Custom).`);
      return;
    }
    if (
      !(await ensureWorkOperationalConsent("maintenance_task_assign", {
        tree_id: isBulkMaintenanceAssign ? null : newTask.tree_id,
        assignee_name: usePlanterStrategy
          ? assignees.length === 1
            ? assignees[0]
            : `original planter routing (${assignees.length} staff)`
          : assignees.length === 1
            ? assignees[0]
            : `${assignees.length} staff`,
        task_type:
          isBulkMaintenanceAssign && bulkRows.length > 1
            ? `${bulkRows.length} maintenance rows`
            : formatTaskTypeLabel(candidates[0]?.activity || singleActivity),
      }))
    ) {
      return;
    }

    const modelSeason =
      newTask.due_mode === "model_dry"
        ? "dry"
        : newTask.due_mode === "model_rainy"
          ? "rainy"
          : seasonMode;

    const loadingId = toast.loading(
      usePlanterStrategy
        ? isBulkMaintenanceAssign
          ? `Assigning ${bulkRows.length} maintenance rows back to original planter(s)...`
          : "Assigning maintenance task back to original planter..."
        : isBulkMaintenanceAssign
          ? maintenanceBulkAssignMode === "group_by_route"
            ? `Grouping ${bulkRows.length} maintenance rows across ${assignees.length} staff...`
            : bulkUsesMultipleStaff
              ? `Distributing ${bulkRows.length} maintenance rows across ${assignees.length} staff...`
              : `Assigning ${bulkRows.length} maintenance rows...`
          : assignees.length > 1
            ? `Assigning maintenance tasks to ${assignees.length} staff...`
            : "Assigning maintenance task...",
    );
    setAssigningMaintenanceTask(true);
    try {
      const bulkRowByKey = new Map(bulkRows.map((row) => [row.key, row]));
      const bulkAssignmentPlan = isBulkMaintenanceAssign
        ? duePlans.map((plan, index) => {
            if (usePlanterStrategy) {
              const planterAssignment =
                planterAssignmentPlan.find((item) => item.candidate.key === plan.candidate.key)?.assignee_name || "";
              return { ...plan, assignee_name: planterAssignment };
            }
            if (maintenanceBulkAssignMode === "single_staff") {
              return { ...plan, assignee_name: assignees[0] };
            }
            if (maintenanceBulkAssignMode === "group_by_route") {
              return { ...plan, assignee_name: "" };
            }
            return { ...plan, assignee_name: assignees[index % assignees.length] };
          })
        : duePlans.map((plan) => ({
            ...plan,
            assignee_name: usePlanterStrategy
              ? planterAssignmentPlan.find((item) => item.candidate.key === plan.candidate.key)?.assignee_name || ""
              : assignees[0],
          }));
      if (isBulkMaintenanceAssign && !usePlanterStrategy && maintenanceBulkAssignMode === "group_by_route") {
        const groupedCandidates = new Map<
          string,
          {
            key: string;
            label: string;
            rows: Array<(typeof bulkAssignmentPlan)[number]>;
          }
        >();
        bulkAssignmentPlan.forEach((plan) => {
          const sourceRow = bulkRowByKey.get(plan.candidate.key);
          const group = sourceRow
            ? describeMaintenanceRouteGroup(sourceRow)
            : { key: plan.candidate.key, label: plan.candidate.label };
          const current = groupedCandidates.get(group.key) || {
            key: group.key,
            label: group.label,
            rows: [],
          };
          current.rows.push(plan);
          groupedCandidates.set(group.key, current);
        });
        Array.from(groupedCandidates.values())
          .sort((a, b) => {
            if (a.rows.length !== b.rows.length) return b.rows.length - a.rows.length;
            return a.label.localeCompare(b.label);
          })
          .forEach((group, index) => {
            const assigneeName = assignees[index % assignees.length] || assignees[0];
            group.rows.forEach((plan) => {
              plan.assignee_name = assigneeName;
            });
          });
      }
      const requests = isBulkMaintenanceAssign
        ? bulkAssignmentPlan.map(({ candidate, due, assignee_name }) =>
            api.post(`/green/trees/${candidate.treeId}/tasks`, {
              task_type: candidate.activity,
              due_date: due.dueDateInput,
              priority: newTask.priority,
              notes: newTask.notes,
              model_season: modelSeason,
              assignee_name,
            }),
          )
        : assignees.map((assignee) =>
            api.post(`/green/trees/${newTask.tree_id}/tasks`, {
              task_type: singleActivity,
              due_date: duePlans[0]?.due.dueDateInput,
              priority: newTask.priority,
              notes: newTask.notes,
              model_season: modelSeason,
              assignee_name: assignee,
            }),
          );
      const results = await Promise.allSettled(requests);
      const successCount = results.filter((item) => item.status === "fulfilled").length;
      const failedEntries = results
        .map((item, index) => ({
          item,
          label: isBulkMaintenanceAssign
            ? duePlans[index]?.candidate.label || `Row ${index + 1}`
            : assignees[index] || `Assignee ${index + 1}`,
          key: isBulkMaintenanceAssign ? duePlans[index]?.candidate.key || "" : "",
        }))
        .filter(
          (entry): entry is { item: PromiseRejectedResult; label: string; key: string } =>
            entry.item.status === "rejected",
        );
      const failedLabels = failedEntries.map((entry) => entry.label);
      if (successCount > 0 && failedEntries.length === 0) {
        setNewTask({
          tree_id: "",
          task_type: "watering",
          assignee_name: "",
          due_mode: "model_rainy",
          due_date: "",
          priority: "normal",
          notes: "",
        });
        setNewTaskMultiAssignEnabled(false);
        setNewTaskSelectedAssignees([]);
        setSelectedMaintenanceRowKeys([]);
        setMaintenanceBulkAssignMode("single_staff");
        setMaintenanceAssigneeStrategy("manual");
        setMaintenancePlanterFallbackAssignee("");
      } else if (isBulkMaintenanceAssign && failedEntries.length > 0) {
        setSelectedMaintenanceRowKeys(failedEntries.map((entry) => entry.key).filter(Boolean));
      } else if (newTaskMultiAssignEnabled) {
        setNewTaskSelectedAssignees(failedLabels);
      } else if (failedLabels[0]) {
        setNewTask((prev) => ({
          ...prev,
          assignee_name: failedLabels[0],
        }));
      }
      await loadProjectData(activeProjectId);
      toast.dismiss(loadingId);
      if (failedEntries.length === 0) {
        toast.success(
          isBulkMaintenanceAssign
            ? successCount === 1
              ? usePlanterStrategy
                ? "Maintenance row assigned to original planter"
                : "Maintenance row assigned"
              : usePlanterStrategy
                ? `${successCount} maintenance rows assigned to original planter(s)`
                : `${successCount} maintenance rows assigned`
            : successCount === 1
              ? usePlanterStrategy
                ? "Task assigned to original planter"
                : "Task assigned"
              : `Tasks assigned to ${successCount} staff`,
        );
      } else if (successCount > 0) {
        toast.success(
          isBulkMaintenanceAssign
            ? `Assigned ${successCount} maintenance row${successCount === 1 ? "" : "s"}`
            : `Assigned tasks to ${successCount} staff`,
        );
        toast.error(`Failed for: ${failedLabels.join(", ")}`);
      } else {
        toast.error(
          isBulkMaintenanceAssign
            ? `Failed to assign ${bulkRows.length} selected maintenance row${bulkRows.length === 1 ? "" : "s"}`
            : `Failed to assign task${assignees.length > 1 ? "s" : ""}`,
        );
      }
    } catch (error: any) {
      toast.dismiss(loadingId);
      toast.error(error?.response?.data?.detail || "Failed to assign task");
    } finally {
      setAssigningMaintenanceTask(false);
    }
  };

  const reviewSubmittedTask = async (taskId: number, decision: "approve" | "reject" | "metadata_edit") => {
    if (!activeProjectId) return;
    const reviewNote = (reviewNoteByTaskId[taskId] || "").trim();
    if ((decision === "reject" || decision === "metadata_edit") && !reviewNote) {
      toast.error(
        decision === "metadata_edit"
          ? "Write a metadata-edit note before sending it back."
          : "Write a rejection note before rejecting.",
      );
      return;
    }
    const loadingId = toast.loading(
      decision === "approve"
        ? "Approving task..."
        : decision === "metadata_edit"
          ? "Requesting metadata edit..."
        : "Rejecting task...",
    );
    if (
      !(await ensureWorkOperationalConsent("task_review", {
        task_id: taskId,
        decision,
      }))
    ) {
      toast.dismiss(loadingId);
      return;
    }
    try {
      await api.post(`/green/tasks/${taskId}/review`, {
        decision,
        reviewer_name: "supervisor",
        review_notes:
          reviewNote ||
          (decision === "approve"
            ? "Approved by supervisor."
            : decision === "metadata_edit"
              ? "Metadata correction requested. Update the form details and resubmit."
              : "Rejected. Update evidence and resubmit."),
        season_mode: seasonMode,
      });
      await Promise.all([
        loadProjectData(activeProjectId),
        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, "new_planting"),
        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, "existing_inventory"),
      ]);
      setReviewNoteByTaskId((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      toast.success(
        decision === "approve"
          ? "Task approved"
          : decision === "metadata_edit"
            ? "Metadata edit requested"
            : "Task rejected",
        { id: loadingId },
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to review task", { id: loadingId });
    }
  };

  const reopenApprovedTask = async (taskId: number) => {
    if (!activeProjectId) return;
    const loadingId = toast.loading("Reopening task...");
    try {
      await api.post(`/green/tasks/${taskId}/reopen`, {
        reviewer_name: "supervisor",
        reason: "Reopened for correction.",
      });
      await Promise.all([
        loadProjectData(activeProjectId),
        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, "new_planting"),
        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, "existing_inventory"),
      ]);
      toast.success("Task reopened", { id: loadingId });
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to reopen task", { id: loadingId });
    }
  };

  const uploadGreenPhoto = async (
    file: File,
    folder: string,
    link?: { treeId?: number; taskId?: number }
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    if (link?.treeId) formData.append("tree_id", String(link.treeId));
    if (link?.taskId) formData.append("task_id", String(link.taskId));
    const res = await api.post("/green/uploads/photo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const url = String(res.data?.url || "");
    if (!url) throw new Error("Upload URL missing");
    return url;
  };

  const onOrganizationLogoPicked = async (file: File | null) => {
    if (!file) return;
    if (!(await ensureWorkOperationalConsent("organization_logo_upload", { has_file: true }))) {
      return;
    }
    setOrgLogoUploading(true);
    const loadingId = toast.loading("Uploading organization logo...");
    try {
      const slugBase = (newOrganization.slug || newOrganization.name || "organization").trim().toLowerCase().replace(/\s+/g, "-");
      const logoUrl = await uploadGreenPhoto(file, `organizations/${slugBase || "logos"}`);
      setNewOrganization((prev) => ({ ...prev, logo_url: logoUrl }));
      toast.success("Organization logo uploaded", { id: loadingId });
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to upload organization logo", { id: loadingId });
    } finally {
      setOrgLogoUploading(false);
    }
  };

  const onInspectedTreePhotoPicked = async (file: File | null) => {
    if (!file || !inspectedTree) return;
    if (!(await ensureWorkOperationalConsent("work_tree_photo_upload", { tree_id: inspectedTree.id }))) {
      return;
    }
    const treeId = inspectedTree.id;
    setTreePhotoUploading(true);
    const loadingId = toast.loading("Uploading tree photo...");
    try {
      const photoUrl = await uploadGreenPhoto(file, "trees", { treeId });
      setInspectedTree((prev) => (prev && prev.id === treeId ? { ...prev, photo_url: photoUrl } : prev));
      if (activeProjectId) {
        await loadProjectData(activeProjectId);
      }
      toast.success("Tree photo updated", { id: loadingId });
    } catch {
      toast.error("Failed to upload tree photo", { id: loadingId });
    } finally {
      setTreePhotoUploading(false);
    }
  };

  const exportWorkCsv = () => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Only PDF exports are allowed.");
      return;
    }
    if (!activeProjectId) return;
    window.open(`${BACKEND_URL}/green/donor/export/csv?project_id=${activeProjectId}`, "_blank");
  };

  const exportWorkPdf = async () => {
    if (!activeProjectId) return;
    if (includePhotosInWorkPdf) {
      const loadingId = toast.loading("Preparing report with photos. This can take a few minutes...");
      try {
        const requestBody = {
          project_id: activeProjectId,
          assignee_name: assigneeFilter !== "all" ? assigneeFilter : null,
          include_photos: true,
          requested_by: workAuthSession?.user?.full_name || "work-user",
        };
        const created = await api.post("/green/work-report/export-jobs", requestBody);
        const jobId = String(created?.data?.id || "");
        if (!jobId) {
          throw new Error("Export job was not created");
        }
        const startedAt = Date.now();
        const timeoutMs = 1000 * 60 * 20;
        while (Date.now() - startedAt < timeoutMs) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const statusRes = await api.get(`/green/export-jobs/${jobId}`);
          const job = statusRes?.data || {};
          const status = String(job.status || "").toLowerCase();
          if (status === "completed" && job.download_url) {
            toast.success("Report is ready. Download started.", { id: loadingId });
            window.open(String(job.download_url), "_blank");
            return;
          }
          if (status === "failed") {
            throw new Error(String(job.error_text || "Report export failed"));
          }
        }
        toast.error("Report is still preparing. Try again in a moment.", { id: loadingId });
      } catch (error: any) {
        toast.error(error?.response?.data?.detail || error?.message || "Failed to prepare report", { id: loadingId });
      }
      return;
    }
    const params = new URLSearchParams({
      project_id: String(activeProjectId),
    });
    if (assigneeFilter !== "all") {
      params.set("assignee_name", assigneeFilter);
    }
    window.open(`${BACKEND_URL}/green/work-report/pdf?${params.toString()}`, "_blank");
  };

  const exportWorkVerra = () => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Only PDF exports are allowed.");
      return;
    }
    if (!activeProjectId) return;
    const quickSeason = verraFilters.season_mode || seasonMode;
    const quickAssignee = verraFilters.assignee_name && verraFilters.assignee_name !== "all"
      ? verraFilters.assignee_name
      : assigneeFilter !== "all"
        ? assigneeFilter
        : "";
    const params = new URLSearchParams({
      project_id: String(activeProjectId),
      season_mode: quickSeason,
      format: "zip",
    });
    if (quickAssignee) {
      params.set("assignee_name", quickAssignee);
    }
    window.open(`${BACKEND_URL}/green/donor/export/verra-vcs?${params.toString()}`, "_blank");
    window.setTimeout(() => {
      void loadVerraHistory(activeProjectId).catch(() => {});
    }, 900);
  };

  const exportCustodianPdf = () => {
    if (!activeProjectId) return;
    if (fieldWorkflowMode) {
      const reportLabel = activeWorkflowProfile === "relief_recovery" ? "Relief & Recovery programme report" : "Agric programme report";
      const entityPluralLabel = activeWorkflowProfile === "relief_recovery" ? "site" : "plot";
      if (includePhotosInCustodianPdf) {
        const loadingId = toast.loading(`Preparing ${reportLabel} with ${entityPluralLabel} photos...`);
        void (async () => {
          try {
            const created = await api.post("/green/work-report/export-jobs", {
              project_id: activeProjectId,
              assignee_name: null,
              include_photos: true,
              requested_by: workAuthSession?.user?.full_name || "work-user",
            });
            const jobId = String(created?.data?.id || "");
            if (!jobId) {
              throw new Error("Export job was not created");
            }
            const startedAt = Date.now();
            const timeoutMs = 1000 * 60 * 20;
            while (Date.now() - startedAt < timeoutMs) {
              await new Promise((resolve) => window.setTimeout(resolve, 3000));
              const statusRes = await api.get(`/green/export-jobs/${jobId}`);
              const job = statusRes?.data || {};
              const status = String(job.status || "").toLowerCase();
              if (status === "completed" && job.download_url) {
                toast.success(`${reportLabel} is ready. Download started.`, { id: loadingId });
                window.open(String(job.download_url), "_blank");
                return;
              }
              if (status === "failed") {
                throw new Error(String(job.error_text || `${reportLabel} export failed`));
              }
            }
            toast.error(`${reportLabel} is still preparing. Try again shortly.`, { id: loadingId });
          } catch (error: any) {
            toast.error(error?.response?.data?.detail || error?.message || `Failed to prepare ${reportLabel}`, { id: loadingId });
          }
        })();
        return;
      }
      window.open(`${BACKEND_URL}/green/work-report/pdf?project_id=${activeProjectId}`, "_blank");
      return;
    }
    const params = new URLSearchParams({
      _ts: String(Date.now()),
      include_photos: includePhotosInCustodianPdf ? "true" : "false",
    });
    window.open(`${BACKEND_URL}/green/projects/${activeProjectId}/custodians/export/pdf?${params.toString()}`, "_blank");
  };

  const exportExistingTreesCsv = () => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Only PDF exports are allowed.");
      return;
    }
    if (!activeProjectId) return;
    const params = new URLSearchParams({
      _ts: String(Date.now()),
    });
    window.open(`${BACKEND_URL}/green/projects/${activeProjectId}/existing-trees/export/csv?${params.toString()}`, "_blank");
  };

  const exportExistingTreesPdf = () => {
    if (!activeProjectId) return;
    const params = new URLSearchParams({
      _ts: String(Date.now()),
      include_photos: includePhotosInExistingTreesPdf ? "true" : "false",
    });
    window.open(`${BACKEND_URL}/green/projects/${activeProjectId}/existing-trees/export/pdf?${params.toString()}`, "_blank");
  };

  const exportVerraPackage = (
    format: VerraExportFormat,
    overrides?: Partial<typeof verraFilters>,
  ) => {
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Only PDF exports are allowed.");
      return;
    }
    if (!activeProjectId) return;
    const merged = {
      ...verraFilters,
      ...(overrides || {}),
    };
    const params = new URLSearchParams({
      project_id: String(activeProjectId),
      season_mode: merged.season_mode || "rainy",
      format,
    });
    if (merged.assignee_name && merged.assignee_name !== "all") {
      params.set("assignee_name", merged.assignee_name);
    }
    if (merged.monitoring_start) {
      params.set("monitoring_start", merged.monitoring_start);
    }
    if (merged.monitoring_end) {
      params.set("monitoring_end", merged.monitoring_end);
    }
    if (merged.methodology_id.trim()) {
      params.set("methodology_id", merged.methodology_id.trim());
    }
    if (merged.verifier_notes.trim()) {
      params.set("verifier_notes", merged.verifier_notes.trim());
    }
    if (merged.generated_by.trim()) {
      params.set("generated_by", merged.generated_by.trim());
    }
    window.open(`${BACKEND_URL}/green/donor/export/verra-vcs?${params.toString()}`, "_blank");
    window.setTimeout(() => {
      void loadVerraHistory(activeProjectId).catch(() => {});
    }, 1200);
  };

  const assignees = useMemo(() => {
    const namesByKey = new Map<string, string>();
    const addName = (name: string | null | undefined) => {
      const cleanName = (name || "").trim();
      if (!cleanName) return;
      const key = normalizeName(cleanName);
      if (!namesByKey.has(key)) namesByKey.set(key, cleanName);
    };
    orders.forEach((o) => addName(o.assignee_name));
    trees.forEach((t) => addName(t.created_by));
    tasks.forEach((t) => addName(t.assignee_name));
    users.forEach((u) => addName(u.full_name));
    const sortedNames = Array.from(namesByKey.values()).sort((a, b) => a.localeCompare(b));
    return ["all", ...sortedNames];
  }, [orders, trees, tasks, users]);

  const treeCoordinatesById = useMemo(() => {
    const map = new Map<number, { lng: number; lat: number }>();
    trees.forEach((tree) => {
      const treeId = Number(tree.id);
      const lng = Number(tree.lng);
      const lat = Number(tree.lat);
      if (!Number.isFinite(treeId) || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
      map.set(treeId, { lng, lat });
    });
    return map;
  }, [trees]);

  useEffect(() => {
    setVerraFilters((prev) => {
      const assigneeExists = prev.assignee_name === "all" || assignees.includes(prev.assignee_name);
      return {
        ...prev,
        season_mode: prev.season_mode || seasonMode,
        assignee_name: assigneeExists ? prev.assignee_name : "all",
      };
    });
  }, [assignees, seasonMode]);

  const projectSpeciesOptions = useMemo(() => {
    const map = new Map<string, string>();
    trees.forEach((tree) => {
      const raw = String(tree.species || "").trim();
      if (!raw) return;
      const key = normalizeName(raw);
      if (!map.has(key)) map.set(key, raw);
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [trees]);
  const normalizedNewOrderSpeciesAllocations = useMemo(
    () => normalizeSpeciesAllocations(newOrderSpeciesAllocations),
    [newOrderSpeciesAllocations],
  );
  const newOrderSpeciesTargetTotal = useMemo(
    () =>
      normalizedNewOrderSpeciesAllocations.reduce(
        (sum, item) => sum + Number(item.count || 0),
        0,
      ),
    [normalizedNewOrderSpeciesAllocations],
  );

  const activeProjectMaturityMap = useMemo(() => {
    if (!activeProjectId) return {};
    return speciesMaturityByProject[String(activeProjectId)] || {};
  }, [activeProjectId, speciesMaturityByProject]);

  const speciesMaturityRows = useMemo(
    () =>
      projectSpeciesOptions.map((item) => ({
        ...item,
        years: activeProjectMaturityMap[item.key] ?? null,
      })),
    [projectSpeciesOptions, activeProjectMaturityMap],
  );

  useEffect(() => {
    if (!projectSpeciesOptions.length) {
      setSelectedMaturitySpecies("");
      return;
    }
    const exists = projectSpeciesOptions.some((item) => item.key === selectedMaturitySpecies);
    if (!selectedMaturitySpecies || !exists) {
      const first = projectSpeciesOptions[0];
      setSelectedMaturitySpecies(first.key);
      const currentYears = activeProjectMaturityMap[first.key];
      setSelectedMaturityYears(currentYears ? String(currentYears) : "3");
    }
  }, [projectSpeciesOptions, selectedMaturitySpecies, activeProjectMaturityMap]);

  useEffect(() => {
    if (!selectedMaturitySpecies) {
      setSelectedMaturityYears("3");
      return;
    }
    const currentYears = activeProjectMaturityMap[selectedMaturitySpecies];
    setSelectedMaturityYears(currentYears ? String(currentYears) : "3");
  }, [selectedMaturitySpecies, activeProjectMaturityMap]);

  const saveSpeciesMaturityYears = async () => {
    if (!activeProjectId) return;
    if (!selectedMaturitySpecies) {
      toast.error("Select species");
      return;
    }
    const years = Number(selectedMaturityYears);
    if (!Number.isFinite(years) || years < 1 || years > 15) {
      toast.error("Select years between 1 and 15");
      return;
    }
    const speciesLabel = projectSpeciesOptions.find((item) => item.key === selectedMaturitySpecies)?.label || selectedMaturitySpecies;
    const payload = {
      species_key: selectedMaturitySpecies,
      species_label: speciesLabel,
      maturity_years: Math.round(years),
    };
    try {
      const res = await api.put(`/green/projects/${activeProjectId}/species-maturity`, payload);
      const savedKey = normalizeName(res.data?.species_key || selectedMaturitySpecies);
      const savedYears = Number(res.data?.maturity_years || Math.round(years));
      setSpeciesMaturityByProject((prev) => {
        const projectKey = String(activeProjectId);
        return {
          ...prev,
          [projectKey]: {
            ...(prev[projectKey] || {}),
            [savedKey]: Math.round(savedYears),
          },
        };
      });
      toast.success(`${speciesLabel}: pegged at ${Math.round(savedYears)} years`);
    } catch {
      toast.error("Failed to save species peg years");
    }
  };

  const assignTaskModelPreview = useMemo(() => {
    const activity = asMaintenanceActivity(newTask.task_type);
    const treeId = Number(newTask.tree_id || 0);
    const modelSeason = dueModeToSeason(newTask.due_mode);
    if (!activity || !treeId || !Number.isFinite(treeId)) {
      return {
        dueDate: null as Date | null,
        dueDateInput: "",
        detail: "Select tree and maintenance type.",
        isPastDue: false,
        daysPastDue: 0,
        blocked: false,
      };
    }
    if (!modelSeason) {
      return {
        dueDate: null as Date | null,
        dueDateInput: "",
        detail: "Custom date selected. Choose any due date.",
        isPastDue: false,
        daysPastDue: 0,
        blocked: false,
      };
    }
    const model = getModelDueForTreeActivity(treeId, activity, modelSeason, activeProjectMaturityMap);
    const today = startOfDay(new Date());
    const countdown = model.dueDate ? dayDiff(model.dueDate, today) : null;
    const isPastDue = countdown !== null && countdown < 0;
    return {
      dueDate: model.dueDate,
      dueDateInput: toDateInput(model.dueDate),
      detail: model.detail,
      isPastDue,
      daysPastDue: isPastDue ? Math.abs(countdown || 0) : 0,
      blocked: model.blocked,
    };
  }, [newTask.task_type, newTask.tree_id, newTask.due_mode, tasks, trees, activeProjectMaturityMap]);

  const resolveTaskDueDateForCandidate = useCallback(
    (treeId: number, activity: MaintenanceActivity) => {
      if (newTask.due_mode === "manual") {
        const dueDateInput = String(newTask.due_date || "").trim();
        if (!dueDateInput) {
          return {
            dueDateInput: "",
            detail: "Select custom due date",
            blocked: true,
            isPastDue: false,
            daysPastDue: 0,
          };
        }
        return {
          dueDateInput,
          detail: "Custom date selected.",
          blocked: false,
          isPastDue: false,
          daysPastDue: 0,
        };
      }
      const modelSeason = dueModeToSeason(newTask.due_mode);
      if (!modelSeason) {
        return {
          dueDateInput: "",
          detail: "Select a valid due mode.",
          blocked: true,
          isPastDue: false,
          daysPastDue: 0,
        };
      }
      const model = getModelDueForTreeActivity(treeId, activity, modelSeason, activeProjectMaturityMap);
      const today = startOfDay(new Date());
      const countdown = model.dueDate ? dayDiff(model.dueDate, today) : null;
      const isPastDue = countdown !== null && countdown < 0;
      return {
        dueDateInput: toDateInput(model.dueDate),
        detail: model.detail,
        blocked: model.blocked || !model.dueDate,
        isPastDue,
        daysPastDue: isPastDue ? Math.abs(countdown || 0) : 0,
      };
    },
    [activeProjectMaturityMap, newTask.due_date, newTask.due_mode, tasks, trees],
  );

  const isExistingTreeIntakeRecord = useCallback((tree: any) => {
    const origin = normalizeName(String(tree?.tree_origin || "").replaceAll(" ", "_"));
    const scope = normalizeName(String(tree?.attribution_scope || "").replaceAll(" ", "_"));
    const hasSourceProject = Number(tree?.source_project_id || 0) > 0;
    if (origin && origin !== "new_planting") return true;
    if (scope === "monitor_only") return true;
    if (tree?.count_in_planting_kpis === false) return true;
    if (hasSourceProject) return true;
    return false;
  }, []);
  const visibleProjectTrees = useMemo(
    () => trees.filter((tree) => !isHiddenSupportPlaceholderTree(tree)),
    [trees],
  );
  const mapViewTrees = useMemo(() => {
    const editingTreeId = Number(treePositionDraft?.treeId || 0);
    const scopedTrees =
      assigneeFilter === "all"
        ? visibleProjectTrees
        : visibleProjectTrees.filter((t) => normalizeName(t.created_by) === normalizeName(assigneeFilter) || isExistingTreeIntakeRecord(t));
    return editingTreeId > 0 ? scopedTrees.filter((tree) => Number(tree.id) !== editingTreeId) : scopedTrees;
  }, [visibleProjectTrees, assigneeFilter, isExistingTreeIntakeRecord, treePositionDraft]);
  const projectFitPoints = useMemo(() => {
    const treePoints = visibleProjectTrees.map((t) => ({ lng: t.lng, lat: t.lat }));
    return treePoints.length ? treePoints : null;
  }, [visibleProjectTrees]);
  const mapWorkflowProfile = draftWorkflowProfile;
  const existingTreeMapAreas = useMemo(
    () =>
      mapViewTrees
        .map((tree) => {
          const geometry = normalizeMapAreaGeometry(tree.existing_area_geojson);
          if (!geometry) return null;
          const count = Number(tree.inventory_tree_count || 1);
          const labelCount = Number.isFinite(count) && count > 1 ? Math.round(count) : 1;
          const localNo = Number(tree.project_tree_no || tree.id || 0);
          const agricLabel = [
            String(tree.custodian_name || "").trim() || formatPlotRecordLabel(tree),
            [getPlotCommodityLabel(tree), formatPlotAreaLabel(tree)].filter((value) => value && value !== "-").join(" | "),
          ]
            .filter(Boolean)
            .join("\n");
            return {
              id: `existing-tree-area-${tree.id}`,
              label:
              mapWorkflowProfile === "agric"
                ? agricLabel
                : labelCount > 1
                  ? `Tree #${localNo} - ${labelCount} trees`
                  : `Tree #${localNo} - Existing area`,
            treeId: tree.id,
            geojson: geometry,
          };
        })
        .filter((item): item is { id: string; label: string; treeId: number; geojson: any } => Boolean(item)),
    [mapViewTrees, mapWorkflowProfile],
  );
  const projectAreaFitPoints = useMemo(() => {
    const points = existingTreeMapAreas.flatMap((item) => extractMapAreaPoints(normalizeMapAreaGeometry(item.geojson)));
    return points.length ? points : null;
  }, [existingTreeMapAreas]);
  const combinedProjectFitPoints = useMemo(() => {
    const merged = [...(projectFitPoints || []), ...(projectAreaFitPoints || [])];
    return merged.length ? merged : null;
  }, [projectFitPoints, projectAreaFitPoints]);
  const monitoringSourceAreas = useMemo(
    () =>
      mapWorkflowProfile === "agric"
        ? visibleProjectTrees
            .map((tree) => {
              const geometry = normalizeMapAreaGeometry(tree.existing_area_geojson);
              if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return null;
              const plotLabel = formatPlotRecordLabel(tree);
              const farmerName = String(tree.custodian_name || "").trim() || "Farmer not linked";
              const cropLabel = getPlotCommodityLabel(tree);
              const areaLabel = formatPlotAreaLabel(tree);
              return {
                id: Number(tree.id),
                label: [plotLabel, farmerName, cropLabel, areaLabel].filter((value) => value && value !== "-").join(" | "),
                geojson: geometry,
                assignee_name: farmerName,
                target_trees: 1,
                crop_label: cropLabel,
                area_label: areaLabel,
              };
            })
            .filter((item): item is { id: number; label: string; geojson: any; assignee_name: string; target_trees: number; crop_label: string; area_label: string } => Boolean(item))
        : orders
            .filter((order) => Boolean(order.area_enabled) && Boolean(order.area_geojson))
            .map((order) => {
              const geometry = normalizeMapAreaGeometry(order.area_geojson);
              if (!geometry) return null;
              const areaLabel = String(order.area_label || "").trim() || `Planting area #${order.id}`;
              return {
                id: Number(order.id),
                label: areaLabel,
                geojson: geometry,
                assignee_name: order.assignee_name,
                target_trees: Number(order.target_trees || 0),
                crop_label: "",
                area_label: areaLabel,
              };
            })
            .filter((item): item is { id: number; label: string; geojson: any; assignee_name: string; target_trees: number; crop_label: string; area_label: string } => Boolean(item)),
    [mapWorkflowProfile, orders, visibleProjectTrees],
  );
  const remoteMonitoringAnalysisLabel = useMemo(() => {
    const sourceArea = monitoringSourceAreas.find((item) => Number(item.id) === Number(remoteMonitoringDraft.source_order_id || 0)) || null;
    return sourceArea?.label || (mapWorkflowProfile === "agric" ? "Drawn Farm Block Analysis" : "Drawn Polygon Analysis");
  }, [mapWorkflowProfile, monitoringSourceAreas, remoteMonitoringDraft.source_order_id]);
  const remoteMonitoringDraftTreeSummary = useMemo(() => {
    const geometry = normalizeMapAreaGeometry(remoteMonitoringDraftGeometry);
    if (!geometry) {
      return {
        tree_count: 0,
        tree_record_count: 0,
        new_planting_tree_count: 0,
        existing_inventory_tree_count: 0,
        other_tree_count: 0,
      };
    }
    return visibleProjectTrees.reduce(
      (acc, tree) => {
        if (!pointInMapGeometry(Number(tree.lng), Number(tree.lat), geometry)) return acc;
        const count = Math.max(1, Math.round(Number(tree.inventory_tree_count || 1) || 1));
        const origin = normalizeName(tree.tree_origin || "new_planting");
        acc.tree_record_count += 1;
        acc.tree_count += count;
        if (origin === "new_planting") acc.new_planting_tree_count += count;
        else if (origin === "existing_inventory") acc.existing_inventory_tree_count += count;
        else acc.other_tree_count += count;
        return acc;
      },
      {
        tree_count: 0,
        tree_record_count: 0,
        new_planting_tree_count: 0,
        existing_inventory_tree_count: 0,
        other_tree_count: 0,
      },
    );
  }, [remoteMonitoringDraftGeometry, visibleProjectTrees]);
  const remoteMonitoringSortedTrees = useMemo(() => {
    const severityRank: Record<string, number> = {
      critical: 0,
      stressed: 1,
      fair: 2,
      healthy: 3,
      vigorous: 4,
      no_data: 5,
    };
    const rows = [...(remoteMonitoringReport?.trees || [])];
    rows.sort((a, b) => {
      const severityDiff =
        (severityRank[normalizeName(a.satellite_health)] ?? 99) - (severityRank[normalizeName(b.satellite_health)] ?? 99);
      if (severityDiff !== 0) return severityDiff;
      const ndviA = typeof a.local_mean_ndvi === "number" ? a.local_mean_ndvi : 999;
      const ndviB = typeof b.local_mean_ndvi === "number" ? b.local_mean_ndvi : 999;
      if (ndviA !== ndviB) return ndviA - ndviB;
      return Number(a.project_tree_no || a.tree_id || 0) - Number(b.project_tree_no || b.tree_id || 0);
    });
    return rows;
  }, [remoteMonitoringReport]);
  const remoteMonitoringHealthCounts = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    remoteMonitoringSortedTrees.forEach((tree) => {
      const key = normalizeName(tree.satellite_health || "no_data") || "no_data";
      const current = counts.get(key) || {
        label: tree.satellite_health_label || "No data",
        count: 0,
      };
      current.count += Math.max(1, Number(tree.inventory_tree_count || 1));
      counts.set(key, current);
    });
    return Array.from(counts.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.count - a.count);
  }, [remoteMonitoringSortedTrees]);
  const remoteMonitoringTopRiskTrees = useMemo(
    () => remoteMonitoringSortedTrees.filter((tree) => ["critical", "stressed", "fair"].includes(normalizeName(tree.satellite_health))).slice(0, 6),
    [remoteMonitoringSortedTrees],
  );
  const remoteMonitoringAgricInsights = useMemo(() => {
    if (mapWorkflowProfile !== "agric" || !remoteMonitoringReport) return [] as Array<{ title: string; value: string; note: string; tone: "healthy" | "warning" | "danger" | "info" }>;
    const summary = remoteMonitoringReport.summary || {};
    const meanNdvi = typeof summary.mean_ndvi === "number" ? summary.mean_ndvi : null;
    const vegetationCoverage = typeof summary.vegetation_coverage_pct === "number" ? summary.vegetation_coverage_pct : null;
    const clearCoverage = typeof summary.clear_coverage_pct === "number" ? summary.clear_coverage_pct : null;
    const stressedPlotCount = remoteMonitoringSortedTrees.filter((tree) =>
      ["critical", "stressed", "fair"].includes(normalizeName(tree.satellite_health)),
    ).length;
    const ndviSeries = (remoteMonitoringReport.series || [])
      .map((row) => (typeof row.mean_ndvi === "number" ? row.mean_ndvi : null))
      .filter((value): value is number => value !== null);
    const latestNdvi = ndviSeries.length ? ndviSeries[ndviSeries.length - 1] : meanNdvi;
    const baselineNdvi =
      ndviSeries.length > 1 ? ndviSeries.slice(0, -1).reduce((sum, value) => sum + value, 0) / (ndviSeries.length - 1) : null;
    const ndviDelta =
      latestNdvi !== null && baselineNdvi !== null ? Number((latestNdvi - baselineNdvi).toFixed(3)) : null;
    const droughtRiskValue =
      normalizeName(summary.signal) === "watch"
        ? clearCoverage !== null && clearCoverage >= 55
          ? "High watch"
          : "Watch"
        : clearCoverage !== null && clearCoverage >= 55
          ? "Watch"
          : "Low";
    const droughtRiskTone: "healthy" | "warning" | "danger" | "info" =
      droughtRiskValue === "High watch" ? "danger" : droughtRiskValue === "Watch" ? "warning" : "info";
    const vigorTrendValue =
      ndviDelta === null
        ? "Collecting trend"
        : ndviDelta <= -0.04
          ? "Declining"
          : ndviDelta >= 0.04
            ? "Improving"
            : "Stable";
    const vigorTrendTone: "healthy" | "warning" | "danger" | "info" =
      vigorTrendValue === "Declining" ? "danger" : vigorTrendValue === "Improving" ? "healthy" : "info";
    return [
      {
        title: "Healthy Vegetation",
        value:
          vegetationCoverage !== null
            ? `${vegetationCoverage.toFixed(1)}% cover`
            : meanNdvi !== null
              ? `NDVI ${meanNdvi.toFixed(3)}`
              : "No data",
        note: meanNdvi !== null ? `Mean NDVI ${meanNdvi.toFixed(3)} in the latest composite window.` : "No cloud-free signal yet.",
        tone:
          meanNdvi !== null && meanNdvi >= 0.5 ? "healthy" : meanNdvi !== null && meanNdvi < 0.25 ? "danger" : "info",
      },
      {
        title: "Stressed Areas",
        value:
          stressedPlotCount > 0
            ? `${stressedPlotCount} flagged ${stressedPlotCount === 1 ? "plot" : "plots"}`
            : clearCoverage !== null
              ? `${clearCoverage.toFixed(1)}% clear`
              : "No major stress",
        note:
          stressedPlotCount > 0
            ? "Critical, stressed, and fair plots are prioritized for supervisor follow-up."
            : "No mapped plot is currently flagged as stressed from the latest satellite proxy.",
        tone: stressedPlotCount > 0 ? (stressedPlotCount >= 3 ? "danger" : "warning") : "healthy",
      },
      {
        title: "Possible Drought Impact",
        value: droughtRiskValue,
        note:
          clearCoverage !== null
            ? `${clearCoverage.toFixed(1)}% of the selected farm block is currently classed as clear or low-vegetation signal.`
            : "Waiting for enough cloud-free imagery to estimate drought watch reliably.",
        tone: droughtRiskTone,
      },
      {
        title: "Crop Vigor Trend",
        value: vigorTrendValue,
        note:
          ndviDelta !== null
            ? `Latest NDVI moved ${ndviDelta >= 0 ? "+" : ""}${ndviDelta.toFixed(3)} against the recent baseline.`
            : "Trend will appear once more than one monthly NDVI window is available.",
        tone: vigorTrendTone,
      },
    ];
  }, [mapWorkflowProfile, remoteMonitoringReport, remoteMonitoringSortedTrees]);
  const remoteMonitoringMapAreas = useMemo(() => {
    const plantingAreas = monitoringSourceAreas.map((area) => ({
      id: `work-order-${area.id}`,
      label: area.label,
      geojson: area.geojson,
    }));
    return plantingAreas;
  }, [monitoringSourceAreas]);
  const remoteMonitoringFocusPoints = useMemo(() => {
    if (!remoteMonitoringFocusedTreeId) return null;
    const sourceTree = visibleProjectTrees.find((entry) => Number(entry.id) === Number(remoteMonitoringFocusedTreeId));
    const coords =
      sourceTree && Number.isFinite(Number(sourceTree.lng)) && Number.isFinite(Number(sourceTree.lat))
        ? { lng: Number(sourceTree.lng), lat: Number(sourceTree.lat) }
        : null;
    if (!coords) return null;
    const delta = 0.0016;
    return [
      { lng: coords.lng - delta, lat: coords.lat - delta },
      { lng: coords.lng + delta, lat: coords.lat + delta },
    ];
  }, [remoteMonitoringFocusedTreeId, visibleProjectTrees]);
  const remoteMonitoringFitPoints = useMemo(() => {
    if (remoteMonitoringFocusPoints?.length) return remoteMonitoringFocusPoints;
    const areaPoints = remoteMonitoringMapAreas.flatMap((item) => extractMapAreaPoints(normalizeMapAreaGeometry(item.geojson)));
    const draftPoints = extractMapAreaPoints(normalizeMapAreaGeometry(remoteMonitoringDraftGeometry));
    if (draftPoints.length) return draftPoints;
    if (areaPoints.length) return areaPoints;
    return combinedProjectFitPoints;
  }, [remoteMonitoringFocusPoints, remoteMonitoringMapAreas, remoteMonitoringDraftGeometry, combinedProjectFitPoints]);

  const fitPoints = useMemo(() => {
    const userTreePoints = mapViewTrees.map((t) => ({ lng: t.lng, lat: t.lat }));
    const userAreaPoints = mapViewTrees
      .flatMap((t) => extractMapAreaPoints(normalizeMapAreaGeometry(t.existing_area_geojson)));
    const merged = [...userTreePoints, ...userAreaPoints];
    return merged.length ? merged : null;
  }, [mapViewTrees]);

  const overviewStaffSummary = useMemo(() => {
    const userByKey = new Map(assignmentUsers.map((user) => [normalizeName(user.full_name), user]));
    const staffNames = assignees.filter((name) => name !== "all");

    return staffNames
      .map((name) => {
        const key = normalizeName(name);
        const linkedUser = userByKey.get(key);
        const userOrders = orders.filter((order) => normalizeName(order.assignee_name) === key);
        const userTasks = tasks.filter((task) => normalizeName(task.assignee_name) === key);
        const plantedTrees = visibleProjectTrees.filter((tree) => normalizeName(tree.created_by) === key).length;

        const targetTrees = userOrders.reduce((sum, order) => sum + Number(order.target_trees || 0), 0);
        const pendingOrders = userOrders.filter((order) => !isCompleteStatus(order.status)).length;
        const doneTasks = userTasks.filter((task) => isCompleteStatus(task.status, task.review_state)).length;
        const overdueTasks = userTasks.filter((task) => isOverdueTask(task)).length;
        const pendingTasks = Math.max(userTasks.length - doneTasks - overdueTasks, 0);
        const lastMaintenanceTask = [...userTasks]
          .sort((a, b) => taskSortStamp(b) - taskSortStamp(a))[0];

        const typeStats = new Map<
          string,
          { type: string; total: number; done: number; pending: number; overdue: number; lastDate: string | null }
        >();
        userTasks.forEach((task) => {
          const taskType = task.task_type || "task";
          const typeKey = normalizeName(taskType);
          const current = typeStats.get(typeKey) || {
            type: taskType,
            total: 0,
            done: 0,
            pending: 0,
            overdue: 0,
            lastDate: null,
          };
          current.total += 1;
          if (isCompleteStatus(task.status, task.review_state)) current.done += 1;
          else if (isOverdueTask(task)) current.overdue += 1;
          else current.pending += 1;

          const taskDate = task.completed_at || task.due_date || task.created_at || null;
          if (taskDate) {
            const nextStamp = new Date(taskDate).getTime();
            const currentStamp = current.lastDate ? new Date(current.lastDate).getTime() : 0;
            if (!Number.isNaN(nextStamp) && nextStamp >= currentStamp) {
              current.lastDate = taskDate;
            }
          }
          typeStats.set(typeKey, current);
        });
        const taskTypeBreakdown = Array.from(typeStats.values())
          .sort((a, b) => b.total - a.total)
          .slice(0, 4);

        const recentMaintenance = [...userTasks]
          .sort((a, b) => taskSortStamp(b) - taskSortStamp(a))
          .slice(0, 3)
          .map((task) => ({
            treeId: task.tree_id,
            type: formatTaskTypeLabel(task.task_type),
            status: task.status || "-",
            date: task.completed_at || task.due_date || task.created_at || null,
          }));

        let statusLabel = "No Active Work";
        let statusTone: "danger" | "busy" | "normal" | "idle" = "idle";
        if (overdueTasks > 0) {
          statusLabel = "Needs Attention";
          statusTone = "danger";
        } else if (pendingOrders > 0 || pendingTasks > 0) {
          statusLabel = "In Progress";
          statusTone = "busy";
        } else if (userOrders.length > 0 || userTasks.length > 0 || plantedTrees > 0) {
          statusLabel = "Up To Date";
          statusTone = "normal";
        }

        return {
          name,
          position: linkedUser ? formatRoleLabel(linkedUser.role) : "Position not set",
          orderCount: userOrders.length,
          targetTrees,
          plantedTrees,
          taskTotal: userTasks.length,
          taskDone: doneTasks,
          taskPending: pendingTasks,
          taskOverdue: overdueTasks,
          taskTypeBreakdown,
          recentMaintenance,
          lastMaintenanceType: formatTaskTypeLabel(lastMaintenanceTask?.task_type),
          lastMaintenanceDate: lastMaintenanceTask?.completed_at || lastMaintenanceTask?.due_date || lastMaintenanceTask?.created_at || null,
          statusLabel,
          statusTone,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignmentUsers, assignees, orders, tasks, trees]);

  const filteredOverviewTasks = useMemo(() => {
    if (assigneeFilter === "all") return tasks;
    const key = normalizeName(assigneeFilter);
    return tasks.filter((task) => normalizeName(task.assignee_name) === key);
  }, [assigneeFilter, tasks]);

  const maintenanceTypeOverview = useMemo(() => {
    const typeStats = new Map<
      string,
      { type: string; total: number; done: number; pending: number; overdue: number; lastDate: string | null }
    >();
    filteredOverviewTasks.forEach((task) => {
      const taskType = task.task_type || "task";
      const key = normalizeName(taskType);
      const current = typeStats.get(key) || {
        type: taskType,
        total: 0,
        done: 0,
        pending: 0,
        overdue: 0,
        lastDate: null,
      };
      current.total += 1;
      if (isCompleteStatus(task.status, task.review_state)) current.done += 1;
      else if (isOverdueTask(task)) current.overdue += 1;
      else current.pending += 1;
      const taskDate = task.completed_at || task.due_date || task.created_at || null;
      if (taskDate) {
        const nextStamp = new Date(taskDate).getTime();
        const currentStamp = current.lastDate ? new Date(current.lastDate).getTime() : 0;
        if (!Number.isNaN(nextStamp) && nextStamp >= currentStamp) {
          current.lastDate = taskDate;
        }
      }
      typeStats.set(key, current);
    });
    return Array.from(typeStats.values()).sort((a, b) => b.total - a.total);
  }, [filteredOverviewTasks]);

  const filteredOverviewSummary = useMemo(() => {
    if (assigneeFilter === "all") return overviewStaffSummary;
    const key = normalizeName(assigneeFilter);
    return overviewStaffSummary.filter((item) => normalizeName(item.name) === key);
  }, [assigneeFilter, overviewStaffSummary]);

  const filteredOverviewTotals = useMemo(() => {
    return filteredOverviewSummary.reduce(
      (acc, item) => {
        acc.orderCount += item.orderCount;
        acc.targetTrees += item.targetTrees;
        acc.plantedTrees += item.plantedTrees;
        acc.taskTotal += item.taskTotal;
        acc.taskDone += item.taskDone;
        acc.taskPending += item.taskPending;
        acc.taskOverdue += item.taskOverdue;
        return acc;
      },
      {
        orderCount: 0,
        targetTrees: 0,
        plantedTrees: 0,
        taskTotal: 0,
        taskDone: 0,
        taskPending: 0,
        taskOverdue: 0,
      },
    );
  }, [filteredOverviewSummary, visibleProjectTrees]);

  const scopedOverviewTrees = useMemo(() => {
    if (assigneeFilter === "all") return visibleProjectTrees;
    const scopedKey = normalizeName(assigneeFilter);
    return visibleProjectTrees.filter((tree) => normalizeName(tree.created_by) === scopedKey);
  }, [assigneeFilter, visibleProjectTrees]);
  const treeHealthMixSegments = useMemo<OverviewDonutSegment[]>(() => {
    const totals = {
      healthy: 0,
      attention: 0,
      loss: 0,
      pending: 0,
    };
    scopedOverviewTrees.forEach((tree) => {
      const status = normalizeTreeStatus(tree.status || "");
      if (status === "pending_planting") {
        totals.pending += 1;
      } else if (status === "dead" || status === "removed") {
        totals.loss += 1;
      } else if (HEALTHY_TREE_STATUSES.has(status)) {
        totals.healthy += 1;
      } else {
        totals.attention += 1;
      }
    });
    return [
      { label: "Healthy", value: totals.healthy, color: "#16a34a" },
      { label: "Attention", value: totals.attention, color: "#f59e0b" },
      { label: "Dead/Removed", value: totals.loss, color: "#dc2626" },
      { label: "Pending", value: totals.pending, color: "#0ea5e9" },
    ];
  }, [scopedOverviewTrees]);
  const speciesPlantedRows = useMemo<OverviewSpeciesBarRow[]>(() => {
    const bySpecies = new Map<string, { species: string; count: number }>();
    scopedOverviewTrees.forEach((tree) => {
      if (tree.count_in_planting_kpis === false) return;
      const status = normalizeTreeStatus(tree.status || "");
      if (status === "pending_planting") return;
      const species = String(tree.species || "").trim() || "Unspecified";
      const key = normalizeName(species);
      const current = bySpecies.get(key);
      if (current) {
        current.count += 1;
      } else {
        bySpecies.set(key, { species, count: 1 });
      }
    });
    return Array.from(bySpecies.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.species.localeCompare(b.species);
      })
      .map((row, index) => ({
        ...row,
        color: OVERVIEW_SPECIES_COLORS[index % OVERVIEW_SPECIES_COLORS.length],
      }));
  }, [scopedOverviewTrees]);
  const overviewMonthlySurvivalRows = useMemo<OverviewMonthlySurvivalRow[]>(() => {
    const months: Array<{ key: string; label: string; year: number; month: number }> = [];
    const monthMap = new Map<string, { planted: number; healthy: number }>();
    const anchor = new Date();
    anchor.setDate(1);
    anchor.setHours(0, 0, 0, 0);
    for (let step = 11; step >= 0; step -= 1) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - step, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(undefined, { month: "short" }).slice(0, 1).toUpperCase();
      months.push({ key, label, year: d.getFullYear(), month: d.getMonth() + 1 });
      monthMap.set(key, { planted: 0, healthy: 0 });
    }
    scopedOverviewTrees.forEach((tree) => {
      if (tree.count_in_planting_kpis === false) return;
      const plantedAt = parseDateValue(tree.planting_date);
      if (!plantedAt) return;
      const monthKey = `${plantedAt.getFullYear()}-${String(plantedAt.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthMap.get(monthKey);
      if (!bucket) return;
      const status = normalizeTreeStatus(tree.status || "");
      if (status === "pending_planting") return;
      bucket.planted += 1;
      if (HEALTHY_TREE_STATUSES.has(status)) {
        bucket.healthy += 1;
      }
    });
    return months.map((month) => {
      const bucket = monthMap.get(month.key) || { planted: 0, healthy: 0 };
      const planted = Math.max(0, Number(bucket.planted || 0));
      const healthy = Math.max(0, Math.min(planted, Number(bucket.healthy || 0)));
      const nonHealthy = Math.max(planted - healthy, 0);
      const healthyRate = planted > 0 ? (healthy / planted) * 100 : 0;
      return {
        key: month.key,
        label: month.label,
        planted,
        healthy,
        nonHealthy,
        healthyRate,
      };
    });
  }, [scopedOverviewTrees]);

  const liveMaintenanceRows = useMemo<LiveMaintenanceRow[]>(() => {
    const today = startOfDay(new Date());
    const assigneeKey = assigneeFilter === "all" ? "" : normalizeName(assigneeFilter);
    const relevantTasks = assigneeKey
      ? tasks.filter((task) => normalizeName(task.assignee_name) === assigneeKey)
      : tasks;

    const taskBuckets = new Map<string, WorkTask[]>();
    const plantingTaskBuckets = new Map<number, WorkTask[]>();
    relevantTasks.forEach((task) => {
      const normalizedTaskType = normalizeName(task.task_type);
      if (normalizedTaskType === "planting") {
        const treeId = Number(task.tree_id || 0);
        if (treeId > 0) {
          const plantingBucket = plantingTaskBuckets.get(treeId);
          if (plantingBucket) plantingBucket.push(task);
          else plantingTaskBuckets.set(treeId, [task]);
        }
      }
      const typeKey = asMaintenanceActivity(task.task_type);
      if (!typeKey) return;
      const key = `${task.tree_id}:${typeKey}`;
      const bucket = taskBuckets.get(key);
      if (bucket) bucket.push(task);
      else taskBuckets.set(key, [task]);
    });

    const scopedTrees =
      assigneeFilter === "all"
        ? trees
        : trees.filter((tree) => {
            const ownerMatch = normalizeName(tree.created_by) === assigneeKey;
            if (ownerMatch) return true;
            return MAINTENANCE_ACTIVITY_ORDER.some((activity) =>
              taskBuckets.has(`${tree.id}:${activity}`)
            );
          });

    const rows: LiveMaintenanceRow[] = [];
    scopedTrees.forEach((tree) => {
      const treeOrigin = (tree.tree_origin || "new_planting") as Tree["tree_origin"];
      const originKey = normalizeName(treeOrigin || "new_planting");
      const treeStatus = normalizeTreeStatus(tree.status || "healthy");
      let plantingSubmissionTask: WorkTask | null = null;
      if (treeStatus === "pending_planting") {
        const submittedPlantings = [...(plantingTaskBuckets.get(Number(tree.id)) || [])]
          .filter((task) => {
            const statusKey = normalizeName(task.status);
            const reviewKey = normalizeName(task.review_state || "none");
            const isDone = statusKey === "done" || statusKey === "completed" || statusKey === "closed";
            return isDone && reviewKey === "submitted";
          })
          .sort((a, b) => {
            const aDate = parseDateValue(a.submitted_at || a.created_at || a.due_date || null);
            const bDate = parseDateValue(b.submitted_at || b.created_at || b.due_date || null);
            const aStamp = aDate ? aDate.getTime() : 0;
            const bStamp = bDate ? bDate.getTime() : 0;
            return bStamp - aStamp;
          });
        plantingSubmissionTask = submittedPlantings[0] || null;
        if (!plantingSubmissionTask) return;
      }
      const provisionalPendingApproval = treeStatus === "pending_planting" && Boolean(plantingSubmissionTask);
      const replacementRequired = isReplacementTriggerStatus(treeStatus);
      const plantingDateObj = parseDateValue(tree.planting_date);
      const replacementTaskBucket = [...(taskBuckets.get(`${tree.id}:replacement`) || [])];
      const replacementDoneTasks = replacementTaskBucket
        .filter((task) => isCompleteStatus(task.status, task.review_state))
        .sort((a, b) => taskSortStamp(b) - taskSortStamp(a));
      const latestReplacementDoneDate = parseDateValue(
        replacementDoneTasks[0]?.completed_at || replacementDoneTasks[0]?.due_date || replacementDoneTasks[0]?.created_at || null,
      );
      const inferredTreeAgeDays = inferTreeAgeDaysForMaintenance(tree, today);
      const baseLifecycleStartDate =
        plantingDateObj || (inferredTreeAgeDays !== null ? addDays(today, -inferredTreeAgeDays) : null);
      const lifecycleStartDate = getLifecycleStartDate(baseLifecycleStartDate, latestReplacementDoneDate);
      const treeAgeDays = lifecycleStartDate ? Math.max(dayDiff(today, lifecycleStartDate), 0) : inferredTreeAgeDays;
      const assignee = tree.created_by || "-";
      const maturityYears = getSpeciesMaturityYears(tree.species || null, activeProjectMaturityMap);
      const maturityReached =
        HEALTHY_TREE_STATUSES.has(treeStatus) &&
        treeAgeDays !== null &&
        maturityYears !== null &&
        treeAgeDays >= maturityYears * 365;

      MAINTENANCE_ACTIVITY_ORDER.forEach((activity) => {
        if (activity === "replacement" && !replacementRequired) {
          return;
        }
        const model = MAINTENANCE_MODEL[activity];
        const bucket = [...(taskBuckets.get(`${tree.id}:${activity}`) || [])];
        const doneTasks = bucket.filter((task) => isCompleteStatus(task.status, task.review_state));
        const notDoneTasks = bucket.filter((task) => !isCompleteStatus(task.status, task.review_state));
        const overdueTasks = notDoneTasks.filter((task) => isOverdueTask(task));

        const latestDone = doneTasks.sort((a, b) => taskSortStamp(b) - taskSortStamp(a))[0] || null;
        const activeTask =
          notDoneTasks
            .slice()
            .sort((a, b) => {
              const aDate = parseDateValue(a.due_date || a.created_at || null);
              const bDate = parseDateValue(b.due_date || b.created_at || null);
              const aStamp = aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER;
              const bStamp = bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER;
              return aStamp - bStamp;
            })[0] || null;

        if (
          shouldSkipExistingTreeRoutineActivity(
            activity,
            treeOrigin,
            treeAgeDays,
            treeStatus,
            Boolean(activeTask),
          )
        ) {
          return;
        }

        const latestDoneDate = parseDateValue(latestDone?.completed_at || latestDone?.due_date || latestDone?.created_at || null);
        const intervals = getMaintenanceIntervals(activity, Math.max(treeAgeDays || 0, 0), seasonMode);
        let modelDue = latestDoneDate
          ? addDays(latestDoneDate, intervals.repeatDays)
          : lifecycleStartDate
            ? addDays(lifecycleStartDate, intervals.firstDays)
            : null;
        if (replacementRequired) {
          modelDue = activity === "replacement" ? today : null;
        } else if (treeStatus === "need_watering" && activity === "watering") {
          modelDue = today;
        } else if (treeStatus === "need_protection" && activity === "protection") {
          modelDue = today;
        }
        if (maturityReached && activity !== "replacement") {
          modelDue = null;
        }
        const assignedDue = parseDateValue(activeTask?.due_date || null);

        let effectiveDue: Date | null = null;
        if (modelDue && assignedDue) {
          effectiveDue = modelDue.getTime() <= assignedDue.getTime() ? modelDue : assignedDue;
        } else {
          effectiveDue = modelDue || assignedDue;
        }

        const countdownDays = effectiveDue ? dayDiff(effectiveDue, today) : null;

        let tone: LiveStatusTone = "ok";
        let indicator = "On schedule";
        let statusText = "No open task";

        if (replacementRequired && activity !== "replacement") {
          tone = "danger";
          indicator = `Tree status '${treeStatusLabel(treeStatus)}' requires replacement`;
          statusText = activeTask ? `Task #${activeTask.id} paused until replacement` : "Paused until replacement/replant";
        } else if (replacementRequired && activity === "replacement") {
          statusText = activeTask ? `Task #${activeTask.id} ${activeTask.status || "pending"}` : "Assign replacement now";
          if (activeTask) {
            if (countdownDays !== null && countdownDays < 0) {
              tone = "danger";
              indicator = `Replacement overdue by ${Math.abs(countdownDays)} day${Math.abs(countdownDays) === 1 ? "" : "s"}`;
            } else if (countdownDays !== null && countdownDays <= 3) {
              tone = "warning";
              indicator = `Replacement due in ${countdownDays} day${countdownDays === 1 ? "" : "s"}`;
            } else {
              tone = "warning";
              indicator = "Replacement assigned";
            }
          } else {
            tone = "danger";
            indicator = "Replacement required immediately";
          }
        } else if (treeStatus === "need_watering" && activity === "watering") {
          tone = activeTask ? "warning" : "danger";
          indicator = "Inspection flagged need watering";
          statusText = activeTask ? `Task #${activeTask.id} ${activeTask.status || "pending"}` : "Action required";
        } else if (treeStatus === "need_protection" && activity === "protection") {
          tone = activeTask ? "warning" : "danger";
          indicator = "Inspection flagged need protection";
          statusText = activeTask ? `Task #${activeTask.id} ${activeTask.status || "pending"}` : "Action required";
        } else if (maturityReached) {
          statusText = "Self-sustaining stage reached";
          if (notDoneTasks.length > 0) {
            tone = "warning";
            indicator = `Lifecycle complete (~${maturityYears || "-"} years), close pending tasks`;
          } else {
            tone = "ok";
            indicator = `Lifecycle complete (~${maturityYears || "-"} years)`;
          }
        } else if (!lifecycleStartDate && !activeTask) {
          tone = "info";
          indicator = "Lifecycle start date missing";
          statusText = "Set planting date or replacement completion date";
        } else if (activeTask) {
          statusText = `Task #${activeTask.id} ${activeTask.status || "pending"}`;
          if (countdownDays !== null && countdownDays < 0) {
            tone = "danger";
            indicator = `Overdue by ${Math.abs(countdownDays)} day${Math.abs(countdownDays) === 1 ? "" : "s"}`;
          } else if (countdownDays !== null && countdownDays <= 3) {
            tone = "warning";
            indicator = `Due in ${countdownDays} day${countdownDays === 1 ? "" : "s"}`;
          } else {
            tone = "warning";
            indicator = "Assigned and in progress";
          }
        } else if (countdownDays !== null && countdownDays < 0) {
          tone = "danger";
          indicator = `Not done, overdue by ${Math.abs(countdownDays)} day${Math.abs(countdownDays) === 1 ? "" : "s"}`;
          statusText = "No open task assigned";
        } else if (countdownDays !== null && countdownDays <= 7) {
          tone = "warning";
          indicator = `Due in ${countdownDays} day${countdownDays === 1 ? "" : "s"}`;
          statusText = "Upcoming window";
        } else if (doneTasks.length > 0) {
          tone = "ok";
          indicator = "Cycle completed";
          statusText = "Waiting for next cycle";
        }

        let modelRationale =
          activity === "replacement"
            ? "Replacement is condition-triggered (dead/damaged/removed/needs replacement), not a routine cyclical task."
            : `${model.rationale} ${SEASON_LABEL[seasonMode]}: first ${intervals.firstDays}d, repeat ${intervals.repeatDays}d.${
                latestReplacementDoneDate ? " Lifecycle reset from latest replacement completion." : ""
              }`;

        if (originKey === "existing_inventory" && (activity === "watering" || activity === "weeding")) {
          modelRationale = `${modelRationale} Existing-tree stewardship suppresses routine ${activity} once the tree is beyond the establishment window unless a live task or condition trigger exists.`;
        }

        if (provisionalPendingApproval) {
          const plantingTaskLabel = plantingSubmissionTask ? `Planting task #${plantingSubmissionTask.id}` : "Planting task";
          statusText = `${plantingTaskLabel} submitted (awaiting supervisor approval)`;
          if (countdownDays === null) {
            tone = "warning";
            indicator = "Provisional preview while planting approval is pending";
          } else if (countdownDays < 0) {
            tone = "danger";
            indicator = `Provisional: ${Math.abs(countdownDays)}d overdue from planting date while approval is pending`;
          } else if (countdownDays === 0) {
            tone = "warning";
            indicator = "Provisional: due today from planting date once approved";
          } else if (countdownDays <= 7) {
            tone = "warning";
            indicator = `Provisional: due in ${countdownDays} day${countdownDays === 1 ? "" : "s"} from planting date`;
          } else {
            tone = "info";
            indicator = `Provisional: due in ${countdownDays} day${countdownDays === 1 ? "" : "s"} from planting date`;
          }
          modelRationale = `${modelRationale} Provisional preview only: planting submission is awaiting supervisor approval. Rows are visible for planning, but maintenance workflow activates after approval.`;
        }

        rows.push({
          key: `${tree.id}-${activity}`,
          treeId: tree.id,
          treeOrigin: originKey as "new_planting" | "existing_inventory" | "natural_regeneration",
          assignee,
          activity,
          activityLabel: model.label,
          plantingDate: tree.planting_date || null,
          treeAgeDays,
          lastDoneAt: latestDone?.completed_at || latestDone?.due_date || latestDone?.created_at || null,
          modelDueDate: modelDue ? modelDue.toISOString() : null,
          assignedDueDate: assignedDue ? assignedDue.toISOString() : null,
          effectiveDueDate: effectiveDue ? effectiveDue.toISOString() : null,
          countdownDays,
          tone,
          indicator,
          statusText,
          doneCount: doneTasks.length,
          pendingCount: notDoneTasks.length,
          overdueCount: overdueTasks.length,
          openTaskId: activeTask?.id || null,
          modelRationale,
        });
      });
    });

    return rows.sort((a, b) => {
      const toneDiff = liveToneRank(a.tone) - liveToneRank(b.tone);
      if (toneDiff !== 0) return toneDiff;
      const aCountdown = a.countdownDays ?? Number.MAX_SAFE_INTEGER;
      const bCountdown = b.countdownDays ?? Number.MAX_SAFE_INTEGER;
      if (aCountdown !== bCountdown) return aCountdown - bCountdown;
      if (a.treeId !== b.treeId) return a.treeId - b.treeId;
      return a.activityLabel.localeCompare(b.activityLabel);
    });
  }, [assigneeFilter, tasks, trees, seasonMode, activeProjectMaturityMap]);

  const newPlantingLiveRows = useMemo(
    () => liveMaintenanceRows.filter((row) => row.treeOrigin === "new_planting"),
    [liveMaintenanceRows],
  );
  const existingTreeLiveRows = useMemo(
    () => liveMaintenanceRows.filter((row) => row.treeOrigin === "existing_inventory"),
    [liveMaintenanceRows],
  );
  const effectiveLiveRows = useMemo(
    () => (serverLiveRows.length ? serverLiveRows : newPlantingLiveRows),
    [serverLiveRows, newPlantingLiveRows],
  );
  const effectiveExistingLiveRows = useMemo(
    () => (serverExistingLiveRows.length ? serverExistingLiveRows : existingTreeLiveRows),
    [serverExistingLiveRows, existingTreeLiveRows],
  );
  const allMaintenanceAssignRows = useMemo(
    () => [...effectiveLiveRows, ...effectiveExistingLiveRows],
    [effectiveExistingLiveRows, effectiveLiveRows],
  );
  const liveTableIsExistingScope = liveTreeScopeTab === "existing_inventory";
  const displayedLiveRowsBase = liveTableIsExistingScope ? effectiveExistingLiveRows : effectiveLiveRows;
  const displayedLiveRows = useMemo(
    () => displayedLiveRowsBase.filter((row) => maintenanceMatchesAttentionFilter(row)),
    [displayedLiveRowsBase, maintenanceMatchesAttentionFilter],
  );
  const displayedLiveSummary = useMemo(() => summarizeLiveRows(displayedLiveRows), [displayedLiveRows]);
  const displayedLiveSources = liveTableIsExistingScope ? serverExistingLiveSources : serverLiveSources;
  const selectedMaintenanceRows = useMemo(() => {
    if (!selectedMaintenanceRowKeys.length) return [];
    const rowMap = new Map(allMaintenanceAssignRows.map((row) => [row.key, row]));
    return selectedMaintenanceRowKeys
      .map((key) => rowMap.get(key))
      .filter((row): row is LiveMaintenanceRow => Boolean(row));
  }, [allMaintenanceAssignRows, selectedMaintenanceRowKeys]);
  const bulkMaintenanceDuePreview = useMemo(() => {
    if (!selectedMaintenanceRows.length) return null;
    if (newTask.due_mode === "manual") {
      return {
        detail: "Custom due date will be applied to all selected maintenance rows.",
        blockedCount: 0,
        pastDueCount: 0,
      };
    }
    const evaluations = selectedMaintenanceRows.map((row) => resolveTaskDueDateForCandidate(row.treeId, row.activity));
    return {
      detail: "Model due dates will be calculated separately for each selected tree and activity.",
      blockedCount: evaluations.filter((item) => item.blocked).length,
      pastDueCount: evaluations.filter((item) => item.isPastDue).length,
    };
  }, [newTask.due_mode, resolveTaskDueDateForCandidate, selectedMaintenanceRows]);
  const displayedMaintenanceSelectionCount = useMemo(
    () => displayedLiveRows.filter((row) => selectedMaintenanceRowKeys.includes(row.key)).length,
    [displayedLiveRows, selectedMaintenanceRowKeys],
  );
  const hiddenMaintenanceSelectionCount = useMemo(
    () => Math.max(selectedMaintenanceRows.length - displayedMaintenanceSelectionCount, 0),
    [displayedMaintenanceSelectionCount, selectedMaintenanceRows.length],
  );
  const maintenanceRouteGroups = useMemo(() => {
    if (!selectedMaintenanceRows.length) return [];
    const groups = new Map<string, { key: string; label: string; count: number }>();
    selectedMaintenanceRows.forEach((row) => {
      const group = describeMaintenanceRouteGroup(row);
      const current = groups.get(group.key) || { ...group, count: 0 };
      current.count += 1;
      groups.set(group.key, current);
    });
    return Array.from(groups.values()).sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
  }, [describeMaintenanceRouteGroup, selectedMaintenanceRows]);
  const maintenancePlanterAssignmentPreview = useMemo(() => {
    if (maintenanceAssigneeStrategy !== "tree_planter") {
      return {
        candidateCount: 0,
        entries: [] as MaintenanceAssignmentPreviewEntry[],
        unmatchedRows: [] as MaintenanceAssignmentPreviewRow[],
      };
    }

    const selectedRows =
      selectedMaintenanceRows.length > 0
        ? selectedMaintenanceRows.map((row) => ({
            key: row.key,
            treeId: Number(row.treeId || 0),
            activityLabel: row.activityLabel,
            sourceIndicator: row.indicator,
          }))
        : Number(newTask.tree_id || 0) > 0
          ? [
              {
                key: `single-${newTask.tree_id}-${newTask.task_type || "maintenance"}`,
                treeId: Number(newTask.tree_id || 0),
                activityLabel: formatTaskTypeLabel(newTask.task_type || "maintenance"),
                sourceIndicator: "Will be assigned to the original planter if a matching staff account exists.",
              },
            ]
          : [];

    const entries = new Map<string, MaintenanceAssignmentPreviewEntry>();
    const unmatchedRows: MaintenanceAssignmentPreviewRow[] = [];

    selectedRows.forEach((item) => {
      const tree = treeById.get(item.treeId);
      const planterName = String(tree?.created_by || "").trim();
      const matchedAssignee = resolveKnownUserName(planterName);
      const resolvedAssignee = matchedAssignee || String(maintenancePlanterFallbackAssignee || "").trim();
      const numericTreeId = Number(item.treeId || 0);
      const projectTreeNo = Number((tree as any)?.project_tree_no || 0);
      const previewRow: MaintenanceAssignmentPreviewRow = {
        key: item.key,
        label: `Tree #${projectTreeNo > 0 ? projectTreeNo : numericTreeId}`,
        activityLabel: item.activityLabel,
        indicator: [
          planterName ? `Original planter: ${planterName}` : "No original planter recorded",
          !matchedAssignee
            ? resolvedAssignee
              ? `Fallback assignee: ${resolvedAssignee}`
              : "Needs fallback assignee"
            : item.sourceIndicator,
        ]
          .filter(Boolean)
          .join(" | "),
        species: String(tree?.species || "").trim(),
        group: {
          key: planterName ? `planter:${normalizeName(planterName)}` : `unmatched:${item.key}`,
          label: planterName ? `Original planter: ${planterName}` : "Needs fallback assignee",
        },
      };

      if (!resolvedAssignee) {
        unmatchedRows.push(previewRow);
        return;
      }

      const current = entries.get(resolvedAssignee) || {
        assignee: resolvedAssignee,
        rows: [],
        groups: [],
      };
      current.rows.push(previewRow);
      entries.set(resolvedAssignee, current);
    });

    return {
      candidateCount: selectedRows.length,
      entries: Array.from(entries.values()).sort((a, b) => a.assignee.localeCompare(b.assignee)),
      unmatchedRows,
    };
  }, [
    maintenanceAssigneeStrategy,
    maintenancePlanterFallbackAssignee,
    newTask.task_type,
    newTask.tree_id,
    resolveKnownUserName,
    selectedMaintenanceRows,
    treeById,
  ]);
  const maintenanceAssignmentPreview = useMemo(() => {
    return buildMaintenanceAssignmentPreview({
      rows: selectedMaintenanceRows,
      assignees: currentTaskAssignees,
      mode: maintenanceBulkAssignMode,
      treeById,
      describeGroup: describeMaintenanceRouteGroup,
    });
  }, [
    currentTaskAssignees,
    describeMaintenanceRouteGroup,
    maintenanceBulkAssignMode,
    selectedMaintenanceRows,
    treeById,
  ]);
  const maintenanceFocusedTreeIds = useMemo(() => {
    if (!maintenanceMapFocusEnabled) return [];
    return Array.from(
      new Set(
        selectedMaintenanceRows
          .map((row) => Number(row.treeId || 0))
          .filter((treeId) => treeId > 0),
      ),
    );
  }, [maintenanceMapFocusEnabled, selectedMaintenanceRows]);
  const maintenanceMapFocusActive = activeForm === "map_view" && maintenanceFocusedTreeIds.length > 0;
  const maintenanceMapTrees = useMemo(() => {
    if (!maintenanceFocusedTreeIds.length) return mapViewTrees;
    const focusedIds = new Set(maintenanceFocusedTreeIds);
    return mapViewTrees.filter((tree) => focusedIds.has(Number(tree.id)));
  }, [maintenanceFocusedTreeIds, mapViewTrees]);
  const maintenanceMapFitPoints = useMemo(() => {
    if (!maintenanceFocusedTreeIds.length) return null;
    const focusedPoints = maintenanceMapTrees.flatMap((tree) => {
      const treePoint =
        Number.isFinite(Number(tree.lng)) && Number.isFinite(Number(tree.lat))
          ? [{ lng: Number(tree.lng), lat: Number(tree.lat) }]
          : [];
      const areaPoints = extractMapAreaPoints(normalizeMapAreaGeometry(tree.existing_area_geojson));
      return [...treePoint, ...areaPoints];
    });
    if (focusedPoints.length === 1) {
      const [point] = focusedPoints;
      const delta = 0.0016;
      return [
        { lng: point.lng - delta, lat: point.lat - delta },
        { lng: point.lng + delta, lat: point.lat + delta },
      ];
    }
    return focusedPoints.length ? focusedPoints : null;
  }, [maintenanceFocusedTreeIds, maintenanceMapTrees]);
  const mapTrees = maintenanceMapFocusActive
    ? maintenanceMapTrees
    : activeProjectId && newOrderAreaEnabled
      ? trees
      : mapViewTrees;
  const mapFitPoints = maintenanceMapFocusActive
    ? maintenanceMapFitPoints
    : activeProjectId && newOrderAreaEnabled
      ? combinedProjectFitPoints
      : fitPoints;

  useEffect(() => {
    if (!selectedMaintenanceRows.length && maintenanceMapFocusEnabled) {
      setMaintenanceMapFocusEnabled(false);
    }
  }, [maintenanceMapFocusEnabled, selectedMaintenanceRows.length]);
  const actionWorkflowProfile = normalizeWorkflowProfile(projectSettingsDraft.workflow_profile);
  const actionWorkflowLabels = getWorkflowLabels(actionWorkflowProfile);

  const activeProjectActions: Array<{ form: WorkForm; title: string; note: string; isNew?: boolean }> =
    actionWorkflowProfile === "agric"
      ? [
          { form: "farmer_live", title: "Farmer Live Table", note: "Live farmer activity + results" },
          { form: "custodian_hub", title: actionWorkflowLabels.registryTitle, note: "Farmer onboarding + support setup" },
          { form: "field_capture_assign", title: "Field Capture", note: "Assign first plot capture to staff" },
          { form: "support_visit_assign", title: "Support Visits", note: "Assign follow-up field visits" },
          { form: "existing_tree_intake", title: "Plot Records", note: "Mapped plots + farm data" },
          { form: "map_view", title: "Map View", note: "Plots + boundaries" },
          { form: "remote_monitoring", title: "Farm Health", note: "NDVI + vigor + drought watch", isNew: true },
          { form: "review_queue", title: "Review Queue", note: "Approve or reject submissions" },
          { form: "users", title: "Users", note: "All staff status + roles" },
          ...(canAccessSuperAdmin
            ? [{ form: "logs" as WorkForm, title: "System Logs & Reports", note: "Cross-product activity + QR reports" }]
            : []),
          ...(activeProjectRecord?.organization_slug
            ? [{ form: "share_impact" as WorkForm, title: "Share Impact", note: "Donor links · endorsements" }]
            : []),
        ]
      : actionWorkflowProfile === "relief_recovery"
        ? [
            { form: "farmer_live", title: "Beneficiary Live Table", note: "Live beneficiary activity + delivery results" },
            { form: "custodian_hub", title: actionWorkflowLabels.registryTitle, note: "Beneficiary onboarding + relief setup" },
            { form: "field_capture_assign", title: "Site Capture", note: "Assign first site assessment to staff" },
            { form: "support_visit_assign", title: "Relief Visits", note: "Assign follow-up relief or recovery visits" },
            { form: "existing_tree_intake", title: "Site Records", note: "Mapped sites + damage and recovery data" },
            { form: "map_view", title: "Map View", note: "Sites + boundaries" },
            { form: "review_queue", title: "Review Queue", note: "Approve or reject submissions" },
            { form: "users", title: "Users", note: "All staff status + roles" },
            ...(canAccessSuperAdmin
              ? [{ form: "logs" as WorkForm, title: "System Logs & Reports", note: "Cross-product activity + QR reports" }]
              : []),
            ...(activeProjectRecord?.organization_slug
              ? [{ form: "share_impact" as WorkForm, title: "Share Impact", note: "Donor links · endorsements" }]
              : []),
          ]
      : [
          { form: "overview", title: "Overview", note: "Progress summary" },
          { form: "map_view", title: "Map View", note: `${actionWorkflowLabels.entityPlural} + draw polygons` },
          { form: "remote_monitoring", title: "Remote Monitoring", note: "Satellite Monitoring +", isNew: true },
          { form: "live_table", title: "Live Maintenance", note: "New planting + existing tree" },
          ...(publicSponsorshipProject
            ? [
                { form: "sponsors" as WorkForm, title: "Sponsors", note: "Sponsor accounts + linked trees" },
                { form: "sponsorship_orders" as WorkForm, title: "Payments", note: "Orders + payment review" },
                { form: "sponsor_payouts" as WorkForm, title: "Payouts", note: "Agent earnings + payout queue" },
                { form: "sponsor_feedback" as WorkForm, title: "Feedback & Nominations", note: "Complaints + school nominations" },
              ]
            : []),
          { form: "users", title: "Users", note: "All staff status + roles" },
          { form: "assign_work", title: "Planting Orders", note: "Assign planting targets" },
          { form: "assign_task", title: "Maintenance", note: "Assign maintenance" },
          { form: "custodian_hub", title: actionWorkflowLabels.registryTitle, note: "Overview + custodians +" },
          { form: "existing_tree_intake", title: "Existing Trees", note: "Existing tree records" },
          { form: "verra_reports", title: "Verra Reports", note: "VCS package + history" },
          { form: "review_queue", title: "Review Queue", note: "Approve or reject submissions" },
          ...(canAccessSuperAdmin
            ? [{ form: "logs" as WorkForm, title: "System Logs & Reports", note: "Activity logs + QR prints report" }]
            : []),
          ...(activeProjectRecord?.organization_slug
            ? [{ form: "share_impact" as WorkForm, title: "Share Impact", note: "Donor links · endorsements" }]
            : []),
        ];

  const userWorkSummary = useMemo(() => {
    return users
      .map((user) => {
        const userKey = normalizeName(user.full_name);
        const userOrders = orders.filter((order) => normalizeName(order.assignee_name) === userKey);
        const userTasks = tasks.filter((task) => normalizeName(task.assignee_name) === userKey);
        const plantedTrees = trees.filter((tree) => normalizeName(tree.created_by) === userKey).length;

        const targetTrees = userOrders.reduce((sum, order) => sum + Number(order.target_trees || 0), 0);
        const pendingOrders = userOrders.filter((order) => !isCompleteStatus(order.status)).length;
        const doneTasks = userTasks.filter((task) => isCompleteStatus(task.status, task.review_state)).length;
        const pendingTasks = userTasks.filter((task) => !isCompleteStatus(task.status, task.review_state)).length;

        let statusLabel = "No Active Work";
        let statusTone: "busy" | "normal" | "idle" = "idle";
        if (pendingOrders > 0 || pendingTasks > 0) {
          statusLabel = "In Progress";
          statusTone = "busy";
        } else if (userOrders.length > 0 || userTasks.length > 0) {
          statusLabel = "Up To Date";
          statusTone = "normal";
        }

        return {
          user,
          position: formatRoleLabel(user.role),
          orderCount: userOrders.length,
          targetTrees,
          plantedTrees,
          totalTasks: userTasks.length,
          doneTasks,
          pendingTasks,
          statusLabel,
          statusTone,
        };
      })
      .sort((a, b) => a.user.full_name.localeCompare(b.user.full_name));
  }, [users, orders, tasks, trees]);
  const visibleUserWorkSummary = useMemo(() => {
    if (!publicSponsorshipProject) return userWorkSummary;
    const allowed = new Set(publicSponsorAgentUserIds);
    return userWorkSummary.filter((item) => allowed.has(Number(item.user.id || 0)));
  }, [publicSponsorshipProject, publicSponsorAgentUserIds, userWorkSummary]);

  const calcProgress = (value: number, target: number) => {
    if (!target || target <= 0) return 0;
    return Math.min((value / target) * 100, 100);
  };
  const plantingCompletionPct = calcProgress(filteredOverviewTotals.plantedTrees, filteredOverviewTotals.targetTrees);
  const taskDonePct = calcProgress(filteredOverviewTotals.taskDone, filteredOverviewTotals.taskTotal);
  const taskPendingPct = calcProgress(filteredOverviewTotals.taskPending, filteredOverviewTotals.taskTotal);
  const taskOverduePct = calcProgress(filteredOverviewTotals.taskOverdue, filteredOverviewTotals.taskTotal);

  const ageSurvivalCheckpoints = useMemo(() => {
    const age = (kpiCurrent?.age_survival || {}) as any;
    return [30, 90, 180].map((day) => {
      const bucket = age?.[`day_${day}`] || {};
      return {
        day,
        survivalRate: Number(bucket?.survival_rate || 0),
        survivedTrees: Number(bucket?.survived_trees || 0),
        eligibleTrees: Number(bucket?.eligible_trees || 0),
      };
    });
  }, [kpiCurrent]);
  const ageSurvivalMissingPlantingDate = useMemo(() => {
    const age = (kpiCurrent?.age_survival || {}) as any;
    return Number(age?.trees_missing_planting_date || 0);
  }, [kpiCurrent]);
  const speciesMissingPlantingFromTrees = useMemo(
    () => trees.reduce((sum, tree) => (parseDateValue(tree?.planting_date || null) ? sum : sum + 1), 0),
    [trees],
  );
  const speciesDailySurvivalSeries = useMemo(() => {
    const rawRows = Array.isArray(speciesDailyTrend?.species) ? speciesDailyTrend.species : [];
    const palette = [
      "#16a34a",
      "#0ea5e9",
      "#f97316",
      "#8b5cf6",
      "#dc2626",
      "#0891b2",
      "#7c3aed",
      "#15803d",
      "#b45309",
      "#334155",
      "#0f766e",
      "#4338ca",
      "#a21caf",
      "#ea580c",
      "#65a30d",
      "#0284c7",
    ];
    return rawRows
      .map((row: any) => {
        const species = String(row?.species_label || row?.species_key || "Unknown Species");
        const treesRaw = Number(row?.trees_with_planting_date || 0);
        const treesWithPlantingDate = Number.isFinite(treesRaw) ? treesRaw : 0;
        const pointsRaw = Array.isArray(row?.points) ? row.points : [];
        const points = pointsRaw
          .map((point: any) => {
            const dayValue = Number(point?.day_since_species_start ?? point?.day ?? 0);
            const rateValue = Number(point?.survival_rate ?? point?.value ?? 0);
            const eligibleValue = Number(point?.eligible_trees ?? point?.eligible ?? 0);
            const survivedValue = Number(point?.survived_trees ?? point?.survived ?? 0);
            const day = Number.isFinite(dayValue) ? Math.max(Math.round(dayValue), 0) : 0;
            const phase =
              String(point?.phase || "").trim() ||
              (day >= 180 ? "past 180 days" : day >= 90 ? "past 90 days" : day >= 30 ? "past 30 days" : "0-29 days");
            return {
              day,
              date: String(point?.date || ""),
              label: `day ${day}`,
              value: Number.isFinite(rateValue) ? Math.max(Math.min(rateValue, 100), 0) : 0,
              eligible: Number.isFinite(eligibleValue) ? Math.max(Math.round(eligibleValue), 0) : 0,
              survived: Number.isFinite(survivedValue) ? Math.max(Math.round(survivedValue), 0) : 0,
              phase,
            };
          })
          .filter((point: any) => Number.isFinite(point.day) && Number.isFinite(point.value))
          .sort((a: any, b: any) => a.day - b.day);
        return {
          species,
          trees: treesWithPlantingDate,
          startDate: String(row?.start_date || ""),
          points,
        };
      })
      .filter((row: any) => row.trees > 0 && row.points.length > 0)
      .sort((a: any, b: any) => {
        if (b.trees !== a.trees) return b.trees - a.trees;
        return String(a.species).localeCompare(String(b.species));
      })
      .map((row: any, idx: number) => ({
        ...row,
        color: palette[idx % palette.length],
      }));
  }, [speciesDailyTrend]);
  const speciesDailySurvivalEmptyMessage = useMemo(() => {
    if (speciesDailySurvivalSeries.length > 0) return "";
    if (trees.length === 0) return "No trees in this project yet.";
    const serverMissingCount = Number(speciesDailyTrend?.trees_missing_planting_date || 0);
    const missingCount =
      serverMissingCount > 0
        ? serverMissingCount
        : ageSurvivalMissingPlantingDate > 0
        ? ageSurvivalMissingPlantingDate
        : speciesMissingPlantingFromTrees;
    if (missingCount > 0) {
      return `No species lines yet: ${missingCount} tree(s) are missing planting date.`;
    }
    return "No species daily survival timeline yet. Submit maintenance status updates and refresh.";
  }, [
    speciesDailySurvivalSeries,
    trees,
    speciesDailyTrend,
    ageSurvivalMissingPlantingDate,
    speciesMissingPlantingFromTrees,
  ]);
  const speciesDailySurvivalContext = useMemo(() => {
    const startRaw = String(speciesDailyTrend?.start_date || "").trim();
    const startLabel = startRaw ? formatDateLabel(startRaw) : "first planting date";
    return `Context: each line is one species, tracked daily from planting date (${startLabel} start). Status updates come from maintenance/task-review tree status logs; after day 30, the phase is marked as past 30 days and continues forward.`;
  }, [speciesDailyTrend]);

  const sponsorAccounts = useMemo(() => {
    const projectStatsBySponsorId = new Map<
      number,
      {
        orders_count: number;
        amount_total: number;
        verified_orders_count: number;
        pending_orders_count: number;
        issue_orders_count: number;
        awaiting_tree_units: number;
      }
    >();
    sponsorshipOrders.forEach((order) => {
      const sponsorId = Number(order.sponsor_account_id || 0);
      if (!(sponsorId > 0)) return;
      const outcome = getSponsorshipPaymentOutcomeGroup(order.payment_status);
      const existing = projectStatsBySponsorId.get(sponsorId) || {
        orders_count: 0,
        amount_total: 0,
        verified_orders_count: 0,
        pending_orders_count: 0,
        issue_orders_count: 0,
        awaiting_tree_units: 0,
      };
      existing.orders_count += 1;
      existing.amount_total = Number((existing.amount_total + Number(order.amount_total || 0)).toFixed(2));
      if (outcome === "successful") existing.verified_orders_count += 1;
      if (outcome === "awaiting") existing.pending_orders_count += 1;
      if (outcome === "issue") existing.issue_orders_count += 1;
      existing.awaiting_tree_units += Number(order.awaiting_tree_units || 0);
      projectStatsBySponsorId.set(sponsorId, existing);
    });

    const byId = new Map<number, SponsorAccountSummary>();
    fallbackSponsorAccounts.forEach((account) => {
      const projectStats = projectStatsBySponsorId.get(Number(account.id || 0));
      byId.set(account.id, {
        ...account,
        project_orders_count: Number(projectStats?.orders_count || 0),
        project_amount_total: Number(projectStats?.amount_total || 0),
        project_verified_orders_count: Number(projectStats?.verified_orders_count || 0),
        project_pending_orders_count: Number(projectStats?.pending_orders_count || 0),
        project_issue_orders_count: Number(projectStats?.issue_orders_count || 0),
        project_awaiting_tree_units: Number(projectStats?.awaiting_tree_units || 0),
      });
    });
    sponsorshipOrders.forEach((order) => {
      const sponsorId = Number(order.sponsor_account_id || 0);
      const outcome = getSponsorshipPaymentOutcomeGroup(order.payment_status);
      if (!(sponsorId > 0)) return;
      const existing = byId.get(sponsorId);
      if (existing) {
        byId.set(sponsorId, {
          ...existing,
          full_name: existing.full_name || String(order.sponsor_name || "").trim() || `Sponsor #${sponsorId}`,
          organization_name:
            existing.organization_name || String(order.sponsor_organization_name || "").trim() || null,
          email: existing.email || String(order.sponsor_email || "").trim() || null,
          account_type: existing.account_type || String(order.sponsor_account_type || "").trim() || null,
          project_orders_count: Number(existing.project_orders_count || 0) || 1,
          project_amount_total:
            Number(existing.project_amount_total || 0) > 0
              ? Number(existing.project_amount_total || 0)
              : Number(order.amount_total || 0),
          project_verified_orders_count:
            Number(existing.project_verified_orders_count || 0) > 0
              ? Number(existing.project_verified_orders_count || 0)
              : outcome === "successful"
              ? 1
              : 0,
          project_pending_orders_count:
            Number(existing.project_pending_orders_count || 0) > 0
              ? Number(existing.project_pending_orders_count || 0)
              : outcome === "awaiting"
              ? 1
              : 0,
          project_issue_orders_count:
            Number(existing.project_issue_orders_count || 0) > 0
              ? Number(existing.project_issue_orders_count || 0)
              : outcome === "issue"
              ? 1
              : 0,
          project_awaiting_tree_units:
            Number(existing.project_awaiting_tree_units || 0) > 0
              ? Number(existing.project_awaiting_tree_units || 0)
              : Number(order.awaiting_tree_units || 0),
        });
        return;
      }
      const projectStats = projectStatsBySponsorId.get(sponsorId);
      byId.set(sponsorId, {
        id: sponsorId,
        full_name: String(order.sponsor_name || "").trim() || `Sponsor #${sponsorId}`,
        organization_name: String(order.sponsor_organization_name || "").trim() || null,
        email: String(order.sponsor_email || "").trim() || null,
        account_type: String(order.sponsor_account_type || "").trim() || null,
        orders_count: Number(projectStats?.orders_count || 1),
        amount_total: Number(projectStats?.amount_total || order.amount_total || 0),
        linked_units: Number(order.linked_units || 0),
        verified_orders_count: Number(projectStats?.verified_orders_count || (outcome === "successful" ? 1 : 0)),
        pending_orders_count: Number(projectStats?.pending_orders_count || (outcome === "awaiting" ? 1 : 0)),
        issue_orders_count: Number(projectStats?.issue_orders_count || (outcome === "issue" ? 1 : 0)),
        awaiting_tree_units: Number(projectStats?.awaiting_tree_units || order.awaiting_tree_units || 0),
        project_orders_count: Number(projectStats?.orders_count || 1),
        project_amount_total: Number(projectStats?.amount_total || order.amount_total || 0),
        project_verified_orders_count: Number(projectStats?.verified_orders_count || (outcome === "successful" ? 1 : 0)),
        project_pending_orders_count: Number(projectStats?.pending_orders_count || (outcome === "awaiting" ? 1 : 0)),
        project_issue_orders_count: Number(projectStats?.issue_orders_count || (outcome === "issue" ? 1 : 0)),
        project_awaiting_tree_units: Number(projectStats?.awaiting_tree_units || order.awaiting_tree_units || 0),
      });
    });
    return Array.from(byId.values()).sort((a, b) => {
      const projectOrderDelta = Number(b.project_orders_count || 0) - Number(a.project_orders_count || 0);
      if (projectOrderDelta !== 0) return projectOrderDelta;
      const totalOrderDelta = Number(b.orders_count || 0) - Number(a.orders_count || 0);
      if (totalOrderDelta !== 0) return totalOrderDelta;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [fallbackSponsorAccounts, sponsorshipOrders]);
  const sponsorAccountSummary = useMemo(
    () =>
      sponsorAccounts.reduce(
        (acc, sponsor) => {
          acc.total += 1;
          if (sponsor.orders_count === 0) acc.signupOnly += 1;
          if (sponsor.verified_orders_count > 0) acc.paid += 1;
          if (sponsor.pending_orders_count > 0) acc.awaiting += 1;
          if (sponsor.issue_orders_count > 0) acc.issue += 1;
          acc.awaitingTreeUnits += Number(sponsor.awaiting_tree_units || 0);
          return acc;
        },
        { total: 0, signupOnly: 0, paid: 0, awaiting: 0, issue: 0, awaitingTreeUnits: 0 },
      ),
    [sponsorAccounts],
  );
  const sponsorshipOrderBuckets = useMemo(() => {
    const grouped = {
      successful: [] as SponsorshipOrderRecord[],
      awaiting: [] as SponsorshipOrderRecord[],
      issue: [] as SponsorshipOrderRecord[],
    };
    sponsorshipOrders.forEach((order) => {
      const outcome = getSponsorshipPaymentOutcomeGroup(order.payment_status);
      grouped[outcome].push(order);
    });
    return grouped;
  }, [sponsorshipOrders]);
  const sponsorshipOrderSummary = useMemo(
    () => ({
      successful: sponsorshipOrderBuckets.successful.length,
      awaiting: sponsorshipOrderBuckets.awaiting.length,
      issue: sponsorshipOrderBuckets.issue.length,
      awaitingTreeUnits: sponsorshipOrderBuckets.successful.reduce(
        (acc, order) => acc + Number(order.awaiting_tree_units || 0),
        0,
      ),
      linkedUnits: sponsorshipOrderBuckets.successful.reduce((acc, order) => acc + Number(order.linked_units || 0), 0),
    }),
    [sponsorshipOrderBuckets],
  );
  const sponsorshipAccountingSummary = useMemo(() => {
    const totals = {
      totalOrders: sponsorshipOrders.length,
      successfulAmounts: {} as Record<string, number>,
      awaitingAmounts: {} as Record<string, number>,
      issueAmounts: {} as Record<string, number>,
      successfulTrees: 0,
      awaitingTrees: 0,
      issueTrees: 0,
      uniqueSponsorsPaid: 0,
      latestSuccessfulAt: "" as string,
    };
    const addAmount = (target: Record<string, number>, currency: string | null | undefined, amount: number) => {
      const safeCurrency = normalizeSponsorCurrencyCode(currency);
      target[safeCurrency] = Number(target[safeCurrency] || 0) + Number(amount || 0);
    };
    const paidSponsorIds = new Set<number>();
    sponsorshipOrderBuckets.successful.forEach((order) => {
      addAmount(totals.successfulAmounts, order.currency, Number(order.amount_total || 0));
      totals.successfulTrees += Number(order.quantity || 0);
      if (Number(order.sponsor_account_id || 0) > 0) paidSponsorIds.add(Number(order.sponsor_account_id || 0));
      const stamp = String(order.payment_verified_at || order.updated_at || order.created_at || "");
      if (stamp && (!totals.latestSuccessfulAt || stamp > totals.latestSuccessfulAt)) {
        totals.latestSuccessfulAt = stamp;
      }
    });
    sponsorshipOrderBuckets.awaiting.forEach((order) => {
      addAmount(totals.awaitingAmounts, order.currency, Number(order.amount_total || 0));
      totals.awaitingTrees += Number(order.quantity || 0);
    });
    sponsorshipOrderBuckets.issue.forEach((order) => {
      addAmount(totals.issueAmounts, order.currency, Number(order.amount_total || 0));
      totals.issueTrees += Number(order.quantity || 0);
    });
    totals.uniqueSponsorsPaid = paidSponsorIds.size;
    return totals;
  }, [sponsorshipOrderBuckets, sponsorshipOrders.length]);
  const sponsorProjectSpendById = useMemo(() => {
    const bySponsor = new Map<number, Record<string, number>>();
    sponsorshipOrders.forEach((order) => {
      const sponsorId = Number(order.sponsor_account_id || 0);
      if (sponsorId <= 0) return;
      const currency = normalizeSponsorCurrencyCode(order.currency);
      const amount = Number(order.amount_total || 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const existing = bySponsor.get(sponsorId) || {};
      existing[currency] = Number(existing[currency] || 0) + amount;
      bySponsor.set(sponsorId, existing);
    });
    return bySponsor;
  }, [sponsorshipOrders]);
  const sponsoredBacklogOrders = useMemo(
    () =>
      sponsorshipOrderBuckets.successful.filter((order) => Number(order.awaiting_tree_units || 0) > 0),
    [sponsorshipOrderBuckets],
  );
  const sponsorAgentPayoutSummary = useMemo(
    () => ({
      currency: sponsorAgentPayoutBoard?.currency || "NGN",
      minimumAmount:
        sponsorAgentPayoutBoard?.minimum_payout_amount === null || sponsorAgentPayoutBoard?.minimum_payout_amount === undefined
          ? 10000
          : Number(sponsorAgentPayoutBoard.minimum_payout_amount || 0),
      agentCount: Number(sponsorAgentPayoutBoard?.summary?.agent_count || 0),
      requestCount: Number(sponsorAgentPayoutBoard?.summary?.request_count || 0),
      pendingRequestCount: Number(sponsorAgentPayoutBoard?.summary?.pending_request_count || 0),
      availableAmount: Number(sponsorAgentPayoutBoard?.summary?.available_amount || 0),
      requestedAmount: Number(sponsorAgentPayoutBoard?.summary?.requested_amount || 0),
      paidAmount: Number(sponsorAgentPayoutBoard?.summary?.paid_amount || 0),
      autoPayoutAvailable: Boolean(sponsorAgentPayoutBoard?.auto_payout_available),
    }),
    [sponsorAgentPayoutBoard],
  );
  const sponsorAgentPayoutRequestBuckets = useMemo(() => {
    const grouped = {
      awaiting: [] as SponsorAgentPayoutRequestRecord[],
      paid: [] as SponsorAgentPayoutRequestRecord[],
      issue: [] as SponsorAgentPayoutRequestRecord[],
    };
    (sponsorAgentPayoutBoard?.requests || []).forEach((request) => {
      const status = normalizeName(request.status);
      if (status === "paid") {
        grouped.paid.push(request);
      } else if (["rejected", "failed", "cancelled"].includes(status)) {
        grouped.issue.push(request);
      } else {
        grouped.awaiting.push(request);
      }
    });
    return grouped;
  }, [sponsorAgentPayoutBoard?.requests]);
  const sponsorAgentPayoutAgents = useMemo(
    () =>
      [...(sponsorAgentPayoutBoard?.agents || [])].sort((a, b) =>
        String(a.user?.full_name || "").localeCompare(String(b.user?.full_name || "")),
      ),
    [sponsorAgentPayoutBoard?.agents],
  );
  const sponsoredPaidTrees = useMemo(
    () =>
      visibleProjectTrees.filter(
        (tree) => Number(tree.sponsor_paid_units || 0) > 0 || Number(tree.sponsor_linked_units || 0) > 0,
      ),
    [visibleProjectTrees],
  );
  const selectedMaintenanceTreeRecord = useMemo(
    () => trees.find((tree) => Number(tree.id) === Number(newTask.tree_id || 0)) || null,
    [newTask.tree_id, trees],
  );
  const deleteProjectNameMatches = useMemo(() => {
    if (!activeProjectRecord) return false;
    return deleteProjectConfirmName.trim() === String(activeProjectRecord.name || "").trim();
  }, [deleteProjectConfirmName, activeProjectRecord]);
  const selectedInspectTreeMeta = useMemo(() => {
    if (!inspectedTree) return null;
    const treeId = Number(inspectedTree.id || 0);
    if (!treeId) return null;
    return (
      treeMetaDraftById[treeId] || {
        tree_height_m:
          inspectedTree.tree_height_m === null || inspectedTree.tree_height_m === undefined
            ? ""
            : String(inspectedTree.tree_height_m),
        planting_date: String(inspectedTree.planting_date || ""),
        tree_origin: (inspectedTree.tree_origin || "new_planting") as
          | "new_planting"
          | "existing_inventory"
          | "natural_regeneration",
        attribution_scope: (inspectedTree.attribution_scope || "full") as "full" | "monitor_only",
        count_in_planting_kpis: inspectedTree.count_in_planting_kpis !== false,
        count_in_carbon_scope: inspectedTree.count_in_carbon_scope !== false,
      }
    );
  }, [inspectedTree, treeMetaDraftById]);
  const inspectedTreeCoords = useMemo(() => {
    if (!inspectedTree) return null;
    return treeCoordinatesById.get(Number(inspectedTree.id || 0)) || null;
  }, [inspectedTree, treeCoordinatesById]);
  const inspectedTreeRecord = useMemo(() => {
    if (!inspectedTree) return null;
    return visibleProjectTrees.find((tree) => Number(tree.id) === Number(inspectedTree.id)) || null;
  }, [inspectedTree, visibleProjectTrees]);
  const inspectedPlotAreaLabel = useMemo(() => {
    if (!inspectedTree) return "-";
    if (inspectedTreeRecord) return formatPlotAreaLabel(inspectedTreeRecord);
    const hectares = Number(inspectedTree.record_profile_data?.area_hectares);
    if (Number.isFinite(hectares) && hectares > 0) return `${hectares.toFixed(4)} ha`;
    const sqm = Number(inspectedTree.existing_area_sqm);
    if (Number.isFinite(sqm) && sqm > 0) return sqm >= 10000 ? `${(sqm / 10000).toFixed(4)} ha` : `${sqm.toFixed(1)} m2`;
    return "-";
  }, [inspectedTree, inspectedTreeRecord]);
  useEffect(() => {
    if (!treePositionDraft || !inspectedTree) return;
    if (Number(treePositionDraft.treeId) === Number(inspectedTree.id)) return;
    setTreePositionDraft(null);
  }, [inspectedTree, treePositionDraft]);
  const projectModel = projectSettingsDraft.planting_model;
  const isCommunityModel = projectModel === "community_distributed" || projectModel === "mixed";
  const hasCommunityData = custodians.length > 0 || distributionEvents.length > 0 || distributionAllocations.length > 0;
  const showCommunityWorkflow = isCommunityModel || hasCommunityData;
  const showLegacyCommunitySetup = false;
  const workflowReadySummary = useMemo(() => {
    const speciesMaturitySet = Object.keys(activeProjectMaturityMap).length;
    return {
      custodians: custodians.length,
      events: distributionEvents.length,
      allocations: distributionAllocations.length,
      speciesMaturitySet,
    };
  }, [
    custodians.length,
    distributionEvents.length,
    distributionAllocations.length,
    activeProjectMaturityMap,
  ]);
  const existingTreeIntakeRows = useMemo(
    () =>
      visibleProjectTrees
        .filter((tree) => {
          const origin = normalizeName(String(tree.tree_origin || "").replaceAll(" ", "_"));
          const scope = normalizeName(String(tree.attribution_scope || "").replaceAll(" ", "_"));
          const hasSourceProject = Number(tree.source_project_id || 0) > 0;
          if (origin && origin !== "new_planting") return true;
          if (scope === "monitor_only") return true;
          if (tree.count_in_planting_kpis === false) return true;
          if (hasSourceProject) return true;
          return false;
        })
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0)),
    [visibleProjectTrees],
  );
  const existingTreeIntakeAgricSummary = useMemo(
    () =>
      existingTreeIntakeRows.reduce(
        (acc, tree) => {
          const areaHectares = Number(tree.record_profile_data?.area_hectares);
          if (Number.isFinite(areaHectares) && areaHectares > 0) {
            acc.totalAreaHectares += areaHectares;
          } else {
            const areaSqm = Number(tree.existing_area_sqm || 0);
            if (Number.isFinite(areaSqm) && areaSqm > 0) acc.totalAreaHectares += areaSqm / 10000;
          }
          const estimatedYieldKg = Number(tree.record_profile_data?.estimated_yield_kg);
          if (Number.isFinite(estimatedYieldKg) && estimatedYieldKg > 0) acc.totalEstimatedYieldKg += estimatedYieldKg;
          return acc;
        },
        { totalAreaHectares: 0, totalEstimatedYieldKg: 0 },
      ),
    [existingTreeIntakeRows],
  );
  const formatProjectTreeLabelById = useCallback(
    (treeId: number | string | null | undefined) => {
      const numericId = Number(treeId || 0);
      const treeRow = trees.find((tree) => Number(tree.id) === numericId);
      if (activeWorkflowProfile === "agric") {
        return treeRow ? formatPlotRecordLabel(treeRow) : `Plot #${numericId}`;
      }
      if (activeWorkflowProfile === "relief_recovery") {
        return treeRow ? formatReliefSiteLabel(treeRow) : `Site #${numericId}`;
      }
      const localNo = Number((treeRow as any)?.project_tree_no || 0);
      return `Tree #${localNo > 0 ? localNo : numericId}`;
    },
    [activeWorkflowProfile, trees],
  );
  const formatTreeSponsorshipLabel = useCallback((tree: Partial<Tree> | null | undefined) => {
    if (!tree) return "";
    const paidUnits = Number(tree.sponsor_paid_units || 0);
    const linkedUnits = Number(tree.sponsor_linked_units || 0);
    const pendingUnits = Number(tree.sponsor_pending_units || 0);
    const problemUnits = Number(tree.sponsor_problem_units || 0);
    const sponsorNames = String(tree.sponsor_display_names || "").trim();
    if (paidUnits > 0 || linkedUnits > 0) {
      const sponsorLabel = sponsorNames || `${Math.max(paidUnits, linkedUnits)} sponsor-linked unit${Math.max(paidUnits, linkedUnits) === 1 ? "" : "s"}`;
      if (paidUnits > 0) {
        return `Sponsor-linked | ${sponsorLabel}${linkedUnits > 0 ? ` | ${linkedUnits} linked` : ""}`;
      }
      return `Sponsor-linked | ${sponsorLabel}`;
    }
    if (pendingUnits > 0) return `Sponsor payment pending | ${pendingUnits} unit${pendingUnits === 1 ? "" : "s"}`;
    if (problemUnits > 0) return `Sponsor payment issue | ${problemUnits} unit${problemUnits === 1 ? "" : "s"}`;
    return "";
  }, []);
  const maintenanceTreeOptions = useMemo(() => {
    const rowByTree = new Map<number, LiveMaintenanceRow>();
    allMaintenanceAssignRows.forEach((row) => {
      const current = rowByTree.get(row.treeId);
      if (!current || liveToneRank(row.tone) < liveToneRank(current.tone)) {
        rowByTree.set(row.treeId, row);
      }
    });
    return trees
      .map((tree) => {
        const treeId = Number(tree.id || 0);
        const liveRow = rowByTree.get(treeId);
        const species = String(tree.species || "").trim();
        const status = treeStatusLabel(tree.status);
        const indicator = liveRow?.indicator ? liveRow.indicator : "No live maintenance alert";
        const sponsorLabel = formatTreeSponsorshipLabel(tree);
        return {
          id: treeId,
          label: `${formatProjectTreeLabelById(treeId)} | ${species || "Species -"} | ${status} | ${indicator}${sponsorLabel ? ` | ${sponsorLabel}` : ""}`,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allMaintenanceAssignRows, formatProjectTreeLabelById, formatTreeSponsorshipLabel, trees]);
  const agricFarmerLiveMode = Boolean(activeProjectId && fieldWorkflowMode && activeForm === "farmer_live");
  const agricFieldCaptureMode = Boolean(activeProjectId && fieldWorkflowMode && activeForm === "field_capture_assign");
  const agricSupportVisitMode = Boolean(activeProjectId && fieldWorkflowMode && activeForm === "support_visit_assign");
  const custodianLiveRows = useMemo(() => {
    const allocationMap = new Map<
      number,
      {
        allocations: number;
        seedlings: number;
        eventIds: Set<number>;
        lastEventDate: string | null;
        supervisionTarget: number;
        supervisionAssigned: number;
        supervisionDone: number;
        supervisionLive: number;
        supervisionRemaining: number;
      }
    >();
    const fieldCaptureMap = new Map<
      number,
      {
        assigned: number;
        done: number;
        live: number;
      }
    >();
    distributionAllocations.forEach((row) => {
      const custodianId = Number(row.custodian_id || 0);
      if (!custodianId) return;
      const existing = allocationMap.get(custodianId) || {
        allocations: 0,
        seedlings: 0,
        eventIds: new Set<number>(),
        lastEventDate: null,
        supervisionTarget: 0,
        supervisionAssigned: 0,
        supervisionDone: 0,
        supervisionLive: 0,
        supervisionRemaining: 0,
      };
      existing.allocations += 1;
      existing.seedlings += Number(row.quantity_allocated || 0);
      existing.supervisionTarget += Number(row.supervision_target || 0);
      existing.supervisionAssigned += Number(row.supervision_assigned || 0);
      existing.supervisionDone += Number(row.supervision_done || 0);
      existing.supervisionLive += Number(row.supervision_live || 0);
      existing.supervisionRemaining += Number(row.supervision_remaining || 0);
      if (Number(row.event_id || 0) > 0) existing.eventIds.add(Number(row.event_id));
      const eventDate = String(row.event_date || "").trim();
      if (eventDate && (!existing.lastEventDate || eventDate > existing.lastEventDate)) {
        existing.lastEventDate = eventDate;
      }
      allocationMap.set(custodianId, existing);
    });
    tasks.forEach((task) => {
      if (normalizeName(task.task_type) !== "field_capture") return;
      const custodianId = Number(task.custodian_id || 0);
      if (!custodianId) return;
      const existing = fieldCaptureMap.get(custodianId) || {
        assigned: 0,
        done: 0,
        live: 0,
      };
      existing.assigned += 1;
      if (isCompleteStatus(task.status, task.review_state)) existing.done += 1;
      else existing.live += 1;
      fieldCaptureMap.set(custodianId, existing);
    });

    const treeMap = new Map<number, { total: number; existing: number; healthy: number }>();
    visibleProjectTrees.forEach((tree) => {
      const custodianId = Number(tree.custodian_id || 0);
      if (!custodianId) return;
      const existing = treeMap.get(custodianId) || { total: 0, existing: 0, healthy: 0 };
      existing.total += 1;
      const origin = normalizeName(String(tree.tree_origin || "").replaceAll(" ", "_"));
      if (origin && origin !== "new_planting") existing.existing += 1;
      const status = normalizeTreeStatus(tree.status || "");
      if (HEALTHY_TREE_STATUSES.has(status)) existing.healthy += 1;
      treeMap.set(custodianId, existing);
    });

    return custodians
      .map((custodian) => {
        const alloc = allocationMap.get(Number(custodian.id)) || {
          allocations: 0,
          seedlings: 0,
          eventIds: new Set<number>(),
          lastEventDate: null,
          supervisionTarget: 0,
          supervisionAssigned: 0,
          supervisionDone: 0,
          supervisionLive: 0,
          supervisionRemaining: 0,
        };
        const fieldCapture = fieldCaptureMap.get(Number(custodian.id)) || {
          assigned: 0,
          done: 0,
          live: 0,
        };
        const tree = treeMap.get(Number(custodian.id)) || { total: 0, existing: 0, healthy: 0 };
        const healthyRate = tree.total > 0 ? (tree.healthy / tree.total) * 100 : null;
        const defaultAllocation = distributionAllocations
          .filter((allocation) => Number(allocation.custodian_id) === Number(custodian.id))
          .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
          .find((allocation) => Number(allocation.supervision_remaining || 0) > 0)
          || distributionAllocations
            .filter((allocation) => Number(allocation.custodian_id) === Number(custodian.id))
            .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
          || null;
        return {
          custodian,
          allocations: alloc.allocations,
          seedlings: alloc.seedlings,
          eventCount: alloc.eventIds.size,
          lastEventDate: alloc.lastEventDate,
          treeTotal: tree.total,
          existingTreeTotal: tree.existing,
          healthyRate,
          supervisionTarget: alloc.supervisionTarget,
          supervisionAssigned: alloc.supervisionAssigned,
          supervisionDone: alloc.supervisionDone,
          supervisionLive: alloc.supervisionLive,
          supervisionRemaining: alloc.supervisionRemaining,
          fieldCaptureAssigned: fieldCapture.assigned,
          fieldCaptureDone: fieldCapture.done,
          fieldCaptureLive: fieldCapture.live,
          hasOpenFieldCapture: fieldCapture.live > 0,
          defaultAllocationId: defaultAllocation ? Number(defaultAllocation.id || 0) : null,
        };
      })
      .sort((a, b) => {
        if (b.seedlings !== a.seedlings) return b.seedlings - a.seedlings;
        if (b.treeTotal !== a.treeTotal) return b.treeTotal - a.treeTotal;
        return String(a.custodian.name || "").localeCompare(String(b.custodian.name || ""));
      });
  }, [custodians, distributionAllocations, tasks, visibleProjectTrees]);
  const activeAgricAssignmentMode: AgricVisitAssignmentMode | null = agricFieldCaptureMode
    ? "field_capture"
    : agricSupportVisitMode
      ? "support_visit"
      : null;
  const displayedCustodianLiveRows = useMemo(() => {
    if (!fieldWorkflowMode) return custodianLiveRows;
    if (agricFieldCaptureMode) {
      return custodianLiveRows.filter((row) => Number(row.treeTotal || 0) <= 0);
    }
    if (agricSupportVisitMode) {
      return custodianLiveRows.filter(
        (row) =>
          Number(row.treeTotal || 0) > 0 &&
          (Number(row.allocations || 0) > 0 || Number(row.supervisionTarget || 0) > 0),
      );
    }
    return custodianLiveRows;
  }, [fieldWorkflowMode, agricFieldCaptureMode, agricSupportVisitMode, custodianLiveRows]);
  const displayedCustodianLiveSummary = useMemo(() => {
    const totalRows = displayedCustodianLiveRows.length;
    const verified = displayedCustodianLiveRows.filter(
      (row) => normalizeName(row.custodian.verification_status) === "verified",
    ).length;
    const units = displayedCustodianLiveRows.reduce((sum, row) => sum + Number(row.seedlings || 0), 0);
    if (!fieldWorkflowMode) {
      return {
        totalRows,
        verified,
        units,
        visitDone: displayedCustodianLiveRows.reduce((sum, row) => sum + Number(row.supervisionDone || 0), 0),
        visitTarget: displayedCustodianLiveRows.reduce((sum, row) => sum + Number(row.supervisionTarget || 0), 0),
        visitLive: displayedCustodianLiveRows.reduce((sum, row) => sum + Number(row.supervisionLive || 0), 0),
      };
    }
    if (agricFieldCaptureMode) {
      return {
        totalRows,
        verified,
        units,
        visitDone: displayedCustodianLiveRows.reduce((sum, row) => sum + Number(row.fieldCaptureDone || 0), 0),
        visitTarget: displayedCustodianLiveRows.length,
        visitLive: displayedCustodianLiveRows.reduce((sum, row) => sum + Number(row.fieldCaptureLive || 0), 0),
      };
    }
    return {
      totalRows,
      verified,
      units,
      visitDone: displayedCustodianLiveRows.reduce((sum, row) => sum + Number(row.supervisionDone || 0), 0),
      visitTarget: displayedCustodianLiveRows.reduce((sum, row) => sum + Number(row.supervisionTarget || 0), 0),
      visitLive: displayedCustodianLiveRows.reduce((sum, row) => sum + Number(row.supervisionLive || 0), 0),
    };
  }, [fieldWorkflowMode, agricFieldCaptureMode, displayedCustodianLiveRows]);
  const custodianSummary = useMemo(() => {
    const totalAllocated = distributionAllocations.reduce(
      (sum, row) => sum + Number(row.quantity_allocated || 0),
      0,
    );
    const supervisionTarget = distributionAllocations.reduce(
      (sum, row) => sum + Number(row.supervision_target || 0),
      0,
    );
    const supervisionAssigned = distributionAllocations.reduce(
      (sum, row) => sum + Number(row.supervision_assigned || 0),
      0,
    );
    const supervisionDone = distributionAllocations.reduce(
      (sum, row) => sum + Number(row.supervision_done || 0),
      0,
    );
    const verified = custodians.filter((row) => normalizeName(row.verification_status) === "verified").length;
    return {
      totalCustodians: custodians.length,
      verifiedCustodians: verified,
      totalEvents: distributionEvents.length,
      totalAllocations: distributionAllocations.length,
      allocatedSeedlings: totalAllocated,
      supervisionTarget,
      supervisionAssigned,
      supervisionDone,
      supervisionLive: Math.max(supervisionAssigned - supervisionDone, 0),
      existingTrees: existingTreeIntakeRows.length,
    };
  }, [custodians, distributionEvents, distributionAllocations, existingTreeIntakeRows.length]);
  const overviewExecutionMix = useMemo<{
    title: string;
    totalLabel: string;
    context: string;
    segments: OverviewDonutSegment[];
  }>(() => {
    if (showCommunityWorkflow) {
      const done = Number(custodianSummary.supervisionDone || 0);
      const live = Number(custodianSummary.supervisionLive || 0);
      const pending = Math.max(Number(custodianSummary.supervisionTarget || 0) - done - live, 0);
      return {
        title: "Supervision Progress Mix",
        totalLabel: "Visits",
        context:
          "Context: done = completed supervision visits, live = assigned pending visits, pending = still unassigned visits.",
        segments: [
          { label: "Done", value: done, color: "#16a34a" },
          { label: "Live", value: live, color: "#0ea5e9" },
          { label: "Pending", value: pending, color: "#f59e0b" },
        ],
      };
    }
    return {
      title: "Task Execution Mix",
      totalLabel: "Tasks",
      context: "Context: done/pending/overdue maintenance tasks for the current project scope.",
      segments: [
        { label: "Done", value: filteredOverviewTotals.taskDone, color: "#16a34a" },
        { label: "Pending", value: filteredOverviewTotals.taskPending, color: "#f59e0b" },
        { label: "Overdue", value: filteredOverviewTotals.taskOverdue, color: "#dc2626" },
      ],
    };
  }, [
    showCommunityWorkflow,
    custodianSummary.supervisionDone,
    custodianSummary.supervisionLive,
    custodianSummary.supervisionTarget,
    filteredOverviewTotals.taskDone,
    filteredOverviewTotals.taskPending,
    filteredOverviewTotals.taskOverdue,
  ]);
  const overviewScopeLabel = assigneeFilter === "all" ? "all staff in this project" : `${assigneeFilter} only`;

  const activeProjectName = useMemo(() => {
    if (!activeProjectId) return "";
    return projects.find((p) => p.id === activeProjectId)?.name || "";
  }, [activeProjectId, projects]);
  const showSidebar =
    activeForm !== null &&
    activeForm !== "overview" &&
    activeForm !== "live_table" &&
    activeForm !== "farmer_live" &&
    activeForm !== "field_capture_assign" &&
    activeForm !== "support_visit_assign" &&
    activeForm !== "verra_reports" &&
    activeForm !== "map_view" &&
    activeForm !== "remote_monitoring";
  const detailScrollMode = activeForm === "existing_tree_intake";
  const custodianHubMode = activeForm === "custodian_hub";
  const overviewMode = Boolean(activeProjectId && activeForm === "overview");
  const mapViewMode = Boolean(activeProjectId && activeForm === "map_view");
  const remoteMonitoringMode = Boolean(activeProjectId && activeForm === "remote_monitoring");
  const assignWorkAreaMode = Boolean(activeProjectId && activeForm === "assign_work" && newOrderAreaEnabled);
  const liveTableMode = Boolean(activeProjectId && activeForm === "live_table");
  const verraMode = Boolean(activeProjectId && activeForm === "verra_reports");
  const shareImpactMode = activeForm === "share_impact";
  const agricRegistryMode = Boolean(activeProjectId && fieldWorkflowMode && activeForm === "custodian_hub");
  const hasDedicatedMainContent =
    overviewMode ||
    mapViewMode ||
    remoteMonitoringMode ||
    liveTableMode ||
    agricFarmerLiveMode ||
    agricFieldCaptureMode ||
    agricSupportVisitMode ||
    verraMode ||
    shareImpactMode ||
    activeForm === "existing_tree_intake" ||
    activeForm === "custodian_hub" ||
    assignWorkAreaMode;
  const sidebarPrimaryMode = Boolean(showSidebar && !hasDedicatedMainContent);
  const mapAreaDrawMode = Boolean(activeProjectId && newOrderAreaEnabled && (activeForm === "assign_work" || activeForm === "map_view"));
  const activeTreeId = inspectedTree?.id || 0;

  const recalcDrawerFrame = useCallback(() => {
    const menuButton = menuButtonRef.current;
    const mapCard = mapCardRef.current;
    if (!menuButton) return;

    const menuRect = menuButton.getBoundingClientRect();
    const mapRect = mapCard?.getBoundingClientRect() || null;
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 720;

    const top = Math.round(Math.max(8, menuRect.bottom + 8));
    const width = Math.round(Math.min(340, Math.max(260, viewportWidth - 16)));
    const left = Math.round(Math.max(8, Math.min(menuRect.left, viewportWidth - width - 8)));
    const bottom = Math.round(mapRect ? Math.min(viewportHeight - 8, mapRect.bottom) : viewportHeight - 8);
    const height = Math.max(260, bottom - top);

    const next: DrawerFrame = { top, left, width, height };
    setDrawerFrame((prev) => {
      if (
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(recalcDrawerFrame);
    return () => window.cancelAnimationFrame(frame);
  }, [recalcDrawerFrame, activeProjectId, activeForm, overviewMode, mapViewMode, mapAreaDrawMode, menuOpen, activeTreeId, showSidebar]);

  useEffect(() => {
    const onViewportChange = () => {
      window.requestAnimationFrame(recalcDrawerFrame);
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [recalcDrawerFrame]);

  const drawerStyle = drawerFrame
    ? {
        top: `${drawerFrame.top}px`,
        left: `${drawerFrame.left}px`,
        width: `${drawerFrame.width}px`,
        height: `${drawerFrame.height}px`,
      }
    : undefined;
  const selectedActivityLogDetailsText = selectedActivityLog ? formatActivityLogDetails(selectedActivityLog.details) : "";

  const openForm = (form: WorkForm) => {
    if (isSuperAdminOnlyForm(form) && !canAccessSuperAdmin) {
      toast.error("Super Admin access is restricted.");
      setMenuOpen(false);
      return;
    }
    if (isHiddenInFieldProject(form)) {
      setActiveForm(defaultProjectForm);
      setMenuOpen(false);
      setStaffMenu(null);
      setLiveTreeMenu(null);
      return;
    }
    if (
      workPartnerOrgPaused &&
      (form === "create_project" || form === "add_user" || form === "assign_work" || form === "assign_task")
    ) {
      toast.error("Organization is paused. Read-only mode is enabled (view and export only).");
      setMenuOpen(false);
      return;
    }
    setActiveForm(form);
    setMenuOpen(false);
    setStaffMenu(null);
    setLiveTreeMenu(null);
  };

  const onLogoutWork = () => {
    clearWorkAuthed();
    navigate("/green-work/login", { replace: true });
  };

  useEffect(() => {
    if (!workPartnerOrgSuspended) return;
    if (workSuspendNoticeShownRef.current) return;
    workSuspendNoticeShownRef.current = true;
    toast.error("Your organization is suspended. Access is blocked.");
    clearWorkAuthed();
    navigate("/green-work/login", { replace: true });
  }, [workPartnerOrgSuspended, navigate]);

  useEffect(() => {
    if (!workPartnerOrgPaused) {
      workPauseNoticeShownRef.current = false;
      return;
    }
    if (workPauseNoticeShownRef.current) return;
    workPauseNoticeShownRef.current = true;
    toast("Organization is paused. Read-only mode is enabled (view and export only).", { icon: "!" });
  }, [workPartnerOrgPaused]);

  useEffect(() => {
    if (!workPartnerOrgPaused) return;
    const interceptorId = api.interceptors.request.use((config) => {
      const method = String(config?.method || "get").trim().toLowerCase();
      const url = String(config?.url || "");
      const isReadMethod = method === "get" || method === "head" || method === "options";
      const isPasswordChange = method === "post" && url.includes("/green/auth/change-password");
      if (isReadMethod || isPasswordChange) {
        return config;
      }
      return Promise.reject({
        response: {
          data: {
            detail: "Organization is paused. Read-only mode is enabled. Viewing and exports only.",
          },
        },
      });
    });
    return () => {
      api.interceptors.request.eject(interceptorId);
    };
  }, [workPartnerOrgPaused]);

  const closeWorkPasswordModal = (force = false) => {
    if (workPasswordModalSaving && !force) return;
    setWorkPasswordModalOpen(false);
    setWorkPasswordModalShow(false);
    setWorkPasswordForm({
      current_password: "",
      new_password: "",
      confirm_password: "",
    });
  };

  const onChangeWorkPassword = () => {
    const authUser = workAuthSession?.user;
    if (!authUser?.id || authUser.id <= 0) {
      toast.error("Password change is not available for this account.");
      return;
    }
    setWorkPasswordModalOpen(true);
  };

  const submitWorkPasswordChange = async () => {
    const authUser = workAuthSession?.user;
    if (!authUser?.id || authUser.id <= 0) {
      toast.error("Password change is not available for this account.");
      return;
    }
    const currentPassword = String(workPasswordForm.current_password || "");
    const newPassword = String(workPasswordForm.new_password || "");
    const confirmPassword = String(workPasswordForm.confirm_password || "");
    if (!currentPassword) {
      toast.error("Current password is required.");
      return;
    }
    if (!newPassword) {
      toast.error("New password is required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password confirmation does not match.");
      return;
    }
    if (String(newPassword).length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    setWorkPasswordModalSaving(true);
    try {
      await api.post("/green/auth/change-password", {
        user_id: authUser.id,
        current_password: currentPassword,
        new_password: newPassword,
        app: "work",
      });
      toast.success("Password updated successfully.");
      closeWorkPasswordModal(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to change password");
    } finally {
      setWorkPasswordModalSaving(false);
    }
  };

  useEffect(() => {
    if (canAccessSuperAdmin) return;
    if (activeForm !== "super_admin" && activeForm !== "logs") return;
    setActiveForm(activeProjectId ? defaultProjectForm : "project_focus");
  }, [activeForm, activeProjectId, canAccessSuperAdmin, defaultProjectForm]);

  useEffect(() => {
    if (!activeProjectId) return;
    if (!activeFormHiddenInAgric) return;
    setActiveForm(defaultProjectForm);
  }, [activeFormHiddenInAgric, activeProjectId, defaultProjectForm]);

  useEffect(() => {
    if (!workPartnerOrgPaused) return;
    if (!activeForm) return;
    if (!["create_project", "add_user", "assign_work", "assign_task"].includes(activeForm)) return;
    setActiveForm(activeProjectId ? defaultProjectForm : "project_focus");
  }, [workPartnerOrgPaused, activeForm, activeProjectId, defaultProjectForm]);

  useEffect(() => {
    if (!workPartnerOrgPaused) return;
    if (!custodianOptionsExpanded) return;
    setCustodianOptionsExpanded(false);
  }, [workPartnerOrgPaused, custodianOptionsExpanded]);

  useEffect(() => {
    if (activeWorkflowProfile !== "agric") {
      setAgricCustodianHubTab("farmer_form");
    }
  }, [activeWorkflowProfile]);

  useEffect(() => {
    if (activeWorkflowProfile !== "agric") return;
    if (activeForm !== "custodian_hub") return;
    if (agricCustodianHubTab === "farmer_live") {
      setAgricCustodianHubTab("farmer_form");
    }
  }, [activeForm, activeWorkflowProfile, agricCustodianHubTab]);

  useEffect(() => {
    if (activeWorkflowProfile !== "agric") return;
    if (staffMenu) setStaffMenu(null);
    if (liveTreeMenu) setLiveTreeMenu(null);
  }, [activeWorkflowProfile, staffMenu, liveTreeMenu]);

  const openAssignWorkForUser = (userName: string) => {
    if (fieldWorkflowMode) {
      setStaffMenu(null);
      setLiveTreeMenu(null);
      return;
    }
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Read-only mode is enabled (view and export only).");
      setStaffMenu(null);
      setLiveTreeMenu(null);
      return;
    }
    if (!activeProjectId) {
      toast("Select an active project first.");
      setStaffMenu(null);
      setLiveTreeMenu(null);
      return;
    }
    setNewOrder((prev) => ({ ...prev, assignee_name: userName }));
    setActiveForm("assign_work");
    setMenuOpen(false);
    setStaffMenu(null);
    setLiveTreeMenu(null);
  };

  const openAssignTaskForUser = (userName: string) => {
    if (fieldWorkflowMode) {
      setStaffMenu(null);
      setLiveTreeMenu(null);
      return;
    }
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Read-only mode is enabled (view and export only).");
      setStaffMenu(null);
      setLiveTreeMenu(null);
      return;
    }
    if (!activeProjectId) {
      toast("Select an active project first.");
      setStaffMenu(null);
      setLiveTreeMenu(null);
      return;
    }
    setNewTask((prev) => ({ ...prev, assignee_name: userName }));
    setActiveForm("assign_task");
    setMenuOpen(false);
    setStaffMenu(null);
    setLiveTreeMenu(null);
  };

  const openAssignTaskForSelectedRows = (rowsOverride?: LiveMaintenanceRow[]) => {
    const rows = rowsOverride && rowsOverride.length ? rowsOverride : selectedMaintenanceRows;
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Read-only mode is enabled (view and export only).");
      return;
    }
    if (!activeProjectId) {
      toast("Select an active project first.");
      return;
    }
    if (!rows.length) {
      toast.error("Select at least one maintenance row first.");
      return;
    }
    const firstRow = rows[0];
    const singleActivity =
      rows.length > 0 &&
      rows.every((row) => row.activity === firstRow.activity)
        ? firstRow.activity
        : "";
    setSelectedMaintenanceRowKeys(rows.map((row) => row.key));
    setNewTask((prev) => ({
      ...prev,
      tree_id: rows.length === 1 ? String(firstRow.treeId) : "",
      task_type: singleActivity || prev.task_type,
      assignee_name: "",
    }));
    setNewTaskMultiAssignEnabled(false);
    setNewTaskSelectedAssignees([]);
    setMaintenanceBulkAssignMode("single_staff");
    setMaintenanceAssigneeStrategy("manual");
    setMaintenancePlanterFallbackAssignee("");
    setActiveForm("assign_task");
    setMenuOpen(false);
    setStaffMenu(null);
    setLiveTreeMenu(null);
    toast.success(
      rows.length === 1
        ? `${formatProjectTreeLabelById(firstRow.treeId)} ready for assignment.`
        : `${rows.length} maintenance rows ready for bulk assignment.`,
    );
  };

  const openAssignTaskForTree = (treeId: number, preferredTaskType?: string) => {
    if (activeWorkflowProfile === "agric") {
      setLiveTreeMenu(null);
      return;
    }
    if (workPartnerOrgPaused) {
      toast.error("Organization is paused. Read-only mode is enabled (view and export only).");
      setLiveTreeMenu(null);
      return;
    }
    if (!activeProjectId) {
      toast("Select an active project first.");
      setLiveTreeMenu(null);
      return;
    }
    const tree = trees.find((entry) => Number(entry.id) === Number(treeId));
    const owner = tree?.created_by || "";
    const matchedOwner = resolveKnownUserName(owner);
    const treeStatus = normalizeTreeStatus(tree?.status || "healthy");
    const replacementRequired = isReplacementTriggerStatus(treeStatus);
    const preferredActivity = replacementRequired ? "replacement" : (preferredTaskType || "");
    const matchingRow =
      preferredActivity
        ? allMaintenanceAssignRows.find(
            (row) => Number(row.treeId) === Number(treeId) && normalizeName(row.activity) === normalizeName(preferredActivity),
          )
        : allMaintenanceAssignRows.find((row) => Number(row.treeId) === Number(treeId));
    if (matchingRow) {
      setSelectedMaintenanceRowKeys([matchingRow.key]);
      setMaintenanceBulkAssignMode("single_staff");
    } else {
      setSelectedMaintenanceRowKeys([]);
    }
    setNewTask((prev) => ({
      ...prev,
      tree_id: String(treeId),
      assignee_name: matchedOwner || prev.assignee_name,
      task_type: replacementRequired ? "replacement" : (preferredTaskType || prev.task_type),
    }));
    setMaintenanceAssigneeStrategy("manual");
    setMaintenancePlanterFallbackAssignee("");
    setActiveForm("assign_task");
    setMenuOpen(false);
    setLiveTreeMenu(null);
    const pickedType = replacementRequired ? "replacement" : (preferredTaskType || "maintenance");
    toast.success(`${formatProjectTreeLabelById(treeId)} ready. ${formatTaskTypeLabel(pickedType)} prefilled.`);
  };

  return (
    <div className="green-work-container">
      <Toaster position="top-right" />
      {privacyConsentModal}
      <header className="green-work-header">
        <div className="green-work-header-inner">
          <div className="green-work-brand">
            <img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="50" height="50" />
            {partnerLogoDisplayUrl ? (
              <img className="green-work-partner-logo" src={partnerLogoDisplayUrl} alt={`${partnerLogoName} logo`} width="42" height="42" />
            ) : null}
          </div>
          <div className="green-work-title">
            <h1>LandCheck Work</h1>
            <span>Assignments & Progress</span>
          </div>
        </div>
      </header>

      <div className="green-work-toolbar-wrap">
        <div className="green-work-toolbar">
          <button
            className="green-work-menu-btn"
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Open forms menu"
            ref={menuButtonRef}
          >
            <span />
            <span />
            <span />
          </button>
          <span className="green-work-toolbar-label">Menu</span>
          {activeProjectName && <span className="green-work-project-chip">{activeProjectName}</span>}
          {workAuthSession?.user?.full_name && (
            <span className="green-work-profile-chip" title={workAuthSession.user.organization_name || undefined}>
              {workAuthSession.user.full_name}
            </span>
          )}
          {workAuthSession?.user?.id && workAuthSession.user.id > 0 && (
            <button type="button" className="green-work-auth-btn" onClick={onChangeWorkPassword}>
              Change Password
            </button>
          )}
          <button type="button" className="green-work-auth-btn" onClick={onLogoutWork}>
            Logout
          </button>
        </div>
      </div>

      {workPartnerOrgPaused && (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: "8px 12px 0",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #d8c169",
            background: "#fff7d6",
            color: "#5f4b00",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Organization is paused. Users can view data and export reports only. Create/edit/review actions are disabled.
        </div>
      )}

      {activeProjectId && (
        <div className="green-work-active-hub-wrap">
          <div className="green-work-active-hub">
            <div className="green-work-action-grid">
              {activeProjectActions.map((action) => {
                return (
                  <button
                    key={action.form}
                    type="button"
                    className={`green-work-action-card ${activeForm === action.form ? "active" : ""} ${action.form === "map_view" ? "green-work-action-card--map-view" : ""} ${action.form === "remote_monitoring" ? "green-work-action-card--remote-monitoring" : ""}`}
                    onClick={() => openForm(action.form)}
                    title={`${action.title} - ${action.note}`}
                    aria-label={action.title}
                  >
                    <span className={`green-work-action-icon ${action.form === "map_view" ? "green-work-action-icon--map-view" : ""} ${action.form === "remote_monitoring" ? "green-work-action-icon--remote-monitoring" : ""}`} aria-hidden="true">
                      {renderActionIcon(action.form)}
                    </span>
                    <span className="green-work-action-copy">
                      <span className="green-work-action-title-row">
                        <span>{action.title}</span>
                        {action.isNew && (
                          <span className="green-work-feature-badge" aria-label={`${action.title} is a new feature`}>
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path
                                d="M12.1 3.5c.9 2.1.4 3.8-.6 5.2-.8 1.2-.8 2.2-.1 3 .8-.4 1.5-1.1 2-2.1 1.9 1.4 3.1 3.3 3.1 5.7 0 3.1-2.3 5.3-5.6 5.3-3.2 0-5.4-2.2-5.4-5.1 0-2.2 1.1-4 3-5.5.3 1 .8 1.8 1.6 2.4.7-.9.7-2 .1-3.1-1-1.5-1.5-3.3-.4-5.8.8.3 1.6 1 2.3 2z"
                                fill="currentColor"
                              />
                            </svg>
                            New
                          </span>
                        )}
                        {action.form === "live_table" && (
                          <span className="green-work-live-badge" aria-label="Live monitoring active">
                            <span className="green-work-live-badge-dot" aria-hidden="true" />
                            Live
                          </span>
                        )}
                        {action.form === "sponsor_feedback" && assistantUnreadCount > 0 && (
                          <span className="green-work-unread-badge" aria-label={`${assistantUnreadCount} new assistant question${assistantUnreadCount === 1 ? "" : "s"}`}>
                            {assistantUnreadCount > 99 ? "99+" : assistantUnreadCount}
                          </span>
                        )}
                      </span>
                      <small>{action.note}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <button
          type="button"
          className="green-work-menu-overlay"
          onClick={() => setMenuOpen(false)}
          aria-label="Close forms menu"
        />
      )}

      <aside className={`green-work-menu-drawer ${menuOpen ? "open" : ""}`} style={drawerStyle}>
        <div className="green-work-menu-head">
          <strong>Forsqm</strong>
          <button className="green-work-menu-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            X
          </button>
        </div>
        {canAccessSuperAdmin && (
          <button
            className={`green-work-menu-item ${activeForm === "super_admin" ? "active" : ""}`}
            type="button"
            onClick={() => openForm("super_admin")}
          >
            Super Admin
          </button>
        )}
        <button
          className={`green-work-menu-item ${activeForm === "project_focus" ? "active" : ""}`}
          type="button"
          onClick={() => openForm("project_focus")}
        >
          Project Focus
        </button>
        <button
          className={`green-work-menu-item ${activeForm === "create_project" ? "active" : ""}`}
          type="button"
          onClick={() => openForm("create_project")}
        >
          Create Project
        </button>
        <button
          className="green-work-menu-item"
          type="button"
          onClick={onChangeWorkPassword}
          disabled={!workAuthSession?.user?.id || workAuthSession.user.id <= 0}
        >
          Change Password
        </button>
        <button
          className="green-work-menu-item green-work-menu-item-logout"
          type="button"
          onClick={onLogoutWork}
        >
          Logout
        </button>
        {activeProjectId ? (
          <div className="green-work-menu-group">
            <p className="green-work-menu-subhead">Active Project Actions</p>
            <p className="green-work-menu-subproject">{activeProjectName}</p>
            {!fieldWorkflowMode ? (
              <button
                className={`green-work-menu-item ${activeForm === "overview" ? "active" : ""}`}
                type="button"
                onClick={() => openForm("overview")}
              >
                Overview
              </button>
            ) : null}
            <button
              className={`green-work-menu-item ${activeForm === "map_view" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("map_view")}
            >
              Map View
            </button>
            {!fieldWorkflowMode ? (
              <>
                <button
                  className={`green-work-menu-item ${activeForm === "remote_monitoring" ? "active" : ""}`}
                  type="button"
                  onClick={() => openForm("remote_monitoring")}
                >
                  Remote Monitoring
                </button>
                <button
                  className={`green-work-menu-item ${activeForm === "live_table" ? "active" : ""}`}
                  type="button"
                  onClick={() => openForm("live_table")}
                >
                  Live Maintenance Table
                </button>
                {publicSponsorshipProject ? (
                  <>
                    <button
                      className={`green-work-menu-item ${activeForm === "sponsors" ? "active" : ""}`}
                      type="button"
                      onClick={() => openForm("sponsors")}
                    >
                      Sponsors
                    </button>
                    <button
                      className={`green-work-menu-item ${activeForm === "sponsorship_orders" ? "active" : ""}`}
                      type="button"
                      onClick={() => openForm("sponsorship_orders")}
                    >
                      Sponsorship Payments
                    </button>
                    <button
                      className={`green-work-menu-item ${activeForm === "sponsor_payouts" ? "active" : ""}`}
                      type="button"
                      onClick={() => openForm("sponsor_payouts")}
                    >
                      Sponsor Payouts
                    </button>
                    <button
                      className={`green-work-menu-item ${activeForm === "sponsor_feedback" ? "active" : ""}`}
                      type="button"
                      onClick={() => openForm("sponsor_feedback")}
                    >
                      Feedback & Nominations
                      {assistantUnreadCount > 0 && (
                        <span className="green-work-unread-badge green-work-unread-badge--inline" aria-label={`${assistantUnreadCount} new assistant question${assistantUnreadCount === 1 ? "" : "s"}`}>
                          {assistantUnreadCount > 99 ? "99+" : assistantUnreadCount}
                        </span>
                      )}
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
            {fieldWorkflowMode ? (
              <>
                <button
                  className={`green-work-menu-item ${activeForm === "farmer_live" ? "active" : ""}`}
                  type="button"
                  onClick={() => openForm("farmer_live")}
                >
                  {activeWorkflowLabels.liveTableTitle}
                </button>
                <button
                  className={`green-work-menu-item ${activeForm === "custodian_hub" ? "active" : ""}`}
                  type="button"
                  onClick={() => openForm("custodian_hub")}
                >
                  {activeWorkflowLabels.registryTitle}
                </button>
                <button
                  className={`green-work-menu-item ${activeForm === "field_capture_assign" ? "active" : ""}`}
                  type="button"
                  onClick={() => openForm("field_capture_assign")}
                >
                  {activeWorkflowLabels.fieldCaptureTitle}
                </button>
                <button
                  className={`green-work-menu-item ${activeForm === "support_visit_assign" ? "active" : ""}`}
                  type="button"
                  onClick={() => openForm("support_visit_assign")}
                >
                  {activeWorkflowLabels.supportVisitTitle}
                </button>
                {agricWorkflowMode ? (
                  <button
                    className={`green-work-menu-item ${activeForm === "remote_monitoring" ? "active" : ""}`}
                    type="button"
                    onClick={() => openForm("remote_monitoring")}
                  >
                    Farm Health
                  </button>
                ) : null}
              </>
            ) : (
              <button
                className={`green-work-menu-item ${activeForm === "custodian_hub" ? "active" : ""}`}
                type="button"
                onClick={() => openForm("custodian_hub")}
              >
                {activeWorkflowLabels.registryTitle}
              </button>
            )}
            <button
              className={`green-work-menu-item ${activeForm === "existing_tree_intake" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("existing_tree_intake")}
            >
              {fieldWorkflowMode ? activeWorkflowLabels.recordTitle : "Existing Trees"}
            </button>
            {!fieldWorkflowMode ? (
              <button
                className={`green-work-menu-item ${activeForm === "verra_reports" ? "active" : ""}`}
                type="button"
                onClick={() => openForm("verra_reports")}
              >
                Verra Reports
              </button>
            ) : null}
            <button
              className={`green-work-menu-item ${activeForm === "review_queue" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("review_queue")}
            >
              Review Queue ({reviewQueue.length})
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "logs" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("logs")}
            >
              System Logs & Reports
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "users" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("users")}
            >
              Users
            </button>
            <button
              className={`green-work-menu-item ${activeForm === "add_user" ? "active" : ""}`}
              type="button"
              onClick={() => openForm("add_user")}
            >
              Add User
            </button>
            {!fieldWorkflowMode ? (
              <>
                <button
                  className={`green-work-menu-item ${activeForm === "assign_work" ? "active" : ""}`}
                  type="button"
                  onClick={() => openForm("assign_work")}
                >
                  Assign Tree Planting
                </button>
                <button
                  className={`green-work-menu-item ${activeForm === "assign_task" ? "active" : ""}`}
                  type="button"
                  onClick={() => openForm("assign_task")}
                >
                  Assign Maintenance Task
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <p className="green-work-menu-note">Select active project in Project Focus to enable assignment actions.</p>
        )}
      </aside>

      <div
        className={`green-work-content ${showSidebar ? "with-sidebar" : "no-sidebar"} ${
          detailScrollMode ? "detail-scroll-mode" : ""
        } ${custodianHubMode ? "custodian-hub-mode" : ""} ${agricRegistryMode ? "agric-registry-mode" : ""} ${sidebarPrimaryMode ? "sidebar-primary-mode" : ""}`}
      >
        <aside className="green-work-sidebar">
          {activeForm === "project_focus" && (
            <>
              <div className="green-work-card">
                <h3>Project Focus</h3>
                <select
                  onChange={async (e) => {
                    const value = e.target.value;
                    if (!value) {
                      clearActiveProjectContext();
                      return;
                    }
                    await onSelectProject(Number(value));
                  }}
                  value={activeProjectId || ""}
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.organization_name ? ` (${p.organization_name})` : ""}
                    </option>
                  ))}
                </select>
                {!activeProjectId && <p className="green-work-note">Select a project to load dashboard data.</p>}
                {activeProjectRecord?.organization_name && (
                  <p className="green-work-note">
                    Organization: {activeProjectRecord.organization_name}
                    {activeProjectRecord.organization_status ? ` (${activeProjectRecord.organization_status})` : ""}
                  </p>
                )}
                {activeProjectRecord && (
                  <p className="green-work-note">
                    Workflow profile: {activeWorkflowLabels.modeLabel}
                  </p>
                )}
                {activeProjectRecord && (
                  <p className="green-work-note">
                    Access route: {activeProjectAccessModel === "public_sponsorship" ? "Public sponsorship" : "Partner organization"}
                  </p>
                )}
                {activeProjectRecord && (
                  <p className="green-work-note">
                    Active model: {formatTaskTypeLabel(activeProjectRecord.planting_model || "direct")}
                  </p>
                )}
                {activeProjectRecord && (
                  <div className="green-work-project-options">
                    <button
                      type="button"
                      className="green-work-option-toggle"
                      onClick={() => setShowProjectDangerOptions((prev) => !prev)}
                    >
                      {showProjectDangerOptions ? "Hide Project Options" : "Project Options"}
                    </button>
                    {showProjectDangerOptions && (
                      <p className="green-work-note">
                        Workflow setup options are now visible below. Delete Project is in the final card at the bottom.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {activeProjectId && showProjectDangerOptions && (
                <>
                  <div className="green-work-card green-work-project-flow-card">
                    <h3>Workflow State</h3>
                    <div className="green-work-flow-summary">
                      <span className="green-work-flow-pill">Profile: {activeWorkflowLabels.modeLabel}</span>
                      <span className="green-work-flow-pill">Model: {formatTaskTypeLabel(projectModel)}</span>
                      <span className="green-work-flow-pill">{activeWorkflowLabels.ownerPlural}: {workflowReadySummary.custodians}</span>
                      <span className="green-work-flow-pill">Events: {workflowReadySummary.events}</span>
                      <span className="green-work-flow-pill">Allocations: {workflowReadySummary.allocations}</span>
                      <span className="green-work-flow-pill">{activeWorkflowLabels.entityPlural}: {existingTreeIntakeRows.length}</span>
                    </div>
                    {agricWorkflowMode ? (
                      <p className="green-work-note">
                        Programme: {formatAgricProgramTypeLabel(activeProjectRecord?.settings?.agric_config?.program_type || projectSettingsDraft.agric_program_type)}
                        {String(activeProjectRecord?.settings?.agric_config?.focus_commodities || projectSettingsDraft.agric_focus_commodities || "").trim()
                          ? ` | Commodities: ${String(activeProjectRecord?.settings?.agric_config?.focus_commodities || projectSettingsDraft.agric_focus_commodities).trim()}`
                          : ""}
                        {String(activeProjectRecord?.settings?.agric_config?.support_packages || projectSettingsDraft.agric_support_packages || "").trim()
                          ? ` | Support: ${String(activeProjectRecord?.settings?.agric_config?.support_packages || projectSettingsDraft.agric_support_packages).trim()}`
                          : ""}
                        {String(activeProjectRecord?.settings?.agric_config?.season_label || projectSettingsDraft.agric_season_label || "").trim()
                          ? ` | Season: ${String(activeProjectRecord?.settings?.agric_config?.season_label || projectSettingsDraft.agric_season_label).trim()}`
                          : ""}
                      </p>
                    ) : reliefWorkflowMode ? (
                      <p className="green-work-note">
                        Programme: {formatReliefProgramTypeLabel(activeProjectRecord?.settings?.relief_config?.program_type || projectSettingsDraft.relief_program_type)}
                        {String(activeProjectRecord?.settings?.relief_config?.intervention_focus || projectSettingsDraft.relief_intervention_focus || "").trim()
                          ? ` | Focus: ${String(activeProjectRecord?.settings?.relief_config?.intervention_focus || projectSettingsDraft.relief_intervention_focus).trim()}`
                          : ""}
                        {String(activeProjectRecord?.settings?.relief_config?.package_types || projectSettingsDraft.relief_package_types || "").trim()
                          ? ` | Packages: ${String(activeProjectRecord?.settings?.relief_config?.package_types || projectSettingsDraft.relief_package_types).trim()}`
                          : ""}
                        {String(activeProjectRecord?.settings?.relief_config?.target_zone || projectSettingsDraft.relief_target_zone || "").trim()
                          ? ` | Target Zone: ${String(activeProjectRecord?.settings?.relief_config?.target_zone || projectSettingsDraft.relief_target_zone).trim()}`
                          : ""}
                      </p>
                    ) : null}
                    <p className="green-work-note">
                      Setup panels are hidden by default to reduce clutter. Open them only when you need to change
                      rules.
                    </p>
                    <div className="work-actions">
                      <button type="button" onClick={() => setProjectSetupExpanded((prev) => !prev)}>
                        {projectSetupExpanded ? "Hide Setup Panels" : "Show Setup Panels"}
                      </button>
                    </div>
                  </div>

                  {projectSetupExpanded && (
                    <>
                  <div className="green-work-card">
                    <h3>Project Settings</h3>
                    <label>
                      Workflow profile
                      <select
                        value={projectSettingsDraft.workflow_profile}
                        onChange={(e) =>
                          setProjectSettingsDraft((prev) => ({
                            ...prev,
                            workflow_profile: normalizeWorkflowProfile(e.target.value) as WorkflowProfile,
                          }))
                        }
                      >
                        <option value="green">Green</option>
                        <option value="agric">Agric</option>
                        <option value="relief_recovery">Relief &amp; Recovery</option>
                        </select>
                    </label>
                    <label>
                      Access route
                      {canAccessSuperAdmin ? (
                        <select
                          value={projectSettingsDraft.access_model}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              access_model: normalizeProjectAccessModel(e.target.value),
                              public_sponsor_enabled: normalizeProjectAccessModel(e.target.value) === "public_sponsorship",
                            }))
                          }
                        >
                          <option value="partner_org">Partner organization route</option>
                          <option value="public_sponsorship">Public sponsorship route</option>
                        </select>
                      ) : (
                        <>
                          <div className="green-work-note">
                            {activeProjectAccessModel === "public_sponsorship"
                              ? "Public sponsorship route"
                              : "Partner organization route"}
                          </div>
                          <p className="green-work-note">Public sponsorship route changes are restricted to super admin.</p>
                        </>
                      )}
                    </label>
                    <label>
                      Planting model
                      <select
                        value={projectSettingsDraft.planting_model}
                        onChange={(e) =>
                          setProjectSettingsDraft((prev) => ({
                            ...prev,
                            planting_model: e.target.value as PlantingModel,
                          }))
                        }
                      >
                        <option value="direct">Direct planting</option>
                        <option value="community_distributed">Community distributed</option>
                        <option value="mixed">Mixed model</option>
                        </select>
                    </label>
                    <label>
                      <span>Project Status</span>
                      <select
                        value={projectSettingsDraft.status || "ongoing"}
                        onChange={(e) =>
                          setProjectSettingsDraft((prev) => ({
                            ...prev,
                            status: e.target.value,
                          }))
                        }
                      >
                        <option value="ongoing">Ongoing</option>
                        <option value="paused">Paused</option>
                        <option value="closed">Closed</option>
                      </select>
                    </label>
                    {projectSettingsDraft.access_model === "public_sponsorship" && canAccessSuperAdmin ? (
                      <>
                        <p className="green-work-note">
                          Public sponsor projects appear automatically in the sponsor app once this route is saved.
                        </p>
                        <p className="green-work-note">
                          Current pricing display: {formatProjectSponsorPriceChoices({
                            sponsor_price_per_tree_ngn: Number(projectSettingsDraft.sponsor_price_per_tree_ngn || 0) || null,
                            sponsor_price_per_tree_usd: Number(projectSettingsDraft.sponsor_price_per_tree_usd || 0) || null,
                            sponsor_price_per_tree: null,
                            sponsor_currency: "NGN",
                          })}
                        </p>
                        <input
                          placeholder="Public sponsor title"
                          value={projectSettingsDraft.public_sponsor_title}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              public_sponsor_title: e.target.value,
                            }))
                          }
                        />
                        <textarea
                          placeholder="Public sponsor description"
                          value={projectSettingsDraft.public_sponsor_description}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              public_sponsor_description: e.target.value,
                            }))
                          }
                          rows={4}
                        />
                        <input
                          placeholder="Sponsor price per tree (NGN)"
                          type="number"
                          min="0"
                          step="100"
                          value={projectSettingsDraft.sponsor_price_per_tree_ngn}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              sponsor_price_per_tree_ngn: e.target.value,
                            }))
                          }
                        />
                        <input
                          placeholder="Sponsor price per tree (USD)"
                          type="number"
                          min="0"
                          step="1"
                          value={projectSettingsDraft.sponsor_price_per_tree_usd}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              sponsor_price_per_tree_usd: e.target.value,
                            }))
                          }
                        />
                        <p className="green-work-note">
                          Set both currencies if this project should accept local NGN sponsorships and international USD sponsorships. Agent payouts remain NGN.
                        </p>
                        <input
                          placeholder="Total trees planned (sponsorship target)"
                          type="number"
                          min="0"
                          step="1"
                          value={projectSettingsDraft.sponsor_capacity}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              sponsor_capacity: e.target.value,
                            }))
                          }
                        />
                        <input
                          placeholder="Max trees per order"
                          type="number"
                          min="1"
                          step="1"
                          value={projectSettingsDraft.sponsor_max_per_order}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              sponsor_max_per_order: e.target.value,
                            }))
                          }
                        />
                        <label>
                          <input
                            type="checkbox"
                            checked={projectSettingsDraft.sponsor_dedication_enabled}
                            onChange={(e) =>
                              setProjectSettingsDraft((prev) => ({
                                ...prev,
                                sponsor_dedication_enabled: e.target.checked,
                              }))
                            }
                          />
                          Allow dedication / memorial messages
                        </label>
                        <textarea
                          placeholder="Payment instructions shown to sponsors"
                          value={projectSettingsDraft.sponsor_payment_instructions}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              sponsor_payment_instructions: e.target.value,
                            }))
                          }
                          rows={4}
                        />
                        <p className="green-work-note">
                          Sponsor-agent rates drive what approved public sponsor agents earn for linked planting and approved maintenance work.
                          Leave blank to keep automatic defaults from the sponsor tree price.
                        </p>
                        <input
                          placeholder="Agent planting fee per linked tree"
                          type="number"
                          min="0"
                          step="100"
                          value={projectSettingsDraft.sponsor_agent_planting_fee}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              sponsor_agent_planting_fee: e.target.value,
                            }))
                          }
                        />
                        <input
                          placeholder="Agent maintenance fee per approved visit"
                          type="number"
                          min="0"
                          step="100"
                          value={projectSettingsDraft.sponsor_agent_maintenance_fee}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              sponsor_agent_maintenance_fee: e.target.value,
                            }))
                          }
                        />
                      </>
                    ) : projectSettingsDraft.access_model === "public_sponsorship" ? (
                      <p className="green-work-note">
                        Public sponsorship publishing, pricing, and sponsor payment settings are managed by super admin.
                      </p>
                    ) : null}
                    {projectSettingsDraft.workflow_profile === "agric" ? (
                      <>
                        <label>
                          Agric program type
                          <select
                            value={projectSettingsDraft.agric_program_type}
                            onChange={(e) =>
                              setProjectSettingsDraft((prev) => ({
                                ...prev,
                                agric_program_type: e.target.value,
                              }))
                            }
                          >
                            <option value="extension_support">Extension support</option>
                            <option value="input_support">Input support</option>
                            <option value="traceability">Traceability</option>
                            <option value="finance_insurance">Finance & insurance</option>
                            <option value="mixed">Mixed</option>
                          </select>
                        </label>
                        <input
                          placeholder="Focus commodities"
                          value={projectSettingsDraft.agric_focus_commodities}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              agric_focus_commodities: e.target.value,
                            }))
                          }
                        />
                        <input
                          placeholder="Support packages"
                          value={projectSettingsDraft.agric_support_packages}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              agric_support_packages: e.target.value,
                            }))
                          }
                        />
                        <input
                          placeholder="Season label"
                          value={projectSettingsDraft.agric_season_label}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              agric_season_label: e.target.value,
                            }))
                          }
                        />
                      </>
                    ) : projectSettingsDraft.workflow_profile === "relief_recovery" ? (
                      <>
                        <label>
                          Relief program type
                          <select
                            value={projectSettingsDraft.relief_program_type}
                            onChange={(e) =>
                              setProjectSettingsDraft((prev) => ({
                                ...prev,
                                relief_program_type: e.target.value,
                              }))
                            }
                          >
                            <option value="emergency_relief">Emergency relief</option>
                            <option value="shelter_recovery">Shelter recovery</option>
                            <option value="construction_materials">Construction materials</option>
                            <option value="infrastructure_rehab">Infrastructure rehabilitation</option>
                            <option value="cash_voucher">Cash & voucher</option>
                            <option value="mixed">Mixed</option>
                          </select>
                        </label>
                        <input
                          placeholder="Intervention focus"
                          value={projectSettingsDraft.relief_intervention_focus}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              relief_intervention_focus: e.target.value,
                            }))
                          }
                        />
                        <input
                          placeholder="Package types"
                          value={projectSettingsDraft.relief_package_types}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              relief_package_types: e.target.value,
                            }))
                          }
                        />
                        <input
                          placeholder="Target zone / LGA cluster"
                          value={projectSettingsDraft.relief_target_zone}
                          onChange={(e) =>
                            setProjectSettingsDraft((prev) => ({
                              ...prev,
                              relief_target_zone: e.target.value,
                            }))
                          }
                        />
                      </>
                    ) : null}
                        <button className="btn-primary" type="button" onClick={() => void saveProjectSettings()}>
                          Save Project Settings
                        </button>
                      </div>
                  {!showCommunityWorkflow && (
                    <p className="green-work-note">
                      Community setup is hidden because the project is in Direct planting mode.
                    </p>
                  )}
                  {showCommunityWorkflow && (
                    <p className="green-work-note">
                      Community workflow now runs in one Custodian Hub tab.
                    </p>
                  )}

                  {showLegacyCommunitySetup && showCommunityWorkflow && (
                  <div className="green-work-card">
                    <h3>Community Custodians</h3>
                    {!isCommunityModel && hasCommunityData && (
                      <p className="green-work-note">
                        Community records exist from an earlier setup. They remain visible for continuity.
                      </p>
                    )}
                    <select
                      value={newCustodian.custodian_type}
                      onChange={(e) =>
                        setNewCustodian((prev) => ({ ...prev, custodian_type: e.target.value as CustodianType }))
                      }
                    >
                      <option value="household">Household</option>
                      <option value="school">School</option>
                      <option value="community_group">Community Group</option>
                    </select>
                    <input
                      placeholder="Custodian name"
                      value={newCustodian.name}
                      onChange={(e) => setNewCustodian((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <input
                      placeholder="Phone"
                      value={newCustodian.phone}
                      onChange={(e) => setNewCustodian((prev) => ({ ...prev, phone: e.target.value }))}
                    />
                    <input
                      placeholder="Community / School name"
                      value={newCustodian.community_name}
                      onChange={(e) => setNewCustodian((prev) => ({ ...prev, community_name: e.target.value }))}
                    />
                    <input
                      placeholder="Address"
                      value={newCustodian.address_text}
                      onChange={(e) => setNewCustodian((prev) => ({ ...prev, address_text: e.target.value }))}
                    />
                    <button className="btn-primary" type="button" onClick={() => void createCustodian()}>
                      Add Custodian
                    </button>
                    <div className="staff-list">
                      {custodians.length === 0 ? (
                        <p className="green-work-note">No custodians yet in this project.</p>
                      ) : (
                        custodians.map((custodian) => (
                          <div key={`custodian-${custodian.id}`} className="staff-row">
                            <div className="staff-row-head">
                              <strong>{custodian.name}</strong>
                              <span>{formatTaskTypeLabel(custodian.custodian_type)}</span>
                            </div>
                            <div className="staff-row-meta">
                              {custodian.community_name || "-"} | {custodian.phone || "-"}
                            </div>
                            <div className="staff-row-meta">
                              Verification: {custodian.verification_status || "pending"}
                            </div>
                            <div className="work-actions">
                              <button
                                type="button"
                                onClick={() => void updateCustodianVerification(custodian.id, "verified")}
                              >
                                Mark Verified
                              </button>
                              <button
                                type="button"
                                onClick={() => void updateCustodianVerification(custodian.id, "pending")}
                              >
                                Mark Pending
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  )}

                  {showLegacyCommunitySetup && showCommunityWorkflow && (
                  <div className="green-work-card">
                    <h3>Distribution Events & Allocations</h3>
                    <input
                      type="date"
                      value={newDistributionEvent.event_date}
                      onChange={(e) => setNewDistributionEvent((prev) => ({ ...prev, event_date: e.target.value }))}
                    />
                    <input
                      placeholder="Species (optional)"
                      value={newDistributionEvent.species}
                      onChange={(e) => setNewDistributionEvent((prev) => ({ ...prev, species: e.target.value }))}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Quantity"
                      value={newDistributionEvent.quantity}
                      onChange={(e) =>
                        setNewDistributionEvent((prev) => ({ ...prev, quantity: Number(e.target.value || 0) }))
                      }
                    />
                    <input
                      placeholder="Batch reference"
                      value={newDistributionEvent.source_batch_ref}
                      onChange={(e) =>
                        setNewDistributionEvent((prev) => ({ ...prev, source_batch_ref: e.target.value }))
                      }
                    />
                    <input
                      placeholder="Distributed by"
                      value={newDistributionEvent.distributed_by}
                      onChange={(e) =>
                        setNewDistributionEvent((prev) => ({ ...prev, distributed_by: e.target.value }))
                      }
                    />
                    <textarea
                      placeholder="Distribution notes"
                      value={newDistributionEvent.notes}
                      onChange={(e) => setNewDistributionEvent((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                    <button className="btn-primary" type="button" onClick={() => void createDistributionEvent()}>
                      Create Distribution Event
                    </button>

                    <h4>Allocate Seedlings</h4>
                    <select
                      value={newAllocation.event_id}
                      onChange={(e) => setNewAllocation((prev) => ({ ...prev, event_id: e.target.value }))}
                      disabled={distributionEvents.length === 0}
                    >
                      <option value="">Select event</option>
                      {distributionEvents.map((event) => (
                        <option key={`event-${event.id}`} value={event.id}>
                          {event.event_date} | {event.species || "Mixed"} | Qty {event.quantity}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newAllocation.custodian_id}
                      onChange={(e) => setNewAllocation((prev) => ({ ...prev, custodian_id: e.target.value }))}
                      disabled={custodians.length === 0}
                    >
                      <option value="">Select custodian</option>
                      {custodians.map((custodian) => (
                        <option key={`alloc-custodian-${custodian.id}`} value={custodian.id}>
                          {custodian.name} ({formatTaskTypeLabel(custodian.custodian_type)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      placeholder="Allocated quantity"
                      value={newAllocation.quantity_allocated}
                      onChange={(e) =>
                        setNewAllocation((prev) => ({
                          ...prev,
                          quantity_allocated: Number(e.target.value || 0),
                        }))
                      }
                    />
                    <input
                      type="date"
                      value={newAllocation.expected_planting_start}
                      onChange={(e) =>
                        setNewAllocation((prev) => ({ ...prev, expected_planting_start: e.target.value }))
                      }
                    />
                    <input
                      type="date"
                      value={newAllocation.expected_planting_end}
                      onChange={(e) =>
                        setNewAllocation((prev) => ({ ...prev, expected_planting_end: e.target.value }))
                      }
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Follow-up cycle days"
                      value={newAllocation.followup_cycle_days}
                      onChange={(e) =>
                        setNewAllocation((prev) => ({
                          ...prev,
                          followup_cycle_days: Number(e.target.value || 14),
                        }))
                      }
                    />
                    <textarea
                      placeholder="Allocation notes"
                      value={newAllocation.notes}
                      onChange={(e) => setNewAllocation((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                    <button
                      className="btn-primary"
                      type="button"
                      disabled={distributionEvents.length === 0 || custodians.length === 0}
                      onClick={() => void upsertDistributionAllocation()}
                    >
                      Save Allocation
                    </button>
                    <p className="green-work-note">Saved allocations: {distributionAllocations.length}</p>
                  </div>
                  )}

                    </>
                  )}

                  <div className="green-work-card green-work-project-danger-zone">
                    <h3>Delete Project</h3>
                    <p className="green-work-note danger">
                      Permanent action. This will remove project data and cannot be undone.
                    </p>
                    <div className="work-actions green-work-project-danger-actions">
                      <button type="button" className="green-work-danger-btn" onClick={openDeleteProjectModal}>
                        Delete Project
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {activeForm === "custodian_hub" && (
            <>
              <div className="green-work-card">
                <h3>{fieldWorkflowMode ? `${activeWorkflowLabels.ownerSingular} Live Overview` : "Custodian Live Overview"}</h3>
                {!activeProjectId && <p className="green-work-note">Select a project first from Project Focus.</p>}
                <div className="green-work-flow-summary">
                  <span className="green-work-flow-pill">{activeWorkflowLabels.ownerPlural}: {custodianSummary.totalCustodians}</span>
                  <span className="green-work-flow-pill">Verified: {custodianSummary.verifiedCustodians}</span>
                  <span className="green-work-flow-pill">Events: {custodianSummary.totalEvents}</span>
                  <span className="green-work-flow-pill">Allocations: {custodianSummary.totalAllocations}</span>
                  <span className="green-work-flow-pill">{fieldWorkflowMode ? "Units" : "Seedlings"}: {custodianSummary.allocatedSeedlings}</span>
                  <span className="green-work-flow-pill">
                    {fieldWorkflowMode ? activeWorkflowLabels.supportVisitTitle : "Supervision"}: {custodianSummary.supervisionDone}/{custodianSummary.supervisionTarget} done
                  </span>
                  <span className="green-work-flow-pill">{fieldWorkflowMode ? `${activeWorkflowLabels.supportVisitTitle} Live` : "Supervision Live"}: {custodianSummary.supervisionLive}</span>
                  <span className="green-work-flow-pill">{activeWorkflowLabels.entityPlural}: {custodianSummary.existingTrees}</span>
                </div>
                <p className="green-work-note">
                  {agricWorkflowMode
                    ? "One hub for farmer registry, support allocations, mapped plots, and exportable programme evidence."
                    : reliefWorkflowMode
                      ? "One hub for beneficiary registry, relief allocations, mapped sites, and exportable recovery evidence."
                    : "One hub for monitoring, custodian registration, distribution events, and custodian PDF export."}
                </p>
                {workPartnerOrgPaused && (
                  <p className="green-work-note" style={{ color: "#8a6500", fontWeight: 700 }}>
                    Organization is paused. {fieldWorkflowMode ? `${activeWorkflowLabels.ownerSingular} operations are disabled. Only programme PDF export is allowed.` : "Custodian operations are disabled. Only Custodian PDF export is allowed."}
                  </p>
                )}
                <div className="work-actions">
                  <button
                    type="button"
                    className="green-work-option-toggle"
                    onClick={() => setCustodianOptionsExpanded((prev) => !prev)}
                    disabled={workPartnerOrgPaused}
                    title={workPartnerOrgPaused ? "Paused organizations cannot use custodian setup/actions" : undefined}
                  >
                    {custodianOptionsExpanded ? `Hide ${activeWorkflowLabels.ownerSingular} Options` : `${activeWorkflowLabels.ownerSingular} Options`}
                  </button>
                </div>
                {!custodianOptionsExpanded && (
                  <p className="green-work-note">
                    {workPartnerOrgPaused
                      ? `${activeWorkflowLabels.ownerSingular} setup/actions are locked while paused. Use the PDF export only.`
                      : `Setup forms are hidden to reduce clutter. Open ${activeWorkflowLabels.ownerSingular} Options to add registry records, events, allocations, and export reports.`}
                  </p>
                )}
              </div>

              {custodianOptionsExpanded && (
                <>
                  {fieldWorkflowMode && (
                    <div className="green-work-hub-tabs" role="tablist" aria-label={`${activeWorkflowLabels.ownerSingular} registry views`}>
                      <button
                        type="button"
                        className={`green-work-hub-tab ${agricCustodianHubTab === "farmer_form" ? "is-active" : ""}`}
                        onClick={() => setAgricCustodianHubTab("farmer_form")}
                      >
                        {activeWorkflowLabels.ownerSingular} Form
                      </button>
                      <button
                        type="button"
                        className={`green-work-hub-tab ${agricCustodianHubTab === "support_setup" ? "is-active" : ""}`}
                        onClick={() => setAgricCustodianHubTab("support_setup")}
                      >
                        {reliefWorkflowMode ? "Relief Setup" : "Support Setup"}
                      </button>
                    </div>
                  )}

                  {(!fieldWorkflowMode || agricCustodianHubTab === "farmer_form") && (
                    <div className="green-work-card green-work-registry-card">
                      <h3>{fieldWorkflowMode ? `Register ${activeWorkflowLabels.ownerSingular}` : `Add ${activeWorkflowLabels.ownerSingular}`}</h3>
                      {!activeProjectId && <p className="green-work-note">Select a project first from Project Focus.</p>}
                      <p className="green-work-note">
                        {agricWorkflowMode
                          ? "Use clear registry sections so field teams can onboard farmers quickly and organizations can export support-ready records later."
                          : reliefWorkflowMode
                            ? "Use clear registry sections so teams can onboard beneficiary households, institutions, and affected groups quickly before site capture and relief follow-up."
                          : "Custodian records are separate from staff users and do not change Live Maintenance rows."}
                      </p>

                      {agricWorkflowMode ? (
                        <div className="green-work-registry-form">
                          <section className="green-work-form-section">
                            <div className="green-work-form-section-head">
                              <strong>Identity</strong>
                              <span>Core farmer identity, contacts, and programme references.</span>
                            </div>
                            <div className="green-work-form-grid">
                              <label className="green-work-stacked-field">
                                <span>Farmer type</span>
                                <select
                                  value={newCustodian.custodian_type}
                                  onChange={(e) =>
                                    setNewCustodian((prev) => ({ ...prev, custodian_type: e.target.value as CustodianType }))
                                  }
                                  disabled={!activeProjectId}
                                >
                                  <option value="household">Household</option>
                                  <option value="school">School</option>
                                  <option value="community_group">Community Group</option>
                                </select>
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Farmer name</span>
                                <input value={newCustodian.name} onChange={(e) => setNewCustodian((prev) => ({ ...prev, name: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Farmer code</span>
                                <input value={newCustodian.farmer_code} onChange={(e) => setNewCustodian((prev) => ({ ...prev, farmer_code: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>National ID / NIN</span>
                                <input value={newCustodian.national_id} onChange={(e) => setNewCustodian((prev) => ({ ...prev, national_id: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Contact person</span>
                                <input value={newCustodian.contact_person} onChange={(e) => setNewCustodian((prev) => ({ ...prev, contact_person: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Primary phone</span>
                                <input value={newCustodian.phone} onChange={(e) => setNewCustodian((prev) => ({ ...prev, phone: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Alternate phone</span>
                                <input value={newCustodian.alt_phone} onChange={(e) => setNewCustodian((prev) => ({ ...prev, alt_phone: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Email</span>
                                <input value={newCustodian.email} onChange={(e) => setNewCustodian((prev) => ({ ...prev, email: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Gender</span>
                                <select value={newCustodian.gender} onChange={(e) => setNewCustodian((prev) => ({ ...prev, gender: e.target.value }))} disabled={!activeProjectId}>
                                  <option value="">Select gender</option>
                                  <option value="male">Male</option>
                                  <option value="female">Female</option>
                                </select>
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Date of birth</span>
                                <input type="date" value={newCustodian.date_of_birth} onChange={(e) => setNewCustodian((prev) => ({ ...prev, date_of_birth: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                            </div>
                          </section>

                          <section className="green-work-form-section">
                            <div className="green-work-form-section-head">
                              <strong>Location</strong>
                              <span>Community and administrative geography used by support programmes.</span>
                            </div>
                            <div className="green-work-form-grid">
                              <label className="green-work-stacked-field">
                                <span>Community / settlement</span>
                                <input value={newCustodian.community_name} onChange={(e) => setNewCustodian((prev) => ({ ...prev, community_name: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Local government area</span>
                                <input value={newCustodian.local_government} onChange={(e) => setNewCustodian((prev) => ({ ...prev, local_government: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>State</span>
                                <input value={newCustodian.state_name} onChange={(e) => setNewCustodian((prev) => ({ ...prev, state_name: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Ward</span>
                                <input value={newCustodian.ward_name} onChange={(e) => setNewCustodian((prev) => ({ ...prev, ward_name: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field green-work-stacked-field-wide">
                                <span>Address</span>
                                <input value={newCustodian.address_text} onChange={(e) => setNewCustodian((prev) => ({ ...prev, address_text: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                            </div>
                          </section>

                          <section className="green-work-form-section">
                            <div className="green-work-form-section-head">
                              <strong>Production Profile</strong>
                              <span>Crop, cooperative, and land-use details most programmes expect during farmer intake.</span>
                            </div>
                            <div className="green-work-form-grid">
                              <label className="green-work-stacked-field">
                                <span>Farmer group / cooperative</span>
                                <input value={newCustodian.farmer_group} onChange={(e) => setNewCustodian((prev) => ({ ...prev, farmer_group: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Primary crop</span>
                                <input value={newCustodian.primary_crop} onChange={(e) => setNewCustodian((prev) => ({ ...prev, primary_crop: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Secondary crops</span>
                                <input value={newCustodian.secondary_crops} onChange={(e) => setNewCustodian((prev) => ({ ...prev, secondary_crops: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Household size</span>
                                <input value={newCustodian.household_size} onChange={(e) => setNewCustodian((prev) => ({ ...prev, household_size: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Land tenure</span>
                                <select value={newCustodian.land_tenure} onChange={(e) => setNewCustodian((prev) => ({ ...prev, land_tenure: e.target.value }))} disabled={!activeProjectId}>
                                  <option value="">Select tenure</option>
                                  <option value="owned">Owned</option>
                                  <option value="family_owned">Family owned</option>
                                  <option value="leased">Leased</option>
                                  <option value="shared">Shared</option>
                                  <option value="communal">Communal</option>
                                  <option value="other">Other</option>
                                </select>
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Irrigation access</span>
                                <select value={newCustodian.irrigation_access} onChange={(e) => setNewCustodian((prev) => ({ ...prev, irrigation_access: e.target.value }))} disabled={!activeProjectId}>
                                  <option value="">Select irrigation access</option>
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                  <option value="seasonal">Seasonal</option>
                                  <option value="unknown">Unknown</option>
                                </select>
                              </label>
                            </div>
                          </section>

                          <section className="green-work-form-section">
                            <div className="green-work-form-section-head">
                              <strong>Services & Follow-up</strong>
                              <span>Finance, insurance, and support-needs fields used for programme targeting.</span>
                            </div>
                            <div className="green-work-form-grid">
                              <div className="green-work-checkbox-stack">
                                <label className="green-work-checkbox-row">
                                  <input
                                    type="checkbox"
                                    checked={newCustodian.finance_access}
                                    onChange={(e) => setNewCustodian((prev) => ({ ...prev, finance_access: e.target.checked }))}
                                    disabled={!activeProjectId}
                                  />
                                  <span>Access to finance</span>
                                </label>
                                <label className="green-work-checkbox-row">
                                  <input
                                    type="checkbox"
                                    checked={newCustodian.insurance_access}
                                    onChange={(e) => setNewCustodian((prev) => ({ ...prev, insurance_access: e.target.checked }))}
                                    disabled={!activeProjectId}
                                  />
                                  <span>Insurance enrolled</span>
                                </label>
                              </div>
                              <label className="green-work-stacked-field green-work-stacked-field-wide">
                                <span>Notes or support needs</span>
                                <textarea value={newCustodian.notes} onChange={(e) => setNewCustodian((prev) => ({ ...prev, notes: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field green-work-stacked-field-wide">
                                <span>Input support needs</span>
                                <textarea value={newCustodian.input_support_needs} onChange={(e) => setNewCustodian((prev) => ({ ...prev, input_support_needs: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                            </div>
                          </section>
                        </div>
                      ) : reliefWorkflowMode ? (
                        <div className="green-work-registry-form">
                          <section className="green-work-form-section">
                            <div className="green-work-form-section-head">
                              <strong>Identity</strong>
                              <span>Core beneficiary identity, verification, and programme references.</span>
                            </div>
                            <div className="green-work-form-grid">
                              <label className="green-work-stacked-field">
                                <span>Beneficiary type</span>
                                <select
                                  value={newCustodian.custodian_type}
                                  onChange={(e) => setNewCustodian((prev) => ({ ...prev, custodian_type: e.target.value as CustodianType }))}
                                  disabled={!activeProjectId}
                                >
                                  <option value="household">Household</option>
                                  <option value="school">School</option>
                                  <option value="community_group">Community Group</option>
                                  <option value="small_business">Small Business</option>
                                  <option value="health_facility">Health Facility</option>
                                  <option value="community_asset">Community Asset</option>
                                </select>
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Beneficiary name</span>
                                <input value={newCustodian.name} onChange={(e) => setNewCustodian((prev) => ({ ...prev, name: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Beneficiary code</span>
                                <input value={newCustodian.beneficiary_code} onChange={(e) => setNewCustodian((prev) => ({ ...prev, beneficiary_code: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Government / registration ID</span>
                                <input value={newCustodian.government_id} onChange={(e) => setNewCustodian((prev) => ({ ...prev, government_id: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Contact person</span>
                                <input value={newCustodian.contact_person} onChange={(e) => setNewCustodian((prev) => ({ ...prev, contact_person: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Primary phone</span>
                                <input value={newCustodian.phone} onChange={(e) => setNewCustodian((prev) => ({ ...prev, phone: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Email</span>
                                <input value={newCustodian.email} onChange={(e) => setNewCustodian((prev) => ({ ...prev, email: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Displacement status</span>
                                <select value={newCustodian.displacement_status} onChange={(e) => setNewCustodian((prev) => ({ ...prev, displacement_status: e.target.value }))} disabled={!activeProjectId}>
                                  <option value="">Select status</option>
                                  <option value="idp">IDP</option>
                                  <option value="returnee">Returnee</option>
                                  <option value="host">Host</option>
                                  <option value="resident">Resident</option>
                                  <option value="relocated">Relocated</option>
                                  <option value="other">Other</option>
                                </select>
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Gender</span>
                                <select value={newCustodian.relief_gender} onChange={(e) => setNewCustodian((prev) => ({ ...prev, relief_gender: e.target.value }))} disabled={!activeProjectId}>
                                  <option value="">Select gender</option>
                                  <option value="male">Male</option>
                                  <option value="female">Female</option>
                                </select>
                              </label>
                            </div>
                          </section>

                          <section className="green-work-form-section">
                            <div className="green-work-form-section-head">
                              <strong>Location & Household</strong>
                              <span>Settlement, origin, and vulnerability snapshot needed for relief targeting.</span>
                            </div>
                            <div className="green-work-form-grid">
                              <label className="green-work-stacked-field">
                                <span>Current settlement</span>
                                <input value={newCustodian.current_settlement} onChange={(e) => setNewCustodian((prev) => ({ ...prev, current_settlement: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Origin location</span>
                                <input value={newCustodian.origin_location} onChange={(e) => setNewCustodian((prev) => ({ ...prev, origin_location: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Community / ward</span>
                                <input value={newCustodian.community_name} onChange={(e) => setNewCustodian((prev) => ({ ...prev, community_name: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Local government area</span>
                                <input value={newCustodian.local_government} onChange={(e) => setNewCustodian((prev) => ({ ...prev, local_government: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Household size</span>
                                <input value={newCustodian.household_size} onChange={(e) => setNewCustodian((prev) => ({ ...prev, household_size: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Women count</span>
                                <input value={newCustodian.women_count} onChange={(e) => setNewCustodian((prev) => ({ ...prev, women_count: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Children under five</span>
                                <input value={newCustodian.children_under_five} onChange={(e) => setNewCustodian((prev) => ({ ...prev, children_under_five: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Elderly count</span>
                                <input value={newCustodian.elderly_count} onChange={(e) => setNewCustodian((prev) => ({ ...prev, elderly_count: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Persons with disability</span>
                                <input value={newCustodian.disability_count} onChange={(e) => setNewCustodian((prev) => ({ ...prev, disability_count: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Shelter status</span>
                                <select value={newCustodian.shelter_status} onChange={(e) => setNewCustodian((prev) => ({ ...prev, shelter_status: e.target.value }))} disabled={!activeProjectId}>
                                  <option value="">Select status</option>
                                  <option value="displaced">Displaced</option>
                                  <option value="hosted">Hosted</option>
                                  <option value="damaged_home">Damaged home</option>
                                  <option value="destroyed_home">Destroyed home</option>
                                  <option value="temporary_shelter">Temporary shelter</option>
                                  <option value="resettled">Resettled</option>
                                  <option value="other">Other</option>
                                </select>
                              </label>
                              <label className="green-work-stacked-field green-work-stacked-field-wide">
                                <span>Address</span>
                                <input value={newCustodian.address_text} onChange={(e) => setNewCustodian((prev) => ({ ...prev, address_text: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                            </div>
                          </section>

                          <section className="green-work-form-section">
                            <div className="green-work-form-section-head">
                              <strong>Support & Vulnerability</strong>
                              <span>Priority support categories used for relief delivery, reconstruction, and follow-up.</span>
                            </div>
                            <div className="green-work-form-grid">
                              <label className="green-work-stacked-field">
                                <span>Support category</span>
                                <input value={newCustodian.support_category} onChange={(e) => setNewCustodian((prev) => ({ ...prev, support_category: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field">
                                <span>Livelihood type</span>
                                <input value={newCustodian.livelihood_type} onChange={(e) => setNewCustodian((prev) => ({ ...prev, livelihood_type: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field green-work-stacked-field-wide">
                                <span>Vulnerability flags</span>
                                <textarea value={newCustodian.vulnerability_flags} onChange={(e) => setNewCustodian((prev) => ({ ...prev, vulnerability_flags: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field green-work-stacked-field-wide">
                                <span>Priority needs</span>
                                <textarea value={newCustodian.priority_needs} onChange={(e) => setNewCustodian((prev) => ({ ...prev, priority_needs: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                              <label className="green-work-stacked-field green-work-stacked-field-wide">
                                <span>Notes</span>
                                <textarea value={newCustodian.notes} onChange={(e) => setNewCustodian((prev) => ({ ...prev, notes: e.target.value }))} disabled={!activeProjectId} />
                              </label>
                            </div>
                          </section>
                        </div>
                      ) : (
                        <>
                          <select
                            value={newCustodian.custodian_type}
                            onChange={(e) =>
                              setNewCustodian((prev) => ({ ...prev, custodian_type: e.target.value as CustodianType }))
                            }
                            disabled={!activeProjectId}
                          >
                            <option value="household">Household</option>
                            <option value="school">School</option>
                            <option value="community_group">Community Group</option>
                          </select>
                          <input placeholder={`${activeWorkflowLabels.ownerSingular} name`} value={newCustodian.name} onChange={(e) => setNewCustodian((prev) => ({ ...prev, name: e.target.value }))} disabled={!activeProjectId} />
                          <input placeholder="Contact person" value={newCustodian.contact_person} onChange={(e) => setNewCustodian((prev) => ({ ...prev, contact_person: e.target.value }))} disabled={!activeProjectId} />
                          <input placeholder="Primary phone" value={newCustodian.phone} onChange={(e) => setNewCustodian((prev) => ({ ...prev, phone: e.target.value }))} disabled={!activeProjectId} />
                          <input placeholder="Alternate phone" value={newCustodian.alt_phone} onChange={(e) => setNewCustodian((prev) => ({ ...prev, alt_phone: e.target.value }))} disabled={!activeProjectId} />
                          <input placeholder="Email" value={newCustodian.email} onChange={(e) => setNewCustodian((prev) => ({ ...prev, email: e.target.value }))} disabled={!activeProjectId} />
                          <input placeholder="Community / School name" value={newCustodian.community_name} onChange={(e) => setNewCustodian((prev) => ({ ...prev, community_name: e.target.value }))} disabled={!activeProjectId} />
                          <input placeholder="Local government area" value={newCustodian.local_government} onChange={(e) => setNewCustodian((prev) => ({ ...prev, local_government: e.target.value }))} disabled={!activeProjectId} />
                          <input placeholder="Address" value={newCustodian.address_text} onChange={(e) => setNewCustodian((prev) => ({ ...prev, address_text: e.target.value }))} disabled={!activeProjectId} />
                          <textarea placeholder="Notes" value={newCustodian.notes} onChange={(e) => setNewCustodian((prev) => ({ ...prev, notes: e.target.value }))} disabled={!activeProjectId} />
                        </>
                      )}

                      <div className="work-actions">
                        <button className="btn-primary" type="button" onClick={() => void createCustodian()} disabled={!activeProjectId}>
                          {fieldWorkflowMode ? `Register ${activeWorkflowLabels.ownerSingular}` : `Add ${activeWorkflowLabels.ownerSingular}`}
                        </button>
                      </div>

                      <div className="staff-list">
                        <h4>{fieldWorkflowMode ? `Recent ${activeWorkflowLabels.ownerSingular} Records` : `${activeWorkflowLabels.ownerPlural} in this project`}</h4>
                        {custodians.length === 0 ? (
                          <p className="green-work-note">No {activeWorkflowLabels.ownerPlural.toLowerCase()} yet in this project.</p>
                        ) : (
                          custodians.map((custodian) => (
                            <div key={`custodian-tab-${custodian.id}`} className="staff-row">
                              <div className="staff-row-head">
                                <strong>{custodian.name}</strong>
                                <span>{formatTaskTypeLabel(custodian.custodian_type)}</span>
                              </div>
                              <div className="staff-row-meta">
                                Contact: {custodian.contact_person || "-"} | {custodian.phone || "-"} | {custodian.email || "-"}
                              </div>
                              <div className="staff-row-meta">
                                Community: {custodian.community_name || "-"} | LGA: {custodian.local_government || "-"}
                              </div>
                              {agricWorkflowMode ? (
                                <div className="staff-row-meta">
                                  Farmer code: {custodian.profile_data?.farmer_code || "-"} | Crop: {custodian.profile_data?.primary_crop || "-"} | Group: {custodian.profile_data?.farmer_group || "-"}
                                </div>
                              ) : reliefWorkflowMode ? (
                                <div className="staff-row-meta">
                                  Beneficiary code: {custodian.profile_data?.beneficiary_code || "-"} | Status: {custodian.profile_data?.displacement_status || "-"} | Support: {custodian.profile_data?.support_category || "-"}
                                </div>
                              ) : null}
                              <div className="staff-row-meta">
                                Verification: {custodian.verification_status || "pending"}
                              </div>
                              {custodian.notes && <div className="staff-row-meta">Notes: {custodian.notes}</div>}
                              <div className="work-actions">
                                <button
                                  type="button"
                                  onClick={() => void updateCustodianVerification(custodian.id, "verified")}
                                  disabled={workPartnerOrgPaused}
                                >
                                  Mark Verified
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void updateCustodianVerification(custodian.id, "pending")}
                                  disabled={workPartnerOrgPaused}
                                >
                                  Mark Pending
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {(!fieldWorkflowMode || agricCustodianHubTab === "support_setup") && (
                    <>
              <div className="green-work-card">
                <h3>{fieldWorkflowMode ? "Support Events" : "Distributed Events"}</h3>
                {!activeProjectId && <p className="green-work-note">Select a project first from Project Focus.</p>}
                <p className="green-work-note">
                  {agricWorkflowMode
                    ? "Support-event tracking is kept separate so supervisor monitoring, targeting, and audit history stay clear."
                    : reliefWorkflowMode
                      ? "Relief-event tracking is kept separate so delivery history, reconstruction follow-up, and audit trails stay clear."
                    : "Distribution tracking is kept separate so supervisor monitoring stays clear."}
                </p>
                <input
                  type="date"
                  value={newDistributionEvent.event_date}
                  onChange={(e) => setNewDistributionEvent((prev) => ({ ...prev, event_date: e.target.value }))}
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">
                  {fieldWorkflowMode
                    ? "Tip: use the actual day the support package or service was delivered."
                    : "Tip: use the actual day seedlings were handed out."}
                </p>
                <input
                  placeholder={fieldWorkflowMode ? "Support item / package (optional)" : "Species (optional)"}
                  value={newDistributionEvent.species}
                  onChange={(e) => setNewDistributionEvent((prev) => ({ ...prev, species: e.target.value }))}
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">
                  {fieldWorkflowMode
                    ? "Tip: enter one package or support item only if this event delivered a single item type."
                    : "Tip: enter a species only if this event was single-species."}
                </p>
                <input
                  type="number"
                  min={0}
                  placeholder="Quantity"
                  value={newDistributionEvent.quantity}
                  onChange={(e) =>
                    setNewDistributionEvent((prev) => ({ ...prev, quantity: Number(e.target.value || 0) }))
                  }
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">
                  {fieldWorkflowMode
                    ? "Tip: total units dispatched in this event."
                    : "Tip: total seedlings dispatched in this event."}
                </p>
                <input
                  placeholder="Batch reference"
                  value={newDistributionEvent.source_batch_ref}
                  onChange={(e) => setNewDistributionEvent((prev) => ({ ...prev, source_batch_ref: e.target.value }))}
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">Tip: use a batch ID or delivery note number for traceability.</p>
                <input
                  placeholder="Distributed by"
                  value={newDistributionEvent.distributed_by}
                  onChange={(e) => setNewDistributionEvent((prev) => ({ ...prev, distributed_by: e.target.value }))}
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">
                  {fieldWorkflowMode
                    ? "Tip: enter the supervisor or staff member responsible for the support event."
                    : "Tip: enter supervisor/staff name responsible for handout."}
                </p>
                <textarea
                  placeholder={fieldWorkflowMode ? "Support event notes" : "Distribution notes"}
                  value={newDistributionEvent.notes}
                  onChange={(e) => setNewDistributionEvent((prev) => ({ ...prev, notes: e.target.value }))}
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">Tip: add location, partner, or any exception notes for audit.</p>
                <button className="btn-primary" type="button" onClick={() => void createDistributionEvent()} disabled={!activeProjectId}>
                  {fieldWorkflowMode ? "Create Support Event" : "Create Distribution Event"}
                </button>

                <h4>{fieldWorkflowMode ? "Allocate Support" : "Allocate Seedlings"}</h4>
                <select
                  value={newAllocation.event_id}
                  onChange={(e) => setNewAllocation((prev) => ({ ...prev, event_id: e.target.value }))}
                  disabled={!activeProjectId || distributionEvents.length === 0}
                >
                  <option value="">Select event</option>
                  {distributionEvents.map((event) => (
                    <option key={`dist-event-${event.id}`} value={event.id}>
                      {event.event_date} | {event.species || "Mixed"} | Qty {event.quantity}
                    </option>
                  ))}
                </select>
                <p className="green-work-field-tip">
                  {fieldWorkflowMode
                    ? "Tip: choose the support event this allocation belongs to."
                    : "Tip: choose the distribution event this allocation belongs to."}
                </p>
                <select
                  value={newAllocation.custodian_id}
                  onChange={(e) => setNewAllocation((prev) => ({ ...prev, custodian_id: e.target.value }))}
                  disabled={!activeProjectId || custodians.length === 0}
                >
                  <option value="">{fieldWorkflowMode ? `Select ${activeWorkflowLabels.ownerSingular.toLowerCase()}` : "Select custodian"}</option>
                  {custodians.map((custodian) => (
                    <option key={`dist-custodian-${custodian.id}`} value={custodian.id}>
                      {custodian.name} ({formatTaskTypeLabel(custodian.custodian_type)})
                    </option>
                  ))}
                </select>
                <p className="green-work-field-tip">
                  {agricWorkflowMode
                    ? "Tip: select the receiving farmer or producer record."
                    : reliefWorkflowMode
                      ? "Tip: select the beneficiary or institution receiving this support package."
                    : "Tip: select the receiving custodian (household/school/group)."}
                </p>
                <input
                  type="number"
                  min={0}
                  placeholder="Allocated quantity"
                  value={newAllocation.quantity_allocated}
                  onChange={(e) =>
                    setNewAllocation((prev) => ({ ...prev, quantity_allocated: Number(e.target.value || 0) }))
                  }
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">
                  {agricWorkflowMode
                    ? "Tip: number of units assigned to this farmer."
                    : reliefWorkflowMode
                      ? "Tip: number of relief units, kits, or materials assigned to this beneficiary."
                    : "Tip: number of seedlings assigned to this custodian."}
                </p>
                <input
                  type="number"
                  min={0}
                  placeholder={fieldWorkflowMode ? "Follow-up target (visits)" : "Supervision target (visits)"}
                  value={newAllocation.supervision_target}
                  onChange={(e) =>
                    setNewAllocation((prev) => ({ ...prev, supervision_target: Number(e.target.value || 0) }))
                  }
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">
                  {fieldWorkflowMode
                    ? `Tip: number of follow-up visits planned for this ${activeWorkflowLabels.ownerSingular.toLowerCase()} support allocation.`
                    : "Tip: number of supervisor follow-up visits planned for this allocation."}
                </p>
                <input
                  type="date"
                  value={newAllocation.expected_planting_start}
                  onChange={(e) => setNewAllocation((prev) => ({ ...prev, expected_planting_start: e.target.value }))}
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">
                  {fieldWorkflowMode
                    ? "Tip: planned support start date for field follow-up."
                    : "Tip: planned planting start date for field follow-up."}
                </p>
                <input
                  type="date"
                  value={newAllocation.expected_planting_end}
                  onChange={(e) => setNewAllocation((prev) => ({ ...prev, expected_planting_end: e.target.value }))}
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">
                  {fieldWorkflowMode
                    ? "Tip: target completion date for this support cycle."
                    : "Tip: target completion date for planting this allocation."}
                </p>
                <input
                  type="number"
                  min={1}
                  placeholder="Follow-up cycle days"
                  value={newAllocation.followup_cycle_days}
                  onChange={(e) =>
                    setNewAllocation((prev) => ({ ...prev, followup_cycle_days: Number(e.target.value || 14) }))
                  }
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">
                  {fieldWorkflowMode
                    ? `Tip: how often, in days, field staff should revisit this ${activeWorkflowLabels.ownerSingular.toLowerCase()}.`
                    : "Tip: how often (in days) supervisors should revisit this custodian."}
                </p>
                <textarea
                  placeholder={fieldWorkflowMode ? "Support allocation notes" : "Allocation notes"}
                  value={newAllocation.notes}
                  onChange={(e) => setNewAllocation((prev) => ({ ...prev, notes: e.target.value }))}
                  disabled={!activeProjectId}
                />
                <p className="green-work-field-tip">Tip: note constraints, replacements, or site-specific instructions.</p>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={!activeProjectId || distributionEvents.length === 0 || custodians.length === 0}
                  onClick={() => void upsertDistributionAllocation()}
                >
                  Save Allocation
                </button>
                <p className="green-work-note">Saved allocations: {distributionAllocations.length}</p>
              </div>

                  <div className="green-work-card">
                    <h3>{fieldWorkflowMode ? `${activeWorkflowLabels.ownerSingular} Registry Report` : "Custodian Report"}</h3>
                    {!activeProjectId && <p className="green-work-note">Select a project first from Project Focus.</p>}
                    <p className="green-work-note">
                      {agricWorkflowMode
                        ? "Export includes farmer registry, support delivery, plot-by-plot evidence pages, and compliance-ready mapped boundaries. Plot photos are optional."
                        : reliefWorkflowMode
                          ? "Export includes beneficiary registry, support delivery, site-by-site evidence pages, and mapped boundaries. Site photos are optional."
                        : "Export includes custodians, distribution history, and supervision tracking. Photo appendix is optional."}
                    </p>
                    <div className="work-actions">
                      <label className="green-work-export-photo-toggle">
                        <input
                          type="checkbox"
                          checked={includePhotosInCustodianPdf}
                          onChange={(e) => setIncludePhotosInCustodianPdf(e.target.checked)}
                        />
                        {fieldWorkflowMode ? `Include ${activeWorkflowLabels.entitySingular.toLowerCase()} photos` : "Include photos"}
                      </label>
                      <button type="button" onClick={exportCustodianPdf} disabled={!activeProjectId}>
                        {agricWorkflowMode ? "Export Agric Programme PDF" : reliefWorkflowMode ? "Export Relief Programme PDF" : "Export Custodian PDF"}
                      </button>
                  </div>
                  </div>
                    </>
                  )}
                </>
              )}
                </>
              )}

          {activeForm === "existing_tree_intake" && (
            <div className="green-work-card">
              <h3>{fieldWorkflowMode ? activeWorkflowLabels.recordTitle : "Existing Trees"}</h3>
              {!activeProjectId && <p className="green-work-note">Select a project first from Project Focus.</p>}
              <p className="green-work-note">
                {activeWorkflowProfile === "agric"
                  ? "This tab shows mapped plot records captured directly in the mobile field app for this project."
                  : "This tab shows existing trees captured directly in Green for this project."}
              </p>
            </div>
          )}

          {activeForm === "super_admin" && canAccessSuperAdmin && (
            <>
              <div className="green-work-card">
                <h3>Super Admin - Organizations & Platform Monitor</h3>
                <p className="green-work-note">
                  Create partner organizations, link projects, and monitor activity across all organizations from one place.
                </p>
                <div className="green-work-flow-summary">
                  <span className="green-work-flow-pill">
                    Orgs: {adminOverview?.totals?.organizations ?? organizations.length}
                  </span>
                  <span className="green-work-flow-pill">
                    Active Orgs: {adminOverview?.totals?.active_organizations ?? 0}
                  </span>
                  <span className="green-work-flow-pill">
                    Projects: {adminOverview?.totals?.projects ?? projects.length}
                  </span>
                  <span className="green-work-flow-pill">
                    Unassigned Projects: {adminOverview?.totals?.unassigned_projects ?? 0}
                  </span>
                  <span className="green-work-flow-pill">Trees: {adminOverview?.totals?.trees ?? 0}</span>
                  <span className="green-work-flow-pill">Tasks: {adminOverview?.totals?.tasks ?? 0}</span>
                  <span className="green-work-flow-pill">
                    Pending Reviews: {adminOverview?.totals?.pending_reviews ?? 0}
                  </span>
                  <span className="green-work-flow-pill">Open Alerts: {adminOverview?.totals?.open_alerts ?? 0}</span>
                  <span className="green-work-flow-pill">Roles: {adminOverview?.totals?.roles ?? roles.length}</span>
                </div>
                <div className="work-actions">
                  <button
                    type="button"
                    onClick={() => {
                      void Promise.all([loadOrganizations(), loadProjects(), loadRoles(), loadAdminUsers(), loadAdminOverview()])
                        .then(() => toast.success("Super admin dashboard refreshed"))
                        .catch(() => toast.error("Failed to refresh super admin dashboard"));
                    }}
                  >
                    {adminOverviewLoading ? "Refreshing..." : "Refresh Monitoring"}
                  </button>
                  {editingOrganizationId && (
                    <button type="button" onClick={clearOrganizationDraft}>
                      Cancel Edit
                    </button>
                  )}
                </div>
                <div className="green-work-stack" style={{ marginTop: "0.75rem" }}>
                  <h4 style={{ margin: 0 }}>Credential Download (PDF)</h4>
                  <p className="green-work-note" style={{ marginTop: 0 }}>
                    Print organization user login usernames and access details.
                  </p>
                  <select value={adminCredentialOrgId} onChange={(e) => setAdminCredentialOrgId(e.target.value)}>
                    <option value="">Select organization</option>
                    {organizations.map((org) => (
                      <option key={`admin-cred-org-${org.id}`} value={org.id}>
                        {org.name} {org.status ? `(${org.status})` : ""}
                      </option>
                    ))}
                  </select>
                  <label className="green-work-checkbox-row">
                    <input
                      type="checkbox"
                      checked={adminCredentialIncludeInactive}
                      onChange={(e) => setAdminCredentialIncludeInactive(e.target.checked)}
                    />
                    <span>Include inactive users</span>
                  </label>
                  <div className="work-actions">
                    <button type="button" onClick={exportAdminCredentialsPdf}>
                      Export Credentials PDF
                    </button>
                  </div>
                </div>
              </div>

              <div className="green-work-card">
                <h3>{editingOrganizationId ? "Edit Organization" : "Add Organization"}</h3>
                {newOrganization.logo_url ? (
                  <div className="green-work-brand-preview">
                    <img src={toDisplayPhotoUrl(newOrganization.logo_url)} alt="Organization logo preview" loading="lazy" decoding="async" />
                    <span>Organization logo preview</span>
                  </div>
                ) : null}
                {editingOrganizationId ? (
                  <p className="green-work-note">
                    Updating organization details or logo does not send a welcome email. SVG logos are recommended for the
                    native dual-logo header.
                  </p>
                ) : (
                  <p className="green-work-note">
                    Creating a new organization can send the normal welcome email if a contact email is provided.
                  </p>
                )}
                <input
                  placeholder="Organization name"
                  value={newOrganization.name}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, name: e.target.value }))}
                />
                <input
                  placeholder="Slug (optional)"
                  value={newOrganization.slug}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, slug: e.target.value }))}
                />
                <input
                  placeholder="Short name (optional)"
                  value={newOrganization.short_name}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, short_name: e.target.value }))}
                />
                <div className="work-actions">
                  <input
                    placeholder="Logo URL (auto-filled after upload)"
                    value={newOrganization.logo_url}
                    onChange={(e) => setNewOrganization((prev) => ({ ...prev, logo_url: e.target.value }))}
                  />
                  <label className="green-work-inline-upload-btn">
                    {orgLogoUploading ? "Uploading..." : "Upload Logo"}
                    <input
                      type="file"
                      accept="image/*,.svg,image/svg+xml"
                      disabled={orgLogoUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        void onOrganizationLogoPicked(file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                <select
                  value={newOrganization.status}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="pilot">Pilot</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="suspended">Suspended</option>
                </select>
                <input
                  placeholder="Contact email"
                  value={newOrganization.contact_email}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, contact_email: e.target.value }))}
                />
                <input
                  placeholder="Contact phone"
                  value={newOrganization.contact_phone}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, contact_phone: e.target.value }))}
                />
                <input
                  placeholder="Website"
                  value={newOrganization.website_url}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, website_url: e.target.value }))}
                />
                <input
                  placeholder="Country"
                  value={newOrganization.country}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, country: e.target.value }))}
                />
                <input
                  placeholder="State / Region"
                  value={newOrganization.state_region}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, state_region: e.target.value }))}
                />
                <input
                  placeholder="City"
                  value={newOrganization.city}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, city: e.target.value }))}
                />
                <input
                  placeholder="Address"
                  value={newOrganization.address_text}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, address_text: e.target.value }))}
                />
                <textarea
                  placeholder="Notes"
                  value={newOrganization.notes}
                  onChange={(e) => setNewOrganization((prev) => ({ ...prev, notes: e.target.value }))}
                />
                <label className="green-work-checkbox-row">
                  <input
                    type="checkbox"
                    checked={newOrganization.is_active}
                    onChange={(e) => setNewOrganization((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  <span>Organization active</span>
                </label>
                <div className="work-actions">
                  <button className="btn-primary" type="button" onClick={() => void saveOrganization()}>
                    {editingOrganizationId ? "Update Organization" : "Add Organization"}
                  </button>
                  <button type="button" onClick={clearOrganizationDraft}>
                    Clear
                  </button>
                </div>
              </div>

              <div className="green-work-card">
                <h3>{editingRoleId ? "Edit Role" : "Create Role"}</h3>
                <p className="green-work-note">
                  Roles can be created with unique IDs and then assigned to users from the user directory below.
                </p>
                <input
                  placeholder="Role name (e.g. Supervisor)"
                  value={newRoleDraft.role_name}
                  onChange={(e) => setNewRoleDraft((prev) => ({ ...prev, role_name: e.target.value }))}
                />
                <div className="work-actions">
                  <input
                    placeholder="Role unique ID (optional)"
                    value={newRoleDraft.role_uid}
                    onChange={(e) => setNewRoleDraft((prev) => ({ ...prev, role_uid: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setNewRoleDraft((prev) => ({ ...prev, role_uid: generateUiUniqueId("ROL") }))}
                  >
                    Generate Role ID
                  </button>
                </div>
                <input
                  placeholder="Role key (optional, e.g. field_officer)"
                  value={newRoleDraft.role_key}
                  onChange={(e) => setNewRoleDraft((prev) => ({ ...prev, role_key: e.target.value }))}
                  disabled={Boolean(editingRoleId && roles.find((r) => Number(r.id) === editingRoleId)?.is_system)}
                />
                <input
                  placeholder="Scope (default: platform)"
                  value={newRoleDraft.scope}
                  onChange={(e) => setNewRoleDraft((prev) => ({ ...prev, scope: e.target.value }))}
                />
                <textarea
                  placeholder="Role description"
                  value={newRoleDraft.description}
                  onChange={(e) => setNewRoleDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
                <label className="green-work-checkbox-row">
                  <input
                    type="checkbox"
                    checked={newRoleDraft.is_active}
                    onChange={(e) => setNewRoleDraft((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  <span>Role active</span>
                </label>
                <div className="work-actions">
                  <button className="btn-primary" type="button" onClick={() => void saveRoleDefinition()}>
                    {editingRoleId ? "Update Role" : "Create Role"}
                  </button>
                  <button type="button" onClick={resetRoleDraft}>
                    Clear
                  </button>
                </div>
                <div className="staff-list">
                  {roles.length === 0 ? (
                    <p className="green-work-note">No roles found.</p>
                  ) : (
                    roles.map((roleDef) => (
                      <div key={`role-${roleDef.id}`} className="staff-row">
                        <div className="staff-row-head">
                          <strong>{roleDef.role_name}</strong>
                          <span>
                            {roleDef.role_key}
                            {roleDef.is_system ? " | system" : ""}
                            {roleDef.is_active === false ? " | inactive" : ""}
                          </span>
                        </div>
                        <div className="staff-row-meta">
                          ID: {roleDef.role_uid || "-"} | Scope: {roleDef.scope || "platform"}
                        </div>
                        {roleDef.description && <div className="staff-row-meta">{roleDef.description}</div>}
                        <div className="work-actions">
                          <button type="button" onClick={() => editRoleDefinition(roleDef)}>
                            Edit
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="green-work-card">
                <h3>{editingAdminUserId ? "Edit User" : "Create User"}</h3>
                <p className="green-work-note">
                  Create users with unique IDs, link them to an organization, and assign a custom role.
                </p>
                <input
                  placeholder="Full name"
                  value={adminUserDraft.full_name}
                  onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, full_name: e.target.value }))}
                />
                <div className="work-actions">
                  <input
                    placeholder="User unique ID (optional)"
                    value={adminUserDraft.user_uid}
                    onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, user_uid: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setAdminUserDraft((prev) => ({ ...prev, user_uid: generateUiUniqueId("USR") }))}
                  >
                    Generate User ID
                  </button>
                </div>
                <input
                  placeholder="Email"
                  value={adminUserDraft.email}
                  onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, email: e.target.value }))}
                />
                <input
                  placeholder="Phone"
                  value={adminUserDraft.phone}
                  onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, phone: e.target.value }))}
                />
                <select
                  value={adminUserDraft.organization_id}
                  onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, organization_id: e.target.value }))}
                >
                  <option value="">No organization (platform user)</option>
                  {organizations.map((org) => (
                    <option key={`admin-user-org-${org.id}`} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
                <select
                  value={adminUserDraft.role_id}
                  onChange={(e) => {
                    const roleId = e.target.value;
                    const roleDef = roles.find((r) => String(r.id) === String(roleId));
                    setAdminUserDraft((prev) => ({
                      ...prev,
                      role_id: roleId,
                      role: roleDef?.role_key || prev.role || "field_officer",
                    }));
                  }}
                >
                  <option value="">Select custom role (optional)</option>
                  {roles
                    .filter((r) => r.is_active !== false)
                    .map((roleDef) => (
                      <option key={`admin-user-role-${roleDef.id}`} value={roleDef.id}>
                        {roleDef.role_name} ({roleDef.role_key})
                      </option>
                    ))}
                </select>
                <input
                  placeholder="Fallback role key (used if no custom role selected)"
                  value={adminUserDraft.role}
                  onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, role: e.target.value }))}
                />
                <label className="green-work-checkbox-row">
                  <input
                    type="checkbox"
                    checked={adminUserDraft.allow_green}
                    onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, allow_green: e.target.checked }))}
                  />
                  <span>Enable LandCheck Green access</span>
                </label>
                <label className="green-work-checkbox-row">
                  <input
                    type="checkbox"
                    checked={adminUserDraft.allow_work}
                    onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, allow_work: e.target.checked }))}
                  />
                  <span>Enable LandCheck Work access</span>
                </label>
                <input
                  placeholder="Login username (optional; defaults to generated User ID)"
                  value={adminUserDraft.work_username}
                  onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, work_username: e.target.value }))}
                />
                <input
                  type="password"
                  placeholder={editingAdminUserId ? "Set / reset login password (leave blank to keep current)" : "Login password (optional: auto-generated)"}
                  value={adminUserDraft.work_password}
                  onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, work_password: e.target.value }))}
                />
                <textarea
                  placeholder="Notes"
                  value={adminUserDraft.notes}
                  onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, notes: e.target.value }))}
                />
                <label className="green-work-checkbox-row">
                  <input
                    type="checkbox"
                    checked={adminUserDraft.is_active}
                    onChange={(e) => setAdminUserDraft((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  <span>User active</span>
                </label>
                <div className="work-actions">
                  <button className="btn-primary" type="button" onClick={() => void saveAdminUser()}>
                    {editingAdminUserId ? "Update User" : "Create User"}
                  </button>
                  <button type="button" onClick={resetAdminUserDraft}>
                    Clear
                  </button>
                </div>
                {latestGeneratedUserCredentials && (
                  <div className="green-work-note" role="status" aria-live="polite">
                    <strong>Generated Login Credentials (shown once):</strong>
                    <div>
                      Name: {latestGeneratedUserCredentials.full_name} | User ID: {latestGeneratedUserCredentials.user_uid || "-"}
                    </div>
                    <div>
                      Username: <code>{latestGeneratedUserCredentials.username}</code>
                    </div>
                    <div>
                      Temporary Password: <code>{latestGeneratedUserCredentials.password}</code>
                    </div>
                    <div className="work-actions" style={{ marginTop: "0.35rem" }}>
                      <button type="button" onClick={() => void copyGeneratedUserCredentials()}>
                        Copy Credentials
                      </button>
                      <button type="button" onClick={() => setLatestGeneratedUserCredentials(null)}>
                        Clear Display
                      </button>
                    </div>
                  </div>
                )}
                <div className="staff-list">
                  {adminUsersLoading ? (
                    <p className="green-work-note">Loading user directory...</p>
                  ) : adminUsers.length === 0 ? (
                    <p className="green-work-note">No users found.</p>
                  ) : (
                    adminUsers.map((user) => (
                      <div key={`admin-user-${user.id}`} className="staff-row">
                        <div className="staff-row-head">
                          <strong>{user.full_name}</strong>
                          <span>
                            {user.role_name || user.role || "-"}
                            {user.is_active === false ? " | inactive" : ""}
                          </span>
                        </div>
                        <div className="staff-row-meta">
                          User ID: {user.user_uid || "-"} | Role Key: {user.role_key || user.role || "-"}
                        </div>
                        <div className="staff-row-meta">
                          Org: {user.organization_name || "Unassigned"} | {user.email || "-"} {user.phone ? `| ${user.phone}` : ""}
                        </div>
                        <div className="staff-row-meta">
                          Access: {user.allow_green !== false ? "Green" : "-"}{user.allow_work ? " / Work" : ""} | Login username: {user.work_username || "-"}
                        </div>
                        {user.notes && <div className="staff-row-meta">{user.notes}</div>}
                        <div className="work-actions">
                          <button type="button" onClick={() => editAdminUser(user)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void api
                                .patch(`/green/users/${user.id}`, { is_active: user.is_active === false })
                                .then(async () => {
                                  await Promise.all([loadUsers(), loadAdminUsers(), loadAdminOverview()]);
                                  toast.success(user.is_active === false ? "User activated" : "User deactivated");
                                })
                                .catch((error: any) => {
                                  toast.error(error?.response?.data?.detail || "Failed to update user status");
                                });
                            }}
                          >
                            {user.is_active === false ? "Activate" : "Deactivate"}
                          </button>
                          <button type="button" onClick={() => void resetAdminUserPasswordAndEmail(user)}>
                            Reset + Email
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const label = String(user.full_name || `user #${user.id}`);
                              const confirmed = window.confirm(
                                `Delete ${label}? This removes the user login and profile from LandCheck Work/Green.`
                              );
                              if (!confirmed) return;
                              void api
                                .delete(`/green/users/${user.id}`)
                                .then(async () => {
                                  if (Number(editingAdminUserId || 0) === Number(user.id)) {
                                    resetAdminUserDraft();
                                  }
                                  await Promise.all([loadUsers(), loadAdminUsers(), loadAdminOverview()]);
                                  toast.success("User deleted");
                                })
                                .catch((error: any) => {
                                  toast.error(error?.response?.data?.detail || "Failed to delete user");
                                });
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="green-work-card">
                <h3>Organizations Monitoring</h3>
                <p className="green-work-note">Monitor projects, trees, tasks, reviews, and alerts per organization.</p>
                <div className="staff-list">
                  {(adminOverview?.organizations || organizations).length === 0 ? (
                    <p className="green-work-note">No organizations yet.</p>
                  ) : (
                    (adminOverview?.organizations || organizations).map((org) => (
                      <div key={`org-${org.id}`} className="staff-row">
                        <div className="staff-row-head">
                          <strong>{org.name}</strong>
                          <span>
                            {(org.status || "pilot").toString()}
                            {org.is_active === false ? " - inactive" : ""}
                          </span>
                        </div>
                        {org.logo_url ? (
                          <div className="green-work-brand-preview compact">
                            <img src={toDisplayPhotoUrl(org.logo_url)} alt={`${org.name} logo`} loading="lazy" decoding="async" />
                            <span>Logo attached</span>
                          </div>
                        ) : null}
                        <div className="staff-row-meta">
                          Slug: {org.slug || "-"} | Projects: {Number(org.projects_count || 0)} | Trees:{" "}
                          {Number(org.trees_count || 0)} | Tasks: {Number(org.tasks_count || 0)}
                        </div>
                        <div className="staff-row-meta">
                          Pending Reviews: {Number(org.pending_review_count || 0)} | Open Alerts: {Number(org.open_alert_count || 0)}
                          {org.last_activity_at ? ` | Last Activity: ${new Date(org.last_activity_at).toLocaleString()}` : ""}
                        </div>
                        <div className="staff-row-meta">
                          {org.contact_email || "-"} {org.contact_phone ? `| ${org.contact_phone}` : ""}{" "}
                          {org.city || org.country ? `| ${[org.city, org.country].filter(Boolean).join(", ")}` : ""}
                        </div>
                        <div className="work-actions">
                          <button type="button" onClick={() => editOrganization(org)}>
                            Edit
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="green-work-card">
                <h3>Project Organization Assignment</h3>
                <p className="green-work-note">
                  Link each project to an organization so monitoring, reporting, and future access controls stay organized.
                </p>
                <div className="staff-list">
                  {projects.length === 0 ? (
                    <p className="green-work-note">No projects found.</p>
                  ) : (
                    projects.map((project) => (
                      <div key={`project-org-${project.id}`} className="staff-row">
                        <div className="staff-row-head">
                          <strong>{project.name}</strong>
                          <span>{project.location_text || "No location"}</span>
                        </div>
                        <div className="staff-row-meta">
                          Current organization: {project.organization_name || "Unassigned"}
                        </div>
                        <div className="work-actions">
                          <select
                            value={project.organization_id ? String(project.organization_id) : ""}
                            onChange={(e) => void assignProjectOrganization(project.id, e.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {organizations.map((org) => (
                              <option key={`project-org-option-${project.id}-${org.id}`} value={org.id}>
                                {org.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="green-work-card">
                <h3>Recent Platform Activity</h3>
                <p className="green-work-note">Latest audit events across all organizations and projects.</p>
                <div className="staff-list">
                  {(adminOverview?.recent_activity || []).length === 0 ? (
                    <p className="green-work-note">No recent activity yet.</p>
                  ) : (
                    (adminOverview?.recent_activity || []).slice(0, 40).map((event) => (
                      <div key={`admin-activity-${event.id}`} className="staff-row">
                        <div className="staff-row-head">
                          <strong>{event.action || "activity"}</strong>
                          <span>{event.created_at ? new Date(event.created_at).toLocaleString() : "-"}</span>
                        </div>
                        <div className="staff-row-meta">
                          Org: {event.organization_name || "Unassigned"} | Project: {event.project_name || "n/a"}
                        </div>
                        <div className="staff-row-meta">
                          Entity: {event.entity_type || "-"} #{event.entity_id ?? "-"} | Actor: {event.actor || "system"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {activeForm === "create_project" && (
            <div className="green-work-card">
              <h3>Create Project</h3>
              {canAccessSuperAdmin ? (
                <>
                  <select
                    value={newProject.organization_id}
                    onChange={(e) => setNewProject({ ...newProject, organization_id: e.target.value })}
                  >
                    <option value="">No organization (unassigned)</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} {org.status ? `(${org.status})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="green-work-note">
                    Link project to an organization now, or assign it later in Super Admin.
                  </p>
                </>
              ) : (
                <p className="green-work-note">
                  Organization: <strong>{workAuthSession?.user?.organization_name || "Assigned organization"}</strong>
                  {" "} (projects created here are automatically linked to your organization).
                </p>
              )}
              <input
                placeholder="Project name"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              />
              <select
                value={newProject.workflow_profile}
                onChange={(e) => setNewProject({ ...newProject, workflow_profile: normalizeWorkflowProfile(e.target.value) })}
              >
                <option value="green">Green workflow</option>
                <option value="agric">Agric workflow</option>
                <option value="relief_recovery">Relief &amp; Recovery workflow</option>
              </select>
              <select
                value={newProject.access_model}
                onChange={(e) =>
                  setNewProject({
                    ...newProject,
                    access_model: normalizeProjectAccessModel(e.target.value),
                    public_sponsor_enabled: normalizeProjectAccessModel(e.target.value) === "public_sponsorship",
                  })
                }
              >
                <option value="partner_org">Partner organization route</option>
                {canAccessSuperAdmin ? <option value="public_sponsorship">Public sponsorship route</option> : null}
              </select>
              {!canAccessSuperAdmin ? (
                <p className="green-work-note">Only super admin can create a public sponsorship project.</p>
              ) : null}
              <input
                placeholder="Location"
                value={newProject.location_text}
                onChange={(e) => setNewProject({ ...newProject, location_text: e.target.value })}
              />
              <input
                placeholder="Sponsor"
                value={newProject.sponsor}
                onChange={(e) => setNewProject({ ...newProject, sponsor: e.target.value })}
              />
              {newProject.access_model === "public_sponsorship" && canAccessSuperAdmin ? (
                <>
                  <p className="green-work-note">
                    Public sponsor projects appear automatically in the sponsor app once they are created.
                  </p>
                  <p className="green-work-note">
                    Sponsor app pricing preview: {formatProjectSponsorPriceChoices({
                      sponsor_price_per_tree_ngn: Number(newProject.sponsor_price_per_tree_ngn || 0) || null,
                      sponsor_price_per_tree_usd: Number(newProject.sponsor_price_per_tree_usd || 0) || null,
                      sponsor_price_per_tree: null,
                      sponsor_currency: "NGN",
                    })}
                  </p>
                  <input
                    placeholder="Public sponsor title"
                    value={newProject.public_sponsor_title}
                    onChange={(e) => setNewProject({ ...newProject, public_sponsor_title: e.target.value })}
                  />
                  <textarea
                    placeholder="Public sponsor description"
                    value={newProject.public_sponsor_description}
                    onChange={(e) => setNewProject({ ...newProject, public_sponsor_description: e.target.value })}
                    rows={4}
                  />
                  <input
                    placeholder="Price per tree (NGN)"
                    type="number"
                    min="0"
                    step="100"
                    value={newProject.sponsor_price_per_tree_ngn}
                    onChange={(e) => setNewProject({ ...newProject, sponsor_price_per_tree_ngn: e.target.value })}
                  />
                  <input
                    placeholder="Price per tree (USD)"
                    type="number"
                    min="0"
                    step="1"
                    value={newProject.sponsor_price_per_tree_usd}
                    onChange={(e) => setNewProject({ ...newProject, sponsor_price_per_tree_usd: e.target.value })}
                  />
                  <p className="green-work-note">
                    Sponsors will see both prices in the public app and choose their checkout currency. Field-agent earnings stay in NGN.
                  </p>
                  <input
                    placeholder="Total trees planned (sponsorship target)"
                    type="number"
                    min="0"
                    step="1"
                    value={newProject.sponsor_capacity}
                    onChange={(e) => setNewProject({ ...newProject, sponsor_capacity: e.target.value })}
                  />
                  <input
                    placeholder="Max trees per order"
                    type="number"
                    min="1"
                    step="1"
                    value={newProject.sponsor_max_per_order}
                    onChange={(e) => setNewProject({ ...newProject, sponsor_max_per_order: e.target.value })}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={newProject.sponsor_dedication_enabled}
                      onChange={(e) => setNewProject({ ...newProject, sponsor_dedication_enabled: e.target.checked })}
                    />
                    Allow dedication / memorial messages
                  </label>
                  <textarea
                    placeholder="Payment instructions shown to public sponsors"
                    value={newProject.sponsor_payment_instructions}
                    onChange={(e) => setNewProject({ ...newProject, sponsor_payment_instructions: e.target.value })}
                    rows={4}
                  />
                  <p className="green-work-note">
                    Optional sponsor-agent rates. Leave blank to use automatic defaults from the sponsor price per tree.
                  </p>
                  <input
                    placeholder="Agent planting fee per linked tree"
                    type="number"
                    min="0"
                    step="100"
                    value={newProject.sponsor_agent_planting_fee}
                    onChange={(e) => setNewProject({ ...newProject, sponsor_agent_planting_fee: e.target.value })}
                  />
                  <input
                    placeholder="Agent maintenance fee per approved visit"
                    type="number"
                    min="0"
                    step="100"
                    value={newProject.sponsor_agent_maintenance_fee}
                    onChange={(e) => setNewProject({ ...newProject, sponsor_agent_maintenance_fee: e.target.value })}
                  />
                </>
              ) : null}
              {newProject.workflow_profile === "agric" ? (
                <>
                  <select
                    value={newProject.agric_program_type}
                    onChange={(e) => setNewProject({ ...newProject, agric_program_type: e.target.value })}
                  >
                    <option value="extension_support">Extension support</option>
                    <option value="input_support">Input support</option>
                    <option value="traceability">Traceability</option>
                    <option value="finance_insurance">Finance & insurance</option>
                    <option value="mixed">Mixed</option>
                  </select>
                  <input
                    placeholder="Focus commodities"
                    value={newProject.agric_focus_commodities}
                    onChange={(e) => setNewProject({ ...newProject, agric_focus_commodities: e.target.value })}
                  />
                  <input
                    placeholder="Support packages"
                    value={newProject.agric_support_packages}
                    onChange={(e) => setNewProject({ ...newProject, agric_support_packages: e.target.value })}
                  />
                  <input
                    placeholder="Season label"
                    value={newProject.agric_season_label}
                    onChange={(e) => setNewProject({ ...newProject, agric_season_label: e.target.value })}
                  />
                </>
              ) : newProject.workflow_profile === "relief_recovery" ? (
                <>
                  <select
                    value={newProject.relief_program_type}
                    onChange={(e) => setNewProject({ ...newProject, relief_program_type: e.target.value })}
                  >
                    <option value="emergency_relief">Emergency relief</option>
                    <option value="shelter_recovery">Shelter recovery</option>
                    <option value="construction_materials">Construction materials</option>
                    <option value="infrastructure_rehab">Infrastructure rehabilitation</option>
                    <option value="cash_voucher">Cash & voucher</option>
                    <option value="mixed">Mixed</option>
                  </select>
                  <input
                    placeholder="Intervention focus"
                    value={newProject.relief_intervention_focus}
                    onChange={(e) => setNewProject({ ...newProject, relief_intervention_focus: e.target.value })}
                  />
                  <input
                    placeholder="Package types"
                    value={newProject.relief_package_types}
                    onChange={(e) => setNewProject({ ...newProject, relief_package_types: e.target.value })}
                  />
                  <input
                    placeholder="Target zone / LGA cluster"
                    value={newProject.relief_target_zone}
                    onChange={(e) => setNewProject({ ...newProject, relief_target_zone: e.target.value })}
                  />
                </>
              ) : null}
              <button className="btn-primary" onClick={createProject}>
                Create Project
              </button>
            </div>
          )}

          {activeForm === "add_user" && (
            <div className="green-work-card">
              <h3>Add User</h3>
              <input
                placeholder="Full name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
              />
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="field_officer">Field Officer</option>
                <option value="volunteer">Volunteer</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="btn-primary" onClick={createUser}>
                Add User
              </button>
            </div>
          )}

          {activeForm === "users" && (
            <div className="green-work-card">
              <h3>Users & Staff</h3>
              {!activeProjectId && <p className="green-work-note">Select project focus to load full assignment status.</p>}
              <p className="green-work-note">Right-click a staff row to assign tree planting or maintenance.</p>
              {publicSponsorshipProject && canAccessSuperAdmin ? (
                <div className="green-work-card" style={{ marginBottom: 14 }}>
                  <h3>Public Sponsor Agents</h3>
                  <p className="green-work-note">
                    Choose which staff can receive sponsor-funded planting and maintenance work in this public sponsor project.
                    Only active Green-enabled users can be selected, and only selected agents will appear in assignment lists.
                  </p>
                  <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                    <span className="green-work-live-pill neutral">Available staff: {eligiblePublicSponsorUsers.length}</span>
                    <span className="green-work-live-pill ok">Selected agents: {projectSettingsDraft.public_sponsor_agent_user_ids.length}</span>
                  </div>
                  <div className="work-actions" style={{ marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() =>
                        setProjectSettingsDraft((prev) => ({
                          ...prev,
                          public_sponsor_agent_user_ids: eligiblePublicSponsorUsers.map((user) => Number(user.id || 0)).filter((id) => id > 0),
                        }))
                      }
                      disabled={!eligiblePublicSponsorUsers.length || savingPublicSponsorAgents}
                    >
                      Select All Project Staff
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setProjectSettingsDraft((prev) => ({ ...prev, public_sponsor_agent_user_ids: [] }))
                      }
                      disabled={!projectSettingsDraft.public_sponsor_agent_user_ids.length || savingPublicSponsorAgents}
                    >
                      Clear Agents
                    </button>
                    <button type="button" onClick={() => void savePublicSponsorAgents()} disabled={savingPublicSponsorAgents}>
                      {savingPublicSponsorAgents ? "Saving..." : "Save Agent List"}
                    </button>
                  </div>
                  {eligiblePublicSponsorUsers.length === 0 ? (
                    <p className="green-work-note">No active Green-enabled project staff found for this organization yet.</p>
                  ) : (
                    <div className="staff-list">
                      {eligiblePublicSponsorUsers.map((user) => {
                        const selected = projectSettingsDraft.public_sponsor_agent_user_ids.includes(Number(user.id || 0));
                        return (
                          <div key={`public-sponsor-agent-${user.id}`} className="staff-row">
                            <div className="staff-row-head">
                              <strong>{user.full_name}</strong>
                              <span>{formatRoleLabel(user.role)}</span>
                            </div>
                            <div className="staff-row-meta">
                              Org: {user.organization_name || "Unassigned"} | Login: {user.work_username || "-"}
                            </div>
                            <div className="staff-row-meta">
                              Access: {user.allow_green !== false ? "Green" : "-"}{user.allow_work ? " / Work" : ""}
                            </div>
                            <label className="green-work-checkbox-row" style={{ marginTop: 8 }}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  setProjectSettingsDraft((prev) => ({
                                    ...prev,
                                    public_sponsor_agent_user_ids: selected
                                      ? prev.public_sponsor_agent_user_ids.filter((id) => id !== Number(user.id || 0))
                                      : [...prev.public_sponsor_agent_user_ids, Number(user.id || 0)],
                                  }))
                                }
                                disabled={savingPublicSponsorAgents}
                              />
                              <span>{selected ? "Assigned as sponsor agent" : "Select as sponsor agent"}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
              {visibleUserWorkSummary.length === 0 && (
                <p className="green-work-note">
                  {publicSponsorshipProject
                    ? "No public sponsor agents selected yet."
                    : "No users found."}
                </p>
              )}
              <div className="staff-list">
                {visibleUserWorkSummary.map((item) => (
                  <button
                    key={item.user.id}
                    type="button"
                    className="staff-row"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (!activeProjectId) {
                        toast("Select an active project first.");
                        return;
                      }
                      setLiveTreeMenu(null);
                      setStaffMenu({ user: item.user, x: event.clientX, y: event.clientY });
                    }}
                  >
                    <div className="staff-row-head">
                      <strong>{item.user.full_name}</strong>
                      <span>{item.position}</span>
                    </div>
                    <div className="staff-row-meta">
                      Planting: {item.orderCount} orders | Target: {item.targetTrees} | Planted: {item.plantedTrees}
                    </div>
                    <div className="staff-row-meta">
                      Maintenance: {item.totalTasks} tasks | Done: {item.doneTasks} | Pending: {item.pendingTasks}
                    </div>
                    <div className="staff-row-meta">
                      User ID: {item.user.user_uid || "-"} | Org: {item.user.organization_name || "Unassigned"}
                    </div>
                    <div className={`staff-row-status ${item.statusTone}`}>{item.statusLabel}</div>
                    <div className="progress-bar">
                      <span style={{ width: `${calcProgress(item.plantedTrees, item.targetTrees)}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeForm === "sponsors" && (
            <div className="green-work-card">
              <h3>Public Sponsors</h3>
              {!publicSponsorshipProject ? (
                <p className="green-work-note">Switch this project to the Public Sponsorship access route first.</p>
              ) : sponsorshipOrdersLoading ? (
                <p className="green-work-note">Loading sponsor accounts...</p>
              ) : (
                <>
                  <div className="work-actions" style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => {
                        void loadSponsorAccounts();
                        if (activeProjectId) void loadSponsorshipOrders(activeProjectId, { forceSync: true });
                        if (activeProjectId) void loadSponsorQrStatus(activeProjectId, { forceSync: true });
                      }}
                    >
                      Refresh Sponsors
                    </button>
                  </div>
                  <p className="green-work-note">
                    Public sponsor accounts are global across the sponsor route. Signups without a chosen project still appear
                    here, and paid, pending, and flagged counts reflect their checkout history.
                  </p>
                  <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                    <span className="green-work-live-pill neutral">Signups: {sponsorAccountSummary.total}</span>
                    <span className="green-work-live-pill ok">Paid sponsors: {sponsorAccountSummary.paid}</span>
                    <span className="green-work-live-pill warning">Awaiting payment: {sponsorAccountSummary.awaiting}</span>
                    <span className="green-work-live-pill danger">Flagged: {sponsorAccountSummary.issue}</span>
                    <span className="green-work-live-pill info">Signed up only: {sponsorAccountSummary.signupOnly}</span>
                    <span className="green-work-live-pill neutral">Awaiting planting: {sponsorAccountSummary.awaitingTreeUnits}</span>
                  </div>
                  {sponsorshipOrdersScopeNote ? <p className="green-work-note">{sponsorshipOrdersScopeNote}</p> : null}
                  {sponsorshipOrdersError ? <p className="green-work-note danger">{sponsorshipOrdersError}</p> : null}
                  {sponsorAccounts.length === 0 ? (
                    <p className="green-work-note">No sponsor accounts have signed up yet.</p>
                  ) : (
                    <div className="staff-list">
                      {sponsorAccounts.map((sponsor) => {
                        const hasOrders = sponsor.orders_count > 0;
                        return (
                          <div key={`sponsor-${sponsor.id}`} className="staff-row">
                            <div className="staff-row-head">
                              <strong>{sponsor.full_name}</strong>
                              <span>{formatTaskTypeLabel(sponsor.account_type || "individual")}</span>
                              {sponsor.is_guest ? (
                                <span className="green-work-live-pill warning" title="Checked out without creating a password — hasn't claimed their account yet">
                                  Guest (unclaimed)
                                </span>
                              ) : sponsor.claimed_at ? (
                                <span className="green-work-live-pill ok" title="Started as a guest checkout, later claimed a full account">
                                  Claimed from guest
                                </span>
                              ) : null}
                            </div>
                            <div className="work-actions" style={{ margin: "8px 0 6px", flexWrap: "wrap" }}>
                              {Number(sponsor.project_orders_count || 0) > 0 ? (
                                <span className="green-work-live-pill info">
                                  This project: {Number(sponsor.project_orders_count || 0)} order{Number(sponsor.project_orders_count || 0) === 1 ? "" : "s"}
                                </span>
                              ) : null}
                              <span className={`green-work-live-pill ${sponsor.verified_orders_count > 0 ? "ok" : "neutral"}`}>
                                Paid: {sponsor.verified_orders_count}
                              </span>
                              <span className={`green-work-live-pill ${sponsor.pending_orders_count > 0 ? "warning" : "neutral"}`}>
                                Awaiting: {sponsor.pending_orders_count}
                              </span>
                              <span className={`green-work-live-pill ${sponsor.issue_orders_count > 0 ? "danger" : "neutral"}`}>
                                Flagged: {sponsor.issue_orders_count}
                              </span>
                              <span className={`green-work-live-pill ${hasOrders ? "info" : "neutral"}`}>
                                {hasOrders ? `Orders: ${sponsor.orders_count}` : "Signed up only"}
                              </span>
                            </div>
                            <div className="work-actions" style={{ margin: "0 0 6px", flexWrap: "wrap" }}>
                              <span className="green-work-live-pill info" style={{ backgroundColor: "#fbf7ee", border: "1px solid rgba(197, 160, 89, 0.35)", color: "#b8860b", fontWeight: "bold" }}>
                                🏆 {sponsor.achievement_level || "Climate Contributor"}
                              </span>
                              <span className="green-work-live-pill neutral">
                                Category: {sponsor.entity_category || "individual"}
                              </span>
                              <span className={`green-work-live-pill ${sponsor.leaderboard_visibility === "public" ? "ok" : "neutral"}`}>
                                Visibility: {sponsor.leaderboard_visibility || "public"}
                              </span>
                            </div>
                            <div className="staff-row-meta">
                              Organization: {sponsor.organization_name || "-"} | Email: {sponsor.email || "-"}
                            </div>
                            <div className="staff-row-meta" style={{ marginTop: 6, padding: '4px 8px', backgroundColor: '#f9fcf9', borderRadius: 4, border: '1px dashed #2aa852' }}>
                              <div><strong>Green Points Balance:</strong> {sponsor.green_points ?? 0} GP | <strong>Lifetime Points:</strong> {sponsor.lifetime_points ?? 0} GP</div>
                              <div><strong>Referral Code:</strong> <code>{sponsor.referral_code || "None"}</code> | <strong>Rules Met:</strong> {sponsor.referral_rules_met ? "✅ Yes" : "❌ No"}</div>
                              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                                Criteria: Sponsored trees: {sponsor.personal_trees_sponsored ?? 0} (req &gt;= 1) | Referred signups: {sponsor.total_referred_users ?? 0} (Converted: {sponsor.converted_referred_users ?? 0}, Conv. Rate: {sponsor.referral_conversion_rate ? `${Math.round(sponsor.referral_conversion_rate * 100)}%` : "0%"} - req &gt;= 20%)
                              </div>
                            </div>
                            <div className="staff-row-meta" style={{ marginTop: 6 }}>
                              Monthly trees (this month): <strong>{sponsor.monthly_trees || 0}</strong> | All-time trees: <strong>{sponsor.all_time_trees || 0}</strong>
                            </div>
                            <div className="staff-row-meta">
                              Orders: {sponsor.orders_count} | Linked trees: {sponsor.linked_units} | Awaiting planting:{" "}
                              {sponsor.awaiting_tree_units}
                            </div>
                            {Number(sponsor.project_orders_count || 0) > 0 ? (
                              <div className="staff-row-meta">
                                Current project spend: {formatCurrencyBreakdownMap(sponsorProjectSpendById.get(Number(sponsor.id || 0)) || {})} | Current project awaiting payment:{" "}
                                {Number(sponsor.project_pending_orders_count || 0)} | Current project awaiting planting: {Number(sponsor.project_awaiting_tree_units || 0)}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ marginTop: 18 }}>
                    <h4>Sponsor QR Tag Status</h4>
                    <p className="green-work-note" style={{ marginLeft: 0 }}>
                      This shows each paid sponsor unit reserved for planting, whether its QR tag has already been downloaded,
                      which field agent it was reserved for, and the total number of downloads recorded so far.
                    </p>
                    <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                      <span className="green-work-live-pill neutral">Reserved tags: {sponsorQrStatusRows.length}</span>
                      <span className="green-work-live-pill ok">
                        Downloaded: {sponsorQrStatusRows.filter((row: any) => Number(row.qr_download_count || 0) > 0).length}
                      </span>
                      <span className="green-work-live-pill warning">
                        Pending: {sponsorQrStatusRows.filter((row: any) => Number(row.qr_download_count || 0) <= 0).length}
                      </span>
                    </div>
                    {sponsorQrStatusLoading ? (
                      <p className="green-work-note">Loading sponsor QR status...</p>
                    ) : sponsorQrStatusError ? (
                      <p className="green-work-note danger">{sponsorQrStatusError}</p>
                    ) : sponsorQrStatusRows.length === 0 ? (
                      <p className="green-work-note">No sponsor QR reservations are visible for this project yet.</p>
                    ) : (
                      <table className="green-work-table">
                        <thead>
                          <tr>
                            <th>Sponsor</th>
                            <th>QR Ref</th>
                            <th>Unit Status</th>
                            <th>Agent</th>
                            <th>Downloads</th>
                            <th>Last Download</th>
                            <th>Tree Link</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sponsorQrStatusRows.map((row: any) => (
                            <tr key={`sponsor-qr-${row.unit_id}`}>
                              <td>
                                <strong>{row.sponsor_name || row.sponsor_organization_name || `Sponsor #${row.sponsor_account_id || row.unit_id}`}</strong>
                                {row.dedication_type || row.dedication_name ? (
                                  <div style={{ fontSize: 11, color: "#56705f", marginTop: 4 }}>
                                    {`Dedication: ${formatTaskTypeLabel(row.dedication_type || "self")}`}
                                    {row.dedication_name ? ` | ${row.dedication_name}` : ""}
                                  </div>
                                ) : null}
                              </td>
                              <td>
                                <div>{row.unit_uid || `Unit #${row.unit_id}`}</div>
                                {row.species ? (
                                  <div style={{ fontSize: 11, color: "#56705f", marginTop: 4 }}>
                                    Species: {row.species}
                                  </div>
                                ) : null}
                              </td>
                              <td>
                                <span className={`green-work-live-pill ${Number(row.qr_download_count || 0) > 0 ? "ok" : "warning"}`}>
                                  {row.download_status === "downloaded" ? "Downloaded" : "Pending download"}
                                </span>
                                <div style={{ fontSize: 11, color: "#56705f", marginTop: 4 }}>
                                  {formatTaskTypeLabel(row.sponsorship_status || "awaiting_tree")}
                                </div>
                              </td>
                              <td>
                                {row.assigned_agent_name || row.assigned_agent_username || "-"}
                                {row.assigned_at ? (
                                  <div style={{ fontSize: 11, color: "#56705f", marginTop: 4 }}>
                                    Reserved {new Date(row.assigned_at).toLocaleString()}
                                  </div>
                                ) : null}
                              </td>
                              <td style={{ fontWeight: 800 }}>{Number(row.qr_download_count || 0)}</td>
                              <td>{row.last_qr_downloaded_at ? new Date(row.last_qr_downloaded_at).toLocaleString() : "-"}</td>
                              <td>
                                {row.tree_project_no ? `Tree #${row.tree_project_no}` : row.tree_id ? `Tree ID ${row.tree_id}` : "Awaiting planting"}
                              </td>
                              <td>
                                {canAccessSuperAdmin && !row.tree_id && String(row.sponsorship_status || "").trim().toLowerCase() === "awaiting_tree" ? (
                                  <div style={{ display: "grid", gap: 8, minWidth: 200 }}>
                                    <select
                                      value={Number(sponsorQrReissueSelections[row.unit_id] || row.assigned_user_id || 0) > 0 ? Number(sponsorQrReissueSelections[row.unit_id] || row.assigned_user_id || 0) : ""}
                                      onChange={(event) =>
                                        setSponsorQrReissueSelections((prev) => ({
                                          ...prev,
                                          [row.unit_id]: Number(event.target.value || 0),
                                        }))
                                      }
                                      disabled={reissuingSponsorQrUnitId === Number(row.unit_id)}
                                    >
                                      <option value="">Choose sponsor agent</option>
                                      {sponsorQrAgentOptions.map((user) => (
                                        <option key={`sponsor-qr-agent-${row.unit_id}-${user.id}`} value={Number(user.id || 0)}>
                                          {user.full_name}
                                          {user.work_username ? ` (${user.work_username})` : ""}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void reissueSponsorQrUnit(
                                          Number(row.unit_id || 0),
                                          Number(sponsorQrReissueSelections[row.unit_id] || row.assigned_user_id || 0),
                                        )
                                      }
                                      disabled={
                                        reissuingSponsorQrUnitId === Number(row.unit_id) ||
                                        !(Number(sponsorQrReissueSelections[row.unit_id] || row.assigned_user_id || 0) > 0)
                                      }
                                    >
                                      {reissuingSponsorQrUnitId === Number(row.unit_id) ? "Reissuing..." : "Reissue Tag"}
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ color: "#56705f", fontSize: 12 }}>
                                    {row.tree_id ? "Tree already linked" : "No action"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeForm === "sponsorship_orders" && (
            <div className="green-work-card">
              <h3>Sponsorship Payments</h3>
              {!publicSponsorshipProject ? (
                <p className="green-work-note">Switch this project to the Public Sponsorship access route first.</p>
              ) : sponsorshipOrdersLoading ? (
                <p className="green-work-note">Loading sponsorship orders...</p>
              ) : sponsorshipOrders.length === 0 && !sponsorshipOrdersError ? (
                <p className="green-work-note">No sponsorship orders found for this project yet.</p>
              ) : (
                <>
                  <div className="work-actions" style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => {
                        void loadSponsorAccounts();
                        if (activeProjectId) void loadSponsorshipOrders(activeProjectId);
                      }}
                    >
                      Refresh Payments
                    </button>
                  </div>
                  <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                    <span className="green-work-live-pill ok">Successful: {sponsorshipOrderSummary.successful}</span>
                    <span className="green-work-live-pill warning">Awaiting: {sponsorshipOrderSummary.awaiting}</span>
                    <span className="green-work-live-pill danger">Flagged: {sponsorshipOrderSummary.issue}</span>
                    <span className="green-work-live-pill info">Awaiting planting: {sponsorshipOrderSummary.awaitingTreeUnits}</span>
                    <span className="green-work-live-pill neutral">Linked trees: {sponsorshipOrderSummary.linkedUnits}</span>
                  </div>
                  {sponsorshipOrdersScopeNote ? <p className="green-work-note">{sponsorshipOrdersScopeNote}</p> : null}
                  {sponsorshipOrdersError ? <p className="green-work-note danger">{sponsorshipOrdersError}</p> : null}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(280px, 0.9fr)", gap: 16, alignItems: "start" }}>
                    <div>
                      {([
                        {
                          key: "successful",
                          title: "Successful Payments",
                          tone: "ok",
                          rows: sponsorshipOrderBuckets.successful,
                        },
                        {
                          key: "awaiting",
                          title: "Awaiting / Pending Payments",
                          tone: "warning",
                          rows: sponsorshipOrderBuckets.awaiting,
                        },
                        {
                          key: "issue",
                          title: "Flagged / Unsuccessful Payments",
                          tone: "danger",
                          rows: sponsorshipOrderBuckets.issue,
                        },
                      ] as Array<{
                        key: string;
                        title: string;
                        tone: "ok" | "warning" | "danger";
                        rows: SponsorshipOrderRecord[];
                      }>)
                        .filter((section) => section.rows.length > 0)
                        .map((section) => (
                          <div key={`sponsor-payment-section-${section.key}`} style={{ marginBottom: 18 }}>
                            <div className="work-actions" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                              <span className={`green-work-live-pill ${section.tone}`}>{section.title}</span>
                              <span className="green-work-live-pill neutral">
                                {section.rows.length} order{section.rows.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="staff-list">
                              {section.rows.map((order) => {
                                const gatewayManaged = String(order.payment_method || "").trim().toLowerCase() === "flutterwave_standard";
                                const gatewayVerified = String(order.payment_status || "").trim().toLowerCase() === "verified";
                                return (
                                  <div key={`sponsor-order-${section.key}-${order.id}`} className="staff-row">
                                    <div className="staff-row-head">
                                      <strong>{order.sponsor_name || `Sponsor #${order.sponsor_account_id || order.id}`}</strong>
                                      <span>
                                        {order.order_uid || `Order #${order.id}`} | {formatCurrencyAmount(order.amount_total, order.currency)}
                                      </span>
                                    </div>
                                    <div className="work-actions" style={{ margin: "8px 0 6px", flexWrap: "wrap" }}>
                                      <span className={`green-work-live-pill ${section.tone}`}>{section.title.replace(" Payments", "")}</span>
                                      <span className={`green-work-live-pill ${gatewayVerified ? "ok" : section.tone}`}>
                                        Payment: {formatTaskTypeLabel(order.payment_status || "pending")}
                                      </span>
                                      <span className="green-work-live-pill neutral">
                                        Order: {formatTaskTypeLabel(order.order_status || "pending")}
                                      </span>
                                    </div>
                                    <div className="staff-row-meta">
                                      Trees: {Number(order.quantity || 0)} | Linked: {Number(order.linked_units || 0)} | Awaiting tree:{" "}
                                      {Number(order.awaiting_tree_units || 0)}
                                    </div>
                                    <div className="staff-row-meta">
                                      {order.payment_reference ? `Ref: ${order.payment_reference} | ` : ""}
                                      Method: {gatewayManaged ? "Flutterwave secure checkout" : formatTaskTypeLabel(order.payment_method || "manual_transfer")}
                                      {order.payment_gateway_status ? ` | Gateway: ${formatTaskTypeLabel(order.payment_gateway_status)}` : ""}
                                      {order.payment_gateway_reference ? ` | Tx Ref: ${order.payment_gateway_reference}` : ""}
                                    </div>
                                    <div className="staff-row-meta">
                                      Sponsor email: {order.sponsor_email || "-"}
                                      {order.dedication_name ? ` | Dedication: ${order.dedication_name}` : ""}
                                    </div>
                                    {order.project_name ? (
                                      <div className="staff-row-meta">
                                        Project: {order.project_name}
                                        {order.location_text ? ` | ${order.location_text}` : ""}
                                      </div>
                                    ) : null}
                                    {Number(order.awaiting_tree_units || 0) > 0 ? (
                                      <div
                                        style={{
                                          marginTop: 10,
                                          padding: 12,
                                          borderRadius: 14,
                                          border: "1px solid #cfe6d3",
                                          background: "#f5fbf6",
                                        }}
                                      >
                                        <div className="staff-row-meta" style={{ marginBottom: 8 }}>
                                          Manual QR assignment: send the pending sponsor QR tags in this paid order directly to one field agent.
                                        </div>
                                        <div className="work-actions" style={{ flexWrap: "wrap" }}>
                                          <select
                                            value={String(sponsorshipOrderAgentSelections[order.id] || "")}
                                            onChange={(e) =>
                                              setSponsorshipOrderAgentSelections((prev) => ({
                                                ...prev,
                                                [order.id]: Number(e.target.value || 0),
                                              }))
                                            }
                                            disabled={!sponsorQrAgentOptions.length || assigningSponsorOrderId === order.id}
                                          >
                                            <option value="">Select sponsor agent</option>
                                            {sponsorQrAgentOptions.map((user) => (
                                              <option key={`sponsor-order-agent-${order.id}-${user.id}`} value={user.id}>
                                                {user.full_name}
                                              </option>
                                            ))}
                                          </select>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void assignSponsorOrderQrTags(
                                                Number(order.id || 0),
                                                Number(sponsorshipOrderAgentSelections[order.id] || 0),
                                              )
                                            }
                                            disabled={
                                              assigningSponsorOrderId === order.id ||
                                              !(Number(sponsorshipOrderAgentSelections[order.id] || 0) > 0)
                                            }
                                          >
                                            {assigningSponsorOrderId === order.id ? "Assigning..." : "Assign Pending QR Tags"}
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                    {gatewayManaged ? (
                                      <div className="staff-row-meta">
                                        Flutterwave orders are expected to verify automatically. Use manual review only if support intervention is required.
                                      </div>
                                    ) : null}
                                    {order.review_notes ? <div className="staff-row-meta">Latest review note: {order.review_notes}</div> : null}
                                    {gatewayManaged ? (
                                      <div className="work-actions">
                                        {order.payment_link ? (
                                          <button type="button" onClick={() => window.open(order.payment_link || "", "_blank")}>
                                            Open Checkout
                                          </button>
                                        ) : null}
                                        {!gatewayVerified ? (
                                          <button type="button" onClick={() => void reviewSponsorshipPayment(order.id, "verified")}>
                                            Manual Verify
                                          </button>
                                        ) : null}
                                        <button type="button" onClick={() => void reviewSponsorshipPayment(order.id, "rejected")}>
                                          {gatewayVerified ? "Flag Issue" : "Mark Unpaid"}
                                        </button>
                                      </div>
                                    ) : order.payment_proof_url ? (
                                      <div className="work-actions">
                                        <button type="button" onClick={() => window.open(toDisplayPhotoUrl(order.payment_proof_url || ""), "_blank")}>
                                          View Payment Proof
                                        </button>
                                        <button type="button" onClick={() => void reviewSponsorshipPayment(order.id, "verified")}>
                                          Verify Payment
                                        </button>
                                        <button type="button" onClick={() => void reviewSponsorshipPayment(order.id, "rejected")}>
                                          Reject
                                        </button>
                                        <button type="button" onClick={() => void reviewSponsorshipPayment(order.id, "proof_submitted")}>
                                          Return To Review
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="work-actions">
                                        <button type="button" onClick={() => void reviewSponsorshipPayment(order.id, "verified")}>
                                          Verify Payment
                                        </button>
                                        <button type="button" onClick={() => void reviewSponsorshipPayment(order.id, "rejected")}>
                                          Reject
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                    <div className="green-work-card" style={{ position: "sticky", top: 16 }}>
                      <h3>Accounting</h3>
                      <p className="green-work-note">This updates automatically from the live sponsorship order feed.</p>
                      <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                        <span className="green-work-live-pill neutral">Orders: {sponsorshipAccountingSummary.totalOrders}</span>
                        <span className="green-work-live-pill ok">Paid sponsors: {sponsorshipAccountingSummary.uniqueSponsorsPaid}</span>
                      </div>
                      <div className="staff-list">
                        <div className="staff-row">
                          <div className="staff-row-head">
                            <strong>Verified Revenue</strong>
                            <span>{formatCurrencyBreakdownMap(sponsorshipAccountingSummary.successfulAmounts)}</span>
                          </div>
                          <div className="staff-row-meta">Successful payments: {sponsorshipOrderSummary.successful}</div>
                          <div className="staff-row-meta">Trees paid for: {sponsorshipAccountingSummary.successfulTrees}</div>
                        </div>
                        <div className="staff-row">
                          <div className="staff-row-head">
                            <strong>Awaiting Revenue</strong>
                            <span>{formatCurrencyBreakdownMap(sponsorshipAccountingSummary.awaitingAmounts)}</span>
                          </div>
                          <div className="staff-row-meta">Awaiting payments: {sponsorshipOrderSummary.awaiting}</div>
                          <div className="staff-row-meta">Trees in pending checkout: {sponsorshipAccountingSummary.awaitingTrees}</div>
                        </div>
                        <div className="staff-row">
                          <div className="staff-row-head">
                            <strong>Flagged Revenue</strong>
                            <span>{formatCurrencyBreakdownMap(sponsorshipAccountingSummary.issueAmounts)}</span>
                          </div>
                          <div className="staff-row-meta">Flagged payments: {sponsorshipOrderSummary.issue}</div>
                          <div className="staff-row-meta">Trees in flagged orders: {sponsorshipAccountingSummary.issueTrees}</div>
                        </div>
                        <div className="staff-row">
                          <div className="staff-row-head">
                            <strong>Operational Backlog</strong>
                            <span>{sponsorshipOrderSummary.awaitingTreeUnits} awaiting tree</span>
                          </div>
                          <div className="staff-row-meta">Linked sponsor trees: {sponsorshipOrderSummary.linkedUnits}</div>
                          <div className="staff-row-meta">
                            Latest verified payment: {sponsorshipAccountingSummary.latestSuccessfulAt ? formatDateLabel(sponsorshipAccountingSummary.latestSuccessfulAt) : "-"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeForm === "sponsor_payouts" && (
            <div className="green-work-card">
              <h3>Public Sponsor Payouts</h3>
              {!publicSponsorshipProject ? (
                <p className="green-work-note">Switch this project to the Public Sponsorship access route first.</p>
              ) : sponsorAgentPayoutLoading ? (
                <p className="green-work-note">Loading sponsor-agent earnings and payout requests...</p>
              ) : (
                <>
                  <div className="work-actions" style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeProjectId) void loadSponsorAgentPayoutBoard(activeProjectId, { forceSync: true });
                      }}
                    >
                      Refresh Payouts
                    </button>
                    <button type="button" onClick={() => openForm("users")}>
                      Manage Sponsor Agents
                    </button>
                  </div>
                  <p className="green-work-note">
                    This is the live sponsor-agent wallet board. It rolls up what each selected public sponsor agent has earned
                    from paid sponsor trees, which requests are pending, and whether bank details are ready for payout.
                  </p>
                  <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                    <span className="green-work-live-pill neutral">Agents: {sponsorAgentPayoutSummary.agentCount}</span>
                    <span className="green-work-live-pill warning">Pending requests: {sponsorAgentPayoutSummary.pendingRequestCount}</span>
                    <span className="green-work-live-pill ok">
                      Minimum payout: {formatCurrencyAmount(sponsorAgentPayoutSummary.minimumAmount, sponsorAgentPayoutSummary.currency)}
                    </span>
                    <span className={`green-work-live-pill ${sponsorAgentPayoutSummary.autoPayoutAvailable ? "info" : "neutral"}`}>
                      Auto payout: {sponsorAgentPayoutSummary.autoPayoutAvailable ? "available" : "manual only"}
                    </span>
                  </div>
                  {sponsorAgentPayoutError ? <p className="green-work-note danger">{sponsorAgentPayoutError}</p> : null}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 0.95fr)", gap: 16, alignItems: "start" }}>
                    <div>
                      <div className="work-actions" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                        <span className="green-work-live-pill ok">
                          Available: {formatCurrencyAmount(sponsorAgentPayoutSummary.availableAmount, sponsorAgentPayoutSummary.currency)}
                        </span>
                        <span className="green-work-live-pill warning">
                          Requested: {formatCurrencyAmount(sponsorAgentPayoutSummary.requestedAmount, sponsorAgentPayoutSummary.currency)}
                        </span>
                        <span className="green-work-live-pill info">
                          Paid: {formatCurrencyAmount(sponsorAgentPayoutSummary.paidAmount, sponsorAgentPayoutSummary.currency)}
                        </span>
                      </div>
                      {sponsorAgentPayoutAgents.length === 0 ? (
                        <p className="green-work-note">No public sponsor agents are selected for this sponsor project yet.</p>
                      ) : (
                        <div className="staff-list">
                          {sponsorAgentPayoutAgents.map((agent) => {
                            const agentSummary = agent.summary || {};
                            const bank = agent.bank_account;
                            const recentEarnings = (agent.earnings || []).slice(0, 3);
                            return (
                              <div key={`sponsor-agent-wallet-${agent.user?.id || agent.user?.user_uid || "agent"}`} className="staff-row">
                                <div className="staff-row-head">
                                  <strong>{agent.user?.full_name || "Sponsor Agent"}</strong>
                                  <span>{agent.user?.user_uid || "-"}</span>
                                </div>
                                <div className="work-actions" style={{ margin: "8px 0 6px", flexWrap: "wrap" }}>
                                  <span className="green-work-live-pill ok">
                                    Available: {formatCurrencyAmount(Number(agentSummary.available_amount || 0), agent.currency || sponsorAgentPayoutSummary.currency)}
                                  </span>
                                  <span className="green-work-live-pill warning">
                                    Requested: {formatCurrencyAmount(Number(agentSummary.requested_amount || 0), agent.currency || sponsorAgentPayoutSummary.currency)}
                                  </span>
                                  <span className="green-work-live-pill info">
                                    Paid: {formatCurrencyAmount(Number(agentSummary.paid_amount || 0), agent.currency || sponsorAgentPayoutSummary.currency)}
                                  </span>
                                  <span className={`green-work-live-pill ${agentSummary.bank_verified ? "ok" : "danger"}`}>
                                    {agentSummary.bank_verified ? "Bank verified" : "Bank setup needed"}
                                  </span>
                                </div>
                                <div className="staff-row-meta">
                                  Planting: {Number(agentSummary.planting_count || 0)} | Maintenance: {Number(agentSummary.maintenance_count || 0)} | Total earned:{" "}
                                  {formatCurrencyAmount(Number(agentSummary.total_earnings_amount || 0), agent.currency || sponsorAgentPayoutSummary.currency)}
                                </div>
                                <div className="staff-row-meta">
                                  Pending requests: {Number(agentSummary.pending_request_count || 0)} | Paid requests: {Number(agentSummary.paid_request_count || 0)} | Projects:{" "}
                                  {Array.isArray(agent.projects) ? agent.projects.length : 0}
                                </div>
                                <div className="staff-row-meta">
                                  Bank: {bank?.bank_name || "-"} | Code: {bank?.bank_code || "-"} | Account:{" "}
                                  {bank?.account_number_masked || bank?.account_number || "-"}
                                </div>
                                <div className="staff-row-meta">
                                  Account name: {bank?.account_name || "-"} | Verified: {bank?.verified_at ? formatDateLabel(bank.verified_at) : "Not yet"}
                                </div>
                                {Array.isArray(agent.projects) && agent.projects.length > 0 ? (
                                  <div className="staff-row-meta">
                                    Rates: {agent.projects
                                      .map(
                                        (project) =>
                                          `${project.project_name || `Project #${project.project_id}`} (${formatCurrencyAmount(
                                            Number(project.planting_fee || 0),
                                            project.currency || sponsorAgentPayoutSummary.currency,
                                          )} planting, ${formatCurrencyAmount(
                                            Number(project.maintenance_fee || 0),
                                            project.currency || sponsorAgentPayoutSummary.currency,
                                          )} maintenance)`,
                                      )
                                      .join(" | ")}
                                  </div>
                                ) : null}
                                {Array.isArray(agent.project_summaries) && agent.project_summaries.length > 0 ? (
                                  <div className="staff-row-meta" style={{ marginTop: 4 }}>
                                    Earnings: {agent.project_summaries
                                      .map(
                                        (ps) =>
                                          `${ps.project_name || `Project #${ps.project_id}`}: ${formatCurrencyAmount(
                                            Number(ps.available_amount || 0),
                                            ps.currency || sponsorAgentPayoutSummary.currency,
                                          )} available (Paid: ${formatCurrencyAmount(
                                            Number(ps.paid_amount || 0),
                                            ps.currency || sponsorAgentPayoutSummary.currency,
                                          )})`
                                      )
                                      .join(" | ")}
                                  </div>
                                ) : null}
                                {recentEarnings.length > 0 ? (
                                  <div className="staff-list" style={{ marginTop: 12 }}>
                                    {recentEarnings.map((earning) => (
                                      <div key={earning.earning_key} className="staff-row" style={{ margin: 0 }}>
                                        <div className="staff-row-head">
                                          <strong>{earning.task_label || formatTaskTypeLabel(earning.work_type || "planting")}</strong>
                                          <span>
                                            {formatCurrencyAmount(Number(earning.amount || 0), earning.currency || sponsorAgentPayoutSummary.currency)}
                                          </span>
                                        </div>
                                        <div className="staff-row-meta">
                                          {earning.tree_label || "Tree record"}
                                          {earning.sponsor_name ? ` | Sponsor: ${earning.sponsor_name}` : ""}
                                          {earning.earned_at ? ` | ${formatDateLabel(earning.earned_at)}` : ""}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="staff-row-meta" style={{ marginTop: 8 }}>
                                    No verified sponsor-funded earnings recorded for this agent yet.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="green-work-card" style={{ position: "sticky", top: 16 }}>
                      <h3>Accounting</h3>
                      <p className="green-work-note">
                        This board refreshes automatically from the live sponsor-agent payout feed. Standard flow: verified bank details,
                        agent payout request, approve only or approve and auto pay, then retry auto payout or complete a manual settlement
                        with an external reference if the gateway payout needs intervention.
                      </p>
                      <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                        <span className="green-work-live-pill neutral">Requests: {sponsorAgentPayoutSummary.requestCount}</span>
                        <span className="green-work-live-pill warning">Awaiting: {sponsorAgentPayoutRequestBuckets.awaiting.length}</span>
                        <span className="green-work-live-pill ok">Paid: {sponsorAgentPayoutRequestBuckets.paid.length}</span>
                        <span className="green-work-live-pill danger">Issues: {sponsorAgentPayoutRequestBuckets.issue.length}</span>
                        <span className="green-work-live-pill neutral">Manual fallback: always available</span>
                      </div>
                      <div className="staff-list">
                        <div className="staff-row">
                          <div className="staff-row-head">
                            <strong>Available Liability</strong>
                            <span>{formatCurrencyAmount(sponsorAgentPayoutSummary.availableAmount, sponsorAgentPayoutSummary.currency)}</span>
                          </div>
                          <div className="staff-row-meta">Earnings ready for agents to request.</div>
                        </div>
                        <div className="staff-row">
                          <div className="staff-row-head">
                            <strong>Requested Liability</strong>
                            <span>{formatCurrencyAmount(sponsorAgentPayoutSummary.requestedAmount, sponsorAgentPayoutSummary.currency)}</span>
                          </div>
                          <div className="staff-row-meta">Already requested and waiting for review or transfer.</div>
                        </div>
                        <div className="staff-row">
                          <div className="staff-row-head">
                            <strong>Paid Out</strong>
                            <span>{formatCurrencyAmount(sponsorAgentPayoutSummary.paidAmount, sponsorAgentPayoutSummary.currency)}</span>
                          </div>
                          <div className="staff-row-meta">Completed sponsor-agent payouts.</div>
                        </div>
                      </div>

                      {([
                        {
                          key: "awaiting",
                          title: "Awaiting Review / Transfer",
                          tone: "warning",
                          rows: sponsorAgentPayoutRequestBuckets.awaiting,
                        },
                        {
                          key: "paid",
                          title: "Paid Requests",
                          tone: "ok",
                          rows: sponsorAgentPayoutRequestBuckets.paid,
                        },
                        {
                          key: "issue",
                          title: "Flagged / Cancelled",
                          tone: "danger",
                          rows: sponsorAgentPayoutRequestBuckets.issue,
                        },
                      ] as Array<{
                        key: string;
                        title: string;
                        tone: "ok" | "warning" | "danger";
                        rows: SponsorAgentPayoutRequestRecord[];
                      }>)
                        .filter((section) => section.rows.length > 0)
                        .map((section) => (
                          <div key={`sponsor-payout-section-${section.key}`} style={{ marginTop: 18 }}>
                            <div className="work-actions" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                              <span className={`green-work-live-pill ${section.tone}`}>{section.title}</span>
                              <span className="green-work-live-pill neutral">
                                {section.rows.length} request{section.rows.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="staff-list">
                              {section.rows.map((request) => {
                                const status = normalizeName(request.status);
                                const terminal = ["paid", "rejected", "cancelled"].includes(status);
                                const failedTransfer = status === "failed";
                                const processingTransfer = status === "processing";
                                return (
                                  <div key={`sponsor-payout-request-${section.key}-${request.id}`} className="staff-row">
                                    <div className="staff-row-head">
                                      <strong>{request.user_name || `Agent #${request.user_id}`}</strong>
                                      <span>{request.request_uid || `Request #${request.id}`}</span>
                                    </div>
                                    <div className="work-actions" style={{ margin: "8px 0 6px", flexWrap: "wrap" }}>
                                      <span className={`green-work-live-pill ${section.tone}`}>{formatTaskTypeLabel(request.status || "requested")}</span>
                                      <span className="green-work-live-pill neutral">
                                        {formatCurrencyAmount(request.amount_total, request.currency || sponsorAgentPayoutSummary.currency)}
                                      </span>
                                      {request.transfer_status ? (
                                        <span className="green-work-live-pill info">Transfer: {formatTaskTypeLabel(request.transfer_status)}</span>
                                      ) : null}
                                    </div>
                                    <div className="staff-row-meta">
                                      Bank: {request.bank_name || "-"} | Code: {request.bank_code || "-"} | Account:{" "}
                                      {request.account_number_masked || request.account_number || "-"} | {request.account_name || "-"}
                                    </div>
                                    <div className="staff-row-meta">
                                      Created: {request.created_at ? formatDateLabel(request.created_at) : "-"}
                                      {request.paid_at ? ` | Paid: ${formatDateLabel(request.paid_at)}` : ""}
                                    </div>
                                    <div className="staff-row-meta">
                                      Settlement: {request.settlement_channel ? formatTaskTypeLabel(request.settlement_channel) : "Pending"}
                                      {request.settlement_reference ? ` | Ref: ${request.settlement_reference}` : ""}
                                    </div>
                                    {request.transfer_reference || request.transfer_id || request.transfer_status ? (
                                      <div className="staff-row-meta">
                                        Transfer ref: {request.transfer_reference || "-"}
                                        {request.transfer_id ? ` | Transfer ID: ${request.transfer_id}` : ""}
                                        {request.transfer_status ? ` | Gateway: ${formatTaskTypeLabel(request.transfer_status)}` : ""}
                                      </div>
                                    ) : null}
                                    <div className="staff-row-meta">
                                      Review: {request.reviewed_by || "-"}
                                      {request.reviewed_at ? ` | ${formatDateLabel(request.reviewed_at)}` : ""}
                                    </div>
                                    {request.review_notes ? <div className="staff-row-meta">Note: {request.review_notes}</div> : null}
                                    {failedTransfer ? (
                                      <div className="green-work-note danger">
                                        Automatic payout failed. Retry the gateway payout or complete a manual settlement with an external bank reference.
                                      </div>
                                    ) : null}
                                    {!terminal ? (
                                      <div className="work-actions">
                                        {sponsorAgentPayoutSummary.autoPayoutAvailable ? (
                                          <button
                                            type="button"
                                            className="btn-primary"
                                            disabled={reviewingSponsorAgentPayoutId === request.id || processingTransfer}
                                            onClick={() =>
                                              void reviewSponsorAgentPayoutRequest(
                                                request.id,
                                                failedTransfer ? "retry_transfer" : "approve_and_pay",
                                                { autoTransfer: true },
                                              )
                                            }
                                          >
                                            {reviewingSponsorAgentPayoutId === request.id
                                              ? "Processing..."
                                              : failedTransfer
                                                ? "Retry Auto Payout"
                                                : "Approve & Auto Pay"}
                                          </button>
                                        ) : null}
                                        {!processingTransfer ? (
                                          <button
                                            type="button"
                                            disabled={reviewingSponsorAgentPayoutId === request.id}
                                            onClick={() => void reviewSponsorAgentPayoutRequest(request.id, "approve")}
                                          >
                                            Approve Only
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          disabled={reviewingSponsorAgentPayoutId === request.id || processingTransfer}
                                          onClick={() => void reviewSponsorAgentPayoutRequest(request.id, "mark_paid")}
                                        >
                                          Manual Settlement Complete
                                        </button>
                                        <button
                                          type="button"
                                          disabled={reviewingSponsorAgentPayoutId === request.id}
                                          onClick={() => void reviewSponsorAgentPayoutRequest(request.id, processingTransfer ? "cancel" : "reject")}
                                        >
                                          {processingTransfer ? "Cancel" : "Reject"}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeForm === "sponsor_feedback" && (
            <div className="green-work-card">
              <h3>Sponsor Feedback & Nominations</h3>
              {!publicSponsorshipProject ? (
                <p className="green-work-note">Switch this project to the Public Sponsorship access route first.</p>
              ) : feedbackLoading &&
                socialFollowClaims.length === 0 &&
                complaints.length === 0 &&
                schoolNominations.length === 0 &&
                communityProjects.length === 0 &&
                redemptions.length === 0 &&
                assistantEscalations.length === 0 ? (
                <p className="green-work-note">Loading sponsor feedback data...</p>
              ) : (
                <>
                  <div className="work-actions" style={{ marginBottom: 16 }}>
                    <button
                      type="button"
                      onClick={() => void loadSponsorFeedback()}
                    >
                      Refresh Data
                    </button>
                  </div>

                  {feedbackError && <p className="green-work-error" style={{ color: 'red', marginBottom: 12 }}>{feedbackError}</p>}

                  <div style={{ marginBottom: 24 }}>
                    <h4>Assistant Questions ({assistantEscalations.filter((e: any) => e.status !== "resolved").length} open)</h4>
                    <p className="green-work-note" style={{ marginLeft: 0 }}>
                      Questions Planty (the sponsor page chat assistant) couldn't confidently answer, escalated here for a human reply.
                    </p>
                    {assistantEscalations.length === 0 ? (
                      <p className="green-work-note" style={{ marginLeft: 0 }}>No escalated questions yet.</p>
                    ) : (
                      <table className="green-work-table">
                        <thead>
                          <tr>
                            <th>Visitor</th>
                            <th>Question</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th>Reply / Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assistantEscalations.map((e: any) => {
                            const isResolved = e.status === "resolved";
                            return (
                              <tr key={`assistant-escalation-${e.id}`}>
                                <td>
                                  <strong>{e.visitor_name || "Anonymous visitor"}</strong>
                                  <div style={{ fontSize: 11, color: "#666" }}>{e.visitor_email}</div>
                                </td>
                                <td style={{ maxWidth: 260 }}>{e.question}</td>
                                <td>
                                  <span className={`green-work-live-pill ${isResolved ? "ok" : "warning"}`}>
                                    {isResolved ? "Replied" : "Needs reply"}
                                  </span>
                                  {e.admin_reply && (
                                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                                      <strong>Reply sent:</strong> {e.admin_reply}
                                    </div>
                                  )}
                                </td>
                                <td>{new Date(e.created_at).toLocaleString()}</td>
                                <td>
                                  {!isResolved ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                                      <textarea
                                        placeholder="Write the reply to email the visitor..."
                                        value={assistantEscalationReplies[e.id] || ""}
                                        onChange={(ev) => setAssistantEscalationReplies({ ...assistantEscalationReplies, [e.id]: ev.target.value })}
                                        style={{ width: "100%", padding: 4, fontSize: 11 }}
                                        rows={2}
                                      />
                                      <textarea
                                        placeholder="Internal note (optional, not emailed)"
                                        value={assistantEscalationNotes[e.id] || ""}
                                        onChange={(ev) => setAssistantEscalationNotes({ ...assistantEscalationNotes, [e.id]: ev.target.value })}
                                        style={{ width: "100%", padding: 4, fontSize: 11 }}
                                        rows={1}
                                      />
                                      <button
                                        type="button"
                                        disabled={resolvingAssistantEscalationId === e.id}
                                        onClick={() => handleResolveAssistantEscalation(e.id, assistantEscalationNotes[e.id], assistantEscalationReplies[e.id])}
                                        style={{ padding: "4px 8px", fontSize: 11 }}
                                      >
                                        {resolvingAssistantEscalationId === e.id ? "Sending…" : "Send Reply & Resolve"}
                                      </button>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: 11, color: "#27ae60", fontWeight: "bold" }}>✓ Resolved</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {canAccessSuperAdmin ? (
                    <div style={{ marginBottom: 24 }}>
                      <h4>Social Follow Proofs ({socialFollowClaims.length})</h4>
                      <p className="green-work-note" style={{ marginLeft: 0 }}>
                        Sponsors submit Facebook and Instagram follow screenshots here. Only super admin can approve the proof and award the 20 GP follow bonus.
                      </p>
                      {socialFollowClaims.length === 0 ? (
                        <p className="green-work-note" style={{ marginLeft: 0 }}>No follow-proof submissions yet.</p>
                      ) : (
                        <table className="green-work-table">
                          <thead>
                            <tr>
                              <th>Sponsor</th>
                              <th>Proof</th>
                              <th>Opened</th>
                              <th>Status / Notes</th>
                              <th>Submitted</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {socialFollowClaims.map((claim: any) => {
                              const submittedAt = claim.submitted_at || claim.updated_at || claim.created_at;
                              const isPending = String(claim.status || "").toLowerCase() === "pending";
                              const statusTone =
                                claim.status === "approved"
                                  ? "ok"
                                  : claim.status === "rejected"
                                    ? "error"
                                    : "warning";
                              return (
                                <tr key={`follow-claim-${claim.id}`}>
                                  <td>
                                    <strong>{claim.sponsor_name || `Sponsor #${claim.sponsor_id}`}</strong>
                                    <div style={{ fontSize: 11, color: "#666" }}>{claim.sponsor_email || "-"}</div>
                                  </td>
                                  <td style={{ minWidth: 240 }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(88px, 1fr))", gap: 8 }}>
                                      {(["facebook", "instagram"] as const).map((platform) => {
                                        const label = platform === "facebook" ? "Facebook" : "Instagram";
                                        const rawUrl =
                                          platform === "facebook"
                                            ? String(claim.facebook_screenshot_url || "").trim()
                                            : String(claim.instagram_screenshot_url || "").trim();
                                        return rawUrl ? (
                                          <button
                                            key={`${claim.id}-${platform}`}
                                            type="button"
                                            onClick={() => window.open(toDisplayPhotoUrl(rawUrl), "_blank")}
                                            style={{
                                              display: "flex",
                                              flexDirection: "column",
                                              gap: 6,
                                              alignItems: "stretch",
                                              padding: 6,
                                              borderRadius: 12,
                                              border: "1px solid #dbe9dd",
                                              background: "#f8fcf9",
                                              cursor: "pointer",
                                            }}
                                          >
                                            <img
                                              src={toDisplayPhotoUrl(rawUrl)}
                                              alt={`${label} proof`}
                                              style={{
                                                width: "100%",
                                                height: 120,
                                                objectFit: "cover",
                                                borderRadius: 8,
                                                background: "#edf6ef",
                                              }}
                                            />
                                            <span style={{ fontSize: 11, fontWeight: 700, color: "#16532d" }}>
                                              Open {label} proof
                                            </span>
                                          </button>
                                        ) : (
                                          <div
                                            key={`${claim.id}-${platform}`}
                                            style={{
                                              minHeight: 120,
                                              borderRadius: 12,
                                              border: "1px dashed #dbe9dd",
                                              background: "#fbfdfb",
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              padding: 10,
                                              fontSize: 11,
                                              color: "#708676",
                                              textAlign: "center",
                                            }}
                                          >
                                            No {label.toLowerCase()} proof uploaded
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td style={{ minWidth: 140 }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                      <span className={`green-work-live-pill ${claim.facebook_opened ? "ok" : "warning"}`}>
                                        Facebook: {claim.facebook_opened ? "opened" : "not opened"}
                                      </span>
                                      <span className={`green-work-live-pill ${claim.instagram_opened ? "ok" : "warning"}`}>
                                        Instagram: {claim.instagram_opened ? "opened" : "not opened"}
                                      </span>
                                    </div>
                                  </td>
                                  <td>
                                    <span className={`green-work-live-pill ${statusTone}`}>{claim.status}</span>
                                    <div style={{ fontSize: 11, color: "#2f4f3a", marginTop: 6 }}>
                                      GP awarded: {claim.points_awarded ? "Yes" : "No"}
                                    </div>
                                    {claim.supervisor_note ? (
                                      <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                                        <strong>Supervisor note:</strong> {claim.supervisor_note}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td>
                                    {submittedAt ? new Date(submittedAt).toLocaleString() : "-"}
                                    {claim.reviewed_at ? (
                                      <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                                        Reviewed: {new Date(claim.reviewed_at).toLocaleString()}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td style={{ minWidth: 210 }}>
                                    {isPending ? (
                                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        <textarea
                                          placeholder="Optional note to the sponsor..."
                                          value={followClaimNotes[claim.id] || ""}
                                          onChange={(e) => setFollowClaimNotes({ ...followClaimNotes, [claim.id]: e.target.value })}
                                          style={{ width: "100%", padding: 6, fontSize: 11 }}
                                          rows={2}
                                        />
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                          <button
                                            type="button"
                                            onClick={() => handleReviewSocialFollowClaim(claim.id, "approved", followClaimNotes[claim.id])}
                                            style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#2ecc71", color: "white", border: "none" }}
                                          >
                                            Approve + award GP
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleReviewSocialFollowClaim(claim.id, "rejected", followClaimNotes[claim.id])}
                                            style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#e74c3c", color: "white", border: "none" }}
                                          >
                                            Reject proof
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 11, textTransform: "capitalize", fontWeight: "bold" }}>{claim.status}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ) : null}

                  {/* Section 2: Complaints */}
                  <div style={{ marginBottom: 24 }}>
                    <h4>Sponsor Complaints ({complaints.length})</h4>
                    {complaints.length === 0 ? (
                      <p className="green-work-note" style={{ marginLeft: 0 }}>No complaints submitted yet.</p>
                    ) : (
                      <table className="green-work-table">
                        <thead>
                          <tr>
                            <th>Sponsor</th>
                            <th>Type</th>
                            <th>Tree ID</th>
                            <th>Message</th>
                            <th>Status / Notes</th>
                            <th>Submitted At</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {complaints.map((c: any) => (
                            <tr key={`complaint-${c.id}`}>
                              <td>
                                <strong>{c.sponsor_name}</strong>
                                <div style={{ fontSize: 11, color: '#666' }}>{c.sponsor_email}</div>
                              </td>
                              <td style={{ textTransform: 'capitalize' }}>{c.complaint_type}</td>
                              <td>{c.tree_id || "-"}</td>
                              <td>{c.message}</td>
                              <td>
                                <span className={`green-work-live-pill ${c.status === 'resolved' ? 'ok' : 'warning'}`}>
                                  {c.status}
                                </span>
                                {c.supervisor_note && (
                                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                                    <strong>Supervisor note:</strong> {c.supervisor_note}
                                  </div>
                                )}
                              </td>
                              <td>{new Date(c.created_at).toLocaleString()}</td>
                              <td>
                                {c.status !== 'resolved' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <textarea
                                      placeholder="Add supervisor note to sponsor..."
                                      value={complaintNotes[c.id] || ""}
                                      onChange={(e) => setComplaintNotes({ ...complaintNotes, [c.id]: e.target.value })}
                                      style={{ width: "100%", padding: 4, fontSize: 11 }}
                                      rows={2}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleResolveComplaint(c.id, complaintNotes[c.id])}
                                      style={{ padding: '4px 8px', fontSize: 11 }}
                                    >
                                      Mark Resolved
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 11, color: '#27ae60', fontWeight: 'bold' }}>✓ Resolved</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Section 3: School Nominations */}
                  <div style={{ marginBottom: 24 }}>
                    <h4>School Nominations ({schoolNominations.length})</h4>
                    {schoolNominations.length === 0 ? (
                      <p className="green-work-note" style={{ marginLeft: 0 }}>No nominations submitted yet.</p>
                    ) : (
                      <table className="green-work-table">
                        <thead>
                          <tr>
                            <th>School Details</th>
                            <th>Nominator</th>
                            <th>Reason</th>
                            <th>Status / Notes</th>
                            <th>Points Spent</th>
                            <th>Submitted At</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolNominations.map((n: any) => (
                            <tr key={`nomination-${n.id}`}>
                              <td>
                                <strong>{n.school_name}</strong>
                                <div style={{ fontSize: 11, color: '#666' }}>{n.school_address}</div>
                                <div style={{ fontSize: 11, color: '#666' }}>Contact: {n.contact_person || "-"} ({n.contact_phone || "-"})</div>
                              </td>
                              <td>
                                <strong>{n.sponsor_name}</strong>
                                <div style={{ fontSize: 11, color: '#666' }}>{n.sponsor_email}</div>
                              </td>
                              <td>{n.reason}</td>
                              <td>
                                <span className={`green-work-live-pill ${n.status === 'approved' ? 'ok' : (n.status === 'rejected' ? 'error' : 'warning')}`}>
                                  {n.status}
                                </span>
                                {n.supervisor_note && (
                                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                                    <strong>Supervisor note:</strong> {n.supervisor_note}
                                  </div>
                                )}
                              </td>
                              <td>{n.points_spent} GP</td>
                              <td>{new Date(n.created_at).toLocaleString()}</td>
                              <td>
                                {n.status === 'pending' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <textarea
                                      placeholder="Add supervisor note to sponsor..."
                                      value={nominationNotes[n.id] || ""}
                                      onChange={(e) => setNominationNotes({ ...nominationNotes, [n.id]: e.target.value })}
                                      style={{ width: "100%", padding: 4, fontSize: 11 }}
                                      rows={2}
                                    />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button
                                        type="button"
                                        onClick={() => handleReviewSchoolNomination(n.id, "approved", nominationNotes[n.id])}
                                        style={{ padding: '4px 8px', fontSize: 11, backgroundColor: '#2ecc71', color: 'white', border: 'none' }}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleReviewSchoolNomination(n.id, "rejected", nominationNotes[n.id])}
                                        style={{ padding: '4px 8px', fontSize: 11, backgroundColor: '#e74c3c', color: 'white', border: 'none' }}
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 11, textTransform: 'capitalize', fontWeight: 'bold' }}>{n.status}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Section 4: Community Projects */}
                  <div style={{ marginBottom: 24 }}>
                    <h4>Proposed Community Forests ({communityProjects.length})</h4>
                    {communityProjects.length === 0 ? (
                      <p className="green-work-note" style={{ marginLeft: 0 }}>No community projects proposed yet.</p>
                    ) : (
                      <table className="green-work-table">
                        <thead>
                          <tr>
                            <th>Project Details</th>
                            <th>Proposer</th>
                            <th>Description</th>
                            <th>Points Contributed</th>
                            <th>Status / Notes</th>
                            <th>Submitted At</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {communityProjects.map((p: any) => (
                            <tr key={`project-${p.id}`}>
                              <td>
                                <strong>{p.project_name}</strong>
                                <div style={{ fontSize: 11, color: '#666' }}>Location: {p.proposed_location}</div>
                              </td>
                              <td>
                                <strong>{p.sponsor_name}</strong>
                                <div style={{ fontSize: 11, color: '#666' }}>{p.sponsor_email}</div>
                              </td>
                              <td>{p.description || "-"}</td>
                              <td>{p.points_contributed} GP</td>
                              <td>
                                <span className={`green-work-live-pill ${p.status === 'approved' ? 'ok' : (p.status === 'rejected' ? 'error' : 'warning')}`}>
                                  {p.status || "pending"}
                                </span>
                                {p.supervisor_note && (
                                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                                    <strong>Supervisor note:</strong> {p.supervisor_note}
                                  </div>
                                )}
                              </td>
                              <td>{new Date(p.created_at).toLocaleString()}</td>
                              <td>
                                {(!p.status || p.status === 'pending') ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <textarea
                                      placeholder="Add supervisor note to sponsor..."
                                      value={projectNotes[p.id] || ""}
                                      onChange={(e) => setProjectNotes({ ...projectNotes, [p.id]: e.target.value })}
                                      style={{ width: "100%", padding: 4, fontSize: 11 }}
                                      rows={2}
                                    />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateCommunityProjectStatus(p.id, "approved", projectNotes[p.id])}
                                        style={{ padding: '4px 8px', fontSize: 11, backgroundColor: '#2ecc71', color: 'white', border: 'none' }}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateCommunityProjectStatus(p.id, "rejected", projectNotes[p.id])}
                                        style={{ padding: '4px 8px', fontSize: 11, backgroundColor: '#e74c3c', color: 'white', border: 'none' }}
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 11, textTransform: 'capitalize', fontWeight: 'bold' }}>{p.status}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Section 5: Reward Redemptions */}
                  <div style={{ marginBottom: 24 }}>
                    <h4>Reward Redemptions ({redemptions.length})</h4>
                    {redemptions.length === 0 ? (
                      <p className="green-work-note" style={{ marginLeft: 0 }}>No reward redemptions yet.</p>
                    ) : (
                      <table className="green-work-table">
                        <thead>
                          <tr>
                            <th>Sponsor</th>
                            <th>Reward</th>
                            <th>Points Spent</th>
                            <th>Shipping Details</th>
                            <th>Status / Notes</th>
                            <th>Submitted At</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {redemptions.map((r: any) => (
                            <tr key={`redemption-${r.id}`}>
                              <td>
                                <strong>{r.sponsor_name}</strong>
                                <div style={{ fontSize: 11, color: '#666' }}>{r.sponsor_email}</div>
                              </td>
                              <td style={{ textTransform: 'capitalize' }}>
                                {String(r.reward_type || "").replace("merch_", "").replace("_", " ")}
                              </td>
                              <td>{r.points_spent} GP</td>
                              <td style={{ fontSize: 11, maxWidth: 250, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                {(() => {
                                  const details = r.shipping_details;
                                  if (!details || typeof details !== 'object') return 'No delivery details';
                                  const method = details.delivery_method || '';
                                  const phone = details.phone || '';
                                  if (method === 'home_delivery') {
                                    return `🏠 Home Delivery - Phone: ${phone} - Address: ${details.address || ''}, ${details.state || ''}, ${details.lga || ''}`;
                                  } else if (method === 'office_pickup') {
                                    return `🏢 Hub Pickup - Phone: ${phone} - Hub: ${details.hub || ''}`;
                                  } else if (method === 'transport_terminal') {
                                    return `🚌 Transport Park - Phone: ${phone} - Company: ${details.transport_company || ''}, Destination Park: ${details.destination_terminal || ''}`;
                                  }
                                  return JSON.stringify(details);
                                })()}
                              </td>
                              <td>
                                <span className={`green-work-live-pill ${r.status === 'approved' ? 'ok' : (r.status === 'rejected' ? 'error' : 'warning')}`}>
                                  {r.status}
                                </span>
                                {r.supervisor_note && (
                                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                                    <strong>Supervisor note:</strong> {r.supervisor_note}
                                  </div>
                                )}
                              </td>
                              <td>{new Date(r.created_at).toLocaleString()}</td>
                              <td>
                                {r.status === 'pending' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <textarea
                                      placeholder="Add supervisor note to sponsor..."
                                      value={redemptionNotes[r.id] || ""}
                                      onChange={(e) => setRedemptionNotes({ ...redemptionNotes, [r.id]: e.target.value })}
                                      style={{ width: "100%", padding: 4, fontSize: 11 }}
                                      rows={2}
                                    />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button
                                        type="button"
                                        onClick={() => handleReviewPointRedemption(r.id, "approved", redemptionNotes[r.id])}
                                        style={{ padding: '4px 8px', fontSize: 11, backgroundColor: '#2ecc71', color: 'white', border: 'none' }}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleReviewPointRedemption(r.id, "rejected", redemptionNotes[r.id])}
                                        style={{ padding: '4px 8px', fontSize: 11, backgroundColor: '#e74c3c', color: 'white', border: 'none' }}
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 11, textTransform: 'capitalize', fontWeight: 'bold' }}>{r.status}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeForm === "logs" && canAccessSuperAdmin && (
            <div className="green-work-card">
              <h3>System Logs & Reports</h3>
              <p className="green-work-note">
                Monitor live API activity across Survey Plan, Flood, LandCheck Work, sponsor, and field capture surfaces,
                plus tree tag QR printing statistics.
              </p>
              
              <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                <button
                  type="button"
                  onClick={() => {
                    void loadActivityLogs();
                    void loadQrPrintsReport();
                  }}
                  disabled={logsLoading}
                >
                  {logsLoading ? "Refreshing..." : "Refresh Logs & Reports"}
                </button>
                <button
                  type="button"
                  onClick={resetActivityLogs}
                  style={{ backgroundColor: '#e74c3c', color: 'white', border: 'none' }}
                >
                  Reset Activity Logs
                </button>
              </div>

              {logsError && <p className="green-work-error" style={{ color: 'red', marginBottom: 12 }}>{logsError}</p>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* QR Code Prints Report */}
                <div>
                  <h4>QR Tag Print Status Report</h4>
                  {qrPrintsReport.length === 0 ? (
                    <p className="green-work-note" style={{ marginLeft: 0 }}>No QR tag print logs recorded yet.</p>
                  ) : (
                    <table className="green-work-table">
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Tree #</th>
                          <th>Species</th>
                          <th>Tree ID</th>
                          <th>Print Count</th>
                          <th>Last Printed At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qrPrintsReport.map((p: any) => (
                          <tr key={`qrprint-${p.tree_id}`}>
                            <td>{p.project_name}</td>
                            <td>#{p.project_tree_no}</td>
                            <td>{p.species}</td>
                            <td>{p.tree_id}</td>
                            <td style={{ fontWeight: 'bold' }}>{p.print_count} times</td>
                            <td>{new Date(p.last_printed_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* System Activity Logs */}
                <div>
                  <h4>System Activity Logs (Capped at 10,000)</h4>
                  {activityLogs.length === 0 ? (
                    <p className="green-work-note" style={{ marginLeft: 0 }}>No system activity logs recorded yet.</p>
                  ) : (
                    <div style={{ maxHeight: 500, overflow: 'auto', border: '1px solid #dcdfdc', borderRadius: 4, padding: 12, backgroundColor: '#fcfcfc' }}>
                      <table className="green-work-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Source</th>
                            <th>Event</th>
                            <th>Actor</th>
                            <th>Message</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activityLogs.map((log) => {
                            const hasDetails = hasActivityLogDetails(log.details);
                            const detailsSummary = summarizeActivityLogDetails(log.details);
                            return (
                              <tr key={`log-${log.id}`} style={{ fontSize: 12 }}>
                                <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at || "").toLocaleString()}</td>
                                <td style={{ textTransform: 'capitalize' }}>{log.source}</td>
                                <td><span className="green-work-live-pill neutral">{log.event_type}</span></td>
                                <td>{resolveActivityLogActor(log)}</td>
                                <td style={{ minWidth: 220 }}>{log.message}</td>
                                <td className="green-work-log-details-cell">
                                  {hasDetails ? (
                                    <button
                                      type="button"
                                      className="green-work-log-details-trigger"
                                      onClick={() => setSelectedActivityLog(log)}
                                    >
                                      <span className="green-work-log-details-trigger-label">View details</span>
                                      <span className="green-work-log-details-trigger-meta">{detailsSummary}</span>
                                    </button>
                                  ) : (
                                    <span className="green-work-log-details-empty">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeForm === "assign_work" && (
            <div className="green-work-card">
              <h3>Assign Tree Planting</h3>
              {!activeProjectId && <p className="green-work-note">Select project first from Project Focus.</p>}
              {publicSponsorshipProject && (
                <>
                  <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                    <span className="green-work-live-pill ok">Paid orders: {sponsorshipOrderSummary.successful}</span>
                    <span className="green-work-live-pill warning">Awaiting planting: {sponsorshipOrderSummary.awaitingTreeUnits}</span>
                    <span className="green-work-live-pill info">Linked sponsored trees: {sponsorshipOrderSummary.linkedUnits}</span>
                    <span className="green-work-live-pill neutral">Project sponsored trees: {sponsoredPaidTrees.length}</span>
                  </div>
                  <p className="green-work-note">
                    Approved planting submissions in this project auto-link to the oldest paid sponsor slots that are still
                    awaiting a tree.
                  </p>
                  {sponsoredBacklogOrders.length > 0 ? (
                    <div className="staff-list" style={{ marginBottom: 14 }}>
                      {sponsoredBacklogOrders.slice(0, 4).map((order) => (
                        <div key={`sponsor-backlog-${order.id}`} className="staff-row">
                          <div className="staff-row-head">
                            <strong>{order.sponsor_name || `Sponsor #${order.sponsor_account_id || order.id}`}</strong>
                            <span>{order.order_uid || `Order #${order.id}`}</span>
                          </div>
                          <div className="staff-row-meta">
                            Awaiting tree: {Number(order.awaiting_tree_units || 0)} | Paid units linked already: {Number(order.linked_units || 0)}
                          </div>
                          <div className="staff-row-meta">
                            {order.dedication_name ? `Dedication: ${order.dedication_name} | ` : ""}
                            Spend: {formatCurrencyAmount(order.amount_total, order.currency)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="green-work-note">No paid sponsor backlog is waiting for tree creation right now.</p>
                  )}
                </>
              )}
              {publicSponsorshipProject && assignmentUsers.length === 0 ? (
                <p className="green-work-note danger">
                  No public sponsor agents are selected for this project yet. Open Users and save at least one sponsor agent first.
                </p>
              ) : null}
              <label className="green-work-checkbox-row">
                <input
                  type="checkbox"
                  checked={newOrderMultiAssignEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setNewOrderMultiAssignEnabled(enabled);
                    if (enabled) {
                      setWorkOrderSelectedAssigneesWithOverrides(
                        newOrderSelectedAssignees.length
                          ? newOrderSelectedAssignees
                          : (newOrder.assignee_name.trim() ? [newOrder.assignee_name.trim()] : []),
                      );
                    } else if (newOrderSelectedAssignees.length) {
                      setNewOrder((prev) => ({ ...prev, assignee_name: newOrderSelectedAssignees[0] || "" }));
                    }
                    if (!enabled) {
                      setNewOrderMultiAssignTargetMode("uniform");
                      setNewOrderMultiAssignDueMode("uniform");
                    }
                  }}
                  disabled={!activeProjectId || assigningWorkOrder}
                />
                <span>Assign to multiple staff</span>
              </label>
              {!newOrderMultiAssignEnabled ? (
                <select
                  value={newOrder.assignee_name}
                  onChange={(e) => setNewOrder({ ...newOrder, assignee_name: e.target.value })}
                  disabled={!activeProjectId || assigningWorkOrder}
                >
                  <option value="">Select assignee</option>
                  {assignmentUsers.map((u) => (
                    <option key={u.id} value={u.full_name}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <label className="green-work-field-label">Tree target mode</label>
                  <select
                    value={newOrderSpeciesMode ? "uniform" : newOrderMultiAssignTargetMode}
                    onChange={(e) => setNewOrderMultiAssignTargetMode(e.target.value === "custom" ? "custom" : "uniform")}
                    disabled={!activeProjectId || assigningWorkOrder || newOrderSpeciesMode}
                  >
                    <option value="uniform">Uniform tree target for all selected staff</option>
                    <option value="custom">Custom tree target per staff</option>
                  </select>
                  {newOrderSpeciesMode && (
                    <p className="green-work-note">
                      Species-based allocation uses one shared target per order, so custom tree counts per staff are disabled.
                    </p>
                  )}
                  <div className="green-work-multi-assign-panel">
                    <div className="green-work-multi-assign-header">
                      <span>{currentWorkOrderAssignees.length} selected</span>
                      <div className="work-actions">
                        <button type="button" onClick={() => setWorkOrderSelectedAssigneesWithOverrides(assignmentUsers.map((u) => u.full_name))} disabled={!assignmentUsers.length || assigningWorkOrder}>
                          Select all
                        </button>
                        <button type="button" onClick={() => setWorkOrderSelectedAssigneesWithOverrides([])} disabled={!currentWorkOrderAssignees.length || assigningWorkOrder}>
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="green-work-multi-assign-list">
                      {assignmentUsers.map((u) => (
                        <div key={u.id} className="green-work-multi-assign-item-row">
                          <label className="green-work-multi-assign-item">
                            <input
                              type="checkbox"
                              checked={newOrderSelectedAssignees.includes(u.full_name)}
                              onChange={() =>
                                setWorkOrderSelectedAssigneesWithOverrides(
                                  toggleNamedSelection(newOrderSelectedAssignees, u.full_name),
                                )
                              }
                              disabled={assigningWorkOrder}
                            />
                            <span>{u.full_name}</span>
                          </label>
                          {newOrderSelectedAssignees.includes(u.full_name) &&
                            (workOrderUsesCustomTargets || workOrderUsesCustomDueDates) && (
                              <div className="green-work-multi-assign-item-inline">
                                {workOrderUsesCustomTargets && (
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    placeholder="Trees"
                                    value={(newOrderMultiAssignOverrides[u.full_name] || makeDefaultWorkOrderOverride()).target_trees}
                                    onChange={(e) =>
                                      updateWorkOrderMultiAssignOverride(u.full_name, { target_trees: e.target.value })
                                    }
                                    disabled={assigningWorkOrder}
                                  />
                                )}
                                {workOrderUsesCustomDueDates && (
                                  <input
                                    type="date"
                                    value={(newOrderMultiAssignOverrides[u.full_name] || makeDefaultWorkOrderOverride()).due_date}
                                    onChange={(e) =>
                                      updateWorkOrderMultiAssignOverride(u.full_name, { due_date: e.target.value })
                                  }
                                  disabled={assigningWorkOrder}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {(!newOrderMultiAssignEnabled || !workOrderUsesCustomTargets) && (
                <input
                  type="number"
                  placeholder="Target trees"
                  value={newOrderSpeciesMode ? newOrderSpeciesTargetTotal : newOrder.target_trees}
                  onChange={(e) => setNewOrder({ ...newOrder, target_trees: Number(e.target.value) })}
                  readOnly={newOrderSpeciesMode}
                  disabled={!activeProjectId || assigningWorkOrder}
                />
              )}
              <label className="green-work-checkbox-row">
                <input
                  type="checkbox"
                  checked={newOrderSpeciesMode}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setNewOrderSpeciesMode(next);
                    if (!next) {
                      setNewOrderSpeciesAllocations([{ species: "", count: 0 }]);
                    } else {
                      setNewOrderMultiAssignTargetMode("uniform");
                    }
                  }}
                  disabled={!activeProjectId || assigningWorkOrder}
                />
                <span>Enable species-based allocation for the assigned sponsor QR tags (optional)</span>
              </label>
              {newOrderSpeciesMode && (
                <div className="green-work-species-allocation">
                  <label className="green-work-field-label">Species allocation rows</label>
                  <p className="green-work-note">Enter species names exactly as you want them to appear on the agent QR sheet before planting and inside Green capture.</p>
                  {newOrderSpeciesAllocations.map((row, index) => (
                    <div key={`species-allocation-${index}`} className="green-work-species-allocation-row">
                      <input
                        type="text"
                        placeholder="Species name"
                        value={row.species}
                        onChange={(e) =>
                          setNewOrderSpeciesAllocations((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, species: e.target.value } : item,
                            ),
                          )
                        }
                        disabled={!activeProjectId || assigningWorkOrder}
                      />
                      <input
                        type="number"
                        min={1}
                        step={1}
                        placeholder="Trees"
                        value={row.count || ""}
                        onChange={(e) =>
                          setNewOrderSpeciesAllocations((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, count: Number(e.target.value || 0) } : item,
                            ),
                          )
                        }
                        disabled={!activeProjectId || assigningWorkOrder}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setNewOrderSpeciesAllocations((prev) =>
                            prev.length <= 1 ? [{ species: "", count: 0 }] : prev.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        disabled={!activeProjectId || assigningWorkOrder}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="work-actions">
                    <button
                      type="button"
                      onClick={() =>
                        setNewOrderSpeciesAllocations((prev) => [...prev, { species: "", count: 0 }])
                      }
                      disabled={!activeProjectId || assigningWorkOrder}
                    >
                      Add Species Row
                    </button>
                  </div>
                  <p className="green-work-note">
                    Total species allocation: {newOrderSpeciesTargetTotal} tree{newOrderSpeciesTargetTotal === 1 ? "" : "s"}.
                  </p>
                </div>
              )}
              {newOrderMultiAssignEnabled && (
                <>
                  <label className="green-work-field-label">Due date mode</label>
                  <select
                    value={newOrderMultiAssignDueMode}
                    onChange={(e) => setNewOrderMultiAssignDueMode(e.target.value === "custom" ? "custom" : "uniform")}
                    disabled={!activeProjectId || assigningWorkOrder}
                  >
                    <option value="uniform">Uniform due date for all selected staff</option>
                    <option value="custom">Custom due date per staff</option>
                  </select>
                </>
              )}
              {(!newOrderMultiAssignEnabled || !workOrderUsesCustomDueDates) && (
                <input
                  type="date"
                  value={newOrder.due_date}
                  onChange={(e) => setNewOrder({ ...newOrder, due_date: e.target.value })}
                  disabled={!activeProjectId || assigningWorkOrder}
                />
              )}
              <label className="green-work-checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(newOrder.auto_assign_first_cycle_maintenance)}
                  onChange={(e) =>
                    setNewOrder({ ...newOrder, auto_assign_first_cycle_maintenance: e.target.checked })
                  }
                  disabled={!activeProjectId || assigningWorkOrder}
                />
                <span>
                  New planting order: auto-assign first-cycle maintenance to the same field officer (optional)
                </span>
              </label>
              <p className="green-work-note">
                When enabled, day-one and first-cycle maintenance tasks from the model are created automatically for the same
                officer as soon as planting is submitted.
              </p>
              <label className="green-work-checkbox-row">
                <input
                  type="checkbox"
                  checked={newOrderAreaEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setNewOrderAreaEnabled(next);
                    if (!next) {
                      setNewOrderAreaLabel("");
                      setNewOrderAreaGeometry(null);
                      setNewOrder((prev) => ({ ...prev, allow_existing_tree_area_reuse: false }));
                    }
                  }}
                  disabled={!activeProjectId || assigningWorkOrder}
                />
                <span>Enable planting area (optional)</span>
              </label>
              {newOrderAreaEnabled && (
                <div className="green-work-assignment-area">
                  <label className="green-work-field-label" htmlFor="order-area-label">
                    Area Label
                  </label>
                  <input
                    id="order-area-label"
                    type="text"
                    placeholder="Optional (e.g. Block A - East plot)"
                    value={newOrderAreaLabel}
                    onChange={(e) => setNewOrderAreaLabel(e.target.value)}
                    disabled={!activeProjectId || assigningWorkOrder}
                  />
                  <p className="green-work-note">
                    When enabled, polygon map appears on the right side of this tab. Use map trash icon to clear and redraw.
                  </p>
                  <p className="green-work-note">
                    {newOrderAreaGeometry ? "Area captured and will be linked to this work order." : "No area polygon captured yet."}
                  </p>
                  <label className="green-work-checkbox-row">
                    <input
                      type="checkbox"
                      checked={Boolean(newOrder.allow_existing_tree_area_reuse)}
                      onChange={(e) =>
                        setNewOrder((prev) => ({
                          ...prev,
                          allow_existing_tree_area_reuse: e.target.checked,
                        }))
                      }
                    disabled={!activeProjectId || assigningWorkOrder}
                  />
                    <span>Allow this polygon to be reused in Green for existing-tree batch capture</span>
                  </label>
                  <p className="green-work-note">
                    When enabled, the assigned field officer can choose this supervisor polygon for existing-tree capture instead of drawing a new area.
                  </p>
                </div>
              )}
              <button
                className="btn-primary"
                onClick={createWorkOrder}
                disabled={!activeProjectId || assigningWorkOrder || (publicSponsorshipProject && assignmentUsers.length === 0)}
              >
                {assigningWorkOrder ? "Assigning..." : "Assign Work"}
              </button>
            </div>
          )}

          {activeForm === "assign_task" && (
            <div className="green-work-card">
              <h3>Assign Maintenance Task</h3>
              {!activeProjectId && <p className="green-work-note">Select project first from Project Focus.</p>}
              {publicSponsorshipProject && (
                <>
                  <div className="work-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                    <span className="green-work-live-pill ok">Sponsor-linked trees: {sponsoredPaidTrees.length}</span>
                    <span className="green-work-live-pill info">
                      Linked sponsor units: {sponsoredPaidTrees.reduce((acc, tree) => acc + Number(tree.sponsor_linked_units || 0), 0)}
                    </span>
                  </div>
                  <p className="green-work-note">
                    Approved maintenance on sponsor-linked trees feeds the sponsor timeline with the new field evidence and
                    status update.
                  </p>
                </>
              )}
              {publicSponsorshipProject && assignmentUsers.length === 0 ? (
                <p className="green-work-note danger">
                  No public sponsor agents are selected for this project yet. Open Users and save at least one sponsor agent first.
                </p>
              ) : null}
              {selectedMaintenanceRows.length > 0 ? (
                <div className="green-work-task-selection-card">
                  <div className="green-work-task-selection-head">
                    <strong>{selectedMaintenanceRows.length} live maintenance row{selectedMaintenanceRows.length === 1 ? "" : "s"} selected</strong>
                    <button type="button" onClick={() => setSelectedMaintenanceRowKeys([])}>
                      Clear selection
                    </button>
                  </div>
                  <p className="green-work-note">
                    These rows come from Live Maintenance, so dispatchers can assign work from urgency and tree context instead of raw tree numbers.
                  </p>
                  <div className="green-work-task-selection-list">
                    {selectedMaintenanceRows.slice(0, 8).map((row) => {
                      const selectedTree = trees.find((tree) => Number(tree.id) === Number(row.treeId)) || null;
                      const sponsorLabel = formatTreeSponsorshipLabel(selectedTree);
                      return (
                        <div key={`selected-maintenance-${row.key}`} className="green-work-task-selection-item">
                          <strong>{formatProjectTreeLabelById(row.treeId)}</strong>
                          <span>{row.activityLabel}</span>
                          <span>{row.indicator}</span>
                          {sponsorLabel ? <small>{sponsorLabel}</small> : null}
                        </div>
                      );
                    })}
                    {selectedMaintenanceRows.length > 8 && (
                      <span className="green-work-note">+ {selectedMaintenanceRows.length - 8} more selected rows</span>
                    )}
                  </div>
                  {maintenanceAssigneeStrategy === "manual" && selectedMaintenanceRows.length > 1 && maintenanceBulkAssignMode === "group_by_route" && maintenanceRouteGroups.length > 0 && (
                    <div className="green-work-task-selection-groups">
                      <strong>{maintenanceRouteGroups.length} custodian / route group{maintenanceRouteGroups.length === 1 ? "" : "s"} will stay together</strong>
                      <div className="green-work-task-selection-group-list">
                        {maintenanceRouteGroups.slice(0, 6).map((group) => (
                          <span key={`maintenance-route-group-${group.key}`} className="green-work-task-selection-group-chip">
                            {group.label} | {group.count}
                          </span>
                        ))}
                        {maintenanceRouteGroups.length > 6 && (
                          <span className="green-work-note">+ {maintenanceRouteGroups.length - 6} more groups</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <select
                    value={newTask.tree_id}
                    onChange={(e) => setNewTask({ ...newTask, tree_id: e.target.value })}
                    disabled={!activeProjectId}
                  >
                    <option value="">Select tree</option>
                    {maintenanceTreeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {selectedMaintenanceTreeRecord && formatTreeSponsorshipLabel(selectedMaintenanceTreeRecord) ? (
                    <p className="green-work-note">{formatTreeSponsorshipLabel(selectedMaintenanceTreeRecord)}</p>
                  ) : null}
                  <select
                    value={newTask.task_type}
                    onChange={(e) => setNewTask({ ...newTask, task_type: e.target.value })}
                    disabled={!activeProjectId}
                  >
                    <option value="watering">Watering</option>
                    <option value="weeding">Weeding</option>
                    <option value="protection">Protection</option>
                    <option value="inspection">Inspection</option>
                    <option value="replacement">Replacement</option>
                  </select>
                </>
              )}
              {maintenanceAssigneeStrategy === "manual" && selectedMaintenanceRows.length > 1 && (
                <>
                  <label className="green-work-field-label">Bulk assignment mode</label>
                  <select
                    value={maintenanceBulkAssignMode}
                    onChange={(e) => {
                      const nextMode =
                        e.target.value === "distribute_evenly"
                          ? "distribute_evenly"
                          : e.target.value === "group_by_route"
                            ? "group_by_route"
                          : "single_staff";
                      setMaintenanceBulkAssignMode(nextMode);
                      if (nextMode === "single_staff" && newTaskSelectedAssignees.length) {
                        setNewTask((prev) => ({ ...prev, assignee_name: newTaskSelectedAssignees[0] || prev.assignee_name }));
                      }
                      if (nextMode !== "single_staff" && !newTaskSelectedAssignees.length && String(newTask.assignee_name || "").trim()) {
                        setNewTaskSelectedAssignees([String(newTask.assignee_name || "").trim()]);
                      }
                    }}
                    disabled={!activeProjectId || assigningMaintenanceTask}
                  >
                    <option value="single_staff">Assign all selected rows to one staff</option>
                    <option value="distribute_evenly">Distribute selected rows evenly across selected staff</option>
                    <option value="group_by_route">Keep custodian / route groups together across selected staff</option>
                  </select>
                </>
              )}
              <label className="green-work-field-label">Assignment source</label>
              <select
                value={maintenanceAssigneeStrategy}
                onChange={(e) => {
                  const nextStrategy =
                    e.target.value === "tree_planter" ? "tree_planter" : "manual";
                  setMaintenanceAssigneeStrategy(nextStrategy);
                  if (nextStrategy === "manual") {
                    setMaintenancePlanterFallbackAssignee("");
                  }
                }}
                disabled={!activeProjectId || assigningMaintenanceTask}
              >
                <option value="manual">Choose staff manually</option>
                <option value="tree_planter">Assign to original planter(s)</option>
              </select>
              <p className="green-work-note">
                Original planter uses the tree&apos;s recorded planting/capture owner and matches it to an active staff account in this project.
              </p>
              {maintenanceAssigneeStrategy === "tree_planter" ? (
                <div className="green-work-assignment-preview">
                  <div className="green-work-assignment-preview-head">
                    <strong>Original planter routing</strong>
                    <span>
                      {maintenancePlanterAssignmentPreview.candidateCount > 1
                        ? "Each selected maintenance row will go back to the staff member who originally planted or captured that tree."
                        : "This task will go back to the staff member who originally planted or captured the tree."}
                    </span>
                  </div>
                  {maintenancePlanterAssignmentPreview.candidateCount === 0 ? (
                    <p className="green-work-note">Select a tree or maintenance row first to preview original-planter routing.</p>
                  ) : (
                    <>
                      {maintenancePlanterAssignmentPreview.unmatchedRows.length > 0 ? (
                        <>
                          <p className="green-work-note danger">
                            {maintenancePlanterAssignmentPreview.unmatchedRows.length} selected tree
                            {maintenancePlanterAssignmentPreview.unmatchedRows.length === 1 ? "" : "s"} do not match an active staff account. Choose a fallback assignee for those trees.
                          </p>
                          <select
                            value={maintenancePlanterFallbackAssignee}
                            onChange={(e) => setMaintenancePlanterFallbackAssignee(e.target.value)}
                            disabled={!activeProjectId || assigningMaintenanceTask}
                          >
                            <option value="">Fallback assignee for unmatched trees</option>
                            {assignmentUsers.map((u) => (
                              <option key={`maintenance-planter-fallback-${u.id}`} value={u.full_name}>
                                {u.full_name}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <p className="green-work-note">All selected trees have matching planter accounts.</p>
                      )}
                      {maintenancePlanterAssignmentPreview.entries.length > 0 ? (
                        <div className="green-work-assignment-preview-grid">
                          {maintenancePlanterAssignmentPreview.entries.map((entry) => (
                            <div key={`maintenance-planter-preview-${entry.assignee}`} className="green-work-assignment-preview-card">
                              <div className="green-work-assignment-preview-card-head">
                                <strong>{entry.assignee}</strong>
                                <span>{entry.rows.length} tree task{entry.rows.length === 1 ? "" : "s"}</span>
                              </div>
                              <div className="green-work-assignment-preview-list">
                                {entry.rows.slice(0, 6).map((row) => (
                                  <div key={`maintenance-planter-preview-row-${row.key}`} className="green-work-assignment-preview-item">
                                    <strong>{row.label}</strong>
                                    <span>
                                      {row.activityLabel}
                                      {row.species ? ` | ${row.species}` : ""}
                                    </span>
                                    <small>{row.indicator}</small>
                                  </div>
                                ))}
                                {entry.rows.length > 6 && (
                                  <span className="green-work-note">+ {entry.rows.length - 6} more rows for {entry.assignee}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {maintenancePlanterAssignmentPreview.unmatchedRows.length > 0 ? (
                        <div className="green-work-task-selection-groups">
                          <strong>Rows needing fallback assignment</strong>
                          <div className="green-work-task-selection-list">
                            {maintenancePlanterAssignmentPreview.unmatchedRows.slice(0, 6).map((row) => (
                              <div key={`maintenance-planter-unmatched-${row.key}`} className="green-work-task-selection-item">
                                <strong>{row.label}</strong>
                                <span>{row.activityLabel}</span>
                                <span>{row.indicator}</span>
                              </div>
                            ))}
                            {maintenancePlanterAssignmentPreview.unmatchedRows.length > 6 && (
                              <span className="green-work-note">
                                + {maintenancePlanterAssignmentPreview.unmatchedRows.length - 6} more unmatched rows
                              </span>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <>
              <label className="green-work-checkbox-row">
                <input
                  type="checkbox"
                  checked={
                    selectedMaintenanceRows.length > 1
                      ? maintenanceBulkAssignMode !== "single_staff"
                      : newTaskMultiAssignEnabled
                  }
                  onChange={(e) => {
                    if (selectedMaintenanceRows.length > 1) {
                      const enabled = e.target.checked;
                      if (enabled && !newTaskSelectedAssignees.length && String(newTask.assignee_name || "").trim()) {
                        setNewTaskSelectedAssignees([String(newTask.assignee_name || "").trim()]);
                      }
                      setMaintenanceBulkAssignMode(enabled ? "group_by_route" : "single_staff");
                      if (!enabled && newTaskSelectedAssignees.length) {
                        setNewTask((prev) => ({ ...prev, assignee_name: newTaskSelectedAssignees[0] || "" }));
                      }
                      return;
                    }
                    const enabled = e.target.checked;
                    setNewTaskMultiAssignEnabled(enabled);
                    if (enabled) {
                      setNewTaskSelectedAssignees((prev) =>
                        prev.length ? prev : (newTask.assignee_name.trim() ? [newTask.assignee_name.trim()] : []),
                      );
                    } else if (newTaskSelectedAssignees.length) {
                      setNewTask((prev) => ({ ...prev, assignee_name: newTaskSelectedAssignees[0] || "" }));
                    }
                  }}
                  disabled={!activeProjectId || assigningMaintenanceTask}
                />
                <span>
                  {selectedMaintenanceRows.length > 1 ? "Use multiple staff for selected maintenance" : "Assign to multiple staff"}
                </span>
              </label>
              {selectedMaintenanceRows.length > 1 && maintenanceBulkAssignMode === "single_staff" ? (
                <select
                  value={newTask.assignee_name}
                  onChange={(e) => setNewTask({ ...newTask, assignee_name: e.target.value })}
                  disabled={!activeProjectId || assigningMaintenanceTask}
                >
                  <option value="">Assign to</option>
                  {assignmentUsers.map((u) => (
                    <option key={u.id} value={u.full_name}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              ) : selectedMaintenanceRows.length > 1 && maintenanceBulkAssignMode !== "single_staff" ? (
                <div className="green-work-multi-assign-panel">
                  <div className="green-work-multi-assign-header">
                    <span>{currentTaskAssignees.length} selected</span>
                    <div className="work-actions">
                      <button
                        type="button"
                        onClick={() => setNewTaskSelectedAssignees(assignmentUsers.map((u) => u.full_name))}
                        disabled={!assignmentUsers.length || assigningMaintenanceTask}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewTaskSelectedAssignees([])}
                        disabled={!currentTaskAssignees.length || assigningMaintenanceTask}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="green-work-multi-assign-list">
                    {assignmentUsers.map((u) => (
                      <label key={u.id} className="green-work-multi-assign-item">
                        <input
                          type="checkbox"
                          checked={newTaskSelectedAssignees.includes(u.full_name)}
                          onChange={() => setNewTaskSelectedAssignees((prev) => toggleNamedSelection(prev, u.full_name))}
                          disabled={assigningMaintenanceTask}
                        />
                        <span>{u.full_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : !newTaskMultiAssignEnabled ? (
                <select
                  value={newTask.assignee_name}
                  onChange={(e) => setNewTask({ ...newTask, assignee_name: e.target.value })}
                  disabled={!activeProjectId || assigningMaintenanceTask}
                >
                  <option value="">Assign to</option>
                  {assignmentUsers.map((u) => (
                    <option key={u.id} value={u.full_name}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="green-work-multi-assign-panel">
                  <div className="green-work-multi-assign-header">
                    <span>{currentTaskAssignees.length} selected</span>
                    <div className="work-actions">
                      <button type="button" onClick={() => setNewTaskSelectedAssignees(assignmentUsers.map((u) => u.full_name))} disabled={!assignmentUsers.length || assigningMaintenanceTask}>
                        Select all
                      </button>
                      <button type="button" onClick={() => setNewTaskSelectedAssignees([])} disabled={!currentTaskAssignees.length || assigningMaintenanceTask}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="green-work-multi-assign-list">
                    {assignmentUsers.map((u) => (
                      <label key={u.id} className="green-work-multi-assign-item">
                        <input
                          type="checkbox"
                          checked={newTaskSelectedAssignees.includes(u.full_name)}
                          onChange={() => setNewTaskSelectedAssignees((prev) => toggleNamedSelection(prev, u.full_name))}
                          disabled={assigningMaintenanceTask}
                        />
                        <span>{u.full_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {selectedMaintenanceRows.length > 1 && maintenanceBulkAssignMode !== "single_staff" && (
                currentTaskAssignees.length === 1 ? (
                  <div className="green-work-assignment-preview">
                    <div className="green-work-assignment-preview-head">
                      <strong>Assignment preview</strong>
                      <span>All selected maintenance rows will go to the single selected staff member.</span>
                    </div>
                    <p className="green-work-note">
                      Only one staff is selected, so all selected maintenance rows will go to <strong>{currentTaskAssignees[0]}</strong>.
                      Select more staff if you want the rows split automatically.
                    </p>
                  </div>
                ) : maintenanceAssignmentPreview.length > 0 ? (
                  <div className="green-work-assignment-preview">
                    <div className="green-work-assignment-preview-head">
                      <strong>Assignment preview</strong>
                      <span>
                        {maintenanceBulkAssignMode === "group_by_route"
                          ? "Each staff member gets complete custodian / route groups."
                          : "Each staff member gets the rows shown below before you submit."}
                      </span>
                    </div>
                    <div className="green-work-assignment-preview-grid">
                      {maintenanceAssignmentPreview.map((entry) => (
                        <div key={`maintenance-preview-${entry.assignee}`} className="green-work-assignment-preview-card">
                          <div className="green-work-assignment-preview-card-head">
                            <strong>{entry.assignee}</strong>
                            <span>{entry.rows.length} tree task{entry.rows.length === 1 ? "" : "s"}</span>
                          </div>
                          {maintenanceBulkAssignMode === "group_by_route" && entry.groups?.length ? (
                            <div className="green-work-assignment-preview-groups">
                              {entry.groups.map((group) => (
                                <span
                                  key={`maintenance-preview-group-${entry.assignee}-${group.label}`}
                                  className="green-work-assignment-preview-group-chip"
                                >
                                  {group.label} | {group.count}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="green-work-assignment-preview-list">
                            {entry.rows.slice(0, 6).map((row) => (
                              <div key={`maintenance-preview-row-${row.key}`} className="green-work-assignment-preview-item">
                                <strong>{row.label}</strong>
                                <span>
                                  {row.activityLabel}
                                  {row.species ? ` | ${row.species}` : ""}
                                </span>
                                <small>{row.indicator}</small>
                              </div>
                            ))}
                            {entry.rows.length > 6 && (
                              <span className="green-work-note">+ {entry.rows.length - 6} more rows for {entry.assignee}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="green-work-note">
                    Select at least two staff to preview how the selected trees will be assigned.
                  </p>
                )
              )}
                </>
              )}
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                disabled={!activeProjectId || assigningMaintenanceTask}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <select
                value={newTask.due_mode}
                onChange={(e) => setNewTask({ ...newTask, due_mode: e.target.value as TaskDueMode })}
                disabled={!activeProjectId || assigningMaintenanceTask}
              >
                <option value="model_rainy">Date Based On Model (Rainy Season)</option>
                <option value="model_dry">Date Based On Model (Dry Season)</option>
                <option value="manual">Other Date (Custom)</option>
              </select>
              {selectedMaintenanceRows.length > 0 && bulkMaintenanceDuePreview ? (
                <>
                  {newTask.due_mode === "manual" ? (
                    <input
                      type="date"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                      disabled={!activeProjectId || assigningMaintenanceTask}
                    />
                  ) : (
                    <>
                      <input type="text" value="Per-tree model due dates" readOnly disabled />
                      <p className="green-work-note">{bulkMaintenanceDuePreview.detail}</p>
                      {bulkMaintenanceDuePreview.blockedCount > 0 && (
                        <p className="green-work-note danger">
                          {bulkMaintenanceDuePreview.blockedCount} selected row
                          {bulkMaintenanceDuePreview.blockedCount === 1 ? "" : "s"} cannot be auto-scheduled by the model.
                          Choose Other Date (Custom) or reduce the selection.
                        </p>
                      )}
                      {bulkMaintenanceDuePreview.pastDueCount > 0 && (
                        <p className="green-work-note danger">
                          {bulkMaintenanceDuePreview.pastDueCount} selected row
                          {bulkMaintenanceDuePreview.pastDueCount === 1 ? "" : "s"} already fall past the model due date.
                          Choose Other Date (Custom) if you want to proceed.
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : newTask.due_mode !== "manual" ? (
                <>
                  <input type="date" value={assignTaskModelPreview.dueDateInput} readOnly disabled />
                  <p className="green-work-note">{assignTaskModelPreview.detail}</p>
                  {assignTaskModelPreview.blocked && (
                    <p className="green-work-note danger">Model cannot auto-schedule this case. Choose Other Date (Custom).</p>
                  )}
                  {assignTaskModelPreview.isPastDue && (
                    <p className="green-work-note danger">
                      Model date passed by {assignTaskModelPreview.daysPastDue} day
                      {assignTaskModelPreview.daysPastDue === 1 ? "" : "s"}. Select Other Date (Custom).
                    </p>
                  )}
                  <p className="green-work-note">Model is computed from selected maintenance type and season.</p>
                </>
              ) : (
                <input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                  disabled={!activeProjectId || assigningMaintenanceTask}
                />
              )}
              <textarea
                placeholder="Notes"
                value={newTask.notes}
                onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                disabled={!activeProjectId || assigningMaintenanceTask}
              />
              <button
                className="btn-primary"
                onClick={assignTask}
                disabled={!activeProjectId || assigningMaintenanceTask || (publicSponsorshipProject && assignmentUsers.length === 0)}
              >
                {assigningMaintenanceTask ? "Assigning..." : "Assign Task"}
              </button>
            </div>
          )}

          {activeForm === "review_queue" && (
            <div className="green-work-card">
              <div className="green-work-row">
                <h3>Supervisor Review Queue</h3>
                {activeProjectId && (
                  <div className="work-actions">
                    <button type="button" onClick={() => void loadProjectData(activeProjectId)}>
                      Refresh
                    </button>
                  </div>
                )}
              </div>
              {!activeProjectId && <p className="green-work-note">Select project first from Project Focus.</p>}
              {activeProjectId && reviewQueue.length === 0 && <p className="green-work-note">No submitted tasks awaiting review.</p>}
              <div className="staff-list">
                {reviewQueue.map((task) => {
                  const reviewTreeRecord = treeById.get(Number(task.tree_id)) || null;
                  const fallbackTreeCoords = treeCoordinatesById.get(Number(task.tree_id));
                  const originalTreeLng = toFiniteCoord(task.tree_lng) ?? toFiniteCoord(fallbackTreeCoords?.lng);
                  const originalTreeLat = toFiniteCoord(task.tree_lat) ?? toFiniteCoord(fallbackTreeCoords?.lat);
                  const maintenanceLng = toFiniteCoord(task.activity_lng);
                  const maintenanceLat = toFiniteCoord(task.activity_lat);
                  const reviewPhotoRenderOptions = getReviewPhotoRenderOptions();
                  const evidencePhotos = getTaskPhotoUrls(task);
                  const distanceFromTreeMeters = computeDistanceMeters(
                    originalTreeLng,
                    originalTreeLat,
                    maintenanceLng,
                    maintenanceLat,
                  );
                  let distanceToneClass = "is-unknown";
                  if (distanceFromTreeMeters !== null) {
                    if (distanceFromTreeMeters <= 10) distanceToneClass = "is-close";
                    else if (distanceFromTreeMeters <= 30) distanceToneClass = "is-near";
                    else distanceToneClass = "is-far";
                  }
                  const reviewWorkflowProfile = fieldWorkflowMode ? activeWorkflowProfile : "green";
                  const reviewTaskLabel = formatWorkflowTaskTypeLabel(task.task_type, reviewWorkflowProfile);
                  const reviewEntityLabel = agricWorkflowMode
                    ? reviewTreeRecord
                      ? formatPlotRecordLabel(reviewTreeRecord)
                      : formatProjectTreeLabelById(task.tree_id)
                    : reliefWorkflowMode
                      ? reviewTreeRecord
                        ? formatReliefSiteLabel(reviewTreeRecord)
                        : formatProjectTreeLabelById(task.tree_id)
                    : formatProjectTreeLabelById(task.tree_id);
                  const reviewCropLabel = reviewTreeRecord ? getPlotCommodityLabel(reviewTreeRecord) : task.tree_species || "-";
                  const reviewPlotAreaLabel = reviewTreeRecord ? formatPlotAreaLabel(reviewTreeRecord) : "-";
                  const reviewSeasonLabel = reviewTreeRecord ? formatPlotSeasonLabel(reviewTreeRecord) : "-";
                  const reviewBoundaryLabel = formatBoundaryCaptureMethodLabel(
                    reviewTreeRecord?.record_profile_data?.boundary_capture_method,
                  );
                  const reviewReliefAssetType = reviewTreeRecord?.record_profile_data?.asset_type
                    ? formatTaskTypeLabel(reviewTreeRecord.record_profile_data.asset_type)
                    : "-";
                  const reviewReliefDamageLevel = reviewTreeRecord?.record_profile_data?.damage_level
                    ? formatReliefDamageLevelLabel(reviewTreeRecord.record_profile_data.damage_level)
                    : "-";
                  const reviewReliefResponsePathway = reviewTreeRecord?.record_profile_data?.response_pathway
                    ? formatTaskTypeLabel(reviewTreeRecord.record_profile_data.response_pathway)
                    : "-";
                  const reviewIrrigationLabel = reviewTreeRecord?.record_profile_data?.irrigation_type
                    ? formatTaskTypeLabel(reviewTreeRecord.record_profile_data.irrigation_type)
                    : "-";
                  const reviewStageLabel = reviewTreeRecord?.record_profile_data?.production_stage
                    ? formatTaskTypeLabel(reviewTreeRecord.record_profile_data.production_stage)
                    : "-";
                  return (
                  <div key={task.id} className="staff-row">
                    <div className="staff-row-head">
                      <strong>
                        Task #{task.id} - {reviewTaskLabel}
                      </strong>
                      <span>{task.assignee_name || "-"}</span>
                    </div>
                    <div className="staff-row-meta">
                      {reviewEntityLabel} | Due: {formatDateLabel(task.due_date)} | Priority: {task.priority || "normal"}
                    </div>
                    <div className="staff-row-meta">
                      Review: {task.review_state || "none"} | Submitted: {formatDateLabel(task.submitted_at || task.created_at)}
                    </div>
                    <div className="staff-row-meta">
                      {fieldWorkflowMode ? "Observed / reference date" : "Planting / reference date"}: {formatDateLabel(task.tree_planting_date || task.due_date || task.created_at)}
                    </div>
                    {agricWorkflowMode ? (
                      <>
                        <div className="staff-row-meta">
                          Farm details: Crop: {reviewCropLabel} | Area: {reviewPlotAreaLabel} | Boundary: {reviewBoundaryLabel} | Season: {reviewSeasonLabel}
                        </div>
                        <div className="staff-row-meta">
                          Farm profile: Irrigation: {reviewIrrigationLabel} | Stage: {reviewStageLabel} | Status: {treeStatusLabel(task.tree_status)}
                        </div>
                        <div className="staff-row-meta">
                          Farm GPS: {formatGpsPair(originalTreeLng, originalTreeLat)}
                        </div>
                        <div className="staff-row-meta">
                          Field GPS: {formatGpsPair(maintenanceLng, maintenanceLat)}
                          {task.activity_recorded_at ? ` | Captured: ${formatDateTimeLabel(task.activity_recorded_at)}` : ""}
                        </div>
                        <div className={`staff-row-meta green-work-review-distance ${distanceToneClass}`}>
                          Distance from farm anchor: {formatDistanceMeters(distanceFromTreeMeters)}
                        </div>
                      </>
                    ) : reliefWorkflowMode ? (
                      <>
                        <div className="staff-row-meta">
                          Site details: Type: {reviewReliefAssetType} | Damage: {reviewReliefDamageLevel} | Area: {reviewPlotAreaLabel} | Boundary: {reviewBoundaryLabel}
                        </div>
                        <div className="staff-row-meta">
                          Recovery profile: Response path: {reviewReliefResponsePathway} | Occupancy: {reviewTreeRecord?.record_profile_data?.occupancy_status || "-"} | Status: {treeStatusLabel(task.tree_status)}
                        </div>
                        <div className="staff-row-meta">
                          Site GPS: {formatGpsPair(originalTreeLng, originalTreeLat)}
                        </div>
                        <div className="staff-row-meta">
                          Visit GPS: {formatGpsPair(maintenanceLng, maintenanceLat)}
                          {task.activity_recorded_at ? ` | Captured: ${formatDateTimeLabel(task.activity_recorded_at)}` : ""}
                        </div>
                        <div className={`staff-row-meta green-work-review-distance ${distanceToneClass}`}>
                          Distance from site anchor: {formatDistanceMeters(distanceFromTreeMeters)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="staff-row-meta">
                          Tree metadata: Species: {task.tree_species || "-"} | Origin: {formatTreeOriginLabel(task.tree_origin)}
                          {Number.isFinite(Number(task.tree_height_m)) ? ` | Height: ${formatTreeHeight(task.tree_height_m)}` : ""}
                          {normalizeName(task.tree_origin) === "existing_inventory" &&
                          Number.isFinite(Number(task.tree_age_months)) &&
                          Number(task.tree_age_months) >= 0
                            ? ` | Estimated age: ${Math.round(Number(task.tree_age_months))}m`
                            : ""}
                        </div>
                        <div className="staff-row-meta">
                          Tree GPS: {formatGpsPair(originalTreeLng, originalTreeLat)}
                        </div>
                        <div className="staff-row-meta">
                          Maintenance GPS: {formatGpsPair(maintenanceLng, maintenanceLat)}
                          {task.activity_recorded_at ? ` | Captured: ${formatDateTimeLabel(task.activity_recorded_at)}` : ""}
                        </div>
                        <div className={`staff-row-meta green-work-review-distance ${distanceToneClass}`}>
                          Distance from tree: {formatDistanceMeters(distanceFromTreeMeters)}
                        </div>
                      </>
                    )}
                    {task.reported_tree_status && (
                      <div className="staff-row-meta">
                        {fieldWorkflowMode ? "Reported field condition" : "Reported condition"}: {formatTaskTypeLabel(task.reported_tree_status)}
                      </div>
                    )}
                    {task.review_notes && (
                      <div className="staff-row-meta">Latest supervisor note: {task.review_notes}</div>
                    )}
                    {(task.custodian_name || normalizeName(task.task_type) === "supervision") && (
                      <div className="staff-row-meta">
                        {fieldWorkflowMode ? activeWorkflowLabels.ownerSingular : "Custodian"}: {task.custodian_name || "-"} | Community: {task.custodian_community_name || "-"} | Contact:{" "}
                        {task.custodian_phone || task.custodian_email || task.custodian_contact_person || "-"}
                      </div>
                    )}
                    {normalizeName(task.task_type) === "supervision" && (
                      <div className="staff-row-meta">
                        {fieldWorkflowMode ? activeWorkflowLabels.supportVisitTitle.replace(/s$/, "") : "Supervision visit"}: {Number(task.supervision_visit_no || 0) || "-"} /{" "}
                        {Number(task.supervision_total_visits || 0) || "-"}
                      </div>
                    )}
                    <div className="staff-row-meta">
                      Evidence: {evidencePhotos.length} photo{evidencePhotos.length === 1 ? "" : "s"} /{" "}
                      {task.notes ? "notes" : "no-notes"}
                    </div>
                    {evidencePhotos.length > 0 && (
                      <div className="green-work-review-photo">
                        {evidencePhotos.map((photoUrl, photoIndex) => (
                          <img
                            key={`review-task-${task.id}-photo-${photoIndex}`}
                            src={toDisplayPhotoUrl(photoUrl, reviewPhotoRenderOptions)}
                            alt={`Task ${task.id} evidence ${photoIndex + 1}`}
                            loading={photoIndex === 0 ? "eager" : "lazy"}
                            decoding="async"
                            width={reviewPhotoRenderOptions.w || 560}
                            height={reviewPhotoRenderOptions.h || 420}
                          />
                        ))}
                      </div>
                    )}
                    <textarea
                      placeholder="Supervisor note (required for reject or metadata edit)"
                      value={reviewNoteByTaskId[task.id] ?? task.review_notes ?? ""}
                      onChange={(e) =>
                        setReviewNoteByTaskId((prev) => ({
                          ...prev,
                          [task.id]: e.target.value,
                        }))
                      }
                    />
                    <div className="work-actions">
                      <button type="button" onClick={() => void reviewSubmittedTask(task.id, "approve")}>
                        Approve
                      </button>
                      <button type="button" onClick={() => void reviewSubmittedTask(task.id, "metadata_edit")}>
                        Metadata Edit
                      </button>
                      <button type="button" onClick={() => void reviewSubmittedTask(task.id, "reject")}>
                        Reject
                      </button>
                      {normalizeName(task.review_state) === "approved" && (
                        <button type="button" onClick={() => void reopenApprovedTask(task.id)}>
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}
        </aside>

        <section className={`green-work-main ${overviewMode || liveTableMode || verraMode || remoteMonitoringMode || agricFarmerLiveMode || agricFieldCaptureMode || agricSupportVisitMode || shareImpactMode ? "overview-mode" : "single-mode"} ${mapViewMode ? "map-view-mode" : ""}`}>
          {shareImpactMode && (
            <ShareImpactPanel
              orgSlug={activeProjectRecord?.organization_slug ?? null}
              orgProjects={activeProjectRecord?.organization_id
                ? projects.filter((p) => Number(p.organization_id || 0) === Number(activeProjectRecord.organization_id))
                : activeProjectId ? projects.filter((p) => Number(p.id) === Number(activeProjectId)) : []}
              shareProjectId={shareImpactProjectId}
              onProjectChange={setShareImpactProjectId}
              workflowProfile={activeWorkflowProfile}
            />
          )}
          {activeProjectId && activeForm === "overview" && (
            <div className="green-work-card green-work-overview-card">
              <div className="green-work-row">
                <h3>Project Overview</h3>
                <div className="work-actions">
                  <button onClick={exportWorkCsv} disabled={workPartnerOrgPaused} title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}>
                    Export CSV
                  </button>
                  <button onClick={exportWorkPdf}>Export PDF</button>
                  <button onClick={exportWorkVerra} disabled={workPartnerOrgPaused} title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}>
                    Export Verra VCS
                  </button>
                  <label className="green-work-export-photo-toggle">
                    <input
                      type="checkbox"
                      checked={includePhotosInWorkPdf}
                      onChange={(e) => setIncludePhotosInWorkPdf(e.target.checked)}
                    />
                    <span>Include photos (appendix)</span>
                  </label>
                  <select
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                  >
                    {assignees.map((a) => (
                      <option key={a} value={a}>
                        {a === "all" ? "All staff" : a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="green-work-task-summary green-work-overview-summary">
                <h4>{assigneeFilter === "all" ? "All Staff Overview" : `${assigneeFilter} Overview`}</h4>
                <div className="green-work-task-summary-stats">
                  <span>Staff: {filteredOverviewSummary.length}</span>
                  <span>Orders: {filteredOverviewTotals.orderCount}</span>
                  <span>Target Trees: {filteredOverviewTotals.targetTrees}</span>
                  <span>Planted: {filteredOverviewTotals.plantedTrees}</span>
                  <span>Tasks: {filteredOverviewTotals.taskTotal}</span>
                  <span>Done: {filteredOverviewTotals.taskDone}</span>
                  <span>Pending: {filteredOverviewTotals.taskPending}</span>
                  <span>Overdue: {filteredOverviewTotals.taskOverdue}</span>
                </div>
                <div className="green-work-task-summary-stats">
                  <span>Open Alerts: {alertsSummary.total}</span>
                  <span>Danger: {alertsSummary.danger}</span>
                  <span>Warning: {alertsSummary.warning}</span>
                  <span>Info: {alertsSummary.info}</span>
                  <span>Awaiting Review: {reviewQueue.length}</span>
                </div>
              </div>
              {alertsList.length > 0 && (
                <div className="green-work-card">
                  <h4>Live Alerts</h4>
                  <div className="green-work-note">
                    {alertsList.slice(0, 5).map((alert: any) => (
                      <p key={alert.id}>
                        [{String(alert.severity || "warning").toUpperCase()}] {alert.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div className="green-work-overview-mini-grid">
                <OverviewDonutCard
                  title="Tree Health Mix"
                  totalLabel="Trees"
                  segments={treeHealthMixSegments}
                  context={`Context: status distribution for ${overviewScopeLabel}.`}
                />
                <OverviewDonutCard
                  title={overviewExecutionMix.title}
                  totalLabel={overviewExecutionMix.totalLabel}
                  segments={overviewExecutionMix.segments}
                  context={overviewExecutionMix.context}
                />
                <OverviewSpeciesBarCard
                  title="Trees Planted by Species"
                  rows={speciesPlantedRows}
                  context={`Context: planted tree count per species for ${overviewScopeLabel}.`}
                />
              </div>
              <div className="green-work-overview-bars">
                <div className="green-work-overview-bar-card">
                  <div className="green-work-overview-bar-head">
                    <h5>Planting Completion</h5>
                    <span>{Math.round(plantingCompletionPct)}%</span>
                  </div>
                  <div className="progress-bar">
                    <span style={{ width: `${plantingCompletionPct}%` }} />
                  </div>
                  <p>
                    {filteredOverviewTotals.plantedTrees} planted out of {filteredOverviewTotals.targetTrees} target trees.
                  </p>
                  <p className="green-work-chart-context">Context: shown for the current staff filter.</p>
                </div>
                <div className="green-work-overview-bar-card">
                  <div className="green-work-overview-bar-head">
                    <h5>Task Completion Mix</h5>
                    <span>{Math.round(taskDonePct)}% done</span>
                  </div>
                  <div className="progress-stack">
                    <span className="stack done" style={{ width: `${taskDonePct}%` }} />
                    <span className="stack pending" style={{ width: `${taskPendingPct}%` }} />
                    <span className="stack overdue" style={{ width: `${taskOverduePct}%` }} />
                  </div>
                  <div className="green-work-overview-legend">
                    <span className="done">Done</span>
                    <span className="pending">Pending</span>
                    <span className="overdue">Overdue</span>
                  </div>
                  <p className="green-work-chart-context">
                    Context: percentages use all tasks in scope (status + review state).
                  </p>
                </div>
                <div className="green-work-overview-bar-card">
                  <div className="green-work-overview-bar-head">
                    <h5>Maintenance Type Activity</h5>
                    <span>{maintenanceTypeOverview.length} types</span>
                  </div>
                  {maintenanceTypeOverview.length === 0 ? (
                    <p>No maintenance tasks recorded for this filter yet.</p>
                  ) : (
                    <div className="green-work-maint-type-list">
                      {maintenanceTypeOverview.slice(0, 5).map((item) => (
                        <div key={normalizeName(item.type)} className="green-work-maint-type-item">
                          <strong>{formatTaskTypeLabel(item.type)}</strong>
                          <span>Times: {item.total}</span>
                          <span>
                            Done/Pending/Overdue: {item.done}/{item.pending}/{item.overdue}
                          </span>
                          <span>Last date: {formatDateLabel(item.lastDate)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="green-work-overview-bar-card">
                  <div className="green-work-overview-bar-head">
                    <h5>Age-Based Survival</h5>
                    <span>30/90/180 days</span>
                  </div>
                  <div className="green-work-maint-type-list">
                    {ageSurvivalCheckpoints.map((item) => (
                      <div key={`age-survival-${item.day}`} className="green-work-maint-type-item">
                        <strong>Day {item.day}</strong>
                        <span>
                          Survival: {item.eligibleTrees > 0 ? `${item.survivalRate.toFixed(1)}%` : "n/a"}
                        </span>
                        <span>
                          Cohort: {item.survivedTrees}/{item.eligibleTrees} surviving
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="green-work-chart-context">
                    Context: trees eligible once planted for at least the checkpoint age.
                  </p>
                  {ageSurvivalMissingPlantingDate > 0 && (
                    <p className="green-work-chart-context">
                      {ageSurvivalMissingPlantingDate} tree(s) excluded because planting date is missing.
                    </p>
                  )}
                </div>
              </div>

              <div className="green-work-overview-trends">
                <SpeciesDailySurvivalChart
                  title="Species Survival Trend (Daily from Planting Date)"
                  series={speciesDailySurvivalSeries}
                  emptyMessage={speciesDailySurvivalEmptyMessage}
                  context={speciesDailySurvivalContext}
                />
                <OverviewMonthlySurvivalCard
                  title="Monthly Cohort Survival Snapshot"
                  rows={overviewMonthlySurvivalRows}
                  emptyMessage="No planted trees with valid planting dates in the last 12 months."
                  context={`Context: bars show planted cohorts vs currently healthy trees by month for ${overviewScopeLabel}; green area shows monthly healthy share trend.`}
                />
              </div>

              {carbonSummary && (
                <div className="green-work-carbon-panel">
                  <h4>Carbon Impact Summary</h4>
                  <p className="green-work-chart-context">
                    Context: current/annual are stock-flow estimates; projection is long-term modeled potential.
                  </p>
                  <div className="green-work-carbon-grid">
                    <div className="green-work-carbon-stat">
                      <span className="green-work-carbon-val">{carbonSummary.current_co2_tonnes.toFixed(1)}</span>
                      <span className="green-work-carbon-lbl">tonnes CO2 sequestered</span>
                    </div>
                    <div className="green-work-carbon-stat">
                      <span className="green-work-carbon-val">{carbonSummary.annual_co2_tonnes.toFixed(1)}</span>
                      <span className="green-work-carbon-lbl">tonnes CO2 / year</span>
                    </div>
                    <div className="green-work-carbon-stat accent">
                      <span className="green-work-carbon-val">{carbonSummary.projected_lifetime_co2_tonnes.toFixed(0)}</span>
                      <span className="green-work-carbon-lbl">tonnes projected (40yr)</span>
                    </div>
                    <div className="green-work-carbon-stat">
                      <span className="green-work-carbon-val">{carbonSummary.co2_per_tree_avg_kg.toFixed(1)}</span>
                      <span className="green-work-carbon-lbl">kg CO2 avg/tree</span>
                    </div>
                  </div>
                  {(carbonSummary.current_co2_tonnes <= 0 || carbonSummary.projected_lifetime_co2_tonnes <= 0) && (
                    <p className="green-work-carbon-warning">
                      CO2 is low/zero. Check tree planting dates and review status.
                      {carbonSummary.trees_missing_age_data > 0 &&
                        ` Missing age data: ${carbonSummary.trees_missing_age_data}.`}
                      {carbonSummary.trees_pending_review > 0 &&
                        ` Pending review: ${carbonSummary.trees_pending_review}.`}
                    </p>
                  )}
                  {carbonSummary.top_species.length > 0 && (
                    <div className="green-work-carbon-species">
                      <h5>Top Species by CO2 Contribution</h5>
                      {carbonSummary.top_species.slice(0, 5).map((sp) => (
                        <div key={sp.species} className="green-work-carbon-sp-row">
                          <span className="green-work-carbon-sp-name">
                            {sp.species}
                            {sp.model_species && normalizeName(sp.model_species) !== normalizeName(sp.species) && (
                              <small className="green-work-carbon-sp-model">model: {sp.model_species}</small>
                            )}
                          </span>
                          <span className="green-work-carbon-sp-count">{sp.count} trees</span>
                          <span className="green-work-carbon-sp-co2">{sp.co2_kg.toFixed(1)} kg CO2</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="green-work-carbon-method">Methodology: IPCC Tier 1 + Chave et al. (2014) pantropical allometric equation</p>
                </div>
              )}

              <div className="green-work-stats green-work-staff-overview">
                {filteredOverviewSummary.length === 0 && (
                  <p className="green-work-note">No staff overview data for the selected filter.</p>
                )}
                {filteredOverviewSummary.map((staff) => (
                  <div key={staff.name} className="stat-card staff-overview-card">
                    <div className="staff-overview-head">
                      <h4>{staff.name}</h4>
                      <span className={`staff-overview-status ${staff.statusTone}`}>{staff.statusLabel}</span>
                    </div>
                    <p className="staff-overview-position">{staff.position}</p>
                    <p>Planting Orders: {staff.orderCount}</p>
                    <p>Target Trees: {staff.targetTrees} | Planted: {staff.plantedTrees}</p>
                    <div className="progress-bar">
                      <span style={{ width: `${calcProgress(staff.plantedTrees, staff.targetTrees)}%` }} />
                    </div>
                    <p>Assigned Tasks: {staff.taskTotal}</p>
                    <p>Done: {staff.taskDone} | Pending: {staff.taskPending} | Overdue: {staff.taskOverdue}</p>
                    <p>
                      Last Maintenance: {staff.lastMaintenanceType} on {formatDateLabel(staff.lastMaintenanceDate)}
                    </p>
                    <div className="progress-stack">
                      <span className="stack done" style={{ width: `${calcProgress(staff.taskDone, staff.taskTotal)}%` }} />
                      <span
                        className="stack pending"
                        style={{ width: `${calcProgress(staff.taskPending, staff.taskTotal)}%` }}
                      />
                      <span
                        className="stack overdue"
                        style={{ width: `${calcProgress(staff.taskOverdue, staff.taskTotal)}%` }}
                      />
                    </div>
                    <div className="staff-overview-types">
                      {staff.taskTypeBreakdown.length === 0 ? (
                        <span className="staff-overview-type-chip">No maintenance types yet</span>
                      ) : (
                        staff.taskTypeBreakdown.map((typeItem: any) => (
                          <span key={`${staff.name}-${normalizeName(typeItem.type)}`} className="staff-overview-type-chip">
                            {formatTaskTypeLabel(typeItem.type)}: {typeItem.total}
                          </span>
                        ))
                      )}
                    </div>
                    {staff.recentMaintenance.length > 0 && (
                      <div className="staff-overview-recent">
                        <strong>Recent Maintenance</strong>
                        {staff.recentMaintenance.map((entry: any, idx: number) => (
                          <p key={`${staff.name}-${entry.treeId}-${idx}`}>
                            {formatProjectTreeLabelById(entry.treeId)} | {entry.type} | {entry.status} | {formatDateLabel(entry.date)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeProjectId && activeForm === "verra_reports" && (
            <div className="green-work-card green-work-verra-card">
              <div className="green-work-row">
                <h3>Verra Reports</h3>
                <div className="work-actions">
                  <button
                    type="button"
                    onClick={() => exportVerraPackage("zip")}
                    disabled={workPartnerOrgPaused}
                    title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}
                  >
                    Export Verra ZIP
                  </button>
                  <button
                    type="button"
                    onClick={() => exportVerraPackage("json")}
                    disabled={workPartnerOrgPaused}
                    title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}
                  >
                    Export Verra JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => exportVerraPackage("docx")}
                    disabled={workPartnerOrgPaused}
                    title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}
                  >
                    Export Verra DOCX
                  </button>
                  <button type="button" onClick={() => void loadVerraHistory(activeProjectId)}>
                    Refresh History
                  </button>
                </div>
              </div>

              <p className="green-work-chart-context">
                Use monitoring-period and verifier metadata filters before export. Every export is logged under this project for one-click rerun.
              </p>

              <div className="green-work-verra-filters">
                <label>
                  Monitoring Start
                  <input
                    type="date"
                    value={verraFilters.monitoring_start}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, monitoring_start: e.target.value }))}
                  />
                </label>
                <label>
                  Monitoring End
                  <input
                    type="date"
                    value={verraFilters.monitoring_end}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, monitoring_end: e.target.value }))}
                  />
                </label>
                <label>
                  Season Model
                  <select
                    value={verraFilters.season_mode}
                    onChange={(e) =>
                      setVerraFilters((prev) => ({
                        ...prev,
                        season_mode: (e.target.value === "dry" ? "dry" : "rainy") as SeasonMode,
                      }))
                    }
                  >
                    <option value="rainy">Rainy Season</option>
                    <option value="dry">Dry Season</option>
                  </select>
                </label>
                <label>
                  Staff Scope
                  <select
                    value={verraFilters.assignee_name}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, assignee_name: e.target.value }))}
                  >
                    {assignees.map((a) => (
                      <option key={`verra-assignee-${a}`} value={a}>
                        {a === "all" ? "All staff" : a}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Methodology ID
                  <input
                    type="text"
                    placeholder="e.g. VM0047"
                    value={verraFilters.methodology_id}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, methodology_id: e.target.value }))}
                  />
                </label>
                <label>
                  Generated By
                  <input
                    type="text"
                    placeholder="Supervisor name"
                    value={verraFilters.generated_by}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, generated_by: e.target.value }))}
                  />
                </label>
                <label className="is-wide">
                  Verifier-ready Notes
                  <textarea
                    rows={3}
                    placeholder="Notes for verifier package context..."
                    value={verraFilters.verifier_notes}
                    onChange={(e) => setVerraFilters((prev) => ({ ...prev, verifier_notes: e.target.value }))}
                  />
                </label>
              </div>

              <div className="green-work-verra-history">
                <h4>Project Export History</h4>
                {verraHistory.length === 0 ? (
                  <p className="green-work-note">No Verra export history yet for this project.</p>
                ) : (
                  <div className="green-work-live-table-wrap">
                    <table className="green-work-live-table green-work-verra-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Period</th>
                          <th>Methodology</th>
                          <th>Scope</th>
                          <th>Format</th>
                          <th>Summary</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verraHistory.map((item) => {
                          const periodText =
                            item.monitoring_start || item.monitoring_end
                              ? `${item.monitoring_start || "..."} to ${item.monitoring_end || "..."}`
                              : "Full project";
                          const summary = item.payload_summary || {};
                          return (
                            <tr key={`verra-history-${item.id}`}>
                              <td>{formatDateLabel(item.created_at)}</td>
                              <td>{periodText}</td>
                              <td>{item.methodology_id || "-"}</td>
                              <td>{item.assignee_name || "All staff"}</td>
                              <td>{String(item.output_format || "zip").toUpperCase()}</td>
                              <td>
                                Trees {Number(summary.tree_inventory_count || 0)} | Tasks {Number(summary.task_timeline_count || 0)}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="green-work-live-tree-link"
                                  onClick={() =>
                                    exportVerraPackage(
                                      normalizeVerraExportFormat(item.output_format),
                                      {
                                        monitoring_start: item.monitoring_start || "",
                                        monitoring_end: item.monitoring_end || "",
                                        methodology_id: item.methodology_id || "",
                                        verifier_notes: item.verifier_notes || "",
                                        generated_by: item.generated_by || "supervisor",
                                        season_mode: (String(item.season_mode || "rainy").toLowerCase() === "dry"
                                          ? "dry"
                                          : "rainy") as SeasonMode,
                                        assignee_name: item.assignee_name || "all",
                                      },
                                    )
                                  }
                                >
                                  Export again
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeProjectId && activeForm === "live_table" && (
            <div className="green-work-card green-work-live-card">
              <div className="green-work-row">
                <h3 className="green-work-live-title">
                  <span className="green-work-live-title-text">Live Maintenance Table</span>
                  <span className="green-work-live-title-indicator" aria-label="Live monitoring active">
                    <span className="green-work-live-title-dot" aria-hidden="true" />
                    <span className="green-work-live-title-wave" aria-hidden="true" />
                    Live Monitoring
                  </span>
                </h3>
                <div className="work-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void Promise.all([
                        loadProjectData(activeProjectId),
                        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, "new_planting"),
                        loadServerLiveMaintenance(activeProjectId, seasonMode, assigneeFilter, "existing_inventory"),
                      ])
                    }
                  >
                    Refresh
                  </button>
                  <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                    {assignees.map((a) => (
                      <option key={a} value={a}>
                        {a === "all" ? "All staff" : a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="green-work-live-scope-tabs" role="tablist" aria-label="Maintenance scope">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!liveTableIsExistingScope}
                  className={`green-work-live-scope-tab ${!liveTableIsExistingScope ? "active" : ""}`}
                  onClick={() => setLiveTreeScopeTab("new_planting")}
                >
                  New Planting
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={liveTableIsExistingScope}
                  className={`green-work-live-scope-tab ${liveTableIsExistingScope ? "active" : ""}`}
                  onClick={() => setLiveTreeScopeTab("existing_inventory")}
                >
                  Existing Trees
                </button>
              </div>
              <p className="green-work-chart-context">
                {liveTableIsExistingScope
                  ? "Context: existing-tree maintenance uses tree status, planting/reference date, captured age, replacement history, and approved maintenance completions for age-based scheduling."
                  : "Context: live monitoring for newly planted trees from planting date through establishment cycles."}
              </p>
              <div className="green-work-live-season-row">
                <label htmlFor="green-work-live-season-select">Season Model</label>
                <select
                  id="green-work-live-season-select"
                  value={seasonMode}
                  onChange={(e) => setSeasonMode(e.target.value as SeasonMode)}
                >
                  <option value="rainy">Rainy Season</option>
                  <option value="dry">Dry Season</option>
                </select>
              </div>
              {!liveTableIsExistingScope && (
                <>
                  <div className="green-work-live-maturity-row">
                    <label htmlFor="green-work-live-species-select">Species</label>
                    <select
                      id="green-work-live-species-select"
                      value={selectedMaturitySpecies}
                      onChange={(e) => {
                        const speciesKey = e.target.value;
                        setSelectedMaturitySpecies(speciesKey);
                        const currentYears = activeProjectMaturityMap[speciesKey];
                        setSelectedMaturityYears(currentYears ? String(currentYears) : "3");
                      }}
                    >
                      {projectSpeciesOptions.length === 0 ? (
                        <option value="">No species in this project yet</option>
                      ) : (
                        projectSpeciesOptions.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.label}
                          </option>
                        ))
                      )}
                    </select>

                    <label htmlFor="green-work-live-years-select">Peg Years</label>
                    <select
                      id="green-work-live-years-select"
                      value={selectedMaturityYears}
                      onChange={(e) => setSelectedMaturityYears(e.target.value)}
                      disabled={!selectedMaturitySpecies}
                    >
                      {Array.from({ length: 15 }, (_, index) => index + 1).map((years) => (
                        <option key={years} value={years}>
                          {years} {years === 1 ? "Year" : "Years"}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="green-work-live-years-btn"
                      onClick={saveSpeciesMaturityYears}
                      disabled={!selectedMaturitySpecies}
                    >
                      Save Peg
                    </button>
                  </div>
                  <div className="green-work-live-maturity-list">
                    {speciesMaturityRows.length === 0 ? (
                      <span className="green-work-live-maturity-chip is-empty">Add trees with species to configure peg years.</span>
                    ) : (
                      speciesMaturityRows.map((item) => (
                        <span
                          key={item.key}
                          className={`green-work-live-maturity-chip ${item.years ? "is-set" : "is-empty"}`}
                        >
                          {item.label}: {item.years ? `${item.years} years` : "Not set"}
                        </span>
                      ))
                    )}
                  </div>
                </>
              )}

              <div className="green-work-live-summary">
                <span className="green-work-live-pill neutral">Season: {SEASON_LABEL[seasonMode]}</span>
                <span className="green-work-live-pill danger">Danger: {displayedLiveSummary.danger}</span>
                <span className="green-work-live-pill warning">In Progress / Due Soon: {displayedLiveSummary.warning}</span>
                <span className="green-work-live-pill ok">On Track: {displayedLiveSummary.ok}</span>
                <span className="green-work-live-pill info">
                  {liveTableIsExistingScope ? "Needs Age Data" : "Needs Planting Date"}: {displayedLiveSummary.info}
                </span>
                <span className="green-work-live-pill neutral">Rows: {displayedLiveSummary.total}</span>
              </div>
              <div className="green-work-live-filter-row">
                <label htmlFor="green-work-live-attention-filter">Queue filter</label>
                <select
                  id="green-work-live-attention-filter"
                  value={maintenanceAttentionFilter}
                  onChange={(e) => setMaintenanceAttentionFilter(e.target.value as MaintenanceAttentionFilter)}
                >
                  <option value="all">All maintenance rows</option>
                  <option value="needs_action">Needs attention now</option>
                  <option value="no_open_task">No open task assigned</option>
                  <option value="overdue">Overdue</option>
                  <option value="due_soon">Due soon</option>
                  <option value="replacement_required">Replacement required</option>
                  <option value="inspection_flags">Inspection / condition flags</option>
                </select>
                <span>Filter the queue before selecting rows for dispatch.</span>
              </div>

              <div className="green-work-live-bulk-bar">
                <div className="green-work-live-bulk-copy">
                  <strong>
                    {selectedMaintenanceRows.length} selected
                    {hiddenMaintenanceSelectionCount > 0
                      ? ` (${displayedMaintenanceSelectionCount} visible in this queue)`
                      : ""}
                  </strong>
                  <span>
                    {hiddenMaintenanceSelectionCount > 0
                      ? `${hiddenMaintenanceSelectionCount} selected row${hiddenMaintenanceSelectionCount === 1 ? "" : "s"} are hidden by the current scope or queue filter.`
                      : "Select rows to assign one tree, many trees, or distribute work across staff."}
                  </span>
                </div>
                <div className="work-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedMaintenanceRowKeys((prev) => Array.from(new Set([...prev, ...displayedLiveRows.map((row) => row.key)])))}
                    disabled={!displayedLiveRows.length}
                  >
                    Select visible
                  </button>
                  <button type="button" onClick={() => setSelectedMaintenanceRowKeys([])} disabled={!selectedMaintenanceRows.length}>
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMaintenanceMapFocusEnabled(true);
                      setActiveForm("map_view");
                      setMenuOpen(false);
                      setStaffMenu(null);
                      setLiveTreeMenu(null);
                    }}
                    disabled={!selectedMaintenanceRows.length}
                  >
                    View selected on map
                  </button>
                  <button type="button" className="btn-primary" onClick={() => openAssignTaskForSelectedRows()} disabled={!selectedMaintenanceRows.length}>
                    Assign selected
                  </button>
                </div>
              </div>

              <div className="green-work-live-table-wrap">
                <table className="green-work-live-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Tree</th>
                      <th>Staff</th>
                      <th>Activity</th>
                      <th>Tree Age</th>
                      <th>Last Done</th>
                      <th>Model Due</th>
                      <th>Assigned Due</th>
                      <th>Countdown</th>
                      <th>Status</th>
                      <th>Indicator</th>
                      <th>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedLiveRows.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="green-work-live-empty">
                          {liveTableIsExistingScope
                            ? "No existing-tree maintenance rows available for this filter."
                            : "No tree maintenance rows available for this filter."}
                        </td>
                      </tr>
                    ) : (
                      displayedLiveRows.map((row) => {
                        const rowTree = trees.find((tree) => Number(tree.id) === Number(row.treeId));
                        const isSelected = selectedMaintenanceRowKeys.includes(row.key);
                        return (
                        <tr key={row.key} className={`tone-${row.tone} ${isSelected ? "is-selected" : ""}`}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleMaintenanceRowSelection(row.key)}
                              aria-label={`Select ${formatProjectTreeLabelById(row.treeId)} ${row.activityLabel}`}
                            />
                          </td>
                          <td>
                            <div className="green-work-live-tree-cell">
                              <button
                                type="button"
                                className="green-work-live-tree-link"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setStaffMenu(null);
                                  setLiveTreeMenu({ treeId: row.treeId, x: event.clientX, y: event.clientY, taskType: row.activity });
                                }}
                              >
                                {formatProjectTreeLabelById(row.treeId)}
                              </button>
                              <span className="green-work-live-hint">
                                {(rowTree?.species || "Species -")} | {treeStatusLabel(rowTree?.status)} | {formatTreeOriginLabel(row.treeOrigin)}
                              </span>
                              <button
                                type="button"
                                className="green-work-live-assign-link"
                                onClick={() => openAssignTaskForSelectedRows([row])}
                              >
                                Assign this
                              </button>
                            </div>
                          </td>
                          <td>{row.assignee}</td>
                          <td>
                            <strong>{row.activityLabel}</strong>
                            <span className="green-work-live-hint">{row.modelRationale}</span>
                          </td>
                          <td>{row.treeAgeDays === null ? "-" : `${row.treeAgeDays}d`}</td>
                          <td>{formatDateLabel(row.lastDoneAt)}</td>
                          <td>{formatDateLabel(row.modelDueDate)}</td>
                          <td>{formatDateLabel(row.assignedDueDate)}</td>
                          <td
                            className={`green-work-live-countdown ${
                              row.countdownDays !== null && row.countdownDays < 0 ? "overdue" : ""
                            }`}
                          >
                            {row.countdownDays === null
                              ? "-"
                              : row.countdownDays < 0
                                ? `${Math.abs(row.countdownDays)}d late`
                                : row.countdownDays === 0
                                  ? "Due today"
                                  : `${row.countdownDays}d left`}
                          </td>
                          <td>{row.statusText}</td>
                          <td>
                            <span className={`green-work-live-indicator ${row.tone}`}>{row.indicator}</span>
                          </td>
                          <td>
                            Done {row.doneCount} | Open {row.pendingCount} | Overdue {row.overdueCount}
                          </td>
                        </tr>
                      )})
                    )}
                  </tbody>
                </table>
              </div>

              <div className="green-work-live-sources">
                <h4>Schedule Sources</h4>
                <p>
                  {liveTableIsExistingScope
                    ? "Existing-tree maintenance follows the same Nigeria-adapted field cadence, but tree age can be derived from planting/reference date or captured age metadata. Routine watering and weeding are suppressed once the tree is clearly beyond establishment unless a live task or condition trigger exists."
                    : `Cadence is a Nigeria-adapted field model for live monitoring using ${SEASON_LABEL[seasonMode]} assumptions. Review intervals seasonally by state-level rainfall outlook.`}
                </p>
                <ul>
                  {displayedLiveSources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeProjectId && activeForm === "existing_tree_intake" && (
            <div className="green-work-card">
              <div className="green-work-row">
                <h3>{agricWorkflowMode ? "Plot Records Inventory" : reliefWorkflowMode ? "Site Records Inventory" : "Existing Trees Inventory"}</h3>
                <div className="work-actions">
                  <button
                    type="button"
                    onClick={exportExistingTreesCsv}
                    disabled={workPartnerOrgPaused}
                    title={workPartnerOrgPaused ? "Paused organizations can export PDF only" : undefined}
                  >
                    {agricWorkflowMode ? "Export Plot CSV" : reliefWorkflowMode ? "Export Site CSV" : "Export CSV"}
                  </button>
                  <button type="button" onClick={exportExistingTreesPdf}>
                    {agricWorkflowMode ? "Export Plot PDF" : reliefWorkflowMode ? "Export Site PDF" : "Export PDF"}
                  </button>
                  <label className="green-work-export-photo-toggle">
                    <input
                      type="checkbox"
                      checked={includePhotosInExistingTreesPdf}
                      onChange={(e) => setIncludePhotosInExistingTreesPdf(e.target.checked)}
                    />
                    <span>Include photos (appendix)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      void Promise.all([
                        loadProjectData(activeProjectId),
                        loadExistingTreeMetrics(activeProjectId),
                      ])
                    }
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <p className="green-work-chart-context">
                {agricWorkflowMode
                  ? "Context: mapped plot records captured in the Agric mobile workflow, including area, crop, season, and support-ready field metadata."
                  : reliefWorkflowMode
                    ? "Context: mapped site records captured in the Relief mobile workflow, including damage level, response pathway, boundary area, and field evidence."
                  : "Context: trees tagged as Existing using origin, attribution scope, KPI scope, or source-project linkage."}
              </p>
              <div className="green-work-live-summary">
                <span className="green-work-live-pill neutral">Rows: {existingTreeIntakeRows.length}</span>
                {fieldWorkflowMode ? (
                  <>
                    <span className="green-work-live-pill ok">
                      Mapped Area: {existingTreeIntakeAgricSummary.totalAreaHectares.toFixed(2)} ha
                    </span>
                    {agricWorkflowMode ? (
                      <span className="green-work-live-pill neutral">
                        Est. Yield: {existingTreeIntakeAgricSummary.totalEstimatedYieldKg.toFixed(0)} kg
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className={`green-work-live-pill ${existingTreeMetricsLoading ? "warning" : "ok"}`}>
                    CO2 Metrics: {existingTreeMetricsLoading ? "Loading..." : `${Object.keys(existingTreeMetricsById).length} rows`}
                  </span>
                )}
              </div>
              <div className="green-work-live-table-wrap">
                <table className="green-work-live-table">
                  <thead>
                    {agricWorkflowMode ? (
                      <tr>
                        <th>Plot</th>
                        <th>Farmer</th>
                        <th>Crop</th>
                        <th>Area</th>
                        <th>Season</th>
                        <th>Irrigation</th>
                        <th>Stage</th>
                        <th>Est. Yield</th>
                        <th>Status</th>
                        <th>Boundary</th>
                        <th>Observed</th>
                        <th>Captured By</th>
                      </tr>
                    ) : reliefWorkflowMode ? (
                      <tr>
                        <th>Site</th>
                        <th>Beneficiary</th>
                        <th>Asset Type</th>
                        <th>Damage</th>
                        <th>Area</th>
                        <th>Response Path</th>
                        <th>Occupancy</th>
                        <th>Population Served</th>
                        <th>Status</th>
                        <th>Observed</th>
                        <th>Captured By</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>Tree</th>
                        <th>Trees</th>
                        <th>Area</th>
                        <th>Species</th>
                        <th>Date</th>
                        <th>Origin</th>
                        <th>Attribution</th>
                        <th>Status</th>
                        <th>Age</th>
                        <th>Height</th>
                        <th>CO2</th>
                        <th>Custodian</th>
                        <th>Tag</th>
                        <th>Created By</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {existingTreeIntakeRows.length === 0 ? (
                      <tr>
                        <td colSpan={agricWorkflowMode ? 12 : reliefWorkflowMode ? 11 : 14} className="green-work-live-empty">
                          {agricWorkflowMode
                            ? "No plot records found in this project yet."
                            : reliefWorkflowMode
                              ? "No site records found in this project yet."
                            : "No Existing Tree records found in this project yet."}
                        </td>
                      </tr>
                    ) : (
                      existingTreeIntakeRows.slice(0, 500).map((tree) => {
                        const metric = existingTreeMetricsById[Number(tree.id)];
                        return agricWorkflowMode ? (
                          <tr key={`existing-main-${tree.id}`}>
                            <td>{formatPlotRecordLabel(tree)}</td>
                            <td>{tree.custodian_name || "-"}</td>
                            <td>{getPlotCommodityLabel(tree)}</td>
                            <td>{formatPlotAreaLabel(tree, metric)}</td>
                            <td>{formatPlotSeasonLabel(tree)}</td>
                            <td>{tree.record_profile_data?.irrigation_type ? formatTaskTypeLabel(tree.record_profile_data.irrigation_type) : "-"}</td>
                            <td>{tree.record_profile_data?.production_stage ? formatTaskTypeLabel(tree.record_profile_data.production_stage) : "-"}</td>
                            <td>
                              {Number.isFinite(Number(tree.record_profile_data?.estimated_yield_kg))
                                ? Number(tree.record_profile_data?.estimated_yield_kg).toFixed(0)
                                : "-"}
                            </td>
                            <td>{formatTaskTypeLabel(tree.status)}</td>
                            <td>{formatBoundaryCaptureMethodLabel(tree.record_profile_data?.boundary_capture_method)}</td>
                            <td>{formatDateLabel(tree.planting_date)}</td>
                            <td>{tree.created_by || "-"}</td>
                          </tr>
                        ) : reliefWorkflowMode ? (
                          <tr key={`existing-main-${tree.id}`}>
                            <td>{formatReliefSiteLabel(tree)}</td>
                            <td>{tree.custodian_name || "-"}</td>
                            <td>{tree.record_profile_data?.asset_type ? formatTaskTypeLabel(tree.record_profile_data.asset_type) : "-"}</td>
                            <td>{formatReliefDamageLevelLabel(tree.record_profile_data?.damage_level)}</td>
                            <td>{formatPlotAreaLabel(tree, metric)}</td>
                            <td>{tree.record_profile_data?.response_pathway ? formatTaskTypeLabel(tree.record_profile_data.response_pathway) : "-"}</td>
                            <td>{tree.record_profile_data?.occupancy_status ? formatTaskTypeLabel(tree.record_profile_data.occupancy_status) : "-"}</td>
                            <td>{Number.isFinite(Number(tree.record_profile_data?.population_served)) ? Number(tree.record_profile_data?.population_served) : "-"}</td>
                            <td>{formatTaskTypeLabel(tree.status)}</td>
                            <td>{formatDateLabel(tree.planting_date)}</td>
                            <td>{tree.created_by || "-"}</td>
                          </tr>
                        ) : (
                          <tr key={`existing-main-${tree.id}`}>
                            <td>{formatProjectTreeLabelById(tree.id).replace("Tree ", "")}</td>
                            <td>{formatExistingTreeCountLabel(tree, metric)}</td>
                            <td>{formatExistingTreeAreaLabel(tree, metric)}</td>
                            <td>{tree.species || "-"}</td>
                            <td>{formatDateLabel(tree.planting_date)}</td>
                            <td>{formatTreeOriginLabel(tree.tree_origin)}</td>
                            <td>{formatAttributionScopeLabel(tree.attribution_scope)}</td>
                            <td>{formatTaskTypeLabel(tree.status)}</td>
                            <td>{formatExistingTreeAgeLabel(tree, metric)}</td>
                            <td>{formatTreeHeight(tree.tree_height_m)}</td>
                            <td>{formatExistingTreeCo2Label(metric)}</td>
                            <td>{tree.custodian_name || "-"}</td>
                            <td>
                              <button
                                type="button"
                                onClick={() => window.open(`${BACKEND_URL}/green/trees/${tree.id}/qr-tag/pdf`, "_blank")}
                                style={{ padding: '2px 6px', fontSize: '11px', background: '#083e20', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                Print
                              </button>
                            </td>
                            <td>{tree.created_by || "-"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeProjectId &&
            (activeForm === "live_table" ||
              (!fieldWorkflowMode && activeForm === "custodian_hub") ||
              agricFarmerLiveMode ||
              agricFieldCaptureMode ||
              agricSupportVisitMode) && (
            <div className="green-work-card">
              <div className="green-work-row">
                <h3>
                  {fieldWorkflowMode
                    ? agricFieldCaptureMode
                      ? "Field Capture Assignment Table"
                      : agricSupportVisitMode
                        ? activeWorkflowProfile === "relief_recovery"
                          ? "Relief Visit Assignment Table"
                          : "Support Visit Assignment Table"
                        : activeWorkflowProfile === "relief_recovery"
                          ? "Beneficiary Live Results Table"
                          : "Farmer Live Results Table"
                    : "Custodian Live Results Table"}
                </h3>
                <div className="work-actions">
                  <button type="button" onClick={() => void Promise.all([loadProjectData(activeProjectId), loadCommunityData(activeProjectId)])}>
                    Refresh
                  </button>
                </div>
              </div>
              <p className="green-work-chart-context">
                {fieldWorkflowMode
                  ? agricFieldCaptureMode
                    ? activeWorkflowProfile === "relief_recovery"
                      ? "Context: assign first site capture to beneficiaries with no mapped sites yet. These tasks open in Map & Assess Sites in the mobile app."
                      : "Context: assign first field capture to farmers with no mapped plots yet. These tasks open in Map & Add Plot in the mobile app."
                    : agricSupportVisitMode
                      ? activeWorkflowProfile === "relief_recovery"
                        ? "Context: assign follow-up relief or recovery visits after sites have been captured and a relief allocation exists."
                        : "Context: assign follow-up support visits only after plots have been captured and a support allocation exists."
                      : activeWorkflowProfile === "relief_recovery"
                        ? "Context: live roll-up by beneficiary using support allocations, mapped sites, and relief follow-up activity in this project."
                        : "Context: live roll-up by farmer using support allocations, mapped plots, and field follow-up activity in this project."
                  : "Context: live roll-up by custodian using allocations + tracked tree statuses in this project."}
              </p>
              <div className="green-work-live-summary">
                <span className="green-work-live-pill neutral">
                  {fieldWorkflowMode ? activeWorkflowLabels.ownerPlural : "Custodians"}: {displayedCustodianLiveSummary.totalRows}
                </span>
                <span className="green-work-live-pill ok">Verified: {displayedCustodianLiveSummary.verified}</span>
                <span className="green-work-live-pill neutral">
                  {fieldWorkflowMode ? "Units Allocated" : "Seedlings Allocated"}: {displayedCustodianLiveSummary.units}
                </span>
                <span className="green-work-live-pill neutral">
                  {fieldWorkflowMode
                    ? agricFieldCaptureMode
                      ? "Field Capture"
                      : activeWorkflowProfile === "relief_recovery"
                        ? "Relief Visits"
                        : "Visits"
                    : "Supervision"}: {displayedCustodianLiveSummary.visitDone}/{displayedCustodianLiveSummary.visitTarget} done
                </span>
                <span className="green-work-live-pill warning">
                  {fieldWorkflowMode
                    ? agricFieldCaptureMode
                      ? "Capture Live"
                      : activeWorkflowProfile === "relief_recovery"
                        ? "Relief Live"
                        : "Visit Live"
                    : "Supervision Live"}: {displayedCustodianLiveSummary.visitLive}
                </span>
              </div>
              <div className="green-work-live-table-wrap">
                <table className="green-work-live-table">
                  <thead>
                    <tr>
                      <th>{fieldWorkflowMode ? activeWorkflowLabels.ownerSingular : "Custodian"}</th>
                      <th>Type</th>
                      <th>Verification</th>
                      <th>Contact</th>
                      <th>{fieldWorkflowMode ? "Support Allocations" : "Allocations"}</th>
                      <th>{fieldWorkflowMode ? "Units" : "Seedlings"}</th>
                      <th>Events</th>
                      <th>{fieldWorkflowMode ? activeWorkflowProfile === "relief_recovery" ? "Sites" : "Plots" : "Trees Tracked"}</th>
                      <th>{fieldWorkflowMode ? activeWorkflowProfile === "relief_recovery" ? "Mapped Sites" : "Mapped Plots" : "Existing Trees"}</th>
                      <th>{fieldWorkflowMode ? activeWorkflowProfile === "relief_recovery" ? "Ready %" : "Good %" : "Healthy %"}</th>
                      <th>
                        {fieldWorkflowMode
                          ? agricFieldCaptureMode
                            ? "Capture Target"
                            : activeWorkflowProfile === "relief_recovery"
                              ? "Relief Target"
                              : "Visit Target"
                          : "Sup Target"}
                      </th>
                      <th>
                        {fieldWorkflowMode
                          ? agricFieldCaptureMode
                            ? "Capture Live"
                            : activeWorkflowProfile === "relief_recovery"
                              ? "Relief Live"
                              : "Visit Live"
                          : "Sup Live"}
                      </th>
                      <th>
                        {fieldWorkflowMode
                          ? agricFieldCaptureMode
                            ? "Capture Done"
                            : activeWorkflowProfile === "relief_recovery"
                              ? "Relief Done"
                              : "Visit Done"
                          : "Sup Done"}
                      </th>
                      <th>Last Event</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedCustodianLiveRows.length === 0 ? (
                      <tr>
                        <td colSpan={15} className="green-work-live-empty">
                          {fieldWorkflowMode
                            ? agricFieldCaptureMode
                              ? activeWorkflowProfile === "relief_recovery"
                                ? "No beneficiaries are waiting for first site capture right now."
                                : "No farmers are waiting for first field capture right now."
                              : agricSupportVisitMode
                                ? activeWorkflowProfile === "relief_recovery"
                                  ? "No beneficiaries are ready for relief-visit assignment yet."
                                  : "No farmers are ready for support-visit assignment yet."
                                : activeWorkflowProfile === "relief_recovery"
                                  ? "No beneficiary activity records yet."
                                  : "No farmer activity records yet."
                            : "No custodian activity records yet."}
                        </td>
                      </tr>
                    ) : (
                      displayedCustodianLiveRows.map((row) => {
                        const rowAllocations = distributionAllocations
                          .filter((item) => Number(item.custodian_id) === Number(row.custodian.id))
                          .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
                        const isAssignOpen = Number(custodianAssignDraft?.custodian_id || 0) === Number(row.custodian.id);
                        const requiresFirstFieldCapture = fieldWorkflowMode && Number(row.treeTotal || 0) <= 0;
                        const hasOpenFieldCapture = Boolean(row.hasOpenFieldCapture);
                        const targetCount = agricFieldCaptureMode ? 1 : row.supervisionTarget;
                        const liveCount = agricFieldCaptureMode ? row.fieldCaptureLive : row.supervisionLive;
                        const doneCount = agricFieldCaptureMode ? row.fieldCaptureDone : row.supervisionDone;
                        const selectedAllocation = rowAllocations.find(
                          (item) => Number(item.id) === Number(custodianAssignDraft?.allocation_id || 0),
                        );
                        return (
                          <Fragment key={`custodian-live-wrap-${row.custodian.id}`}>
                            <tr key={`custodian-live-${row.custodian.id}`}>
                              <td>
                                <button
                                  type="button"
                                  className="green-work-link-btn"
                                  onClick={() =>
                                    openCustodianSupervisionAssign(
                                      Number(row.custodian.id),
                                      activeAgricAssignmentMode || (requiresFirstFieldCapture ? "field_capture" : "support_visit"),
                                    )
                                  }
                                  disabled={workPartnerOrgPaused || (agricFieldCaptureMode && hasOpenFieldCapture)}
                                >
                                  {row.custodian.name || "-"}
                                </button>
                              </td>
                              <td>{formatTaskTypeLabel(row.custodian.custodian_type)}</td>
                              <td>{formatTaskTypeLabel(row.custodian.verification_status || "pending")}</td>
                              <td>{row.custodian.phone || row.custodian.email || "-"}</td>
                              <td>{row.allocations}</td>
                              <td>{row.seedlings}</td>
                              <td>{row.eventCount}</td>
                              <td>{row.treeTotal}</td>
                              <td>{row.existingTreeTotal}</td>
                              <td>{row.healthyRate === null ? "-" : `${row.healthyRate.toFixed(1)}%`}</td>
                              <td>{targetCount}</td>
                              <td>{liveCount}</td>
                              <td>{doneCount}</td>
                              <td>{formatDateLabel(row.lastEventDate)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="green-row-btn"
                                  onClick={() => {
                                    if (fieldWorkflowMode && agricFarmerLiveMode) {
                                      openForm(requiresFirstFieldCapture ? "field_capture_assign" : "support_visit_assign");
                                    }
                                    openCustodianSupervisionAssign(
                                      Number(row.custodian.id),
                                      activeAgricAssignmentMode || (requiresFirstFieldCapture ? "field_capture" : "support_visit"),
                                    );
                                  }}
                                  disabled={workPartnerOrgPaused || (agricFieldCaptureMode && hasOpenFieldCapture)}
                                >
                                  {fieldWorkflowMode
                                    ? agricFarmerLiveMode
                                      ? requiresFirstFieldCapture
                                        ? "Open Field Capture"
                                        : activeWorkflowProfile === "relief_recovery"
                                          ? "Open Relief Visit"
                                          : "Open Support Visit"
                                      : agricFieldCaptureMode && hasOpenFieldCapture
                                        ? "Field Capture Assigned"
                                      : requiresFirstFieldCapture
                                        ? "Assign First Field Capture"
                                        : activeWorkflowProfile === "relief_recovery"
                                          ? "Assign Relief Visit"
                                          : "Assign Support Visit"
                                    : "Assign Supervision"}
                                </button>
                              </td>
                            </tr>
                            {isAssignOpen && !agricFarmerLiveMode && (
                              <tr key={`custodian-live-assign-${row.custodian.id}`} className="green-work-live-subrow">
                                <td colSpan={15}>
                                  <div className="green-work-inline-form">
                                    {custodianAssignDraft?.assignment_mode !== "field_capture" ? (
                                      <label>
                                        Allocation
                                        <select
                                          value={custodianAssignDraft?.allocation_id || ""}
                                          onChange={(e) =>
                                            setCustodianAssignDraft((prev) =>
                                              prev
                                                ? { ...prev, allocation_id: Number(e.target.value || 0) }
                                                : prev,
                                            )
                                          }
                                          disabled={workPartnerOrgPaused}
                                        >
                                          {rowAllocations.map((allocation) => (
                                            <option key={`row-allocation-${allocation.id}`} value={allocation.id}>
                                              #{allocation.id} | {allocation.event_date || "-"} | {allocation.species || "Mixed"} |
                                              target {Number(allocation.supervision_target || 0)} | live{" "}
                                              {Number(allocation.supervision_live || 0)} | done {Number(allocation.supervision_done || 0)}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    ) : null}
                                    <label>
                                      Assign To
                                      <select
                                        value={custodianAssignDraft?.assignee_name || ""}
                                        onChange={(e) =>
                                          setCustodianAssignDraft((prev) =>
                                            prev ? { ...prev, assignee_name: e.target.value } : prev,
                                          )
                                        }
                                        disabled={workPartnerOrgPaused}
                                      >
                                        <option value="">Select staff</option>
                                        {users.map((user) => (
                                          <option key={`custody-assign-user-${user.id}`} value={user.full_name}>
                                            {user.full_name} ({formatRoleLabel(user.role)})
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      {custodianAssignDraft?.assignment_mode === "field_capture" ? "Field Capture Tasks" : "Visits To Assign"}
                                      <input
                                        type="number"
                                        min={1}
                                        max={30}
                                        value={custodianAssignDraft?.visits_to_assign || 1}
                                        onChange={(e) =>
                                          setCustodianAssignDraft((prev) =>
                                            prev ? { ...prev, visits_to_assign: Number(e.target.value || 1) } : prev,
                                          )
                                        }
                                        disabled={workPartnerOrgPaused || custodianAssignDraft?.assignment_mode === "field_capture"}
                                      />
                                    </label>
                                    <label>
                                      Due Date (optional)
                                      <input
                                        type="date"
                                        value={custodianAssignDraft?.due_date || ""}
                                        onChange={(e) =>
                                          setCustodianAssignDraft((prev) =>
                                            prev ? { ...prev, due_date: e.target.value } : prev,
                                          )
                                        }
                                        disabled={workPartnerOrgPaused}
                                      />
                                    </label>
                                    <div className="work-actions">
                                      <button
                                        type="button"
                                        onClick={() => void assignCustodianSupervision()}
                                        disabled={workPartnerOrgPaused}
                                      >
                                        {custodianAssignDraft?.assignment_mode === "field_capture" ? "Assign Field Capture" : "Assign"}
                                      </button>
                                      <button type="button" onClick={() => setCustodianAssignDraft(null)}>
                                        Cancel
                                      </button>
                                    </div>
                                    {custodianAssignDraft?.assignment_mode === "field_capture" && (
                                      <p className="green-work-note">
                                        {activeWorkflowProfile === "relief_recovery"
                                          ? <>This creates the beneficiary&apos;s first site-capture task. It opens in <strong>Map &amp; Assess Sites</strong> in the mobile app so the officer can pin, trace, or draw the site geometry before relief follow-up starts.</>
                                          : <>This creates the farmer&apos;s first field-capture task. It opens in <strong>Map &amp; Add Plot</strong> in the mobile app so the officer can walk or draw the farm boundary before the first field-visit cycle starts.</>}
                                      </p>
                                    )}
                                    {selectedAllocation && custodianAssignDraft?.assignment_mode !== "field_capture" && (
                                      <p className="green-work-note">
                                        Allocation #{selectedAllocation.id}: support-visit target{" "}
                                        {Number(selectedAllocation.supervision_target || 0)}, live{" "}
                                        {Number(selectedAllocation.supervision_live || 0)}, done{" "}
                                        {Number(selectedAllocation.supervision_done || 0)}, remaining{" "}
                                        {Number(selectedAllocation.supervision_remaining || 0)}.
                                      </p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeProjectId && activeForm === "remote_monitoring" && (
            <>
              <div className="green-work-remote-shell">
              <div className="green-work-remote-workspace">
                <div className="green-work-card green-work-remote-card">
                  <div className="green-work-row">
                    <h3>{activeWorkflowProfile === "agric" ? "Farm Health Monitoring" : "Remote Monitoring"}</h3>
                    <div className="work-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void loadRemoteMonitoringAnalysis()}
                        disabled={!normalizeMapAreaGeometry(remoteMonitoringDraftGeometry) || remoteMonitoringLoading}
                      >
                        {remoteMonitoringLoading ? "Analyzing..." : activeWorkflowProfile === "agric" ? "Analyze Farm Health" : "Analyze Vegetation"}
                      </button>
                    </div>
                  </div>
                  <p className="green-work-note">
                    {activeWorkflowProfile === "agric"
                      ? "Choose an existing mapped farm boundary or draw a farm block on the map. NDVI, vegetation cover, stressed areas, drought watch, and crop-vigor trend are generated from recent satellite imagery."
                      : "Choose an existing planting polygon or draw one on the map. Tree count comes from LandCheck tree records inside the polygon. NDVI is only used as a satellite vegetation proxy."}
                  </p>

                  <div className="green-work-remote-layout">
                    <div className="green-work-remote-builder">
                      <label>
                        {activeWorkflowProfile === "agric" ? "Use mapped farm boundary" : "Use existing planting area"}
                        <select
                          value={remoteMonitoringDraft.source_order_id}
                          onChange={(e) => applyMonitoringSourceArea(e.target.value)}
                        >
                          <option value="">{activeWorkflowProfile === "agric" ? "Draw a new farm block instead" : "Draw a new polygon instead"}</option>
                          {monitoringSourceAreas.map((area) => (
                            <option key={`remote-source-${area.id}`} value={area.id}>
                              {activeWorkflowProfile === "agric"
                                ? area.label
                                : `${area.label} | ${area.assignee_name || "Unassigned"} | target ${area.target_trees}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="work-actions">
                        <button type="button" onClick={() => setRemoteMonitoringDrawActive((prev) => !prev)}>
                          {remoteMonitoringDrawActive ? "Stop Polygon Draw" : activeWorkflowProfile === "agric" ? "Draw Farm Block On Map" : "Draw Polygon On Map"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRemoteMonitoringDraftGeometry(null);
                            setRemoteMonitoringDraft((prev) => ({ ...prev, source_order_id: "" }));
                            setRemoteMonitoringDrawActive(false);
                            setRemoteMonitoringFocusedTreeId(null);
                            setRemoteMonitoringActionTreeId(null);
                            setRemoteMonitoringReport(null);
                          }}
                        >
                          Clear Polygon
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => void loadRemoteMonitoringAnalysis()}
                          disabled={!normalizeMapAreaGeometry(remoteMonitoringDraftGeometry) || remoteMonitoringLoading}
                        >
                          {remoteMonitoringLoading ? "Analyzing..." : activeWorkflowProfile === "agric" ? "Analyze Farm Health" : "Analyze Vegetation"}
                        </button>
                      </div>
                      <div className="green-work-remote-draft-summary">
                        <span className="green-work-flow-pill">
                          {activeWorkflowProfile === "agric" ? "Plot rows" : "Tree rows"}: {remoteMonitoringDraftTreeSummary.tree_record_count}
                        </span>
                        <span className="green-work-flow-pill">
                          {activeWorkflowProfile === "agric" ? "Plots in area" : "Trees in polygon"}: {remoteMonitoringDraftTreeSummary.tree_count}
                        </span>
                        <span className="green-work-flow-pill">
                          {activeWorkflowProfile === "agric" ? "Mapped plots" : "New planting"}: {remoteMonitoringDraftTreeSummary.new_planting_tree_count}
                        </span>
                        <span className="green-work-flow-pill">
                          {activeWorkflowProfile === "agric" ? "Existing plot batches" : "Existing inventory"}: {remoteMonitoringDraftTreeSummary.existing_inventory_tree_count}
                        </span>
                      </div>
                    </div>
                  </div>
                  {remoteMonitoringLoading && (
                    <div className="green-work-remote-progress-panel">
                      <div className="green-work-remote-progress-head">
                        <strong>{activeWorkflowProfile === "agric" ? "Farm-health calculation in progress" : "Vegetation calculation in progress"}</strong>
                        <span>{Math.max(8, Math.min(100, Math.round(remoteMonitoringProgressPct || 0)))}%</span>
                      </div>
                      <div className="green-work-remote-progress-bar" aria-hidden="true">
                        <span style={{ width: `${Math.max(8, Math.min(100, remoteMonitoringProgressPct || 0))}%` }} />
                      </div>
                      <div className="green-work-remote-progress-steps">
                        {(activeWorkflowProfile === "agric" ? REMOTE_MONITORING_PROGRESS_STEPS_AGRIC : REMOTE_MONITORING_PROGRESS_STEPS).map((label, index) => {
                          const isDone = index < remoteMonitoringProgressStep;
                          const isActive = index === remoteMonitoringProgressStep;
                          return (
                            <div
                              key={`remote-progress-step-${label}`}
                              className={`green-work-remote-progress-step ${isDone ? "is-done" : ""} ${isActive ? "is-active" : ""}`}
                            >
                              <span>{index + 1}</span>
                              <strong>{label}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div ref={mapCardRef} className="green-work-card green-work-map-card green-work-remote-map-card">
                  <h3>
                    {remoteMonitoringDrawActive
                      ? activeWorkflowProfile === "agric"
                        ? "Farm Health Map (Polygon Draw Enabled)"
                        : "Remote Monitoring Map (Polygon Draw Enabled)"
                      : activeWorkflowProfile === "agric"
                        ? "Farm Health Map"
                        : "Remote Monitoring Map"}
                  </h3>
                  <p className="green-work-note">
                    {remoteMonitoringDrawActive
                      ? activeWorkflowProfile === "agric"
                        ? "Draw one polygon for the farm block. When draw is off, you can inspect mapped farm boundaries on the map."
                        : "Draw one polygon for the monitoring block. When draw is off, you can inspect trees on the map."
                      : activeWorkflowProfile === "agric"
                        ? "Inspect mapped farm boundaries, select a farm block, and run NDVI-based health analysis."
                        : "Inspect trees and planting polygons, then run satellite analysis for the selected polygon."}
                  </p>
                  <div className="green-work-map-layout">
                    <div className="green-work-map-canvas">
                      <TreeMap
                        trees={visibleProjectTrees}
                        onAddTree={() => {}}
                        enableDraw={remoteMonitoringDrawActive}
                        drawMode="polygon"
                        drawActive={remoteMonitoringDrawActive}
                        onPolygonChange={remoteMonitoringDrawActive ? (geometry) => {
                          setRemoteMonitoringDraftGeometry(geometry);
                          setRemoteMonitoringFocusedTreeId(null);
                          setRemoteMonitoringActionTreeId(null);
                          setRemoteMonitoringReport(null);
                        } : undefined}
                        minHeight={560}
                        onTreeInspect={(detail) => {
                          setInspectedTree(detail);
                          setRemoteMonitoringFocusedTreeId(detail ? Number(detail.id || 0) : null);
                          setRemoteMonitoringActionTreeId(null);
                          if (detail) setMenuOpen(false);
                        }}
                        fitBounds={remoteMonitoringFitPoints}
                        assignmentAreas={remoteMonitoringMapAreas}
                        workflowMode={activeWorkflowProfile}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="green-work-card green-work-remote-report-card">
                <div className="green-work-remote-report-head">
                  <div className="green-work-remote-report-copy">
                    <p className="green-work-remote-kicker">{activeWorkflowProfile === "agric" ? "Farm Health Summary" : "Vegetation Summary"}</p>
                    <h3>{remoteMonitoringAnalysisLabel}</h3>
                    <p className="green-work-remote-subtitle">
                      {activeWorkflowProfile === "agric"
                        ? "Satellite NDVI, vegetation cover, stressed farm areas, drought-watch cues, and crop-vigor trend for the selected farm block."
                        : "Satellite vegetation signal for the current polygon, normalized by stored tree count and broken down by tree buffer."}
                    </p>
                  </div>
                  {remoteMonitoringReport?.summary?.signal && (
                    <span className={`green-work-remote-signal is-${normalizeName(remoteMonitoringReport.summary.signal)}`}>
                      {formatMonitoringSignalLabel(remoteMonitoringReport.summary.signal)}
                    </span>
                  )}
                </div>
                {!normalizeMapAreaGeometry(remoteMonitoringDraftGeometry) ? (
                  <div className="green-work-remote-empty-state">
                    <strong>No polygon selected yet</strong>
                    <p>{activeWorkflowProfile === "agric" ? "Choose a mapped farm boundary or draw a farm block on the map, then run analysis." : "Choose an existing planting polygon or draw one on the map, then run analysis."}</p>
                  </div>
                ) : remoteMonitoringLoading ? (
                  <div className="green-work-remote-progress-panel is-report-panel">
                    <div className="green-work-remote-progress-head">
                      <strong>{activeWorkflowProfile === "agric" ? "Calculating farm-health summary" : "Calculating vegetation summary"}</strong>
                      <span>{Math.max(8, Math.min(100, Math.round(remoteMonitoringProgressPct || 0)))}%</span>
                    </div>
                    <div className="green-work-remote-progress-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(8, Math.min(100, remoteMonitoringProgressPct || 0))}%` }} />
                    </div>
                    <div className="green-work-remote-progress-steps">
                      {(activeWorkflowProfile === "agric" ? REMOTE_MONITORING_PROGRESS_STEPS_AGRIC : REMOTE_MONITORING_PROGRESS_STEPS).map((label, index) => {
                        const isDone = index < remoteMonitoringProgressStep;
                        const isActive = index === remoteMonitoringProgressStep;
                        return (
                          <div
                            key={`remote-report-progress-step-${label}`}
                            className={`green-work-remote-progress-step ${isDone ? "is-done" : ""} ${isActive ? "is-active" : ""}`}
                          >
                            <span>{index + 1}</span>
                            <strong>{label}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : !remoteMonitoringReport ? (
                  <div className="green-work-remote-empty-state">
                    <strong>{activeWorkflowProfile === "agric" ? "No farm-health result yet" : "No monitoring result yet"}</strong>
                    <p>{activeWorkflowProfile === "agric" ? "Run farm-health analysis to load NDVI, vegetation cover, drought watch, and per-plot proxy values." : "Run vegetation analysis to load polygon metrics and per-tree satellite proxy values."}</p>
                  </div>
                ) : (
                  <>
                    <p className="green-work-note green-work-remote-summary-note">
                      {remoteMonitoringReport.summary.signal_message}
                    </p>
                    {activeWorkflowProfile === "agric" && remoteMonitoringAgricInsights.length ? (
                      <div className="green-work-remote-insight-grid">
                        {remoteMonitoringAgricInsights.map((item) => (
                          <div key={`remote-insight-${item.title}`} className={`green-work-remote-insight-card is-${item.tone}`}>
                            <span>{item.title}</span>
                            <strong>{item.value}</strong>
                            <small>{item.note}</small>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {remoteMonitoringHealthCounts.length ? (
                      <div className="green-work-remote-health-counts">
                        {remoteMonitoringHealthCounts.map((item) => (
                          <div key={`remote-health-count-${item.key}`} className={`green-work-remote-health-chip is-${normalizeName(item.key)}`}>
                            <strong>{item.count}</strong>
                            <span>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {remoteMonitoringTopRiskTrees.length ? (
                      <div className="green-work-remote-risk-strip">
                        <strong>{activeWorkflowProfile === "agric" ? "Farms needing attention" : "Priority trees"}</strong>
                        {activeWorkflowProfile === "agric" && (
                          <small style={{ display: "block", marginBottom: 8, color: "var(--gw-muted, #888)", fontSize: 12 }}>
                            These plots show stress signals. Tap to locate on map, then assign a support visit.
                          </small>
                        )}
                        <div className="green-work-remote-risk-list">
                          {remoteMonitoringTopRiskTrees.map((tree) => (
                            <button
                              key={`remote-risk-${tree.tree_id}`}
                              type="button"
                              className={`green-work-remote-risk-card is-${normalizeName(tree.satellite_health || "")}`}
                              onClick={() => focusRemoteMonitoringTree(tree)}
                            >
                              <span>{tree.tree_label || formatProjectTreeLabelById(tree.tree_id)}</span>
                              <strong>{tree.satellite_health_label || "No data"}</strong>
                              {activeWorkflowProfile !== "agric" && (
                                <small>{typeof tree.local_mean_ndvi === "number" ? `NDVI ${tree.local_mean_ndvi.toFixed(3)}` : "No NDVI"}</small>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="green-work-remote-tree-detail-wrap">
                      <div className="green-work-remote-tree-table-head">
                        <strong>{activeWorkflowProfile === "agric" ? "Farm health detail" : "Tree vegetation detail"}</strong>
                        <span>{remoteMonitoringSortedTrees.length || 0} {activeWorkflowProfile === "agric" ? "plot row(s)" : "tree row(s)"}</span>
                      </div>
                      {remoteMonitoringSortedTrees.length ? (
                        <div className="green-work-remote-tree-detail-list">
                          {remoteMonitoringSortedTrees.map((tree) => {
                            const treeId = Number(tree.tree_id || 0);
                            const isFocused = Number(remoteMonitoringFocusedTreeId || 0) === treeId;
                            const actionsOpen = Number(remoteMonitoringActionTreeId || 0) === treeId;
                            return (
                              <div
                                key={`remote-tree-${tree.tree_id}`}
                                className={`green-work-remote-tree-card ${isFocused ? "is-focused" : ""}`}
                              >
                                <div className="green-work-remote-tree-card-head">
                                  <button
                                    type="button"
                                    className="green-work-remote-tree-link"
                                    onClick={() => focusRemoteMonitoringTree(tree)}
                                  >
                                    {tree.tree_label || formatProjectTreeLabelById(tree.tree_id)}
                                  </button>
                                  <span className={`green-work-remote-tree-health is-${normalizeName(tree.satellite_health || "")}`}>
                                    {tree.satellite_health_label || "No data"}
                                  </span>
                                </div>
                                <div className="green-work-remote-tree-card-meta">
                                  <span>{activeWorkflowProfile === "agric" ? getPlotCommodityLabel(treeById.get(Number(tree.tree_id || 0)) || ({ species: tree.species } as Tree)) : tree.species || "-"}</span>
                                  <span>{treeStatusLabel(tree.status)}</span>
                                  {tree.inventory_tree_count && tree.inventory_tree_count > 1 ? (
                                    <span>{tree.inventory_tree_count} {activeWorkflowProfile === "agric" ? "plots" : "trees"}</span>
                                  ) : null}
                                </div>
                                <p className="green-work-remote-tree-card-note">
                                  {tree.satellite_health_note || (activeWorkflowProfile === "agric"
                                    ? "Satellite farm-health signal is not available for this plot yet."
                                    : "Satellite vegetation proxy not available for this tree yet.")}
                                </p>
                                <div className="green-work-remote-tree-card-metrics">
                                  {activeWorkflowProfile === "agric" ? (
                                    <div>
                                      <span>Vegetation Signal</span>
                                      <strong>
                                        {typeof tree.local_mean_ndvi === "number"
                                          ? tree.local_mean_ndvi >= 0.5 ? "Strong" : tree.local_mean_ndvi >= 0.35 ? "Moderate" : tree.local_mean_ndvi >= 0.2 ? "Weak" : "Very Low"
                                          : "-"}
                                      </strong>
                                    </div>
                                  ) : (
                                    <div>
                                      <span>NDVI</span>
                                      <strong>{typeof tree.local_mean_ndvi === "number" ? tree.local_mean_ndvi.toFixed(3) : "-"}</strong>
                                    </div>
                                  )}
                                </div>
                                <div className="green-work-remote-tree-actions-menu">
                                  <button
                                    type="button"
                                    className="green-work-remote-tree-actions-toggle"
                                    onClick={() =>
                                      setRemoteMonitoringActionTreeId((prev) => (Number(prev || 0) === treeId ? null : treeId))
                                    }
                                  >
                                    {actionsOpen ? "Hide Actions" : activeWorkflowProfile === "agric" ? "Farm Actions" : "Tree Actions"}
                                  </button>
                                  {actionsOpen ? (
                                    <div className="green-work-context-menu green-work-remote-inline-menu">
                                      <button type="button" onClick={() => focusRemoteMonitoringTree(tree)}>
                                        View On Map
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRemoteMonitoringActionTreeId(null);
                                          if (activeWorkflowProfile === "agric") {
                                            openForm("support_visit_assign");
                                            openCustodianSupervisionAssign(Number(treeById.get(treeId)?.custodian_id || 0), "support_visit");
                                            return;
                                          }
                                          openAssignTaskForTree(treeId, "inspection");
                                        }}
                                      >
                                        {activeWorkflowProfile === "agric" ? "Assign Support Visit" : "Assign Maintenance"}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="green-work-remote-empty-state">
                          <strong>{activeWorkflowProfile === "agric" ? "No mapped plots inside this block" : "No stored trees inside this polygon"}</strong>
                          <p>{activeWorkflowProfile === "agric" ? "Choose another polygon or adjust the block so mapped farm anchors fall inside it." : "Choose another polygon or adjust the block so LandCheck trees fall inside it."}</p>
                        </div>
                      )}
                    </div>
                    {activeWorkflowProfile === "agric" ? (
                      <details className="green-work-remote-tech-details">
                        <summary>Technical details</summary>
                        <div className="green-work-remote-summary-grid">
                          <div className="green-work-remote-metric">
                            <span>Plots In Block</span>
                            <strong>{remoteMonitoringReport.area.tree_count || 0}</strong>
                            <small>{remoteMonitoringReport.area.tree_record_count || 0} plot rows stored</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Healthy Vegetation Area</span>
                            <strong>{remoteMonitoringReport.summary.vegetation_area_sqm?.toFixed?.(2) || remoteMonitoringReport.summary.vegetation_area_sqm || 0} sqm</strong>
                            <small>{remoteMonitoringReport.summary.vegetation_coverage_pct ?? 0}% of farm block</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Vegetation sqm / Plot</span>
                            <strong>{remoteMonitoringReport.summary.vegetation_area_per_tree_sqm?.toFixed?.(2) || remoteMonitoringReport.summary.vegetation_area_per_tree_sqm || 0} sqm</strong>
                            <small>Uses mapped plots in block as denominator</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Crop Vigor Index (NDVI)</span>
                            <strong>{remoteMonitoringReport.summary.mean_ndvi?.toFixed?.(3) || remoteMonitoringReport.summary.mean_ndvi || "-"}</strong>
                            <small>Latest composite window across the farm block</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Latest Satellite Image</span>
                            <strong>{formatDateLabel(remoteMonitoringReport.summary.latest_image_date || null)}</strong>
                            <small>{remoteMonitoringReport.summary.image_count || 0} image(s) used</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Block Mix</span>
                            <strong>{remoteMonitoringReport.area.new_planting_tree_count || 0} new plots</strong>
                            <small>{remoteMonitoringReport.area.existing_inventory_tree_count || 0} existing plot records</small>
                          </div>
                        </div>
                        {remoteMonitoringReport.health_scale?.bands?.length ? (
                          <div className="green-work-remote-health-scale">
                            <div className="green-work-remote-health-scale-head">
                              <strong>Farm-health signal bands</strong>
                              {remoteMonitoringReport.health_scale?.buffer_meters ? (
                                <span>{remoteMonitoringReport.health_scale.buffer_meters}m plot-anchor buffer</span>
                              ) : null}
                            </div>
                            <div className="green-work-remote-health-scale-list">
                              {remoteMonitoringReport.health_scale.bands.map((band) => (
                                <div key={`remote-health-band-${band.key}`} className={`green-work-remote-health-band is-${normalizeName(band.key)}`}>
                                  <strong>{band.label}</strong>
                                  <span>{formatNdviBandLabel(band)}</span>
                                  <small>{band.description || ""}</small>
                                </div>
                              ))}
                            </div>
                            {remoteMonitoringReport.health_scale?.note ? (
                              <p className="green-work-note green-work-remote-summary-note">{remoteMonitoringReport.health_scale.note}</p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="green-work-remote-series-table-wrap">
                          <table className="green-work-live-table green-work-remote-series-table">
                            <thead>
                              <tr>
                                <th>Period</th>
                                <th>Latest Image</th>
                                <th>NDVI</th>
                                <th>Healthy Area</th>
                                <th>Cover %</th>
                                <th>Vigor sqm / Plot</th>
                              </tr>
                            </thead>
                            <tbody>
                              {remoteMonitoringReport.series.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="green-work-live-empty">No monthly farm-health rows available yet.</td>
                                </tr>
                              ) : (
                                remoteMonitoringReport.series.map((row) => (
                                  <tr key={`remote-series-${row.label}`}>
                                    <td>{row.label}</td>
                                    <td>{formatDateLabel(row.latest_image_date || null)}</td>
                                    <td>{row.mean_ndvi?.toFixed?.(3) || row.mean_ndvi || "-"}</td>
                                    <td>{row.vegetation_area_sqm?.toFixed?.(2) || row.vegetation_area_sqm || "-"}</td>
                                    <td>{row.vegetation_coverage_pct?.toFixed?.(1) || row.vegetation_coverage_pct || "-"}</td>
                                    <td>{row.vegetation_area_per_tree_sqm?.toFixed?.(2) || row.vegetation_area_per_tree_sqm || "-"}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ) : (
                      <>
                        <div className="green-work-remote-summary-grid">
                          <div className="green-work-remote-metric">
                            <span>Trees In Polygon</span>
                            <strong>{remoteMonitoringReport.area.tree_count || 0}</strong>
                            <small>{remoteMonitoringReport.area.tree_record_count || 0} tree rows stored</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Vegetation Signal Area</span>
                            <strong>{remoteMonitoringReport.summary.vegetation_area_sqm?.toFixed?.(2) || remoteMonitoringReport.summary.vegetation_area_sqm || 0} sqm</strong>
                            <small>{remoteMonitoringReport.summary.vegetation_coverage_pct ?? 0}% of polygon</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Signal Per Tree</span>
                            <strong>{remoteMonitoringReport.summary.vegetation_area_per_tree_sqm?.toFixed?.(2) || remoteMonitoringReport.summary.vegetation_area_per_tree_sqm || 0} sqm</strong>
                            <small>Uses stored trees inside polygon as denominator</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Mean NDVI</span>
                            <strong>{remoteMonitoringReport.summary.mean_ndvi?.toFixed?.(3) || remoteMonitoringReport.summary.mean_ndvi || "-"}</strong>
                            <small>Latest composite window across the polygon</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Latest Image</span>
                            <strong>{formatDateLabel(remoteMonitoringReport.summary.latest_image_date || null)}</strong>
                            <small>{remoteMonitoringReport.summary.image_count || 0} image(s) used</small>
                          </div>
                          <div className="green-work-remote-metric">
                            <span>Inventory Mix</span>
                            <strong>{remoteMonitoringReport.area.new_planting_tree_count || 0} planted</strong>
                            <small>{remoteMonitoringReport.area.existing_inventory_tree_count || 0} existing inventory</small>
                          </div>
                        </div>
                        {remoteMonitoringReport.health_scale?.bands?.length ? (
                          <div className="green-work-remote-health-scale">
                            <div className="green-work-remote-health-scale-head">
                              <strong>Satellite health bands</strong>
                              {remoteMonitoringReport.health_scale?.buffer_meters ? (
                                <span>{remoteMonitoringReport.health_scale.buffer_meters}m tree buffer</span>
                              ) : null}
                            </div>
                            <div className="green-work-remote-health-scale-list">
                              {remoteMonitoringReport.health_scale.bands.map((band) => (
                                <div key={`remote-health-band-${band.key}`} className={`green-work-remote-health-band is-${normalizeName(band.key)}`}>
                                  <strong>{band.label}</strong>
                                  <span>{formatNdviBandLabel(band)}</span>
                                  <small>{band.description || ""}</small>
                                </div>
                              ))}
                            </div>
                            {remoteMonitoringReport.health_scale?.note ? (
                              <p className="green-work-note green-work-remote-summary-note">{remoteMonitoringReport.health_scale.note}</p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="green-work-remote-series-table-wrap">
                          <table className="green-work-live-table green-work-remote-series-table">
                            <thead>
                              <tr>
                                <th>Period</th>
                                <th>Latest Image</th>
                                <th>Mean NDVI</th>
                                <th>Signal Area</th>
                                <th>Cover %</th>
                                <th>Signal sqm / Tree</th>
                              </tr>
                            </thead>
                            <tbody>
                              {remoteMonitoringReport.series.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="green-work-live-empty">No monthly monitoring rows available yet.</td>
                                </tr>
                              ) : (
                                remoteMonitoringReport.series.map((row) => (
                                  <tr key={`remote-series-${row.label}`}>
                                    <td>{row.label}</td>
                                    <td>{formatDateLabel(row.latest_image_date || null)}</td>
                                    <td>{row.mean_ndvi?.toFixed?.(3) || row.mean_ndvi || "-"}</td>
                                    <td>{row.vegetation_area_sqm?.toFixed?.(2) || row.vegetation_area_sqm || "-"}</td>
                                    <td>{row.vegetation_coverage_pct?.toFixed?.(1) || row.vegetation_coverage_pct || "-"}</td>
                                    <td>{row.vegetation_area_per_tree_sqm?.toFixed?.(2) || row.vegetation_area_per_tree_sqm || "-"}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
              </div>

            </>
          )}

          {activeProjectId && (activeForm === "map_view" || assignWorkAreaMode) && (
            <div ref={mapCardRef} className="green-work-card green-work-map-card">
              <h3>
                {assignWorkAreaMode
                  ? "Planting Area Map (Polygon Draw)"
                  : mapAreaDrawMode
                    ? "Map View (Polygon Draw Enabled)"
                    : "Map View"}
              </h3>
              <p className="green-work-note">
                {assignWorkAreaMode
                  ? "Draw one polygon for this planting order in this tab, then click Assign Work."
                  : mapAreaDrawMode
                    ? "Planting-area draw is enabled from Assign Tree Planting. Draw polygon here, then return to assign work."
                    : maintenanceMapFocusActive
                      ? `Showing ${maintenanceFocusedTreeIds.length} selected maintenance tree${maintenanceFocusedTreeIds.length === 1 ? "" : "s"} from the queue. Clear focus to return to the full project map.`
                      : activeWorkflowProfile === "agric"
                        ? "Project farm map view. Inspect mapped farm boundaries and open farmer-linked plot details."
                        : "Project tree map view. Inspect trees and monitor field positions."}
              </p>
              {(maintenanceMapFocusActive || (mapAreaDrawMode && !assignWorkAreaMode)) && (
                <div className="work-actions">
                  {maintenanceMapFocusActive && (
                    <button type="button" onClick={() => setMaintenanceMapFocusEnabled(false)}>
                      Clear Maintenance Focus
                    </button>
                  )}
                  {mapAreaDrawMode && !assignWorkAreaMode && (
                    <button type="button" onClick={() => openForm("assign_work")}>
                      Back To Assign Tree Planting
                    </button>
                  )}
                </div>
              )}
              <div className="green-work-map-layout">
                <div className="green-work-map-canvas">
                  <TreeMap
                    trees={mapTrees}
                    draftPoint={
                      treePositionDraft && inspectedTree && Number(treePositionDraft.treeId) === Number(inspectedTree.id)
                        ? { lng: treePositionDraft.lng, lat: treePositionDraft.lat }
                        : null
                    }
                    onDraftMove={
                      treePositionDraft && inspectedTree && Number(treePositionDraft.treeId) === Number(inspectedTree.id)
                        ? (lng, lat) => setTreePositionDraft((prev) => (prev ? { ...prev, lng, lat } : prev))
                        : undefined
                    }
                    suspendFitBounds={Boolean(treePositionDraft && inspectedTree && Number(treePositionDraft.treeId) === Number(inspectedTree.id))}
                    onAddTree={() => {}}
                    enableDraw={mapAreaDrawMode}
                    drawMode={mapAreaDrawMode ? "polygon" : "point"}
                    drawActive={mapAreaDrawMode}
                    onPolygonChange={mapAreaDrawMode ? (geometry) => setNewOrderAreaGeometry(geometry) : undefined}
                    minHeight={mapAreaDrawMode ? 520 : 500}
                    onTreeInspect={(detail) => {
                      setInspectedTree(detail);
                      if (detail) setMenuOpen(false);
                    }}
                    fitBounds={mapFitPoints}
                    assignmentAreas={existingTreeMapAreas}
                    workflowMode={activeWorkflowProfile}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedActivityLog && (
        <>
          <button
            type="button"
            className="green-work-log-detail-overlay"
            onClick={() => setSelectedActivityLog(null)}
            aria-label="Close activity log details"
          />
          <section
            className="green-work-log-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="green-work-log-detail-title"
          >
            <div className="green-work-log-detail-head">
              <div>
                <p className="green-work-log-detail-kicker">Activity log details</p>
                <h3 id="green-work-log-detail-title">Log Entry #{selectedActivityLog.id}</h3>
              </div>
              <button
                type="button"
                className="green-work-log-detail-close"
                onClick={() => setSelectedActivityLog(null)}
                aria-label="Close activity log details"
              >
                X
              </button>
            </div>

            <div className="green-work-log-detail-grid">
              <div>
                <span>Time</span>
                <strong>{new Date(selectedActivityLog.created_at || "").toLocaleString()}</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>{selectedActivityLog.source || "-"}</strong>
              </div>
              <div>
                <span>Event</span>
                <strong>{selectedActivityLog.event_type || "-"}</strong>
              </div>
              <div>
                <span>Actor</span>
                <strong>{resolveActivityLogActor(selectedActivityLog)}</strong>
              </div>
              <div className="green-work-log-detail-grid-wide">
                <span>Message</span>
                <strong>{selectedActivityLog.message || "-"}</strong>
              </div>
              <div className="green-work-log-detail-grid-wide">
                <span>Details summary</span>
                <strong>{summarizeActivityLogDetails(selectedActivityLog.details)}</strong>
              </div>
            </div>

            <div className="green-work-log-detail-body">
              <p className="green-work-note" style={{ marginLeft: 0, marginBottom: 0 }}>
                Full request or event payload for this activity log entry.
              </p>
              <pre className="green-work-log-detail-json">{selectedActivityLogDetailsText}</pre>
            </div>
          </section>
        </>
      )}

      {inspectedTree && (
        <>
          <button
            type="button"
            className="green-work-tree-overlay"
            onClick={() => {
              setInspectedTree(null);
              setTreePositionDraft(null);
            }}
            aria-label="Close tree details"
            style={
              treePositionDraft && Number(treePositionDraft.treeId) === Number(inspectedTree.id)
                ? { pointerEvents: "none", opacity: 0 }
                : undefined
            }
          />
          <aside className="green-work-tree-drawer green-work-tree-inspector" style={drawerStyle}>
            <div className="green-work-tree-drawer-head">
              <strong>{activeWorkflowProfile === "agric" ? "Farm Details" : "Tree Details"}</strong>
              <button
                className="green-work-tree-drawer-close"
                type="button"
                onClick={() => {
                  setInspectedTree(null);
                  setTreePositionDraft(null);
                }}
                aria-label="Close tree details"
              >
                X
              </button>
            </div>
            <div className="green-work-tree-inspector-body">
              <div className="green-work-tree-inspector-photo-wrap">
                {inspectedTree.photo_url ? (
                  <img
                    className="green-work-tree-inspector-photo"
                    src={toDisplayPhotoUrl(inspectedTree.photo_url)}
                    alt={activeWorkflowProfile === "agric" ? `Farm ${inspectedTree.id}` : `Tree ${inspectedTree.id}`}
                  />
                ) : (
                  <div className="green-work-tree-inspector-photo empty">
                    {activeWorkflowProfile === "agric" ? "No farm photo" : "No tree photo"}
                  </div>
                )}
              </div>
              <div className="green-work-tree-photo-upload-row">
                <label className={`green-work-tree-photo-upload-btn ${treePhotoUploading ? "is-loading" : ""}`}>
                  {treePhotoUploading ? "Uploading..." : activeWorkflowProfile === "agric" ? "Upload Farm Photo" : "Upload Tree Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={treePhotoUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      void onInspectedTreePhotoPicked(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <p className="green-work-tree-maintenance-count">
                {activeWorkflowProfile === "agric" ? "Field Visit Records" : "Maintenance Records"}: {inspectedTree.maintenance.total}
              </p>
              <h4>
                {activeWorkflowProfile === "agric"
                  ? inspectedTreeRecord
                    ? formatPlotRecordLabel(inspectedTreeRecord)
                    : `Plot #${inspectedTree.project_tree_no || inspectedTree.id}`
                  : formatProjectTreeLabelById(inspectedTree.id)}
              </h4>
              {inspectedTree.loading && <p className="green-work-note">Loading latest records...</p>}
              <div className="green-work-tree-inspector-grid">
                {activeWorkflowProfile === "agric" ? (
                  <>
                    <div>
                      <span>Farmer</span>
                      <strong>{inspectedTree.custodian_name || "-"}</strong>
                    </div>
                    <div>
                      <span>Crop</span>
                      <strong>
                        {inspectedTreeRecord ? getPlotCommodityLabel(inspectedTreeRecord) : String(inspectedTree.record_profile_data?.commodity || inspectedTree.species || "-")}
                      </strong>
                    </div>
                    <div>
                      <span>Plot Area</span>
                      <strong>{inspectedPlotAreaLabel}</strong>
                    </div>
                    <div>
                      <span>Season</span>
                      <strong>
                        {inspectedTreeRecord
                          ? formatPlotSeasonLabel(inspectedTreeRecord)
                          : [inspectedTree.record_profile_data?.season_name, inspectedTree.record_profile_data?.season_year]
                              .filter(Boolean)
                              .join(" ") || "-"}
                      </strong>
                    </div>
                    <div>
                      <span>Current GPS</span>
                      <strong>{formatGpsPair(inspectedTreeCoords?.lng ?? null, inspectedTreeCoords?.lat ?? null)}</strong>
                    </div>
                    <div>
                      <span>Boundary Capture</span>
                      <strong>{formatBoundaryCaptureMethodLabel(inspectedTree.record_profile_data?.boundary_capture_method)}</strong>
                    </div>
                    <div>
                      <span>Irrigation</span>
                      <strong>{inspectedTree.record_profile_data?.irrigation_type ? formatTaskTypeLabel(inspectedTree.record_profile_data.irrigation_type) : "-"}</strong>
                    </div>
                    <div>
                      <span>Production Stage</span>
                      <strong>{inspectedTree.record_profile_data?.production_stage ? formatTaskTypeLabel(inspectedTree.record_profile_data.production_stage) : "-"}</strong>
                    </div>
                    <div>
                      <span>Recorded By</span>
                      <strong>{inspectedTree.created_by}</strong>
                    </div>
                    <div>
                      <span>Observation Date</span>
                      <strong>{formatDateLabel(inspectedTree.planting_date)}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span>Status</span>
                      <strong>{inspectedTree.status_label}</strong>
                    </div>
                    <div>
                      <span>Species</span>
                      <strong>{inspectedTree.species}</strong>
                    </div>
                    <div>
                      <span>Planted By</span>
                      <strong>{inspectedTree.created_by}</strong>
                    </div>
                    <div>
                      <span>Planting Date</span>
                      <strong>{formatDateLabel(inspectedTree.planting_date)}</strong>
                    </div>
                    <div>
                      <span>Current GPS</span>
                      <strong>{formatGpsPair(inspectedTreeCoords?.lng ?? null, inspectedTreeCoords?.lat ?? null)}</strong>
                    </div>
                    <div>
                      <span>Tree Height</span>
                      <strong>{formatTreeHeight(inspectedTree.tree_height_m)}</strong>
                    </div>
                    <div>
                      <span>Tree Origin</span>
                      <strong>{formatTreeOriginLabel(inspectedTree.tree_origin)}</strong>
                    </div>
                    <div>
                      <span>Attribution</span>
                      <strong>{formatAttributionScopeLabel(inspectedTree.attribution_scope)}</strong>
                    </div>
                    <div>
                      <span>Scope Flags</span>
                      <strong>
                        {inspectedTree.count_in_planting_kpis ? "Planting KPI" : "No KPI"} /{" "}
                        {inspectedTree.count_in_carbon_scope ? "Carbon" : "No Carbon"}
                      </strong>
                    </div>
                    <div>
                      <span>Custodian</span>
                      <strong>{inspectedTree.custodian_name}</strong>
                    </div>
                  </>
                )}
              </div>
              {activeWorkflowProfile !== "agric" && selectedInspectTreeMeta && (
                <div className="green-work-tree-meta-edit">
                  <label>
                    Planting Date
                    <input
                      type="date"
                      value={selectedInspectTreeMeta.planting_date}
                      onChange={(e) =>
                        setTreeMetaDraftById((prev) => ({
                          ...prev,
                          [inspectedTree.id]: {
                            ...selectedInspectTreeMeta,
                            planting_date: e.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Height (m)
                    <input
                      type="number"
                      min={0}
                      max={120}
                      step="0.01"
                      value={selectedInspectTreeMeta.tree_height_m}
                      onChange={(e) =>
                        setTreeMetaDraftById((prev) => ({
                          ...prev,
                          [inspectedTree.id]: {
                            ...selectedInspectTreeMeta,
                            tree_height_m: e.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Origin
                    <select
                      value={selectedInspectTreeMeta.tree_origin}
                      onChange={(e) =>
                        setTreeMetaDraftById((prev) => ({
                          ...prev,
                          [inspectedTree.id]: {
                            ...selectedInspectTreeMeta,
                            tree_origin: e.target.value as
                              | "new_planting"
                              | "existing_inventory"
                              | "natural_regeneration",
                          },
                        }))
                      }
                    >
                      <option value="new_planting">New planting</option>
                      <option value="existing_inventory">Existing inventory</option>
                      <option value="natural_regeneration">Natural regeneration</option>
                    </select>
                  </label>
                  <label>
                    Attribution
                    <select
                      value={selectedInspectTreeMeta.attribution_scope}
                      onChange={(e) =>
                        setTreeMetaDraftById((prev) => ({
                          ...prev,
                          [inspectedTree.id]: {
                            ...selectedInspectTreeMeta,
                            attribution_scope: e.target.value as "full" | "monitor_only",
                          },
                        }))
                      }
                    >
                      <option value="full">Full attribution</option>
                      <option value="monitor_only">Monitor only</option>
                    </select>
                  </label>
                  <label className="green-work-checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedInspectTreeMeta.count_in_planting_kpis}
                      onChange={(e) =>
                        setTreeMetaDraftById((prev) => ({
                          ...prev,
                          [inspectedTree.id]: {
                            ...selectedInspectTreeMeta,
                            count_in_planting_kpis: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Count in planting KPI</span>
                  </label>
                  <label className="green-work-checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedInspectTreeMeta.count_in_carbon_scope}
                      onChange={(e) =>
                        setTreeMetaDraftById((prev) => ({
                          ...prev,
                          [inspectedTree.id]: {
                            ...selectedInspectTreeMeta,
                            count_in_carbon_scope: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Count in carbon scope</span>
                  </label>
                  <button
                    className="green-work-tree-meta-save"
                    type="button"
                    disabled={savingTreeMetaId === inspectedTree.id}
                    onClick={() => void saveTreeMeta(inspectedTree.id)}
                  >
                    {savingTreeMetaId === inspectedTree.id ? "Saving..." : "Save Tree Metadata"}
                  </button>
                  <div className="green-work-tree-position-tools">
                    <button className="green-btn-outline" type="button" onClick={() => startAdjustingTreePosition(inspectedTree.id)}>
                      Adjust Position
                    </button>
                    {treePositionDraft && Number(treePositionDraft.treeId) === Number(inspectedTree.id) && (
                      <>
                        <span className="green-work-note">
                          Draft GPS: {formatGpsPair(treePositionDraft.lng, treePositionDraft.lat)}
                        </span>
                        <button
                          className="green-btn-primary"
                          type="button"
                          disabled={savingTreePositionId === inspectedTree.id}
                          onClick={() => void saveTreePosition(inspectedTree.id)}
                        >
                          {savingTreePositionId === inspectedTree.id ? "Saving Position..." : "Save Position"}
                        </button>
                        <button
                          className="green-btn-outline"
                          type="button"
                          disabled={savingTreePositionId === inspectedTree.id}
                          onClick={() => setTreePositionDraft(null)}
                        >
                          Cancel Position Edit
                        </button>
                      </>
                    )}
                  </div>
                  <div className="work-actions">
                    <button
                      className="green-work-danger-btn"
                      type="button"
                      disabled={deletingTreeId === inspectedTree.id}
                      onClick={() => void deleteTreeFromWork(inspectedTree.id)}
                    >
                      {deletingTreeId === inspectedTree.id ? "Deleting Tree..." : "Delete Tree"}
                    </button>
                  </div>
                  <p className="green-work-note danger">
                    Deleting a tree permanently removes that tree and all related maintenance records/tasks.
                  </p>
                </div>
              )}
              <p className="green-work-tree-inspector-notes">{inspectedTree.notes || "No notes."}</p>
              <div className="green-work-tree-maintenance-row">
                <span>Total: {inspectedTree.maintenance.total}</span>
                <span>Done: {inspectedTree.maintenance.done}</span>
                <span>Pending: {inspectedTree.maintenance.pending}</span>
                <span>Overdue: {inspectedTree.maintenance.overdue}</span>
              </div>
              <div className="green-work-tree-inspector-tasks">
                <h5>{activeWorkflowProfile === "agric" ? "Recent Field Visits" : "Recent Maintenance"}</h5>
                {inspectedTree.tasks.length === 0 ? (
                  <p>{activeWorkflowProfile === "agric" ? "No field visits yet." : "No maintenance records yet."}</p>
                ) : (
                  inspectedTree.tasks.slice(0, 5).map((task: any) => (
                    <div key={task.id} className="green-work-tree-inspector-task">
                      <strong>{formatTaskTypeLabel(task.task_type || "task")}</strong>
                      <span>{task.assignee_name || "-"}</span>
                      <span>{formatTaskTypeLabel(task.status || "-")}</span>
                      <span>{formatDateLabel(task.due_date)}</span>
                    </div>
                  ))
                )}
              </div>
              {activeWorkflowProfile === "green" && (
                <div style={{ marginTop: 20, padding: '0 16px 16px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      window.open(`${BACKEND_URL}/green/trees/${inspectedTree.id}/qr-tag/pdf`, "_blank");
                    }}
                    style={{
                      width: "100%",
                      padding: "12px",
                      background: "#083e20",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "bold",
                      cursor: "pointer"
                    }}
                  >
                    🌳 Download QR Tree Tag (PDF)
                  </button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {workPasswordModalOpen && (
        <>
          <button
            type="button"
            className="green-work-delete-overlay"
            onClick={() => closeWorkPasswordModal()}
            aria-label="Close password dialog"
          />
          <section
            className="green-work-password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="green-work-password-title"
          >
            <div className="green-work-password-head">
              <h3 id="green-work-password-title">Change Password</h3>
              <button
                type="button"
                className="green-work-password-close"
                onClick={() => closeWorkPasswordModal()}
                disabled={workPasswordModalSaving}
                aria-label="Close password dialog"
              >
                X
              </button>
            </div>
            <p className="green-work-password-note">
              Update your login password for LandCheck Work and LandCheck Green.
            </p>
            <div className="green-work-password-fields">
              <label>
                Current Password
                <input
                  type={workPasswordModalShow ? "text" : "password"}
                  value={workPasswordForm.current_password}
                  onChange={(e) =>
                    setWorkPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))
                  }
                  disabled={workPasswordModalSaving}
                  autoComplete="current-password"
                  autoFocus
                />
              </label>
              <label>
                New Password
                <input
                  type={workPasswordModalShow ? "text" : "password"}
                  value={workPasswordForm.new_password}
                  onChange={(e) => setWorkPasswordForm((prev) => ({ ...prev, new_password: e.target.value }))}
                  disabled={workPasswordModalSaving}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirm New Password
                <input
                  type={workPasswordModalShow ? "text" : "password"}
                  value={workPasswordForm.confirm_password}
                  onChange={(e) =>
                    setWorkPasswordForm((prev) => ({ ...prev, confirm_password: e.target.value }))
                  }
                  disabled={workPasswordModalSaving}
                  autoComplete="new-password"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submitWorkPasswordChange();
                    }
                  }}
                />
              </label>
            </div>
            <div className="work-actions green-work-password-actions">
              <button
                type="button"
                onClick={() => setWorkPasswordModalShow((prev) => !prev)}
                disabled={workPasswordModalSaving}
              >
                {workPasswordModalShow ? "Hide Passwords" : "Show Passwords"}
              </button>
              <button type="button" onClick={() => closeWorkPasswordModal()} disabled={workPasswordModalSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void submitWorkPasswordChange()}
                disabled={workPasswordModalSaving}
              >
                {workPasswordModalSaving ? "Saving..." : "Save Password"}
              </button>
            </div>
          </section>
        </>
      )}

      {deleteProjectModalOpen && activeProjectRecord && (
        <>
          <button
            type="button"
            className="green-work-delete-overlay"
            onClick={closeDeleteProjectModal}
            aria-label="Close delete project dialog"
          />
          <section className="green-work-delete-modal" role="dialog" aria-modal="true" aria-labelledby="green-work-delete-title">
            <h3 id="green-work-delete-title">Delete Project</h3>
            <p className="green-work-delete-warning">
              Are you sure you want to delete this project? This permanently removes all related trees, tasks,
              reports, custodians, and workflow records.
            </p>
            <p className="green-work-delete-target">
              Type project name exactly to confirm:
              <strong>{activeProjectRecord.name}</strong>
            </p>
            <input
              type="text"
              value={deleteProjectConfirmName}
              onChange={(e) => setDeleteProjectConfirmName(e.target.value)}
              placeholder="Type exact project name"
              disabled={deletingProject}
              autoFocus
            />
            <div className="work-actions">
              <button type="button" onClick={closeDeleteProjectModal} disabled={deletingProject}>
                Cancel
              </button>
              <button
                type="button"
                className="green-work-danger-btn"
                onClick={() => void deleteProject()}
                disabled={deletingProject || !deleteProjectNameMatches}
              >
                {deletingProject ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </section>
        </>
      )}

      {staffMenu && activeWorkflowProfile !== "agric" && (
        <>
          <button
            type="button"
            className="green-work-context-overlay"
            onClick={() => setStaffMenu(null)}
            aria-label="Close staff menu"
          />
          <div className="green-work-context-menu" style={{ left: staffMenu.x, top: staffMenu.y }}>
            <div className="green-work-context-title">{staffMenu.user.full_name}</div>
            <button type="button" onClick={() => openAssignWorkForUser(staffMenu.user.full_name)}>
              Assign Tree Planting
            </button>
            <button type="button" onClick={() => openAssignTaskForUser(staffMenu.user.full_name)}>
              Assign Maintenance
            </button>
          </div>
        </>
      )}

      {liveTreeMenu && activeWorkflowProfile !== "agric" && (
        <>
          <button
            type="button"
            className="green-work-context-overlay"
            onClick={() => setLiveTreeMenu(null)}
            aria-label="Close tree menu"
          />
          <div className="green-work-context-menu" style={{ left: liveTreeMenu.x, top: liveTreeMenu.y }}>
            <div className="green-work-context-title">{formatProjectTreeLabelById(liveTreeMenu.treeId)}</div>
            <button type="button" onClick={() => openAssignTaskForTree(liveTreeMenu.treeId, liveTreeMenu.taskType)}>
              Assign Maintenance
            </button>
          </div>
        </>
      )}
    </div>
  );
}
