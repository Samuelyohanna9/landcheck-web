import { useEffect, useMemo, useRef, useState } from "react";
import { bearing, beaconLabel, cardinal, centroid, distanceToRing, formatDistance, haversine, pointInRing, polygonRing, type LngLat } from "../../../utils/geoGuide";
import { copyText, mapsDirectionsHref, wazeHref } from "../../../utils/estateMarketing";

export type GuidePosition = { lat: number; lng: number; accuracy: number };
type MeetingPoint = { lat: number; lng: number; label?: string | null; note?: string | null } | null;

export default function PublicPlotGuide({
  plotNumber, geometry, meetingPoint, onPosition, onEvent,
}: {
  plotNumber: string;
  geometry: any;
  meetingPoint: MeetingPoint;
  onPosition: (position: GuidePosition | null) => void;
  onEvent: (type: "directions_click" | "guide_open") => void;
}) {
  const ring = useMemo(() => polygonRing(geometry), [geometry]);
  const center = useMemo<LngLat | null>(() => (ring.length ? centroid(ring) : null), [ring]);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState<GuidePosition | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const watchRef = useRef<number | null>(null);

  const stop = () => {
    if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setActive(false);
    setPosition(null);
    setHeading(null);
    onPosition(null);
  };

  useEffect(() => () => { if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current); onPosition(null); }, [plotNumber]);

  useEffect(() => {
    if (!active) return undefined;
    const handler = (event: any) => {
      let value: number | null = null;
      if (typeof event.webkitCompassHeading === "number") value = event.webkitCompassHeading;
      else if (event.absolute && typeof event.alpha === "number") value = (360 - event.alpha) % 360;
      if (value !== null) setHeading(value);
    };
    window.addEventListener("deviceorientationabsolute", handler as any, true);
    window.addEventListener("deviceorientation", handler as any, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler as any, true);
      window.removeEventListener("deviceorientation", handler as any, true);
    };
  }, [active]);

  const start = async () => {
    if (!navigator.geolocation) { setError("This device cannot share its location."); return; }
    setError("");
    onEvent("guide_open");
    try {
      const orientation: any = (window as any).DeviceOrientationEvent;
      if (orientation && typeof orientation.requestPermission === "function") await orientation.requestPermission();
    } catch { /* compass is optional */ }
    setActive(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (result) => {
        const next = { lat: result.coords.latitude, lng: result.coords.longitude, accuracy: result.coords.accuracy };
        setPosition(next);
        onPosition(next);
      },
      (failure) => {
        setError(failure.code === 1 ? "Location permission was denied. Allow it in your browser settings to use the on-site guide." : "Your location could not be read. Move to an open area and try again.");
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  };

  if (!ring.length || !center) return null;

  const destination = meetingPoint ? { lat: meetingPoint.lat, lng: meetingPoint.lng, label: meetingPoint.label || "the meeting point" } : { lat: center[1], lng: center[0], label: `Plot ${plotNumber}` };
  const here: LngLat | null = position ? [position.lng, position.lat] : null;
  const inside = here ? pointInRing(here, ring) : false;
  const edgeDistance = here ? (inside ? 0 : distanceToRing(here, ring)) : null;
  const beacons = ring.map((point, index) => ({ label: beaconLabel(index), point, distance: here ? haversine(here, point) : null }));
  const nearest = here ? beacons.reduce((best, item) => (best === null || (item.distance ?? Infinity) < (best.distance ?? Infinity) ? item : best), null as null | (typeof beacons)[number]) : null;
  const toCenter = here ? bearing(here, center) : null;
  const arrowRotation = toCenter === null ? 0 : (toCenter - (heading ?? 0) + 360) % 360;
  const tolerance = Math.max(10, Math.min(position?.accuracy || 0, 40));

  const copyBeacons = async () => {
    const text = beacons.map((item) => `Plot ${plotNumber} beacon ${item.label}: ${item.point[1].toFixed(6)}, ${item.point[0].toFixed(6)}`).join("\n");
    if (await copyText(text)) { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className="estate-public-guide">
      <div className="estate-public-guide-head">
        <div><p className="estate-public-kicker">On site</p><h3>Find Plot {plotNumber} on the ground</h3></div>
      </div>
      <div className="estate-public-guide-actions">
        <a className="estate-public-ghost" href={mapsDirectionsHref(destination.lat, destination.lng)} target="_blank" rel="noreferrer" onClick={() => onEvent("directions_click")}>Directions to {destination.label}</a>
        <a className="estate-public-ghost" href={wazeHref(destination.lat, destination.lng)} target="_blank" rel="noreferrer" onClick={() => onEvent("directions_click")}>Open in Waze</a>
        {!active ? <button type="button" className="estate-public-primary" onClick={() => void start()}>I am at the estate - guide me</button> : <button type="button" className="estate-public-ghost" onClick={stop}>Stop guiding</button>}
      </div>
      {error && <p className="estate-public-guide-error">{error}</p>}
      {active && !position && !error && <p className="estate-public-guide-note">Finding your location...</p>}
      {active && position && here && nearest && toCenter !== null && edgeDistance !== null && (
        <div className={`estate-public-guide-live${inside ? " is-inside" : ""}`}>
          <div className="estate-public-guide-arrow" aria-hidden="true">
            {inside ? <span className="estate-public-guide-check">&#10003;</span> : <svg viewBox="0 0 24 24" style={{ transform: `rotate(${arrowRotation}deg)` }}><path d="M12 3 5 20l7-4 7 4-7-17Z" fill="currentColor" /></svg>}
          </div>
          <div>
            {inside
              ? <><strong>You are standing on Plot {plotNumber}</strong><span>Your position is inside the plot boundary (GPS accuracy about {Math.round(position.accuracy)} m).</span></>
              : edgeDistance <= tolerance
                ? <><strong>You are at the edge of Plot {plotNumber}</strong><span>Within GPS accuracy of the boundary (about {Math.round(position.accuracy)} m).</span></>
                : <><strong>{formatDistance(edgeDistance)} to the plot boundary</strong><span>Head {cardinal(toCenter)}{heading === null ? "" : " (arrow follows your phone's compass)"}. Nearest beacon: {nearest.label}, {formatDistance(nearest.distance ?? 0)} away.</span></>}
          </div>
        </div>
      )}
      <details className="estate-public-guide-beacons" open={active}>
        <summary>Beacon coordinates ({beacons.length} corners)</summary>
        <div className="estate-public-guide-beacon-grid">
          {beacons.map((item) => (
            <div key={item.label} className={nearest?.label === item.label ? "is-nearest" : ""}>
              <b>{item.label}</b><span>{item.point[1].toFixed(6)}, {item.point[0].toFixed(6)}</span>{item.distance !== null && <em>{formatDistance(item.distance)} away</em>}
            </div>
          ))}
        </div>
        <button type="button" className="estate-public-ghost" onClick={() => void copyBeacons()}>{copied ? "Copied" : "Copy coordinates"}</button>
      </details>
      <p className="estate-public-guide-note">Phone GPS is usually accurate to 5-15 metres. Use this to find the right plot; boundaries and documents should always be confirmed with the estate team.</p>
    </div>
  );
}
