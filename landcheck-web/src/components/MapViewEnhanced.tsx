import { memo, useEffect, useRef, useCallback, useState } from "react";
import toast from "react-hot-toast";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "../styles/map-enhanced.css";
import { loadMapboxDraw, loadMapboxGl } from "../utils/mapboxLoader";
import { COUNTRY_MAP_VIEW, getCoordinateSystemCountry } from "../utils/coordinateConverter";

type Point = {
  station: string;
  lng: number;
  lat: number;
};

// A wrong (or wrongly-detected) coordinate system doesn't just distort a plot's shape - it can
// produce raw Easting/Northing-scale numbers that end up here still unconverted, and Mapbox's
// LngLat constructor throws on anything outside real degree range instead of just ignoring it,
// which crashes the whole map. This is the last line of defense against that: no point reaches a
// mapboxgl call (Marker, LngLatBounds, GeoJSON source) without passing this check first, no matter
// what upstream coordinate-system detection got wrong.
function isPlottableLngLat(lng: unknown, lat: unknown): boolean {
  const lngNum = Number(lng);
  const latNum = Number(lat);
  return (
    Number.isFinite(lngNum) &&
    Number.isFinite(latNum) &&
    lngNum >= -180 &&
    lngNum <= 180 &&
    latNum >= -90 &&
    latNum <= 90 &&
    !(lngNum === 0 && latNum === 0)
  );
}

type SpotHeightPoint = Point & {
  is_boundary?: boolean;
};

type Props = {
  coordinates: Point[];
  onCoordinatesDrawn?: (coords: Point[]) => void;
  disabled?: boolean;
  lightweight?: boolean;
  coordinateSystem?: string;
  // "boundary" (default) is today's exact behavior - the interactive draw polygon plus its
  // corner pins. "spot_heights" is a read-only view showing every uploaded point (boundary
  // corners and spot-height-only samples alike, since a boundary corner is also a spot height)
  // as unconnected markers, so a surveyor can see where their elevation samples actually sit
  // without that data being forced into (and distorting) the boundary ring.
  viewMode?: "boundary" | "spot_heights";
  spotHeightPoints?: SpotHeightPoint[];
};

// Nigeria spans UTM zones 31N-33N, split at fixed meridians - picking the wrong zone for a
// location is a real, easy-to-make mistake, so show the selected zone's boundary on the map as
// soon as it's chosen, before a single point is even entered. Only meaningful for a projected
// system (UTM or Minna Datum, which is UTM on a different reference ellipsoid/datum shift but the
// same zone boundaries) - WGS84 has no zone concept, so nothing is drawn for it.
const UTM_ZONE_BOUNDARIES: Record<string, { label: string; westLng: number; eastLng: number }> = {
  utm_31n: { label: "UTM Zone 31N", westLng: 0, eastLng: 6 },
  minna_31: { label: "Minna Datum Zone 31", westLng: 0, eastLng: 6 },
  utm_32n: { label: "UTM Zone 32N", westLng: 6, eastLng: 12 },
  minna_32: { label: "Minna Datum Zone 32", westLng: 6, eastLng: 12 },
  utm_33n: { label: "UTM Zone 33N", westLng: 12, eastLng: 18 },
  minna_33: { label: "Minna Datum Zone 33", westLng: 12, eastLng: 18 },
  ghana_utm_30n: { label: "Ghana UTM Zone 30N", westLng: -6, eastLng: 0 },
  uganda_utm_35n: { label: "Uganda UTM Zone 35N", westLng: 24, eastLng: 30 },
  uganda_arc1960_35n: { label: "Uganda Arc 1960 Zone 35N", westLng: 24, eastLng: 30 },
  uganda_utm_36n: { label: "Uganda UTM Zone 36N", westLng: 30, eastLng: 36 },
  uganda_arc1960_36n: { label: "Uganda Arc 1960 Zone 36N", westLng: 30, eastLng: 36 },
  uganda_utm_35s: { label: "Uganda UTM Zone 35S", westLng: 24, eastLng: 30 },
  uganda_arc1960_35s: { label: "Uganda Arc 1960 Zone 35S", westLng: 24, eastLng: 30 },
  uganda_utm_36s: { label: "Uganda UTM Zone 36S", westLng: 30, eastLng: 36 },
  uganda_arc1960_36s: { label: "Uganda Arc 1960 Zone 36S", westLng: 30, eastLng: 36 },
};
const ZONE_BOUNDARY_LAT_SPAN: [number, number] = [-2, 16]; // generous margin around Nigeria's real 4°N-14°N extent

