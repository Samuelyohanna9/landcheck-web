import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import { money } from "../../components/estates/FinancialComponents";
import { formatArea, type UnitSystem } from "../../utils/unitFormat";

type PlotFeature = {
  id: number;
  properties: {
    id: number;
    plot_number: string;
    commercial_status: string;
    development_status?: string;
    geometry_status: string;
    public_address?: string | null;
    area_sqm?: number;
    asking_price?: string | null;
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
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [priceBusy, setPriceBusy] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [addressDraft, setAddressDraft] = useState("");
  const [addressBusy, setAddressBusy] = useState(false);

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

  const savePrice = async (plotId: number) => {
    setPriceBusy(true);
    try {
      const response = await api.patch(`/estates/plots/${plotId}/public-price`, { asking_price: priceDraft.trim() ? Number(priceDraft) : null });
      setPlots((current) => current.map((plot) => plot.id === plotId ? { ...plot, asking_price: response.data.asking_price } : plot));
      setEditingPriceId(null);
      toast.success("Public price saved.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The public price could not be saved."));
    } finally {
      setPriceBusy(false);
    }
  };

  const saveAddress = async (plotId: number) => {
    setAddressBusy(true);
    try {
      const response = await api.patch(`/estates/plots/${plotId}/public-address`, { public_address: addressDraft.trim() || null });
      setPlots((current) => current.map((plot) => plot.id === plotId ? { ...plot, public_address: response.data.public_address } : plot));
      setEditingAddressId(null);
      toast.success("Plot address saved.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The plot address could not be saved."));
    } finally {
      setAddressBusy(false);
    }
  };

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
                  <tr><th>Plot No.</th><th>Block</th><th>Status</th><th>Development</th><th>Area</th><th>Plot address</th><th>Public price</th><th>Geometry</th><th /></tr>
                </thead>
                <tbody>
                  {filtered.map((plot) => (
                    <tr key={plot.id}>
                      <td data-label="Plot No.">{plot.plot_number}</td>
                      <td data-label="Block">{blockLabel(plot.block_id)}</td>
                      <td data-label="Status" style={{ textTransform: "capitalize" }}>{plot.commercial_status.replaceAll("_", " ")}</td>
                      <td data-label="Development" style={{ textTransform: "capitalize" }}>{(plot.development_status || "not_started").replaceAll("_", " ")}</td>
                      <td data-label="Area">{formatArea(Number(plot.area_sqm || 0), unitSystem)}</td>
                      <td data-label="Plot address">
                        {editingAddressId === plot.id ? (
                          <span className="edash-inline-price-editor"><input value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} aria-label={`Address for Plot ${plot.plot_number}`} placeholder="Street or plot address" /><button type="button" className="edash-card-link" disabled={addressBusy} onClick={() => void saveAddress(plot.id)}>Save</button><button type="button" className="edash-card-link" onClick={() => setEditingAddressId(null)}>Cancel</button></span>
                        ) : (
                          <span className="edash-inline-price"><span>{plot.public_address || "Not set"}</span><button type="button" className="edash-card-link" onClick={() => { setEditingAddressId(plot.id); setAddressDraft(plot.public_address || ""); }}>{plot.public_address ? "Edit" : "Add address"}</button></span>
                        )}
                      </td>
                      <td data-label="Public price">
                        {editingPriceId === plot.id ? (
                          <span className="edash-inline-price-editor"><input type="number" min="0" step="1000" value={priceDraft} onChange={(event) => setPriceDraft(event.target.value)} aria-label={`Price for Plot ${plot.plot_number}`} /><button type="button" className="edash-card-link" disabled={priceBusy} onClick={() => void savePrice(plot.id)}>Save</button><button type="button" className="edash-card-link" onClick={() => setEditingPriceId(null)}>Cancel</button></span>
                        ) : (
                          <span className="edash-inline-price"><span>{plot.asking_price ? money(plot.asking_price) : "Not set"}</span><button type="button" className="edash-card-link" onClick={() => { setEditingPriceId(plot.id); setPriceDraft(plot.asking_price || ""); }}>{plot.asking_price ? "Edit" : "Set price"}</button></span>
                        )}
                      </td>
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
