import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "../styles/feature-override-modal.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

type FeatureType = "road" | "building" | "river";
type FeatureAction = "add" | "delete" | "update";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: { feature_type: FeatureType; action: FeatureAction; name?: string; width_m?: number; geojson: any }) => void;
  plotCoords: number[][] | null;
  featureType: FeatureType;
  setFeatureType: (t: FeatureType) => void;
  action: FeatureAction;
  setAction: (a: FeatureAction) => void;
  roadName: string;
  setRoadName: (v: string) => void;
  roadWidth: "2" | "4" | "6" | "8" | "10" | "12" | "15" | "20" | "30";
  setRoadWidth: (v: "2" | "4" | "6" | "8" | "10" | "12" | "15" | "20" | "30") => void;
  plotId: number | null;
};

export default function FeatureOverrideModal({
  isOpen,
  onClose,
  onSave,
  plotCoords,
  featureType,
  setFeatureType,
  action,
  setAction,
  roadName,
  setRoadName,
  roadWidth,
  setRoadWidth,
  plotId,
}: Props) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [selectedGeometry, setSelectedGeometry] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [7.5, 9.0],
      zoom: 12,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        point: false,
        line_string: true,
        polygon: true,
        trash: true,
      },
    });
    map.addControl(draw, "top-left");

    const loadFeatures = async () => {
      if (!plotId) return;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/plots/${plotId}/features/geojson`);
        if (!res.ok) return;
        const data = await res.json();

        if (!map.getSource("roads-src")) {
          map.addSource("roads-src", { type: "geojson", data: data.roads });
          map.addLayer({
            id: "roads-line",
            type: "line",
            source: "roads-src",
            paint: { "line-color": "#0f172a", "line-width": 2 },
          });
          map.on("mouseenter", "roads-line", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "roads-line", () => (map.getCanvas().style.cursor = ""));
        } else {
          (map.getSource("roads-src") as mapboxgl.GeoJSONSource).setData(data.roads);
        }

        if (!map.getSource("buildings-src")) {
          map.addSource("buildings-src", { type: "geojson", data: data.buildings });
          map.addLayer({
            id: "buildings-line",
            type: "line",
            source: "buildings-src",
            paint: { "line-color": "#1f2937", "line-width": 1.5 },
          });
          map.on("mouseenter", "buildings-line", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "buildings-line", () => (map.getCanvas().style.cursor = ""));
        } else {
          (map.getSource("buildings-src") as mapboxgl.GeoJSONSource).setData(data.buildings);
        }

        if (!map.getSource("rivers-src")) {
          map.addSource("rivers-src", { type: "geojson", data: data.rivers });
          map.addLayer({
            id: "rivers-line",
            type: "line",
            source: "rivers-src",
            paint: { "line-color": "#2563eb", "line-width": 1.5 },
          });
          map.on("mouseenter", "rivers-line", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "rivers-line", () => (map.getCanvas().style.cursor = ""));
        } else {
          (map.getSource("rivers-src") as mapboxgl.GeoJSONSource).setData(data.rivers);
        }
      } catch {
        // ignore
      }
    };

    map.on("load", () => {
      if (plotCoords && plotCoords.length >= 3) {
        const plotFeature = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [plotCoords],
          },
        };
        if (!map.getSource("plot-boundary")) {
          map.addSource("plot-boundary", {
            type: "geojson",
            data: plotFeature as any,
          });
          map.addLayer({
            id: "plot-boundary-line",
            type: "line",
            source: "plot-boundary",
            paint: {
              "line-color": "#ef4444",
              "line-width": 2,
            },
          });
        }
        const bounds = new mapboxgl.LngLatBounds();
        plotCoords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
        map.fitBounds(bounds, { padding: 40, duration: 0 });
      }
      loadFeatures();
    });

  const selectFeature = (featureType: FeatureType) => (e: mapboxgl.MapLayerMouseEvent) => {
      if (!drawRef.current || !e.features?.length) return;
      const feat = e.features[0];
      if (!feat.geometry) return;
      drawRef.current.deleteAll();
      drawRef.current.add({
        type: "Feature",
        properties: {},
        geometry: feat.geometry as any,
      });
      setSelectedGeometry(feat.geometry);
      if (map.getSource("selected-feature")) {
        (map.getSource("selected-feature") as mapboxgl.GeoJSONSource).setData({
          type: "Feature",
          geometry: feat.geometry,
          properties: {},
        } as any);
      } else {
        map.addSource("selected-feature", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: feat.geometry,
            properties: {},
          } as any,
        });
        map.addLayer({
          id: "selected-feature-line",
          type: "line",
          source: "selected-feature",
          paint: { "line-color": "#f59e0b", "line-width": 3 },
        });
      }
      setFeatureType(featureType);
      if (featureType === "road") {
        const nm = (feat.properties as any)?.name;
        setRoadName(nm || "");
        const w = (feat.properties as any)?.width_m;
        if (w) setRoadWidth(String(w) as Props["roadWidth"]);
      }
      if (action === "add") setAction("update");
    };

    const contextMenu = (featureType: FeatureType) => (e: mapboxgl.MapLayerMouseEvent) => {
      e.preventDefault();
      if (!e.features?.length) return;
      const feat = e.features[0];
      if (!feat.geometry) return;
      selectFeature(featureType)(e);
      setSelectedGeometry(feat.geometry);
      setMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, visible: true });
      setFeatureType(featureType);
    };

    map.on("click", "roads-line", selectFeature("road"));
    map.on("click", "buildings-line", selectFeature("building"));
    map.on("click", "rivers-line", selectFeature("river"));

    map.on("contextmenu", "roads-line", contextMenu("road"));
    map.on("contextmenu", "buildings-line", contextMenu("building"));
    map.on("contextmenu", "rivers-line", contextMenu("river"));

    mapRef.current = map;
    drawRef.current = draw;

    return () => {
      drawRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [isOpen, plotCoords]);

  const handleSave = () => {
    const draw = drawRef.current;
    if (!draw) return;
    const data = draw.getAll();
    let feature = data.features[data.features.length - 1];
    if (!feature && selectedGeometry) {
      feature = {
        type: "Feature",
        properties: {},
        geometry: selectedGeometry,
      } as any;
    }
    if (!feature) return;
    onSave({
      feature_type: featureType,
      action,
      name: featureType === "road" ? roadName : undefined,
      width_m: featureType === "road" ? Number(roadWidth) : undefined,
      geojson: feature.geometry,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="feature-override-modal">
      <div className="feature-override-card">
        <div className="feature-override-header">
          <div>
            <h3>Edit Features</h3>
            <p>Draw on the map to add, update, or remove features.</p>
          </div>
          <button className="feature-override-close" onClick={onClose}>✕</button>
        </div>

        <div className="feature-override-controls">
          <div className="field">
            <label>Feature Type</label>
            <select value={featureType} onChange={(e) => setFeatureType(e.target.value as FeatureType)}>
              <option value="road">Road</option>
              <option value="building">Building</option>
              <option value="river">River</option>
            </select>
          </div>
          <div className="field">
            <label>Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value as FeatureAction)}>
              <option value="add">Add</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
            </select>
          </div>
          {featureType === "road" && action !== "delete" && (
            <div className="field wide">
              <label>Road Name (optional)</label>
              <input value={roadName} onChange={(e) => setRoadName(e.target.value)} placeholder="e.g., Abuja Road" />
            </div>
          )}
          {featureType === "road" && action === "add" && (
            <div className="field">
              <label>New Road Width</label>
              <select value={roadWidth} onChange={(e) => setRoadWidth(e.target.value as Props["roadWidth"])}>
                <option value="2">2</option>
                <option value="4">4</option>
                <option value="6">6</option>
                <option value="8">8</option>
                <option value="10">10</option>
                <option value="12">12</option>
                <option value="15">15</option>
                <option value="20">20</option>
                <option value="30">30</option>
              </select>
            </div>
          )}
          <div className="hint">
            Tip: Use line tool for roads/rivers and polygon tool for buildings. Delete draws a mask to remove detected features.
          </div>
        </div>

        <div className="feature-override-map" ref={containerRef} />

        <div className="feature-override-actions">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
      {menu.visible && (
        <div
          className="feature-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu({ ...menu, visible: false })}
        >
          <button
            onClick={() => {
              setAction("update");
              setMenu({ ...menu, visible: false });
            }}
          >
            Set Update
          </button>
          <button
            onClick={() => {
              setAction("delete");
              if (selectedGeometry) {
                onSave({
                  feature_type: featureType,
                  action: "delete",
                  geojson: selectedGeometry,
                });
                setMenu({ ...menu, visible: false });
                return;
              }
              setMenu({ ...menu, visible: false });
            }}
          >
            Set Delete
          </button>
          <button
            onClick={() => {
              setSelectedGeometry(null);
              setMenu({ ...menu, visible: false });
            }}
          >
            Clear Selection
          </button>
        </div>
      )}
    </div>
  );
}