const emptyZoneCollection = () => ({
  type: "FeatureCollection" as const,
  features: [] as any[],
});

const zoneBoundaryCollection = (system: string | undefined) => {
  const zone = system ? UTM_ZONE_BOUNDARIES[system] : undefined;
  if (!zone) return emptyZoneCollection();
  const [southLat, northLat] = ZONE_BOUNDARY_LAT_SPAN;
  const meridian = (lng: number) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: [[lng, southLat], [lng, northLat]] },
  });
  return {
    type: "FeatureCollection" as const,
    features: [meridian(zone.westLng), meridian(zone.eastLng)],
  };
};

const drawStyles = [
  {
    id: "gl-draw-polygon-fill-active",
    type: "fill",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#ef4444",
      "fill-opacity": 0.3,
    },
  },
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#ef4444",
      "fill-opacity": 0.2,
    },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: {
      "line-color": "#ef4444",
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"]],
    paint: {
      "line-color": "#dc2626",
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-line",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"]],
    paint: {
      "line-color": "#ef4444",
      "line-width": 3,
      "line-dasharray": [2, 2],
    },
  },
  {
    id: "gl-draw-point-active",
    type: "circle",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 8,
      "circle-color": "#ef4444",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  },
  {
    id: "gl-draw-point-inactive",
    type: "circle",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 6,
      "circle-color": "#dc2626",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  },
  {
    id: "gl-draw-polygon-midpoint",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fca5a5",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  },
];

