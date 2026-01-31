// src/pages/NewPlot.tsx
import { useEffect, useMemo, useState } from "react";
import MapView from "../components/MapView";
import { api, BACKEND_URL } from "../api/client";
import toast, { Toaster } from "react-hot-toast";

type PlotMeta = {
  title_text: string;
  station_text: string;
  location_text: string;
  lga_text: string;
  state_text: string;
  surveyor_name: string;
  surveyor_rank: string;
  scale_text: string;
};

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
};

const BACKEND = BACKEND_URL;

export default function NewPlot() {
  // polygon from map (lng/lat)
  const [coords, setCoords] = useState<number[][] | null>(null);

  // manual table (single source of truth when non-empty)
  const [manualPoints, setManualPoints] = useState<ManualPoint[]>([]);

  const [loading, setLoading] = useState(false);
  const [plotId, setPlotId] = useState<number | null>(null);
  const [features, setFeatures] = useState<any>(null);
  const [resetKey, setResetKey] = useState(0);

  const [meta, setMeta] = useState<PlotMeta>({
    title_text: "SURVEY PLAN",
    station_text: "",
    location_text: "",
    lga_text: "",
    state_text: "",
    surveyor_name: "",
    surveyor_rank: "",
    scale_text: "1 : 1000",
  });

  // when user draws a polygon, seed manual table with A,B,C... + coords
  useEffect(() => {
    if (!coords || coords.length < 3) return;

    const pts = coords.map((c, i) => ({
      station: String.fromCharCode(65 + i), // A, B, C...
      lng: c[0],
      lat: c[1],
    }));

    // Avoid overwriting manual edits after plot created or if user already edited table:
    // Only auto-fill when table is empty AND no plot yet.
    if (manualPoints.length === 0 && plotId === null) {
      setManualPoints(pts);
    }
  }, [coords, manualPoints.length, plotId]);

  const updatePoint = (index: number, key: keyof ManualPoint, value: string | number) => {
    setManualPoints((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: value } as ManualPoint;
      return copy;
    });
  };

  // Generate station name: A, B, C, ... Z, AA, AB, ... AZ, BA, ... (unlimited)
  const getStationName = (index: number): string => {
    let name = "";
    let num = index;
    do {
      name = String.fromCharCode(65 + (num % 26)) + name;
      num = Math.floor(num / 26) - 1;
    } while (num >= 0);
    return name;
  };

  const removePoint = (index: number) => {
    setManualPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const addPoint = () => {
    setManualPoints((prev) => [
      ...prev,
      {
        station: getStationName(prev.length),
        lng: 0,
        lat: 0,
      },
    ]);
  };

  const closeRing = (pts: number[][]) => {
    if (pts.length < 3) return pts;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const same = first[0] === last[0] && first[1] === last[1];
    return same ? pts : [...pts, first];
  };

  // final coords to send to backend
  const finalCoords = useMemo(() => {
    if (manualPoints.length >= 3) {
      const pts = manualPoints.map((p) => [Number(p.lng), Number(p.lat)]);
      return closeRing(pts);
    }
    if (coords && coords.length >= 3) return closeRing(coords);
    return null;
  }, [manualPoints, coords]);

  const stationNames = useMemo(() => {
    if (manualPoints.length >= 3) return manualPoints.map((p) => (p.station || "").trim());
    return [];
  }, [manualPoints]);

  const createPlot = async () => {
    if (!finalCoords) {
      toast.error("Draw a polygon or enter at least 3 points.");
      return;
    }

    try {
      setLoading(true);

      // IMPORTANT:
      // Your backend currently expects: create_plot(coords: list[list[float]])
      // So we POST the raw array for /plots.
      // Metadata + scale will be sent in the next steps (preview/pdf endpoints).
      const res = await api.post("/plots", finalCoords);
      const id = res.data.plot_id ?? res.data.id;
      setPlotId(id);

      const featureRes = await api.get(`/plots/${id}/features`);
      setFeatures(featureRes.data);

      toast.success("Plot created successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create plot");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setCoords(null);
    setManualPoints([]);
    setPlotId(null);
    setFeatures(null);
    setResetKey((k) => k + 1);
    toast("Reset completed");
  };

  // Preview endpoints in your backend are POST (Body params), not GET.
  // So we use forms to POST and open in new tab.
  const buildPreviewForm = (actionUrl: string) => (
    <form
      action={actionUrl}
      method="post"
      target="_blank"
      style={{ display: "inline-flex" }}
    >
      <input type="hidden" name="title_text" value={meta.title_text} />
      <input type="hidden" name="station_text" value={meta.station_text} />
      <input type="hidden" name="location_text" value={meta.location_text} />
      <input type="hidden" name="lga_text" value={meta.lga_text} />
      <input type="hidden" name="state_text" value={meta.state_text} />
      <input type="hidden" name="scale_text" value={meta.scale_text} />
      <input type="hidden" name="surveyor_name" value={meta.surveyor_name} />
      <input type="hidden" name="surveyor_rank" value={meta.surveyor_rank} />
      <input type="hidden" name="station_names" value={JSON.stringify(stationNames)} />
      <button type="submit">Open Preview</button>
    </form>
  );

  const buildDownloadForm = (actionUrl: string, label: string) => (
    <form
      action={actionUrl}
      method="post"
      target="_blank"
      style={{ display: "inline-flex" }}
    >
      <input type="hidden" name="title_text" value={meta.title_text} />
      <input type="hidden" name="station_text" value={meta.station_text} />
      <input type="hidden" name="location_text" value={meta.location_text} />
      <input type="hidden" name="lga_text" value={meta.lga_text} />
      <input type="hidden" name="state_text" value={meta.state_text} />
      <input type="hidden" name="scale_text" value={meta.scale_text} />
      <input type="hidden" name="surveyor_name" value={meta.surveyor_name} />
      <input type="hidden" name="surveyor_rank" value={meta.surveyor_rank} />
      <input type="hidden" name="station_names" value={JSON.stringify(stationNames)} />
      <button type="submit">{label}</button>
    </form>
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Toaster position="top-right" />

      {/* TOP TOOLBAR */}
      <div
        style={{
          padding: 10,
          background: "#f5f5f5",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button disabled={!finalCoords || loading || plotId !== null} onClick={createPlot}>
          {loading ? "Saving..." : "Create Plot"}
        </button>

        <button disabled={loading} onClick={resetAll}>
          Clear
        </button>

        {loading && <span>⏳ Processing...</span>}
      </div>

      {/* SURVEY FORM */}
      <div style={{ padding: 10, borderBottom: "1px solid #ddd" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
            gap: 8,
          }}
        >
          <input
            value={meta.title_text}
            placeholder="SURVEY PLAN"
            onChange={(e) => setMeta((m) => ({ ...m, title_text: e.target.value }))}
          />
          <input
            value={meta.location_text}
            placeholder="LOCATION"
            onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))}
          />
          <input
            value={meta.lga_text}
            placeholder="LGA"
            onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))}
          />
          <input
            value={meta.state_text}
            placeholder="STATE"
            onChange={(e) => setMeta((m) => ({ ...m, state_text: e.target.value }))}
          />

          <input
            value={meta.station_text}
            placeholder="STATION"
            onChange={(e) => setMeta((m) => ({ ...m, station_text: e.target.value }))}
          />
          <input
            value={meta.surveyor_name}
            placeholder="SURVEYOR"
            onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))}
          />
          <input
            value={meta.surveyor_rank}
            placeholder="RANK"
            onChange={(e) => setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))}
          />

          <select
            value={meta.scale_text}
            onChange={(e) => setMeta((m) => ({ ...m, scale_text: e.target.value }))}
          >
            <option value="1 : 250">1 : 250</option>
            <option value="1 : 500">1 : 500</option>
            <option value="1 : 1000">1 : 1000</option>
            <option value="1 : 2000">1 : 2000</option>
            <option value="1 : 5000">1 : 5000</option>
          </select>
        </div>
      </div>

      {/* MAP */}
      <div style={{ flex: 1 }}>
        <MapView
          onPolygonCreated={(poly) => {
            if (plotId !== null) return; // lock drawing after create
            setCoords(poly);
            // also keep manualPoints in sync if user hasn't edited manually yet
            if (poly && manualPoints.length === 0) {
              setManualPoints(
                poly.map((c, i) => ({
                  station: String.fromCharCode(65 + i),
                  lng: c[0],
                  lat: c[1],
                }))
              );
            }
          }}
          disabled={plotId !== null}
          resetKey={resetKey}
        />
      </div>

      {/* MANUAL INPUT */}
      <div style={{ padding: 12, borderTop: "1px solid #ddd", background: "#fff" }}>
        <h4 style={{ margin: "8px 0" }}>Manual Coordinates (Lng / Lat)</h4>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Station</th>
                <th style={th}>Longitude</th>
                <th style={th}>Latitude</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {manualPoints.map((p, i) => (
                <tr key={i}>
                  <td style={td}>{i + 1}</td>

                  <td style={td}>
                    <input
                      value={p.station}
                      onChange={(e) => updatePoint(i, "station", e.target.value)}
                      style={{ width: 90 }}
                      placeholder="A"
                    />
                  </td>

                  <td style={td}>
                    <input
                      type="number"
                      value={p.lng}
                      onChange={(e) => updatePoint(i, "lng", Number(e.target.value))}
                      style={{ width: 160 }}
                    />
                  </td>

                  <td style={td}>
                    <input
                      type="number"
                      value={p.lat}
                      onChange={(e) => updatePoint(i, "lat", Number(e.target.value))}
                      style={{ width: 160 }}
                    />
                  </td>

                  <td style={td}>
                    <button disabled={plotId !== null} onClick={() => removePoint(i)}>
                      ❌
                    </button>
                  </td>
                </tr>
              ))}

              {manualPoints.length === 0 && (
                <tr>
                  <td style={td} colSpan={5}>
                    Draw a polygon OR add points manually below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button disabled={plotId !== null} onClick={addPoint}>
            ➕ Add Point
          </button>
          <button
            disabled={plotId !== null}
            onClick={() => setManualPoints([])}
          >
            Clear Manual Points
          </button>
          <small style={{ opacity: 0.7 }}>
            Tip: You need at least 3 points. Ring will auto-close on submit.
          </small>
        </div>
      </div>

      {/* RESULTS */}
      {plotId && (
        <div style={{ padding: 15, background: "#fafafa", borderTop: "1px solid #ddd" }}>
          <h3 style={{ marginTop: 0 }}>Plot #{plotId}</h3>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            {/* Previews must be POST so we open in new tab */}
            <div style={panelBox}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Survey Plan Preview</div>
              {buildPreviewForm(`${BACKEND}/plots/${plotId}/report/preview`)}
            </div>

            <div style={panelBox}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Orthophoto Preview</div>
              {/* your backend endpoint is POST too */}
              <form action={`${BACKEND}/plots/${plotId}/orthophoto/preview`} method="post" target="_blank">
                <input type="hidden" name="scale_text" value={meta.scale_text} />
                <button type="submit">Open Preview</button>
              </form>
            </div>

            <div style={panelBox}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Downloads</div>

              {/* survey pdf is POST in your backend */}
              {buildDownloadForm(`${BACKEND}/plots/${plotId}/report/pdf`, "Download Survey PDF")}

              {/* orthophoto pdf: your backend likely POST; if yours is GET, change method */}
              <form
                action={`${BACKEND}/plots/${plotId}/orthophoto/pdf`}
                method="post"
                target="_blank"
                style={{ display: "inline-flex", marginLeft: 8 }}
              >
                <input type="hidden" name="scale_text" value={meta.scale_text} />
                <button type="submit">Download Orthophoto PDF</button>
              </form>

              {/* DWG (you said this exists as GET) */}
              <a
                href={`${BACKEND}/plots/${plotId}/survey-plan/dwg`}
                target="_blank"
                rel="noreferrer"
                style={{ marginLeft: 8 }}
              >
                <button type="button">Download DWG</button>
              </a>
            </div>
          </div>

          {features && (
            <div style={{ marginTop: 15 }}>
              <h4 style={{ margin: "10px 0" }}>Detected Features</h4>
              <pre
                style={{
                  background: "#eee",
                  padding: 10,
                  borderRadius: 6,
                  maxHeight: 220,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(features, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "8px 6px",
  fontWeight: 700,
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "8px 6px",
};

const panelBox: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  padding: 12,
};
