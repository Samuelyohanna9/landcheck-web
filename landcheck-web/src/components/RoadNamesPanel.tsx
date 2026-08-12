import { useEffect, useState } from "react";
import { api } from "../api/client";

type FeatureKind = "road" | "river";

type FeatureGroup = {
  key: string;
  kind: FeatureKind;
  label: string;
  currentName: string;
  widthM: number | null;
  geojson: { type: "MultiLineString"; coordinates: number[][][] };
};

type OverridePayload = {
  feature_type: FeatureKind;
  action: "add" | "delete" | "update";
  name?: string;
  width_m?: number;
  geojson: any;
};

type RoadNamesPanelProps = {
  open: boolean;
  onClose: () => void;
  plotId: number | null;
  onSaveOverride: (payload: OverridePayload) => Promise<boolean>;
  onSaved?: () => void;
};

function toMultiLineString(features: any[]): { type: "MultiLineString"; coordinates: number[][][] } {
  const coords: number[][][] = [];
  for (const f of features) {
    const geom = f?.geometry;
    if (!geom) continue;
    if (geom.type === "LineString" && Array.isArray(geom.coordinates)) {
      coords.push(geom.coordinates);
    } else if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
      coords.push(...geom.coordinates);
    }
  }
  return { type: "MultiLineString", coordinates: coords };
}

function groupFeatures(features: any[], kind: FeatureKind): FeatureGroup[] {
  const byName = new Map<string, any[]>();
  const unnamed: any[] = [];
  for (const f of features || []) {
    const name = String(f?.properties?.name || "").trim();
    if (name) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(f);
    } else {
      unnamed.push(f);
    }
  }
  const groups: FeatureGroup[] = [];
  for (const [name, feats] of byName.entries()) {
    const widthEntry = feats.map((f) => f?.properties?.width_m).find((w) => typeof w === "number");
    groups.push({
      key: `${kind}-named-${name}`,
      kind,
      label: name,
      currentName: name,
      widthM: typeof widthEntry === "number" ? widthEntry : null,
      geojson: toMultiLineString(feats),
    });
  }
  unnamed.forEach((f, idx) => {
    const widthM = typeof f?.properties?.width_m === "number" ? f.properties.width_m : null;
    groups.push({
      key: `${kind}-unnamed-${idx + 1}`,
      kind,
      label: `${kind === "road" ? "Road" : "River"} segment ${idx + 1}`,
      currentName: "",
      widthM,
      geojson: toMultiLineString([f]),
    });
  });
  return groups;
}

function RoadNamesPanel({ open, onClose, plotId, onSaveOverride, onSaved }: RoadNamesPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roadGroups, setRoadGroups] = useState<FeatureGroup[]>([]);
  const [riverGroups, setRiverGroups] = useState<FeatureGroup[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !plotId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/plots/${plotId}/features/geojson`)
      .then((res) => {
        if (cancelled) return;
        const roads = groupFeatures(res.data?.roads?.features || [], "road");
        const rivers = groupFeatures(res.data?.rivers?.features || [], "river");
        setRoadGroups(roads);
        setRiverGroups(rivers);
        const initialDrafts: Record<string, string> = {};
        [...roads, ...rivers].forEach((g) => {
          initialDrafts[g.key] = g.currentName;
        });
        setDrafts(initialDrafts);
        setSavedKeys({});
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load detected roads/rivers for this plot.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, plotId]);

  const handleSave = async (group: FeatureGroup) => {
    const name = (drafts[group.key] || "").trim();
    if (!name) return;
    setSavingKey(group.key);
    const ok = await onSaveOverride({
      feature_type: group.kind,
      action: "update",
      name,
      width_m: group.widthM ?? undefined,
      geojson: group.geojson,
    });
    setSavingKey(null);
    if (ok) {
      setSavedKeys((prev) => ({ ...prev, [group.key]: true }));
      onSaved?.();
    }
  };

  const renderGroup = (group: FeatureGroup) => (
    <div className="road-name-row" key={group.key}>
      <span className="road-name-row-label">{group.currentName || group.label}</span>
      <input
        type="text"
        className="road-name-input"
        value={drafts[group.key] ?? ""}
        placeholder="Enter name"
        onChange={(e) => {
          const value = e.target.value;
          setDrafts((prev) => ({ ...prev, [group.key]: value }));
          setSavedKeys((prev) => (prev[group.key] ? { ...prev, [group.key]: false } : prev));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSave(group);
        }}
      />
      <button
        type="button"
        className="road-name-save-btn"
        onClick={() => void handleSave(group)}
        disabled={savingKey === group.key || !(drafts[group.key] || "").trim()}
      >
        {savingKey === group.key ? "..." : savedKeys[group.key] ? "Saved" : "Save"}
      </button>
    </div>
  );

  return (
    <>
      <div
        className={`appearance-panel-backdrop${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`appearance-panel road-names-panel${open ? " open" : ""}`} aria-hidden={!open}>
        <div className="appearance-panel-header">
          <span>Road &amp; River Names</span>
          <button type="button" className="appearance-panel-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="appearance-panel-body">
          {!plotId ? (
            <p className="road-names-empty">Sync this draft to the server first to name its roads/rivers.</p>
          ) : loading ? (
            <p className="road-names-empty">Loading detected roads and rivers...</p>
          ) : error ? (
            <p className="road-names-empty">{error}</p>
          ) : (
            <>
              <section className="appearance-section">
                <h4>Roads</h4>
                {roadGroups.length ? (
                  <div className="road-name-list">{roadGroups.map(renderGroup)}</div>
                ) : (
                  <p className="road-names-empty">No roads detected on this plot.</p>
                )}
              </section>
              <section className="appearance-section">
                <h4>Rivers</h4>
                {riverGroups.length ? (
                  <div className="road-name-list">{riverGroups.map(renderGroup)}</div>
                ) : (
                  <p className="road-names-empty">No rivers detected on this plot.</p>
                )}
              </section>
              <p className="road-names-hint">
                Saved names are written along the road or river's own path on the plan.
                Re-render the preview afterward to see them on the sheet.
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default RoadNamesPanel;
