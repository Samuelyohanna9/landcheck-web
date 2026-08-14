import { useEffect, useState } from "react";
import { api } from "../api/client";

type FeatureKind = "road" | "river";

type FeatureGroup = {
  key: string;
  kind: FeatureKind;
  label: string;
  currentName: string;
  widthM: number | null;
  geojson: any;
  positionHint: string;
  lengthM: number | null;
  segmentIndex: number | null;
  sourceHint: string;
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
  scaleText?: string;
  paperSize?: string;
  templateName?: string;
  roadStyle: string;
  onRoadStyleChange: (value: string) => void;
};

const ROAD_STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Template Default" },
  { value: "solid", label: "Solid" },
  { value: "dashed_symbol", label: "Dashed + Symbols" },
];

// Small preview matching how each style actually renders on the plan: a plain line, or a dashed
// line with the periodic cross-tie ticks map_renderer_layout.py's dashed_symbol style draws.
function RoadStyleSwatch({ value }: { value: string }) {
  return (
    <svg className="road-style-swatch" viewBox="0 0 64 18" aria-hidden="true">
      {value === "dashed_symbol" ? (
        <>
          <line x1="4" y1="9" x2="60" y2="9" strokeDasharray="7,4" />
          <line x1="11" y1="5" x2="11" y2="13" />
          <line x1="25" y1="5" x2="25" y2="13" />
          <line x1="39" y1="5" x2="39" y2="13" />
          <line x1="53" y1="5" x2="53" y2="13" />
        </>
      ) : value === "solid" ? (
        <line x1="4" y1="9" x2="60" y2="9" />
      ) : (
        <line x1="4" y1="9" x2="60" y2="9" strokeDasharray="2,3" />
      )}
    </svg>
  );
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function describeFeature(features: any[], kind: FeatureKind): FeatureGroup[] {
  return (features || []).map((feature: any, idx: number) => {
    const props = feature?.properties || {};
    const currentName = String(props.name || "").trim();
    const widthM = typeof props.width_m === "number" ? props.width_m : null;
    const positionHint = String(props.position_hint || "").trim();
    const lengthM = typeof props.length_m === "number" ? props.length_m : null;
    const sourceHint = String(props.source || "").trim() || "detected";
    const segmentIndex = Number.isFinite(Number(props.segment_index))
      ? Number(props.segment_index)
      : idx + 1;
    const baseLabel = `${kind === "road" ? "Road" : "River"} ${segmentIndex}`;
    const detailBits = [
      positionHint ? titleCase(positionHint) : "",
      lengthM && Number.isFinite(lengthM) ? `${lengthM.toFixed(1)} m` : "",
      sourceHint === "manual-add"
        ? "Manual"
        : sourceHint === "override"
          ? "Edited"
          : "Detected",
    ].filter(Boolean);

    return {
      key: String(props.segment_key || `${kind}-${segmentIndex}-${idx + 1}`),
      kind,
      label: currentName || `${baseLabel}${detailBits.length ? ` · ${detailBits.join(" · ")}` : ""}`,
      currentName,
      widthM,
      geojson: feature?.geometry,
      positionHint,
      lengthM,
      segmentIndex,
      sourceHint,
    };
  });
}

function RoadNamesPanel({
  open,
  onClose,
  plotId,
  onSaveOverride,
  onSaved,
  scaleText,
  paperSize,
  templateName,
  roadStyle,
  onRoadStyleChange,
}: RoadNamesPanelProps) {
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
      .get(`/plots/${plotId}/features/geojson`, {
        params: {
          scale_text: scaleText || undefined,
          paper_size: paperSize || undefined,
          template_name: templateName || undefined,
        },
      })
      .then((res) => {
        if (cancelled) return;
        const roads = describeFeature(res.data?.roads?.features || [], "road");
        const rivers = describeFeature(res.data?.rivers?.features || [], "river");
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
  }, [open, plotId, scaleText, paperSize, templateName]);

  const applyGroupUpdate = (key: string, updater: (g: FeatureGroup) => FeatureGroup) => {
    setRoadGroups((prev) => prev.map((g) => (g.key === key ? updater(g) : g)));
    setRiverGroups((prev) => prev.map((g) => (g.key === key ? updater(g) : g)));
  };

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
      applyGroupUpdate(group.key, (g) => ({ ...g, currentName: name }));
      setSavedKeys((prev) => ({ ...prev, [group.key]: true }));
      onSaved?.();
    }
  };

  const handleClear = async (group: FeatureGroup) => {
    if (!group.currentName) return;
    setSavingKey(group.key);
    const ok = await onSaveOverride({
      feature_type: group.kind,
      action: "update",
      name: "",
      width_m: group.widthM ?? undefined,
      geojson: group.geojson,
    });
    setSavingKey(null);
    if (ok) {
      setDrafts((prev) => ({ ...prev, [group.key]: "" }));
      applyGroupUpdate(group.key, (g) => ({ ...g, currentName: "" }));
      setSavedKeys((prev) => ({ ...prev, [group.key]: false }));
      onSaved?.();
    }
  };

  const renderGroup = (group: FeatureGroup) => (
    <div className="road-name-row" key={group.key}>
      <div className="road-name-row-header">
        <span className="road-name-row-label">{group.currentName || group.label}</span>
        <div className="road-name-row-meta">
          {group.positionHint && (
            <span className="road-name-row-chip">{titleCase(group.positionHint)}</span>
          )}
          {group.lengthM && Number.isFinite(group.lengthM) && (
            <span className="road-name-row-chip">{group.lengthM.toFixed(1)} m</span>
          )}
          {group.sourceHint && (
            <span className="road-name-row-chip">
              {group.sourceHint === "manual-add"
                ? "Manual"
                : group.sourceHint === "override"
                  ? "Edited"
                  : "Detected"}
            </span>
          )}
        </div>
      </div>
      <input
        type="text"
        className="road-name-input"
        value={drafts[group.key] ?? ""}
        placeholder={`Name ${group.kind === "road" ? "road" : "river"} on plan`}
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
      {group.currentName && (
        <button
          type="button"
          className="road-name-clear-btn"
          onClick={() => void handleClear(group)}
          disabled={savingKey === group.key}
          title="Remove this name"
          aria-label="Remove this name"
        >
          &times;
        </button>
      )}
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
          <span>Road Names &amp; Style</span>
          <button type="button" className="appearance-panel-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="appearance-panel-body">
          <section className="appearance-section road-style-section">
            <h4>Road Style</h4>
            <div className="road-style-options">
              {ROAD_STYLE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value || "default"}
                  className={`road-style-option${roadStyle === opt.value ? " active" : ""}`}
                  onClick={() => onRoadStyleChange(opt.value)}
                >
                  <RoadStyleSwatch value={opt.value} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </section>
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
                Only segments that are visible on the current printed sheet are listed here.
                Each row represents one visible road or river path on the plan, so names stay
                attached to that exact segment when you reopen the panel.
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default RoadNamesPanel;