function MapViewEnhanced({
  coordinates,
  onCoordinatesDrawn,
  disabled = false,
  lightweight = false,
  coordinateSystem,
  viewMode = "boundary",
  spotHeightPoints,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const drawRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const mapboxglRef = useRef<any>(null);
  const isDrawingRef = useRef(false);
  const activeZoneRef = useRef<{ label: string; westLng: number; eastLng: number } | undefined>(undefined);
  const lastCountryRef = useRef<string | null>(null);
  const viewModeRef = useRef<"boundary" | "spot_heights">(viewMode);
  const [zoneBadge, setZoneBadge] = useState<{ left: number; top: number; label: string } | null>(null);
  // Flips true once the map's "load" event has fired (sources/layers exist, mapRef.current is
  // set) - the country-recenter effect below depends on this so it can retry once the map
  // actually becomes ready, instead of silently giving up forever if a coordinate-system change
  // happens to land before the (asynchronously-loaded) map has finished initializing.
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Keeps the badge attached to whichever boundary meridian is actually on screen right now,
  // instead of sitting in a fixed corner unrelated to where the line is - recomputed on every
  // pan/zoom/resize (registered once below) plus whenever the selected zone itself changes.
  const updateZoneBadgePosition = useCallback(() => {
    const map = mapRef.current;
    const zone = activeZoneRef.current;
    if (!map || !zone || typeof map.getBounds !== "function") {
      setZoneBadge(null);
      return;
    }
    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const visibleLng = [zone.westLng, zone.eastLng].find((lng) => lng > west && lng < east);
    if (visibleLng === undefined) {
      setZoneBadge(null);
      return;
    }
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const point = map.project([visibleLng, south + (north - south) * 0.14]);
    setZoneBadge({ left: point.x, top: point.y, label: `${zone.label} boundary` });
  }, []);

  // Switches between the interactive boundary view (draw polygon + its corner pins) and the
  // read-only spot-heights view (every uploaded point as an unconnected dot) - toggled by the
  // Boundary/Spot Heights buttons in the parent panel, not by anything drawn here.
  const applySpotHeightVisibility = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const showSpotHeights = viewModeRef.current === "spot_heights";
    ["plot-fill", "plot-outline"].forEach((id) => {
      if (map.getLayer?.(id)) {
        map.setLayoutProperty(id, "visibility", showSpotHeights ? "none" : "visible");
      }
    });
    ["spot-height-circles", "spot-height-labels"].forEach((id) => {
      if (map.getLayer?.(id)) {
        map.setLayoutProperty(id, "visibility", showSpotHeights ? "visible" : "none");
      }
    });
    markersRef.current.forEach((marker) => {
      const el = marker.getElement?.();
      if (el) el.style.display = showSpotHeights ? "none" : "";
    });
  }, []);

  const handleDrawUpdate = useCallback(() => {
    if (!drawRef.current || !onCoordinatesDrawn) return;

    const data = drawRef.current.getAll();
    if (!data.features.length) {
      return;
    }

    const geom = data.features[0].geometry;
    if (geom.type !== "Polygon") {
      return;
    }

    const ring = geom.coordinates[0] as number[][];
    const cleaned =
      ring.length > 3 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring;

    const points: Point[] = cleaned.map((coord, index) => ({
      station: String.fromCharCode(65 + index),
      lng: coord[0],
      lat: coord[1],
    }));

    isDrawingRef.current = true;
    onCoordinatesDrawn(points);

    setTimeout(() => {
      isDrawingRef.current = false;
    }, 100);
  }, [onCoordinatesDrawn]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    containerRef.current.innerHTML = "";
    let disposed = false;

    void (async () => {
      const mapboxgl = await loadMapboxGl();
      if (disposed || !containerRef.current || mapRef.current) return;

      mapboxglRef.current = mapboxgl;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: lightweight
          ? "mapbox://styles/mapbox/streets-v12"
          : "mapbox://styles/mapbox/satellite-streets-v12",
        center: [7.5, 9.0],
        zoom: 6,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      mapRef.current = map;

      const MapboxDraw = await loadMapboxDraw();
      if (disposed || mapRef.current !== map) return;

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
        defaultMode: "simple_select",
        styles: drawStyles,
      });

      map.addControl(draw, "top-left");

      map.on("load", () => {
        map.addSource("plot-polygon", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [[]],
            },
          },
        });

        map.addLayer({
          id: "plot-fill",
          type: "fill",
          source: "plot-polygon",
          paint: {
            "fill-color": "#ef4444",
            "fill-opacity": 0.25,
          },
        });

        map.addLayer({
          id: "plot-outline",
          type: "line",
          source: "plot-polygon",
          paint: {
            "line-color": "#dc2626",
            "line-width": 3,
          },
        });

        map.addSource("utm-zone-boundary", {
          type: "geojson",
          data: zoneBoundaryCollection(coordinateSystem),
        });

        map.addLayer({
          id: "utm-zone-boundary-line",
          type: "line",
          source: "utm-zone-boundary",
          paint: {
            "line-color": "#ef4444",
            "line-width": 2,
            "line-dasharray": [3, 2],
          },
        });

        // Read-only "Spot Heights" view: every uploaded point (boundary corners included, since
        // a boundary corner is also a spot height) as unconnected dots, hidden until that view is
        // selected - see the viewMode effect below.
        map.addSource("spot-height-points", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "spot-height-circles",
          type: "circle",
          source: "spot-height-points",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": 6,
            "circle-color": ["case", ["==", ["get", "is_boundary"], true], "#f97316", "#2563eb"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });

        map.addLayer({
          id: "spot-height-labels",
          type: "symbol",
          source: "spot-height-points",
          layout: {
            visibility: "none",
            "text-field": ["get", "station"],
            "text-size": 11,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
          },
          paint: {
            "text-color": "#1e293b",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.5,
          },
        });

        applySpotHeightVisibility();
        updateZoneBadgePosition();
        setMapReady(true);
      });

      map.on("move", updateZoneBadgePosition);
      map.on("zoom", updateZoneBadgePosition);
      map.on("resize", updateZoneBadgePosition);

      map.on("draw.create", handleDrawUpdate);
      map.on("draw.update", handleDrawUpdate);
      map.on("draw.delete", () => {
        if (onCoordinatesDrawn) {
          onCoordinatesDrawn([
            { station: "A", lng: 0, lat: 0 },
            { station: "B", lng: 0, lat: 0 },
            { station: "C", lng: 0, lat: 0 },
          ]);
        }
      });

      drawRef.current = draw;
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      drawRef.current = null;
      mapboxglRef.current = null;
      setMapReady(false);
    };
  }, [applySpotHeightVisibility, handleDrawUpdate, lightweight, onCoordinatesDrawn, updateZoneBadgePosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ctrl = containerRef.current?.querySelector(".mapboxgl-ctrl-top-left") as HTMLElement | null;
    if (!ctrl) return;

    ctrl.style.pointerEvents = disabled ? "none" : "auto";
    ctrl.style.opacity = disabled ? "0.5" : "1";
  }, [disabled]);

  useEffect(() => {
    activeZoneRef.current = coordinateSystem ? UTM_ZONE_BOUNDARIES[coordinateSystem] : undefined;
    const map = mapRef.current;
    if (!map) return;
    const applyZoneData = () => {
      const source = map.getSource("utm-zone-boundary") as any;
      if (source) source.setData(zoneBoundaryCollection(coordinateSystem));
      updateZoneBadgePosition();
    };
    if (map.isStyleLoaded() && map.getSource("utm-zone-boundary")) {
      applyZoneData();
    } else {
      map.once("load", applyZoneData);
    }
  }, [coordinateSystem, updateZoneBadgePosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded() && map.getLayer?.("spot-height-circles")) {
      applySpotHeightVisibility();
    } else {
      map.once("load", applySpotHeightVisibility);
    }
  }, [viewMode, applySpotHeightVisibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applySpotHeightData = () => {
      const source = map.getSource("spot-height-points") as any;
      if (!source) return;
      const valid = (spotHeightPoints || []).filter((p) => isPlottableLngLat(p.lng, p.lat));
      source.setData({
        type: "FeatureCollection",
        features: valid.map((p) => ({
          type: "Feature",
          properties: { station: p.station, is_boundary: p.is_boundary !== false },
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        })),
      });
    };
    if (map.isStyleLoaded() && map.getSource("spot-height-points")) {
      applySpotHeightData();
    } else {
      map.once("load", applySpotHeightData);
    }
  }, [spotHeightPoints]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;

    const resizeNow = () => {
      try {
        map.resize();
      } catch {
      }
    };

    const observer = new ResizeObserver(() => resizeNow());
    observer.observe(el);

    const onWindowResize = () => resizeNow();
    window.addEventListener("resize", onWindowResize);

    const t1 = window.setTimeout(resizeNow, 0);
    const t2 = window.setTimeout(resizeNow, 180);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", onWindowResize);
      observer.disconnect();
    };
  }, []);

  // Gated on mapReady, not just mapRef.current/mapboxglRef.current truthiness, and mapReady is
  // listed as a dependency below - same reasoning as the country-recenter effect further down.
  // mapRef.current is set synchronously as soon as the mapboxgl.Map constructor returns (see the
  // mount effect above), but that happens inside an async IIFE (behind an awaited loadMapboxGl()
  // chunk fetch); a flow that hands this component coordinates the moment it first mounts - AI
  // Field to Survey Plan jumps straight from import to a populated confirm-map, unlike a manual
  // CSV upload which almost always lands on a map that's already been sitting loaded for a while -
  // runs this effect on mount, before that promise has resolved, so mapRef.current is still null
  // and this effect used to bail out for good: since `coordinates` never changes again after a
  // one-shot AI import, it never got a second chance to draw once the map actually finished
  // loading. Depending on mapReady means it retries the instant the map (and its plot-polygon
  // source) becomes available, instead of a coordinate-system change being the only thing that
  // could ever re-trigger a draw.
  useEffect(() => {
    const map = mapRef.current;
    const draw = drawRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!map || !mapboxgl || !mapReady) return;

    if (isDrawingRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const nonZeroCoords = coordinates.filter((c) => c.lng !== 0 || c.lat !== 0);
    const validCoords = nonZeroCoords.filter((c) => isPlottableLngLat(c.lng, c.lat));
    if (validCoords.length < nonZeroCoords.length) {
      const droppedCount = nonZeroCoords.length - validCoords.length;
      console.error(
        `MapViewEnhanced: dropped ${droppedCount} point(s) with out-of-range coordinates instead of crashing`,
        nonZeroCoords.filter((c) => !isPlottableLngLat(c.lng, c.lat))
      );
      toast.error(
        `${droppedCount} point${droppedCount === 1 ? "" : "s"} couldn't be plotted - the coordinates look outside a valid range for the selected system. Try a different coordinate system.`,
        { duration: 9000 }
      );
    }

    if (draw) {
      const features = draw.getAll();
      if (features.features.length > 0) {
        draw.deleteAll();
      }
    }

    if (validCoords.length === 0) {
      const source = map.getSource("plot-polygon") as any;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[]],
          },
        });
      }
      return;
    }

    validCoords.forEach((coord, index) => {
      const el = document.createElement("div");
      el.className = "map-marker";
      el.innerHTML = `<span>${coord.station || String.fromCharCode(65 + index)}</span>`;
      if (viewModeRef.current === "spot_heights") {
        el.style.display = "none";
      }

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([coord.lng, coord.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (validCoords.length >= 3) {
      const ringCoords = validCoords.map((c) => [c.lng, c.lat]);
      ringCoords.push(ringCoords[0]);

      const source = map.getSource("plot-polygon") as any;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [ringCoords],
          },
        });
      }

      const bounds = new mapboxgl.LngLatBounds();
      validCoords.forEach((c) => bounds.extend([c.lng, c.lat]));

      map.fitBounds(bounds, {
        padding: 80,
        maxZoom: 18,
        duration: 1000,
      });
    } else {
      const source = map.getSource("plot-polygon") as any;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[]],
          },
        });
      }

      if (validCoords.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        validCoords.forEach((c) => bounds.extend([c.lng, c.lat]));
        map.fitBounds(bounds, {
          padding: 80,
          maxZoom: 16,
          duration: 1000,
        });
      }
    }
  }, [coordinates, mapReady]);

  // Recenters the map on the chosen coordinate system's country - only when the country actually
  // changes (not on every zone tweak within the same country). Deliberately fires even with a
  // boundary already drawn: a coordinate-system change usually means the surveyor is about to
  // work somewhere else, and a map that silently stays put (while the zone-boundary line updates
  // fine, since that effect has no such gate) is the confusing outcome, not the safe one.
  // Declared AFTER the [coordinates] effect above (which can call its own fitBounds) so that if
  // both ever fire in the same render pass, this one - reacting to the surveyor's own explicit
  // country choice - always has the final say over where the camera ends up.
  //
  // Gated on `mapReady` (not just mapRef.current truthiness) and listed in the dependency array:
  // the map loads asynchronously (dynamic import of the mapbox-gl chunk, then the "load" event),
  // so a coordinate-system change that lands before that finishes would otherwise see no map to
  // fly yet and - since this effect only re-runs when coordinateSystem itself changes again -
  // never get a second chance. Depending on mapReady means it retries the instant the map
  // actually finishes loading, using whatever coordinateSystem is current at that point.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const country = getCoordinateSystemCountry(coordinateSystem || "wgs84");
    const view = COUNTRY_MAP_VIEW[country];
    // Not updated until we're past the mapReady gate above, so if several coordinate-system
    // changes happen while the map is still loading, the first run that actually executes still
    // correctly treats itself as "first" and reconciles against whatever country is current then.
    const isFirstRun = lastCountryRef.current === null;
    const countryChanged = !isFirstRun && lastCountryRef.current !== country;
    lastCountryRef.current = country;
    if (!view) return;
    // The map's hardcoded default view is already Nigeria, so the first reconciliation only needs
    // to act for a non-Nigeria country; every later run only reacts to an actual country change.
    if (isFirstRun ? country === "Nigeria" : !countryChanged) return;

    map.flyTo({ center: view.center, zoom: view.zoom, duration: 1200 });
  }, [coordinateSystem, mapReady]);

  const hasValidCoords = coordinates.filter((c) => isPlottableLngLat(c.lng, c.lat)).length > 0;

  return (
    <div className={`map-enhanced-container ${disabled ? "disabled" : ""}`}>
      <div ref={containerRef} className="map-enhanced" />

      {zoneBadge && (
        <div
          className="map-zone-badge"
          style={{ left: zoneBadge.left, top: zoneBadge.top }}
        >
          <span className="map-zone-badge-swatch" aria-hidden="true" />
          <span>{zoneBadge.label}</span>
        </div>
      )}

      {hasValidCoords && coordinates.filter((c) => isPlottableLngLat(c.lng, c.lat)).length < 3 && (
        <div className="map-warning">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>Need at least 3 points to form a polygon</span>
        </div>
      )}
    </div>
  );
}

export default memo(MapViewEnhanced);
