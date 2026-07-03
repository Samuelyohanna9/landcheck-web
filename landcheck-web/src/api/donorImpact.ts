import { api, BACKEND_URL } from "./client";

export type DonorImpactOrg = {
  id: number;
  name: string;
  slug: string;
  short_name?: string | null;
  logo_url?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  country?: string | null;
  state_region?: string | null;
  city?: string | null;
};

export type DonorImpactStats = {
  total_records: number;
  active_records: number;
  dead_records: number;
  replaced_records: number;
  survival_rate: number;
  total_custodians: number;
  total_field_officers: number;
  approved_tasks: number;
  species_breakdown: Array<{ label: string; count: number }>;
  last_activity_at?: string | null;
};

export type DonorImpactPhoto = {
  url: string;
  tree_id: number;
  captured_at?: string | null;
  created_by?: string | null;
  entity_label?: string | null;
};

export type DonorImpactMapPoint = {
  lng: number;
  lat: number;
  custodian_name?: string;
  commodity?: string;
  area_ha?: number | null;
  ref_no?: string;
};

export type DonorImpactMapFeature = {
  type: "Feature";
  geometry: Record<string, unknown>;
  properties: {
    custodian_name: string;
    commodity: string;
    area_ha: number | null;
    ref_no: string;
  };
};

export type DonorImpactComment = {
  id: number;
  commenter_name: string;
  commenter_rank?: string | null;
  commenter_org?: string | null;
  project_name?: string | null;
  comment_body: string;
  created_at?: string | null;
};

export type DonorImpactActivity = {
  id: number;
  task_type: string;
  assignee_name: string;
  custodian_name: string;
  review_notes: string;
  reviewed_at: string;
  entity_ref: string;
  species: string;
};

export type WorkflowProfile = "green" | "agric" | "relief_recovery";

export type DonorImpactProjectLabels = {
  mode_label: string;
  owner_singular: string;
  owner_plural: string;
  entity_singular: string;
  entity_plural: string;
  visit_label: string;
};

export type AgricConfig = {
  program_type?: string | null;
  focus_commodities?: string | null;
  support_packages?: string | null;
  season_label?: string | null;
};

export type ReliefConfig = {
  program_type?: string | null;
  intervention_focus?: string | null;
  package_types?: string | null;
  target_zone?: string | null;
};

export type DonorImpactProject = {
  id: number;
  name: string;
  location_text: string;
  workflow_profile: WorkflowProfile;
  labels: DonorImpactProjectLabels;
  agric_config?: AgricConfig | null;
  relief_config?: ReliefConfig | null;
  stats: DonorImpactStats;
  recent_photos: DonorImpactPhoto[];
  map_points: DonorImpactMapPoint[];
  map_features?: DonorImpactMapFeature[];
  recent_activities: DonorImpactActivity[];
};

export type DonorImpactData = {
  org: DonorImpactOrg;
  projects: DonorImpactProject[];
  summary: {
    total_records: number;
    total_approved_activities: number;
    last_updated_at?: string | null;
  };
  generated_at: string;
};

export const fetchOrgImpact = async (orgSlug: string): Promise<DonorImpactData> => {
  const response = await api.get<DonorImpactData>(`/green/public/impact/${encodeURIComponent(orgSlug)}`);
  return response.data;
};

export const buildOrgImpactPdfUrl = (orgSlug: string): string =>
  `${BACKEND_URL}/green/public/impact/${encodeURIComponent(orgSlug)}/pdf`;

export const buildOrgImpactShareUrl = (orgSlug: string): string =>
  `https://landcheck.online/impact/${encodeURIComponent(orgSlug)}`;

export const fetchOrgImpactComments = async (orgSlug: string): Promise<DonorImpactComment[]> => {
  const response = await api.get<DonorImpactComment[]>(`/green/public/impact/${encodeURIComponent(orgSlug)}/comments`);
  return response.data;
};

export const postOrgImpactComment = async (
  orgSlug: string,
  payload: { commenter_name: string; commenter_rank: string; commenter_org: string; project_name: string; comment_body: string },
): Promise<DonorImpactComment> => {
  const response = await api.post<DonorImpactComment>(`/green/public/impact/${encodeURIComponent(orgSlug)}/comment`, payload);
  return response.data;
};
