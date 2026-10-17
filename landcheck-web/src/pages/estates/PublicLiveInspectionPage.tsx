import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import { api, extractApiErrorMessage } from "../../api/client";
import { formatDistance } from "../../utils/geoGuide";
import "../../styles/estate-public.css";

type Verification = "on_plot" | "on_estate" | "near_estate" | "outside" | null;
type Session = {
  id: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  estate_name: string;
  plot_number: string;
  buyer_name: string;
  live: { verification: Verification; distance_m: number | null; updated_at: string | null } | null;
  room_url?: string | null;
};

const VERIFICATION_TEXT: Record<Exclude<Verification, null>, string> = {
  on_plot: "Your agent is standing on the plot",
  on_estate: "Your agent is on the estate, near the plot",
  near_estate: "Your agent is close to the estate",
  outside: "Your agent is away from the plot right now",
};

// Buyer-facing live view: polls for session status (scheduled -> live -> ended) the same way
// the estate dashboard already polls hazard/soil analysis jobs - no WebSocket in this codebase,
// and a position update every few seconds is normal for this kind of indicator.
export default function PublicLiveInspectionPage() {
  const { token } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [videoError, setVideoError] = useState("");
  const videoRef = useRef<HTMLDivElement | null>(null);
  const callRef = useRef<DailyCall | null>(null);
  const joinedRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    const load = () => {
      api.get<Session>(`/estates/public/live-inspections/${token}`).then((response) => {
        if (!cancelled) setSession(response.data);
      }).catch(async (requestError) => {
        if (!cancelled) setError(await extractApiErrorMessage(requestError, "This live inspection link is not valid."));
      });
    };
    load();
    const interval = window.setInterval(load, session?.status === "live" ? 3000 : 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session?.status]);

  useEffect(() => {
    if (session?.status !== "live" || !session.room_url || !videoRef.current) return undefined;
    if (joinedRoomRef.current === session.room_url) return undefined;
    setVideoError("");
    const frame = DailyIframe.createFrame(videoRef.current, {
      showLeaveButton: false,
      iframeStyle: { width: "100%", height: "100%", border: "0" },
    });
    callRef.current = frame;
    joinedRoomRef.current = session.room_url;
    frame.on("error", (event: any) => setVideoError(event?.errorMsg || "The video call hit a connection problem."));
    frame.on("camera-error", () => setVideoError("Could not access your camera/microphone. Check this site's camera and microphone permission in your browser settings."));
    frame.join({ url: session.room_url }).catch((joinError: any) => setVideoError(joinError?.errorMsg || "Could not join the video call."));
    return () => {
      frame.destroy();
      callRef.current = null;
      joinedRoomRef.current = null;
    };
  }, [session?.status, session?.room_url]);

  if (error && !session) return <main className="estate-public-app"><div className="estate-public-message"><h1>Live inspection unavailable</h1><p>{error}</p></div></main>;
  if (!session) return <main className="estate-public-app"><div className="estate-public-loading">Loading your live inspection...</div></main>;

  const live = session.live;
  const isInside = live?.verification === "on_plot" || live?.verification === "on_estate";

  return (
    <main className="estate-public-app">
      <div className="estate-public-inspect-page">
        <p className="estate-public-kicker">Live site inspection</p>
        <h1>Plot {session.plot_number}, {session.estate_name}</h1>

        {session.status === "scheduled" && (
          <p className="estate-public-guide-note">
            Hello {session.buyer_name}, your agent hasn't started the walkthrough yet. This page updates automatically -
            keep it open and the video will appear here the moment they go live.
          </p>
        )}

        {session.status === "live" && (
          <>
            <div className="estate-public-live-video" ref={videoRef} />
            {videoError && <p className="estate-public-guide-error">{videoError}</p>}
            {live && (
              <div className={`estate-public-guide-live${isInside ? " is-inside" : ""}`}>
                {isInside ? <span className="estate-public-guide-check">&#10003;</span> : null}
                <div>
                  <strong>{live.verification ? VERIFICATION_TEXT[live.verification] : "Waiting for a GPS signal..."}</strong>
                  {live.distance_m != null && live.verification !== "on_plot" && (
                    <span>{formatDistance(live.distance_m)} from the plot boundary</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {session.status === "ended" && (
          <p className="estate-public-guide-note">This live inspection has ended. Thank you for joining - reach out to your agent with any questions.</p>
        )}

        {session.status === "cancelled" && (
          <p className="estate-public-guide-error">This live inspection was cancelled.</p>
        )}

        {error && <p className="estate-public-guide-error">{error}</p>}
      </div>
    </main>
  );
}
