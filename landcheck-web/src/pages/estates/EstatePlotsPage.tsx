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

// Colour-coded status cells: green = ready/available, orange = in progress or held, blue = sold on, grey = idle.
function statusTone(value: string): "good" | "warn" | "info" | "danger" | "neutral" {
  const key = String(value || "").toLowerCase();
  if (["available", "approved", "completed", "developed", "done"].includes(key)) return "good";
  if (["reserved", "in_progress", "under_construction", "pending", "draft", "needs_review"].includes(key)) return "warn";
  if (["allocated", "sold"].includes(key)) return "info";
  if (["rejected", "disputed", "failed"].includes(key)) return "danger";
  return "neutral";
}

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
  const [sharedAddress, setSharedAddress] = useState("");
  const [priceMode, setPriceMode] = useState<"uniform" | "custom">("uniform");
  const [uniformPrice, setUniformPrice] = useState("");
  const [listingDefaultsBusy, setListingDefaultsBusy] = useState<"address" | "price" | null>(null);

  const syncListingDefaults = (rows: PlotFeature["properties"][]) => {
    const addresses = [...new Set(rows.map((plot) => plot.public_address?.trim()).filter(Boolean))] as string[];
    setSharedAddress(addresses.length === 1 ? addresses[0] : "");
    const prices = rows.map((plot) => plot.asking_price?.trim() || null);
    const uniquePrices = [...new Set(prices.filter(Boolean))] as string[];
    const hasUniformPrice = uniquePrices.length === 1 && prices.every((price) => price === uniquePrices[0]);
    if (uniquePrices.length === 0 || hasUniformPrice) {
      setPriceMode("uniform");
      setUniformPrice(uniquePrices[0] || "");
    } else {
      setPriceMode("custom");
      setUniformPrice("");
    }
  };

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => {
      setEstateName(response.data.name);
      setUnitSystem(response.data.unit_system === "ft" ? "ft" : "m");
    }).catch(() => undefined);
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => {
      const features = (response.data?.features || []) as PlotFeature[];
      const rows = features.map((feature) => feature.properties);
      setPlots(rows);
      syncListingDefaults(rows);
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

  const applyListingDefaults = async (kind: "address" | "price") => {
    if (kind === "price" && (!uniformPrice.trim() || !Number.isFinite(Number(uniformPrice)) || Number(uniformPrice) <= 0)) {
      toast.error("Enter a valid uniform price first.");
      return;
    }
    setListingDefaultsBusy(kind);
    try {
      const response = await api.patch(`/estates/${estateId}/plot-listing-defaults`, {
        apply_address: kind === "address",
        public_address: kind === "address" ? (sharedAddress.trim() || null) : undefined,
        apply_price: kind === "price",
        asking_price: kind === "price" ? Number(uniformPrice) : undefined,
      });
      if (kind === "address") {
        const value = response.data.public_address || null;
        setSharedAddress(value || "");
        setPlots((current) => current.map((plot) => ({ ...plot, public_address: value })));
        toast.success(`Address applied to ${response.data.updated_plots} plot(s).`);
      } else {
        const value = response.data.asking_price || null;
        setPlots((current) => current.map((plot) => ({ ...plot, asking_price: value })));
        toast.success(`Uniform price applied to ${response.data.updated_plots} plot(s).`);
      }
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The listing defaults could not be applied."));
    } finally {
      setListingDefaultsBusy(null);
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
          <div className="edash-plot-listing-defaults">
            <div className="edash-plot-listing-defaults-copy">
              <strong>Public listing details</strong>
              <span>Set shared details once, then customise individual plots only when needed.</span>
            </div>
            <div className="edash-plot-listing-defaults-grid">
              <div className="edash-plot-default-field">
                <label htmlFor="shared-plot-address">Shared plot address</label>
                <div className="edash-plot-default-action">
                  <input id="shared-plot-address" value={sharedAddress} onChange={(event) => setSharedAddress(event.target.value)} placeholder="e.g. Greenview Estate, Phase 1" />
                  <button type="button" className="edash-card-link" disabled={listingDefaultsBusy !== null} onClick={() => void applyListingDefaults("address")}>{listingDefaultsBusy === "address" ? "Applying..." : `Apply to all ${plots.length}`}</button>
                </div>
              </div>
              <fieldset className="edash-plot-default-field edash-plot-pricing-field">
                <legend>Public pricing</legend>
                <div className="edash-plot-price-modes">
                  <label><input type="radio" name="plot-price-mode" checked={priceMode === "uniform"} onChange={() => setPriceMode("uniform")} /> Uniform</label>
                  <label><input type="radio" name="plot-price-mode" checked={priceMode === "custom"} onChange={() => setPriceMode("custom")} /> Custom</label>
                </div>
                {priceMode === "uniform" ? (
                  <div className="edash-plot-default-action">
                    <input type="number" min="0" step="1000" value={uniformPrice} onChange={(event) => setUniformPrice(event.target.value)} placeholder="Enter one price" aria-label="Uniform public plot price" />
                    <button type="button" className="edash-card-link" disabled={listingDefaultsBusy !== null || !uniformPrice.trim()} onClick={() => void applyListingDefaults("price")}>{listingDefaultsBusy === "price" ? "Applying..." : `Apply to all ${plots.length}`}</button>
                  </div>
                ) : (
                  <span className="edash-field-note">Set prices individually in the register below.</span>
                )}
              </fieldset>
            </div>
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
                      <td data-label="Status"><span className={`edash-status-pill tone-${statusTone(plot.commercial_status)}`}>{plot.commercial_status.replaceAll("_", " ")}</span></td>
                      <td data-label="Development"><span className={`edash-status-pill tone-${statusTone(plot.development_status || "not_started")}`}>{(plot.development_status || "not_started").replaceAll("_", " ")}</span></td>
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
                      <td data-label="Geometry"><span className={`edash-status-pill tone-${statusTone(plot.geometry_status)}`}>{plot.geometry_status}</span></td>
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
