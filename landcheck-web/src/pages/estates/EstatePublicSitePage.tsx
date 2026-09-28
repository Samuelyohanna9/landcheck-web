import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { API_URL, api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";

/** Everything about the buyer-facing public Estate site - branding, contact details, the site
 * inspection meeting point, the payment plan shown to buyers, the development outlook (whose only
 * real purpose beyond running the analysis is choosing whether to show it here), and the publish
 * switch itself. This used to live inside Settings, where it was easily most of the page on its
 * own; it's a big enough, distinct enough feature (it's the estate's actual public website) to
 * have its own place in the sidebar instead of crowding Settings out. */
export default function EstatePublicSitePage() {
  const { estateId } = useParams();
  const paymentPlanStageIdRef = useRef(0);
  const [estateName, setEstateName] = useState("");
  const [loading, setLoading] = useState(true);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [publicDescription, setPublicDescription] = useState("");
  const [publicTagline, setPublicTagline] = useState("");
  const [publicPhone, setPublicPhone] = useState("");
  const [publicWhatsapp, setPublicWhatsapp] = useState("");
  const [meetLat, setMeetLat] = useState("");
  const [meetLng, setMeetLng] = useState("");
  const [meetLabel, setMeetLabel] = useState("");
  const [meetNote, setMeetNote] = useState("");
  const [meetLocating, setMeetLocating] = useState(false);
  const [publicLogoPath, setPublicLogoPath] = useState<string | null>(null);
  const [publicLogoFile, setPublicLogoFile] = useState<File | null>(null);
  const [publicCoverPath, setPublicCoverPath] = useState<string | null>(null);
  const [publicCoverFile, setPublicCoverFile] = useState<File | null>(null);
  const [publicCoverPreview, setPublicCoverPreview] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [publicShowPrices, setPublicShowPrices] = useState(true);
  const [paymentPlan, setPaymentPlan] = useState<Array<{ id: string; label: string; percentage: string }>>([]);
  const [publicCanPublish, setPublicCanPublish] = useState(false);
  const [publicUrlPath, setPublicUrlPath] = useState<string | null>(null);
  const [developmentForecast, setDevelopmentForecast] = useState<any>(null);
  const [forecastBusy, setForecastBusy] = useState(false);
  const [forecastProgress, setForecastProgress] = useState<{ stage?: string; progress_pct?: number }>({});
  const [forecastUpgrade, setForecastUpgrade] = useState(false);

  const load = () => {
    if (!estateId) return;
    setLoading(true);
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data?.name || "")).catch(() => setEstateName(""));
    api.get(`/estates/${estateId}/development-forecast`).then((response) => {
      setDevelopmentForecast(response.data.forecast || null);
      setForecastUpgrade(false);
    }).catch((error: any) => {
      setDevelopmentForecast(null);
      setForecastUpgrade(error?.response?.status === 402);
    });
    api.get(`/estates/${estateId}/public-settings`).then((response) => {
      const publicPage = response.data;
      setPublicEnabled(Boolean(publicPage.public_enabled));
      setPublicDescription(publicPage.public_description || "");
      setPublicTagline(publicPage.public_tagline || "");
      setPublicPhone(publicPage.public_contact_phone || "");
      setPublicWhatsapp(publicPage.public_whatsapp_number || "");
      const meeting = publicPage.public_meeting_point;
      setMeetLat(meeting ? String(meeting.lat) : "");
      setMeetLng(meeting ? String(meeting.lng) : "");
      setMeetLabel(meeting?.label || "");
      setMeetNote(meeting?.note || "");
      setPublicLogoPath(publicPage.public_logo_path || null);
      setPublicCoverPath(publicPage.public_cover_path || null);
      setPublicShowPrices(publicPage.public_show_prices !== false);
      setPaymentPlan((publicPage.payment_plan || []).map((item: { label?: string; percentage?: string | number }) => ({
        id: `payment-stage-${paymentPlanStageIdRef.current++}`,
        label: item.label || "",
        percentage: String(item.percentage ?? ""),
      })));
      setPublicCanPublish(Boolean(publicPage.can_publish));
      setPublicUrlPath(publicPage.public_url_path || null);
    }).catch(() => { /* optional until its migration is deployed */ }).finally(() => setLoading(false));
  };
  useEffect(load, [estateId]);

  const savePublicPage = async () => {
    const cleanedPaymentPlan = paymentPlan.map((item) => ({ label: item.label.trim(), percentage: Number(item.percentage) }));
    if (cleanedPaymentPlan.some((item) => !item.label || !Number.isFinite(item.percentage) || item.percentage <= 0) || (cleanedPaymentPlan.length > 0 && cleanedPaymentPlan.reduce((total, item) => total + item.percentage, 0) !== 100)) {
      toast.error("Payment plan percentages must add up to 100%.");
      return;
    }
    const hasMeeting = meetLat.trim() !== "" || meetLng.trim() !== "";
    const lat = Number(meetLat);
    const lng = Number(meetLng);
    if (hasMeeting && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
      toast.error("Enter the meeting point as valid latitude and longitude, or clear both boxes.");
      return;
    }
    try {
      const response = await api.patch(`/estates/${estateId}/public-settings`, {
        public_whatsapp_number: publicWhatsapp.trim() || null,
        public_meeting_point: hasMeeting ? { lat, lng, label: meetLabel.trim() || null, note: meetNote.trim() || null } : null,
        public_enabled: publicEnabled,
        public_description: publicDescription.trim() || null,
        public_tagline: publicTagline.trim() || null,
        public_contact_phone: publicPhone.trim() || null,
        public_show_prices: publicShowPrices,
        payment_plan: cleanedPaymentPlan.length ? cleanedPaymentPlan : null,
      });
      setPublicUrlPath(response.data.public_url_path || null);
      if (publicLogoFile) {
        const formData = new FormData();
        formData.append("file", publicLogoFile);
        const logoResponse = await api.post(`/estates/${estateId}/public-logo`, formData);
        setPublicLogoPath(logoResponse.data.logo_path || null);
        setPublicLogoFile(null);
      }
      if (publicCoverFile) {
        const formData = new FormData();
        formData.append("file", publicCoverFile);
        const coverResponse = await api.post(`/estates/${estateId}/public-cover`, formData);
        setPublicCoverPath(coverResponse.data.cover_path || null);
        setPublicCoverFile(null);
        setPublicCoverPreview(null);
      }
      toast.success(publicEnabled ? "Public Estate page published." : "Public Estate page saved.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The public Estate page could not be saved."));
    }
  };

  const runDevelopmentForecast = async () => {
    if (forecastBusy) return;
    setForecastBusy(true);
    setForecastProgress({ stage: "Queueing forecast...", progress_pct: 0 });
    try {
      const response = await api.post(`/estates/${estateId}/development-forecast/run`);
      const jobId = response.data?.id;
      if (!jobId) throw new Error("The forecast job was not created.");
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const job = (await api.get(`/hazards/jobs/${jobId}`)).data;
        setForecastProgress({ stage: job.stage || "Analysing...", progress_pct: Number(job.progress_pct || 0) });
        if (job.status === "completed") {
          setDevelopmentForecast(job.result || null);
          toast.success("Development forecast is ready for review.");
          return;
        }
        if (job.status === "failed") throw new Error(job.error_text || "The development forecast failed.");
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      throw new Error("The forecast is taking longer than expected. Refresh this page to check its status.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Development forecast could not be completed."));
    } finally {
      setForecastBusy(false);
      setForecastProgress({});
    }
  };

  const setForecastVisibility = async (publicVisible: boolean) => {
    try {
      const response = await api.patch(`/estates/${estateId}/development-forecast/public`, { public_enabled: publicVisible });
      setDevelopmentForecast(response.data.forecast || null);
      toast.success(publicVisible ? "Development outlook added to the public page." : "Development outlook hidden from the public page.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Forecast visibility could not be updated."));
    }
  };

  const chooseCoverFile = (file: File | null) => {
    setPublicCoverFile(file);
    setPublicCoverPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const useDefaultCover = async () => {
    if (!window.confirm("Switch the public page back to the default cover photo?")) return;
    setCoverBusy(true);
    try {
      await api.delete(`/estates/${estateId}/public-cover`);
      setPublicCoverPath(null);
      chooseCoverFile(null);
      toast.success("Back to the default cover photo.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not switch back to the default cover photo."));
    } finally {
      setCoverBusy(false);
    }
  };

  const useMyLocationForMeetingPoint = () => {
    if (!navigator.geolocation) { toast.error("This device cannot share its location."); return; }
    setMeetLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setMeetLat(position.coords.latitude.toFixed(6)); setMeetLng(position.coords.longitude.toFixed(6)); setMeetLocating(false); },
      () => { toast.error("Your location could not be read. Allow location access, or type the coordinates."); setMeetLocating(false); },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  };

  const updatePaymentPlan = (index: number, field: "label" | "percentage", value: string) => {
    setPaymentPlan((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  const addPaymentPlanStage = () => {
    const stage = { id: `payment-stage-${paymentPlanStageIdRef.current++}`, label: "", percentage: "" };
    setPaymentPlan((current) => [...current, stage]);
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="public_site">
      <div className="edash-page-head">
        <div>
          <span className="edash-section-kicker">Public website</span>
          <h1>Public website</h1>
          <p>The live map, branding, contact details, payment plan and development outlook buyers see when they open this Estate's public page.</p>
        </div>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <div><h3 className="edash-card-title">Public Estate page</h3><p className="edash-status-row-desc" style={{ marginTop: 4 }}>Share a live map of your approved plots so buyers can view availability and request a reservation.</p></div>
            {publicUrlPath && publicEnabled && <a className="edash-card-link" href={publicUrlPath} target="_blank" rel="noreferrer">Open public page</a>}
          </div>
          {loading ? <p className="edash-field-note">Loading...</p> : <>
            <label className="edash-toggle" style={{ marginBottom: 12 }}><input type="checkbox" checked={publicEnabled} onChange={(event) => setPublicEnabled(event.target.checked)} /> Publish this Estate page</label>
            {!publicCanPublish && <p className="edash-field-note" style={{ marginBottom: 12 }}>Approve at least one plot on the Estate map before publishing.</p>}
            <div className="edash-public-settings-grid">
              <div className="edash-field"><span>Page address</span><strong style={{ color: "var(--edash-ink)" }}>{publicUrlPath || "Created automatically when you publish"}</strong></div>
              <label className="edash-field"><span>Contact phone</span><input value={publicPhone} onChange={(event) => setPublicPhone(event.target.value)} placeholder="Phone for enquiries" /></label>
            </div>
            <div className="edash-public-settings-grid" style={{ marginTop: 10 }}>
              <label className="edash-field"><span>WhatsApp number</span><input value={publicWhatsapp} onChange={(event) => setPublicWhatsapp(event.target.value)} placeholder="Defaults to the contact phone" /></label>
              <div className="edash-field"><span>Where buyers chat</span><strong style={{ color: "var(--edash-ink)", fontWeight: 600, fontSize: ".78rem" }}>Buyers get a "Chat on WhatsApp" button on every plot, with the plot and estate already typed in. Agents' own links use the agent's number.</strong></div>
            </div>
            <div className="edash-public-settings-grid" style={{ marginTop: 10 }}>
              <label className="edash-field"><span>Trust line</span><input value={publicTagline} onChange={(event) => setPublicTagline(event.target.value)} placeholder="Verified land | C of O documentation available" /></label>
              <label className="edash-field"><span>Company logo</span><input type="file" accept="image/png,image/jpeg" onChange={(event) => setPublicLogoFile(event.target.files?.[0] || null)} /></label>
            </div>
            {publicLogoPath && <p className="edash-field-note" style={{ margin: "8px 0" }}>Company logo uploaded and visible on the public page.</p>}
            <div className="edash-public-payment-plan" style={{ margin: "10px 0" }}>
              <div className="edash-card-head" style={{ marginBottom: 5 }}><div><h4 className="edash-card-title" style={{ fontSize: "1rem" }}>Cover photo</h4><p className="edash-field-note">The large background photo at the top of the public page. Leave it as the default, or upload your own - a wide, landscape photo works best (at least 1600px wide).</p></div></div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <div className="edash-public-cover-preview" style={{ backgroundImage: `url("${publicCoverPreview || (publicCoverPath ? `${API_URL}${publicCoverPath}` : "/realestate_public.jpg")}")` }}>
                  {!publicCoverPath && !publicCoverPreview && <span>Default photo</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input type="file" accept="image/png,image/jpeg" onChange={(event) => chooseCoverFile(event.target.files?.[0] || null)} />
                  {(publicCoverPath || publicCoverFile) && <button type="button" className="edash-btn-outline" disabled={coverBusy} onClick={() => void (publicCoverFile ? chooseCoverFile(null) : useDefaultCover())}>{publicCoverFile ? "Cancel" : coverBusy ? "Switching..." : "Use default photo instead"}</button>}
                </div>
              </div>
              {publicCoverFile && <p className="edash-field-note" style={{ marginTop: 8 }}>Saved when you click "Save and publish page" below.</p>}
            </div>
            <label className="edash-field" style={{ margin: "10px 0" }}><span>About this Estate</span><textarea rows={3} value={publicDescription} onChange={(event) => setPublicDescription(event.target.value)} placeholder="Tell buyers what makes this Estate worth considering" /></label>
            <div className="edash-public-payment-plan" style={{ marginBottom: 14 }}>
              <div className="edash-card-head" style={{ marginBottom: 5 }}><div><h4 className="edash-card-title" style={{ fontSize: "1rem" }}>Site inspection meeting point</h4><p className="edash-field-note">Where visitors meet you on inspection day. It appears on the public page and in booking emails with a directions link, and it replaces the paid inspection guide.</p></div></div>
              <div className="edash-public-settings-grid">
                <label className="edash-field"><span>Latitude</span><input value={meetLat} onChange={(event) => setMeetLat(event.target.value)} placeholder="e.g. 7.377600" inputMode="decimal" /></label>
                <label className="edash-field"><span>Longitude</span><input value={meetLng} onChange={(event) => setMeetLng(event.target.value)} placeholder="e.g. 3.947000" inputMode="decimal" /></label>
              </div>
              <div className="edash-public-settings-grid" style={{ marginTop: 10 }}>
                <label className="edash-field"><span>Landmark</span><input value={meetLabel} onChange={(event) => setMeetLabel(event.target.value)} placeholder="e.g. Estate gate beside Total filling station" maxLength={160} /></label>
                <label className="edash-field"><span>Directions note</span><input value={meetNote} onChange={(event) => setMeetNote(event.target.value)} placeholder="e.g. Ask for the LandCheck inspection desk" maxLength={300} /></label>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="edash-btn-outline" disabled={meetLocating} onClick={useMyLocationForMeetingPoint}>{meetLocating ? "Locating..." : "Use my current location"}</button>
                {(meetLat || meetLng) && <button type="button" className="edash-btn-outline" onClick={() => { setMeetLat(""); setMeetLng(""); setMeetLabel(""); setMeetNote(""); }}>Clear</button>}
              </div>
              <p className="edash-field-note" style={{ marginTop: 8 }}>Stand at the meeting point and tap "Use my current location" for the most accurate pin.</p>
            </div>
            <label className="edash-toggle" style={{ marginBottom: 14 }}><input type="checkbox" checked={publicShowPrices} onChange={(event) => setPublicShowPrices(event.target.checked)} /> Show plot prices publicly</label>
            <div className="edash-public-payment-plan">
              <div className="edash-card-head" style={{ marginBottom: 5 }}><div><h4 className="edash-card-title" style={{ fontSize: "1rem" }}>Payment plan for buyers</h4><p className="edash-field-note">Optional. Show buyers how the agreed price can be paid in stages.</p></div><button type="button" className="edash-tool-btn" onClick={addPaymentPlanStage}>+ Add stage</button></div>
              {paymentPlan.map((item, index) => <div className="edash-public-payment-plan-row" key={item.id}><input aria-label={`Payment stage ${index + 1} name`} value={item.label} onChange={(event) => updatePaymentPlan(index, "label", event.target.value)} placeholder={index === 0 ? "Initial payment" : "Next payment"} /><input aria-label={`Payment stage ${index + 1} percentage`} type="number" min="1" max="100" step="1" value={item.percentage} onChange={(event) => updatePaymentPlan(index, "percentage", event.target.value)} placeholder="%" /><button type="button" className="edash-tool-btn" onClick={() => setPaymentPlan((current) => current.filter((stage) => stage.id !== item.id))}>Remove</button></div>)}
              {paymentPlan.length > 0 && <p className="edash-field-note" style={{ color: paymentPlan.reduce((total, item) => total + (Number(item.percentage) || 0), 0) === 100 ? "var(--edash-brand)" : "var(--edash-danger)" }}>Total: {paymentPlan.reduce((total, item) => total + (Number(item.percentage) || 0), 0)}%</p>}
            </div>
            <button type="button" className="edash-btn-primary" disabled={publicEnabled && !publicCanPublish} onClick={() => void savePublicPage()}>Save and publish page</button>
          </>}
        </div>
      </div>

      <div className="edash-card" style={{ marginTop: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <div><h3 className="edash-card-title">Development outlook</h3><p className="edash-status-row-desc" style={{ marginTop: 4 }}>Use LandCheck flood, erosion and annual land-cover evidence to create a transparent growth scenario for buyers - then choose whether to show it on this public page.</p></div>
            {forecastUpgrade ? <span className="edash-status-pill tone-neutral">Plus plan</span> : <button type="button" className="edash-btn-primary" disabled={forecastBusy} onClick={() => void runDevelopmentForecast()}>{forecastBusy ? "Analysing..." : developmentForecast ? "Run again" : "Run forecast"}</button>}
          </div>
          {forecastUpgrade ? (
            <div style={{ marginTop: 16, padding: "22px 20px", border: "1px solid #c8e5d4", borderRadius: 14, background: "linear-gradient(135deg, #f0fbf4, #f8fcf9)" }}>
              <strong style={{ display: "block", marginBottom: 6, color: "var(--edash-ink)" }}>Development outlook is a Plus plan feature</strong>
              <p className="edash-status-row-desc" style={{ maxWidth: 620, margin: "0 0 14px" }}>
                Upgrade to Plus to run flood, erosion and land-cover growth analysis for this Estate and share the result on your public page.
              </p>
              <Link className="edash-btn-primary" style={{ display: "inline-flex" }} to="/estates/billing">Upgrade to Plus</Link>
            </div>
          ) : <>
            {forecastBusy && <div style={{ margin: "12px 0", padding: 12, borderRadius: 10, background: "var(--edash-surface-muted, #f4f7f5)" }}><strong>{forecastProgress.stage || "Analysing..."}</strong><div style={{ height: 7, marginTop: 8, overflow: "hidden", borderRadius: 99, background: "#dce7e0" }}><div style={{ width: `${Math.max(4, Math.min(100, forecastProgress.progress_pct || 0))}%`, height: "100%", background: "var(--edash-brand)", transition: "width .3s ease" }} /></div></div>}
            {!forecastBusy && !developmentForecast && <p className="edash-field-note" style={{ marginTop: 12 }}>Run it after confirming the Estate boundary. The result will remain private until you publish it.</p>}
            {developmentForecast && developmentForecast.data_available && <>
              <div className="edash-public-settings-grid" style={{ marginTop: 14 }}>
                <div className="edash-field"><span>Growth direction</span><strong style={{ color: "var(--edash-ink)" }}>{developmentForecast.growth?.direction || "No clear direction"}</strong></div>
                <div className="edash-field"><span>Observed annual change</span><strong style={{ color: "var(--edash-ink)" }}>{developmentForecast.growth?.annual_area_rate_ha ?? 0} ha/year</strong></div>
                <div className="edash-field"><span>Nearest built-up frontier</span><strong style={{ color: "var(--edash-ink)" }}>{developmentForecast.growth?.frontier_distance_m == null ? "Not available" : `${Math.round(developmentForecast.growth.frontier_distance_m)} m`}</strong></div>
                <div className="edash-field"><span>Confidence</span><strong style={{ color: "var(--edash-ink)" }}>{developmentForecast.confidence?.level || "Low"}</strong></div>
              </div>
              <p className="edash-status-row-desc" style={{ margin: "14px 0 8px" }}>{developmentForecast.reach_estimate?.headline || "No responsible reach estimate is available from the observed record."}</p>
              <div className="edash-chip-row" style={{ marginBottom: 10 }}>{(developmentForecast.projections || []).map((row: any) => <span key={row.horizon_years} className="edash-chip">{row.horizon_years} years: {row.conservative_area_ha}-{row.accelerated_area_ha} ha</span>)}</div>
              <p className="edash-field-note">This is a location-screening scenario based on rigorous analysis from multiple reliable data sources.</p>
              <label className="edash-toggle" style={{ marginTop: 12 }}><input type="checkbox" checked={Boolean(developmentForecast.published)} onChange={(event) => void setForecastVisibility(event.target.checked)} /> Show this outlook on the public Estate page</label>
            </>}
            {developmentForecast && !developmentForecast.data_available && <p className="edash-field-note" style={{ marginTop: 12 }}>{developmentForecast.message || "Not enough historical coverage is available for a responsible projection."}</p>}
          </>}
        </div>
      </div>
    </EstateShell>
  );
}
