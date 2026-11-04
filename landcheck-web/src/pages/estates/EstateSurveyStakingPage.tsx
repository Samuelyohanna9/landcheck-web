import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon, { type EstateIconName } from "../../components/estates/EstateIcon";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";
import SurveyPlanTab from "../../components/estates/surveyStaking/SurveyPlanTab";
import StakingTab from "../../components/estates/surveyStaking/StakingTab";
// .edash-mk-tabs / .edash-mk-tab (the tab switcher, same pattern as EstateMarketingPage) only has
// its base rules here, not in estate-dashboard.css which EstateShell already loads globally.
import "../../styles/estate-marketing.css";

type TabKey = "survey" | "staking";
const TABS: Array<{ key: TabKey; label: string; icon: EstateIconName }> = [
  { key: "survey", label: "Survey Plan", icon: "survey" },
  { key: "staking", label: "Staking", icon: "staking" },
];

export default function EstateSurveyStakingPage() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // /estates/:id/staking is kept as a working, bookmarkable URL (this page used to live there on
  // its own) and defaults the tab to Staking; every other way in - the sidebar's own subView link,
  // or /estates/:id/survey directly - defaults to Survey Plan. ?tab= always wins when present so
  // the sidebar's link (which always points at the /survey path, per estateNavItems below) can
  // still select Staking explicitly.
  const requested = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = requested === "staking" || requested === "survey"
    ? requested
    : location.pathname.endsWith("/staking") ? "staking" : "survey";

  const [estateName, setEstateName] = useState("");
  const [activity, setActivity] = useState<any[]>([]);

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  }, [estateId]);

  const selectTab = (key: TabKey) => setSearchParams(key === "survey" ? {} : { tab: key }, { replace: true });

  if (!estateId) return null;

  const ribbonTabs: EstateRibbonTab[] = [
    {
      key: "home",
      label: "Home",
      groups: [
        { key: "navigate", label: "Navigate", buttons: [{ key: "map", label: "Map & Plots", icon: "map", onClick: () => navigate(`/estates/${estateId}/map`) }] },
      ],
    },
  ];

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="survey" recentActivity={activity}>
      <EstateRibbon tabs={ribbonTabs} />
      <div className="edash-mk-tabs" role="tablist" aria-label="Survey and staking sections">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`edash-mk-tab${tab === item.key ? " is-active" : ""}`} onClick={() => selectTab(item.key)}>
            <EstateIcon name={item.icon} />{item.label}
          </button>
        ))}
      </div>
      {tab === "survey" && <SurveyPlanTab estateId={estateId} />}
      {tab === "staking" && <StakingTab estateId={estateId} />}
    </EstateShell>
  );
}
