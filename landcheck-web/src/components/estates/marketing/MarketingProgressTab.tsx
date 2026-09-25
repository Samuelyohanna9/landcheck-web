import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../../api/client";
import { fetchBlobUrl, formatDateTime } from "../../../utils/estateMarketing";
import EstateIcon from "../EstateIcon";

type Update = {
  id: number; kind: string; title: string; body: string | null; plot_number: string | null; plot_id: number | null;
  media_type: "none" | "image" | "video" | "link"; media_url: string | null; captured_at: string; created_at: string;
  verification: "on_plot" | "on_estate" | "near_estate" | "outside" | "unverified"; verification_label: string; location_source: string;
  distance_m: number | null; is_published: boolean;
};
type PlotOption = { id: number; plot_number: string };
type Geo = { lat: number; lng: number; accuracy: number };

const KINDS = [
  { key: "photo", label: "Photo" }, { key: "video", label: "Video" }, { key: "drone", label: "Drone footage" },
  { key: "milestone", label: "Milestone (no media)" }, { key: "note", label: "Note" },
];

function MediaThumb({ item }: { item: Update }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!item.media_url || item.media_type === "link" || item.media_type === "none") return undefined;
    let cancelled = false;
    let created: string | null = null;
    fetchBlobUrl(item.media_url).then((value) => { if (cancelled) URL.revokeObjectURL(value); else { created = value; setUrl(value); } }).catch(() => undefined);
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [item.media_url, item.media_type]);
  if (item.media_type === "link" && item.media_url) return <a href={item.media_url} target="_blank" rel="noreferrer" style={{ color: "#a8e8c4", fontSize: ".8rem", padding: 12, textAlign: "center" }}>Open video link</a>;
  if (!url) return item.media_type === "none" ? <EstateIcon name="activity" /> : <span style={{ fontSize: ".74rem" }}>Loading...</span>;
  return item.media_type === "video" ? <video src={url} controls preload="metadata" /> : <img src={url} alt={item.title} />;
}

export function VerifyBadge({ verification, label }: { verification: string; label: string }) {
  const icon = verification === "on_plot" || verification === "on_estate" ? "check-circle" : verification === "unverified" ? "pin" : "alert-triangle";
  return <span className={`edash-mk-verify is-${verification}`}><EstateIcon name={icon} />{label}</span>;
}

