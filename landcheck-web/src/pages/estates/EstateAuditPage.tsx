import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";

export default function EstateAuditPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [activity, setActivity] = useState<any[]>([]);

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };

  useEffect(load, [estateId]);

  if (!estateId) return null;

  const ribbonTabs: EstateRibbonTab[] = [
    {
      key: "home",
      label: "Home",
      groups: [{ key: "data", label: "Data", buttons: [{ key: "refresh", label: "Refresh", icon: "refresh", onClick: load }] }],
    },
  ];

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="audit" recentActivity={activity}>
      <EstateRibbon tabs={ribbonTabs} />
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Audit timeline ({activity.length})</h3></div>
          {activity.length ? (
            <div className="edash-timeline-list">
              {activity.map((event) => (
                <div key={event.id} className="edash-timeline-item">
                  <span className="edash-timeline-dot" />
                  <div>
                    <strong>{String(event.action || "").replaceAll("_", " ")}</strong>
                    <small>{event.entity_type ? `${event.entity_type} #${event.entity_id} · ` : ""}{new Date(event.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="edash-tab-empty">No recorded activity for this Estate yet.</p>}
        </div>
      </div>
    </EstateShell>
  );
}
