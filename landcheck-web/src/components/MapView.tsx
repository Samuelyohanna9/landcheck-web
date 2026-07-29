import { useEffect, useRef } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { loadMapboxDraw, loadMapboxGl } from "../utils/mapboxLoader";

type Props = {
  onPolygonCreated: (coords: number[][] | null) => void;
  disabled?: boolean;
  resetKey?: number;
};

export default function MapView({ onPolygonCreated, disabled = false, resetKey = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const drawRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    containerRef.current.innerHTML = "";
    let disposed = false;

    void (async () => {
      const mapboxgl = await loadMapboxGl();
      if (disposed || !containerRef.current || mapRef.current) return;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
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
      });

      map.addControl(draw, "top-left");

      const updatePolygon = () => {
        const data = draw.getAll();
        if (!data.features.length) {
          onPolygonCreated(null);
          return;
        }

        const geom = data.features[0].geometry;
        if (geom.type !== "Polygon") {
          onPolygonCreated(null);
          return;
        }
        const ring = geom.coordinates[0] as number[][];
        const cleaned =
          ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
            ? ring.slice(0, -1)
            : ring;

        onPolygonCreated(cleaned);
      };

      map.on("draw.create", updatePolygon);
      map.on("draw.update", updatePolygon);
      map.on("draw.delete", () => onPolygonCreated(null));

      drawRef.current = draw;
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [onPolygonCreated]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ctrl = containerRef.current?.querySelector(".mapboxgl-ctrl-top-left") as HTMLElement | null;
    if (!ctrl) return;

    ctrl.style.pointerEvents = disabled ? "none" : "auto";
    ctrl.style.opacity = disabled ? "0.5" : "1";
  }, [disabled]);

  useEffect(() => {
    if (!drawRef.current) return;
    drawRef.current.deleteAll();
    onPolygonCreated(null);
  }, [resetKey, onPolygonCreated]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 500 }} />;
}
