import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import { api, extractApiErrorMessage } from "../../../api/client";
import EstateIcon from "../EstateIcon";

type Session = {
  id: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  estate_name: string;
  plot_number: string;
  buyer_name: string;
  live: { verification: string | null; distance_m: number | null; updated_at: string | null } | null;
  room_url?: string | null;
  directions_url?: string | null;
};

const VERIFICATION_LABEL: Record<string, string> = {
  on_plot: "You are on the plot",
  on_estate: "You are on the estate, near the plot",
  near_estate: "You are close to the estate",
  outside: "You are away from the plot",
};

// The agent's side of a live inspection: go live on a scheduled session (camera/mic + a
// continuous GPS watch, same navigator.geolocation.watchPosition options already used by
// PublicPlotGuide.tsx for the buyer's own in-person guide), post a location ping every ~3s
// so the buyer's page can show live proof the agent is really standing on the plot.
export default function AgentLiveInspectionsSection({ token, onCount }: { token: string; onCount?: (count: number) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<{ verification: string | null; distance_m: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [videoJoined, setVideoJoined] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "watching" | "error">("idle");
  const videoRef = useRef<HTMLDivElement | null>(null);
  const callRef = useRef<DailyCall | null>(null);
  const joinedRoomRef = useRef<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);

  const load = () => {
    api.get<Session[]>(`/estates/agent-portal/${token}/live-inspections`).then((response) => {
      setSessions(response.data);
      onCount?.(response.data.filter((item) => item.status === "live").length);
    }).catch(() => setSessions([]));
  };
  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const stopTracking = () => {
    if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
    pingTimerRef.current = null;
    callRef.current?.destroy();
    callRef.current = null;
    joinedRoomRef.current = null;
    setLiveStatus(null);
    setVideoError("");
    setVideoJoined(false);
    setGpsStatus("idle");
  };

  useEffect(() => () => stopTracking(), []);

  const activeSession = sessions.find((item) => item.id === activeId) || null;

  // Creating the Daily call frame has to happen in an effect, not inline in goLive() - the
  // video container only exists in the DOM once `active` is truthy, and `active` depends on the
  // activeId state set by goLive() itself, so videoRef.current was always still null when goLive
  // checked it synchronously (React hadn't re-rendered yet). That silently skipped frame
  // creation every time - no error, just a permanently blank box.
  useEffect(() => {
    if (!activeSession?.room_url || !videoRef.current) return undefined;
    if (joinedRoomRef.current === activeSession.room_url) return undefined;
    setVideoError("");
    setVideoJoined(false);
    const frame = DailyIframe.createFrame(videoRef.current, { showLeaveButton: false, iframeStyle: { width: "100%", height: "100%", border: "0" } });
    callRef.current = frame;
    joinedRoomRef.current = activeSession.room_url;
    frame.on("joined-meeting", () => setVideoJoined(true));
    frame.on("error", (event: any) => setVideoError(event?.errorMsg || "The video call hit a connection problem."));
    frame.on("camera-error", () => setVideoError("Could not access your camera/microphone. Check this site's camera and microphone permission in your browser settings."));
    frame.join({ url: activeSession.room_url }).catch((error: any) => setVideoError(error?.errorMsg || "Could not join the video call."));
    return () => {
      frame.destroy();
      callRef.current = null;
      joinedRoomRef.current = null;
    };
  }, [activeSession?.room_url]);

  const goLive = async (session: Session) => {
    setBusy(true);
    try {
      const response = await api.post<Session>(`/estates/agent-portal/${token}/live-inspections/${session.id}/start`);
      setActiveId(session.id);
      setSessions((current) => current.map((item) => (item.id === session.id ? response.data : item)));
      if (!navigator.geolocation) {
        setGpsStatus("error");
        toast.error("This device cannot share its location - the buyer won't see live GPS verification.");
        return;
      }
      setGpsStatus("watching");
      let lastSentAt = 0;
      watchRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now();
          if (now - lastSentAt < 2500) return;
          lastSentAt = now;
          void api.post(`/estates/agent-portal/${token}/live-inspections/${session.id}/location`, {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy_m: position.coords.accuracy,
          }).then((locationResponse) => setLiveStatus(locationResponse.data)).catch(() => undefined);
        },
        (geoError) => {
          setGpsStatus("error");
          toast.error(geoError?.code === 1 ? "Location permission was denied for this site - allow it in your browser settings." : "Could not read your location. Check location permission for this site.");
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
      );
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not start the live inspection."));
    } finally {
      setBusy(false);
    }
  };

  const endLive = async (sessionId: string) => {
    setBusy(true);
    try {
      await api.post(`/estates/agent-portal/${token}/live-inspections/${sessionId}/end`);
      stopTracking();
      setActiveId(null);
      load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not end the live inspection."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="inspections" className="agent-public-card">
      <div className="agent-public-card-head">
        <div>
          <h2>Live inspections</h2>
          <p>Go live from the plot so a remote buyer can watch - and see your GPS position verified against the plot's real boundary - in real time.</p>
        </div>
        <EstateIcon name="video" />
      </div>

      {activeSession && (
        <div style={{ marginBottom: 16 }}>
          {!videoJoined && !videoError && (
            <p className="agent-public-empty" style={{ marginBottom: 8 }}>Connecting video...</p>
          )}
          <div className="agent-public-live-video" ref={videoRef} />
          {videoError && (
            <p className="agent-public-empty" style={{ textAlign: "left", marginTop: 8, borderColor: "#f3c6c6", color: "#b3302c" }}>{videoError}</p>
          )}
          <p className="agent-public-empty" style={{ textAlign: "left", marginTop: 8 }}>
            {liveStatus
              ? `${liveStatus.verification ? VERIFICATION_LABEL[liveStatus.verification] || liveStatus.verification : "Finding your GPS signal..."}${liveStatus.distance_m != null && liveStatus.verification !== "on_plot" ? ` - ${Math.round(liveStatus.distance_m)} m from the boundary` : ""}`
              : gpsStatus === "watching" ? "Waiting for your first GPS fix..." : gpsStatus === "error" ? "Location isn't available - the buyer won't see GPS verification." : "Starting location tracking..."}
          </p>
          {activeSession.directions_url && (
            <a className="agent-public-directions-cta agent-public-live-cta" style={{ marginTop: 10 }} href={activeSession.directions_url} target="_blank" rel="noreferrer">
              <EstateIcon name="navigation" /> Directions to the plot
            </a>
          )}
          <button type="button" className="agent-public-primary agent-public-live-cta" style={{ marginTop: 10 }} disabled={busy} onClick={() => void endLive(activeSession.id)}>
            {busy ? "Ending..." : "End live inspection"}
          </button>
        </div>
      )}

      {sessions.filter((item) => item.status === "scheduled" || item.id === activeId).length ? (
        <div className="agent-public-list">
          {sessions.filter((item) => item.status === "scheduled" || item.id === activeId).map((session) => (
            <div className="agent-public-row" key={session.id}>
              <div>
                <strong>Plot {session.plot_number}</strong>
                <small>{session.buyer_name} - {session.estate_name}</small>
              </div>
              {session.status === "scheduled" ? (
                <div className="agent-public-row-actions">
                  {session.directions_url && (
                    <a href={session.directions_url} target="_blank" rel="noreferrer" title="Directions to the plot"><EstateIcon name="navigation" /></a>
                  )}
                  <button type="button" className="agent-public-primary" style={{ minHeight: 44, fontSize: ".78rem" }} disabled={busy || Boolean(activeId)} onClick={() => void goLive(session)}>
                    Go live
                  </button>
                </div>
              ) : (
                <b>Live now</b>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="agent-public-empty">No live inspections scheduled for you yet.</div>
      )}
    </section>
  );
}
