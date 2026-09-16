import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import { formatArea, type UnitSystem } from "../../utils/unitFormat";

type PlotFeature = {
  id: number;
  properties: {
    id: number;
    plot_number: string;
    commercial_status: string;
    development_status?: string;
    geometry_status: string;
    area_sqm?: number;
    block_id?: number | null;
  };
};

export default function EstatePlotsPage() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const [estateName, setEstateName] = useState("");
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("m");
  const [plots, setPlots] = useState<PlotFeature["properties"][]>([]);
  const [blocks, setBlocks] = useState<Array<{ id: number; label: string; name?: string }>>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => {
      setEstateName(response.data.name);
      setUnitSystem(response.data.unit_system === "ft" ? "ft" : "m");
    }).catch(() => undefined);
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => {
      const features = (response.data?.features || []) as PlotFeature[];
      setPlots(features.map((feature) => feature.properties));
    }).catch(() => setPlots([]));
    api.get(`/estates/${estateId}/blocks`).then((response) => setBlocks(response.data || [])).catch(() => setBlocks([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  }, [estateId]);

  const blockLabel = (blockId?: number | null) => blocks.find((block) => block.id === blockId)?.label || "--";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return plots.filter((plot) => {
      const matchesStatus = statusFilter === "all" || plot.commercial_status === statusFilter;
      const matchesSearch = !query || plot.plot_number.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [plots, search, statusFilter]);

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="plots" search={search} onSearchChange={setSearch} searchPlaceholder="Search plot number..." recentActivity={activity}>
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Plot register ({filtered.length})</h3>
            <select className="edash-map-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Status</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="allocated">Allocated</option>
              <option value="on_hold">On hold</option>
            </select>
          </div>
          {filtered.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="edash-mini-table">
                <thead>
                  <tr><th>Plot No.</th><th>Block</th><th>Status</th><th>Development</th><th>Area</th><th>Geometry</th><th /></tr>
                </thead>
                <tbody>
                  {filtered.map((plot) => (
                    <tr key={plot.id}>
                      <td data-label="Plot No.">{plot.plot_number}</td>
                      <td data-label="Block">{blockLabel(plot.block_id)}</td>
                      <td data-label="Status" style={{ textTransform: "capitalize" }}>{plot.commercial_status.replaceAll("_", " ")}</td>
                      <td data-label="Development" style={{ textTransform: "capitalize" }}>{(plot.development_status || "not_started").replaceAll("_", " ")}</td>
                      <td data-label="Area">{formatArea(Number(plot.area_sqm || 0), unitSystem)}</td>
                      <td data-label="Geometry" style={{ textTransform: "capitalize" }}>{plot.geometry_status}</td>
                      <td>
                        <button type="button" className="edash-btn-outline" onClick={() => navigate(`/estates/${estateId}/map?plot=${plot.id}`)}>
                          <EstateIcon name="map" /> Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="edash-tab-empty">No plots match this filter yet.</p>
          )}
        </div>
      </div>
    </EstateShell>
  );
}
