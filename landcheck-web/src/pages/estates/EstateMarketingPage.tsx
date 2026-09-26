import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { getEstateAuthSession } from "../../auth/estateAuth";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon, { type EstateIconName } from "../../components/estates/EstateIcon";
import MarketingAgentsTab from "../../components/estates/marketing/MarketingAgentsTab";
import MarketingInspectionsTab from "../../components/estates/marketing/MarketingInspectionsTab";
import MarketingMaterialsTab from "../../components/estates/marketing/MarketingMaterialsTab";
import MarketingOverviewTab from "../../components/estates/marketing/MarketingOverviewTab";
import MarketingProgressTab from "../../components/estates/marketing/MarketingProgressTab";
import MarketingSocialTab from "../../components/estates/marketing/MarketingSocialTab";
import "../../styles/estate-marketing.css";

type TabKey = "overview" | "materials" | "social" | "inspections" | "progress" | "agents";
const TABS: Array<{ key: TabKey; label: string; icon: EstateIconName }> = [
  { key: "overview", label: "Overview", icon: "chart-donut" },
  { key: "materials", label: "Materials & sharing", icon: "share" },
  { key: "social", label: "Social posts", icon: "megaphone" },
  { key: "inspections", label: "Site inspections", icon: "calendar" },
  { key: "progress", label: "Site progress", icon: "camera" },
  { key: "agents", label: "Agents", icon: "customers" },
];

export default function EstateMarketingPage() {
  const { estateId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = TABS.some((item) => item.key === requested) ? (requested as TabKey) : "overview";
  const session = getEstateAuthSession();
  const role = String(session?.user.role_key || "").toLowerCase();
  const organizationId = Number(session?.user.organization_id || 0);
  const canManage = role === "owner" || role === "manager";
  const canPost = canManage || role === "field_officer";
  const canSocial = canManage || role === "marketer";

  const [estateName, setEstateName] = useState("");
  const [published, setPublished] = useState(false);
  const [hasMeetingPoint, setHasMeetingPoint] = useState(false);
  const [followUps, setFollowUps] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/public-settings`).then((response) => {
      setPublished(Boolean(response.data.public_enabled && response.data.public_slug));
      setHasMeetingPoint(Boolean(response.data.public_meeting_point));
    }).catch(() => undefined).finally(() => setReady(true));
  }, [estateId]);

  const onFollowUpCount = useCallback((count: number) => setFollowUps(count), []);
  const selectTab = (key: TabKey) => setSearchParams(key === "overview" ? {} : { tab: key }, { replace: true });

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="marketing" onEstateNameChange={setEstateName}>
      {ready && !published && (
        <div className="edash-mk-banner">
          <div><strong>Publish your public Estate page to start marketing</strong>Flyers, ads and share links all point buyers to it, and inspection bookings happen there.</div>
          <Link to={`/estates/${estateId}/settings`}>Open settings</Link>
        </div>
      )}
      <div className="edash-mk-tabs" role="tablist" aria-label="Marketing sections">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`edash-mk-tab${tab === item.key ? " is-active" : ""}`} onClick={() => selectTab(item.key)}>
            <EstateIcon name={item.icon} />{item.label}
            {item.key === "overview" && followUps > 0 && <span className="edash-mk-count">{followUps}</span>}
          </button>
        ))}
      </div>
      {tab === "overview" && <MarketingOverviewTab estateId={estateId} onFollowUpCount={onFollowUpCount} />}
      {tab === "materials" && <MarketingMaterialsTab estateId={estateId} estateName={estateName} published={published} />}
      {tab === "social" && <MarketingSocialTab estateId={estateId} estateName={estateName} canManage={canSocial} published={published} />}
      {tab === "inspections" && <MarketingInspectionsTab estateId={estateId} canManage={canManage} hasMeetingPoint={hasMeetingPoint} published={published} />}
      {tab === "progress" && <MarketingProgressTab estateId={estateId} canPost={canPost} />}
      {tab === "agents" && <MarketingAgentsTab estateId={estateId} organizationId={organizationId} canManage={canManage} published={published} />}
    </EstateShell>
  );
}