export default function MarketingProgressTab({ estateId, canPost }: { estateId: string; canPost: boolean }) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [plots, setPlots] = useState<PlotOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("photo");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [plotId, setPlotId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [publish, setPublish] = useState(true);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get<Update[]>(`/estates/${estateId}/marketing/progress`);
      setUpdates(response.data || []);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Site updates could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [estateId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => {
      const items: PlotOption[] = (response.data?.features || []).map((feature: any) => ({ id: Number(feature.properties.id), plot_number: String(feature.properties.plot_number) }));
      items.sort((a, b) => a.plot_number.localeCompare(b.plot_number, undefined, { numeric: true }));
      setPlots(items);
    }).catch(() => setPlots([]));
  }, [estateId]);

  const locate = () => {
    if (!navigator.geolocation) { setGeoError("This device cannot share its location."); return; }
    setLocating(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (position) => { setGeo({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }); setLocating(false); },
      (error) => { setGeoError(error.code === 1 ? "Location permission was denied. Allow it in your browser to verify the capture point." : "Your location could not be read. Try again outdoors."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const needsMedia = kind === "photo" || kind === "video";
  const submit = async () => {
    if (title.trim().length < 2) { toast.error("Give the update a short title."); return; }
    if (needsMedia && !file && !videoUrl.trim()) { toast.error("Attach a photo or video, or paste a video link."); return; }
    const form = new FormData();
    form.append("title", title.trim());
    form.append("kind", kind);
    if (body.trim()) form.append("body", body.trim());
    if (plotId) form.append("plot_id", plotId);
    if (file) form.append("file", file);
    if (videoUrl.trim()) form.append("video_url", videoUrl.trim());
    if (geo) { form.append("latitude", String(geo.lat)); form.append("longitude", String(geo.lng)); form.append("accuracy_m", String(geo.accuracy)); }
    form.append("captured_at", new Date().toISOString());
    form.append("is_published", publish ? "true" : "false");
    setSaving(true);
    try {
      const response = await api.post<Update>(`/estates/${estateId}/marketing/progress`, form, { timeout: 180000 });
      const verdict = response.data.verification;
      toast.success(verdict === "unverified" ? "Update posted. No location was found, so it is labelled as not verified." : `Update posted - ${response.data.verification_label.toLowerCase()}.`);
      setTitle(""); setBody(""); setFile(null); setVideoUrl(""); setGeo(null);
      (document.getElementById("mk-progress-file") as HTMLInputElement | null)?.value && ((document.getElementById("mk-progress-file") as HTMLInputElement).value = "");
      await load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The update could not be posted."));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (item: Update) => {
    setBusyId(item.id);
    try { await api.patch(`/estates/marketing/progress/${item.id}`, { is_published: !item.is_published }); await load(); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "The update could not be changed.")); }
    finally { setBusyId(null); }
  };

  const remove = async (item: Update) => {
    if (!window.confirm("Delete this update permanently?")) return;
    setBusyId(item.id);
    try { await api.delete(`/estates/marketing/progress/${item.id}`); await load(); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "The update could not be deleted.")); }
    finally { setBusyId(null); }
  };

  return (
    <div className="edash-mk-stack">
      {canPost && (
        <div className="edash-card"><div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Post a site update</h3><span className="edash-field-note">Shown on your public page</span></div>
          <div className="edash-mk-form-grid">
            <label className="edash-field"><span>Type</span><select value={kind} onChange={(event) => setKind(event.target.value)}>{KINDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            <label className="edash-field is-wide"><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Road grading complete on Block C" maxLength={120} /></label>
            <label className="edash-field"><span>About a plot (optional)</span>
              <select value={plotId} onChange={(event) => setPlotId(event.target.value)}><option value="">Whole estate</option>{plots.map((plot) => <option key={plot.id} value={plot.id}>Plot {plot.plot_number}</option>)}</select>
            </label>
            <label className="edash-field is-wide"><span>{needsMedia ? "Photo or video" : "Attachment (optional)"}</span>
              <input id="mk-progress-file" type="file" accept="image/*,video/mp4,video/webm" capture="environment" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <label className="edash-field is-wide"><span>Or paste a video link (YouTube, Drive...)</span><input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://" /></label>
            <label className="edash-field is-full"><span>Details</span><textarea rows={2} value={body} onChange={(event) => setBody(event.target.value)} placeholder="What buyers should know about this update" maxLength={1000} /></label>
            <div className="is-full edash-mk-locate">
              <EstateIcon name="pin" />
              {geo ? <span><strong style={{ color: "var(--edash-ink)" }}>Location captured</strong> ({geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}, accurate to about {Math.round(geo.accuracy)} m). It is checked against your plot and estate boundary.</span>
                : <span>Capture your location while standing on site so buyers can see the media was shot on the land. Photos with GPS data are checked automatically.</span>}
              <button type="button" className="edash-mk-chip-btn" disabled={locating} onClick={locate}><EstateIcon name="locate" />{locating ? "Locating..." : geo ? "Update location" : "Use my location"}</button>
              {geoError && <span style={{ color: "var(--edash-danger)" }}>{geoError}</span>}
            </div>
            <label className="edash-toggle is-wide"><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} /> Publish to the public page now</label>
            <div className="is-wide" style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" className="edash-btn-primary" disabled={saving} onClick={() => void submit()}>{saving ? "Uploading..." : "Post update"}</button></div>
          </div>
        </div></div>
      )}

      <div className="edash-card"><div className="edash-card-inner">
        <div className="edash-card-head"><h3 className="edash-card-title">Site updates</h3><span className="edash-field-note">{updates.length} posted</span></div>
        {loading ? <p className="edash-mk-empty">Loading...</p> : updates.length === 0 ? <p className="edash-mk-empty">No updates yet. Regular photo and drone updates show buyers - especially those abroad - that work is real and ongoing.</p> : (
          <div className="edash-mk-progress-grid">
            {updates.map((item) => (
              <div key={item.id} className={`edash-mk-progress${item.is_published ? "" : " is-hidden"}`}>
                <div className="edash-mk-progress-media"><MediaThumb item={item} /></div>
                <div className="edash-mk-progress-body">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <VerifyBadge verification={item.verification} label={item.verification_label} />
                    <span className={`edash-status-pill tone-${item.is_published ? "good" : "neutral"}`}>{item.is_published ? "Public" : "Hidden"}</span>
                  </div>
                  <strong>{item.title}</strong>
                  {item.body && <p>{item.body}</p>}
                  <small>{formatDateTime(item.captured_at)}{item.plot_number ? ` · Plot ${item.plot_number}` : ""}{item.distance_m !== null && item.verification !== "on_plot" && item.verification !== "on_estate" ? ` · ${Math.round(item.distance_m)} m from the estate` : ""}</small>
                  {canPost && (
                    <div className="edash-mk-actions" style={{ justifyContent: "flex-start", marginTop: 4 }}>
                      <button type="button" className="edash-mk-chip-btn" disabled={busyId === item.id} onClick={() => void togglePublish(item)}>{item.is_published ? "Hide" : "Publish"}</button>
                      <button type="button" className="edash-mk-chip-btn is-danger" disabled={busyId === item.id} onClick={() => void remove(item)}><EstateIcon name="trash" />Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div></div>
    </div>
  );
}
