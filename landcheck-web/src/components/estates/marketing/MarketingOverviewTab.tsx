import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../../api/client";
import { ageLabel, type FollowUpItem } from "../../../utils/estateMarketing";
import EstateIcon from "../EstateIcon";

type ChannelRow = {
  id: number; code: string; name: string; channel: string; agent: string | null;
  link_opens: number; leads: number; whatsapp: number; shares: number; directions: number; inspections: number; reservations: number; sales: number;
};
type Overview = {
  period_days: number;
  totals: { link_opens: number; whatsapp: number; shares: number; directions: number; leads: number; inspections: number; reservations: number; sales: number; upcoming_inspections: number };
  channels: ChannelRow[];
  direct: { leads: number; whatsapp: number; inspections: number; reservations: number; sales: number };
  follow_up_queue: FollowUpItem[];
  follow_up_count: number;
  published: boolean;
};

const PERIODS = [7, 30, 90];

export default function MarketingOverviewTab({ estateId, onFollowUpCount }: { estateId: string; onFollowUpCount: (count: number) => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get<Overview>(`/estates/${estateId}/marketing/overview`, { params: { days } });
      setData(response.data);
      onFollowUpCount(response.data.follow_up_count);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Marketing figures could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [estateId, days, onFollowUpCount]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  const markContacted = async (id: number) => {
    setBusyId(id);
    try {
      await api.patch(`/estates/reservation-requests/${id}`, { status: "contacted" });
      toast.success("Marked as contacted.");
      await load();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The lead could not be updated."));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) return <p className="edash-tab-empty">Loading marketing figures...</p>;
  if (!data) return <p className="edash-tab-empty">Marketing figures are not available right now.</p>;
  const t = data.totals;

  return (
    <>
      <div className="edash-mk-toolbar">
        <div><strong style={{ fontSize: ".9rem" }}>Where your enquiries come from</strong></div>
        <div className="edash-mk-segment" role="group" aria-label="Period">
          {PERIODS.map((value) => <button key={value} type="button" className={days === value ? "is-active" : ""} onClick={() => setDays(value)}>{value} days</button>)}
        </div>
      </div>

      <div className="edash-mk-metrics">
        <div className="edash-mk-metric"><span>Link opens</span><strong>{t.link_opens}</strong><small>All time, every tracked link</small></div>
        <div className="edash-mk-metric"><span>WhatsApp chats</span><strong>{t.whatsapp}</strong><small>Started from the page</small></div>
        <div className="edash-mk-metric"><span>Leads</span><strong>{t.leads}</strong><small>Reservation requests</small></div>
        <div className="edash-mk-metric"><span>Inspections</span><strong>{t.inspections}</strong><small>{t.upcoming_inspections} upcoming times open</small></div>
        <div className="edash-mk-metric"><span>Reservations</span><strong>{t.reservations}</strong><small>Plots reserved</small></div>
        <div className="edash-mk-metric"><span>Sales</span><strong>{t.sales}</strong><small>Fully paid</small></div>
      </div>

      <div className="edash-mk-grid-2">
        <div className="edash-mk-stack">
          <div className="edash-card"><div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Channels &amp; agent links</h3></div>
            {data.channels.length === 0 && data.direct.leads === 0 ? (
              <p className="edash-mk-empty">No tracked links yet. Create one in the Materials tab and share it - every enquiry will be credited to it.</p>
            ) : (
              <div className="edash-mk-scroll">
                <table className="edash-mk-table">
                  <thead><tr><th>Link</th><th className="num">Opens</th><th className="num">WhatsApp</th><th className="num">Leads</th><th className="num">Inspections</th><th className="num">Reserved</th><th className="num">Sold</th></tr></thead>
                  <tbody>
                    {data.channels.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}<small>{row.channel.replaceAll("_", " ")}{row.agent ? ` · ${row.agent}` : ""}</small></td>
                        <td className="num">{row.link_opens}</td><td className="num">{row.whatsapp}</td><td className="num">{row.leads}</td>
                        <td className="num">{row.inspections}</td><td className="num">{row.reservations}</td><td className="num">{row.sales}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>Direct / untracked<small>Public page without a tracked link</small></td>
                      <td className="num">-</td><td className="num">{data.direct.whatsapp}</td><td className="num">{data.direct.leads}</td>
                      <td className="num">{data.direct.inspections}</td><td className="num">{data.direct.reservations}</td><td className="num">{data.direct.sales}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div></div>
        </div>

        <div className="edash-card"><div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Needs a follow-up</h3>
            <span className={`edash-status-pill tone-${data.follow_up_count ? "danger" : "good"}`}>{data.follow_up_count ? `${data.follow_up_count} waiting` : "All caught up"}</span>
          </div>
          {data.follow_up_queue.length === 0 ? (
            <p className="edash-mk-empty">No leads are waiting. New enquiries appear here if nobody replies within the hour.</p>
          ) : (
            <div className="edash-mk-followups">
              {data.follow_up_queue.map((lead) => (
                <div key={lead.id} className={`edash-mk-followup${lead.age_hours >= 24 ? " is-late" : ""}`}>
                  <div>
                    <strong>{lead.name}</strong>
                    <small>Plot {lead.plot || "-"} · {lead.status === "new" ? "Enquired" : "Contacted"} {ageLabel(lead.age_hours)}{lead.agent ? ` · ${lead.agent}` : ""}</small>
                  </div>
                  <div className="edash-mk-actions">
                    <a className="edash-mk-chip-btn" href={`tel:${lead.phone}`}><EstateIcon name="phone" />Call</a>
                    {lead.whatsapp_url && <a className="edash-mk-chip-btn is-wa" href={lead.whatsapp_url} target="_blank" rel="noreferrer"><EstateIcon name="whatsapp" />WhatsApp</a>}
                    {lead.status === "new" && <button type="button" className="edash-mk-chip-btn" disabled={busyId === lead.id} onClick={() => void markContacted(lead.id)}>Mark contacted</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="edash-mk-hint">Owners and managers are emailed a digest of unanswered leads after 1, 6, 24 and 72 hours, so nobody has to remember to check.</p>
        </div></div>
      </div>
    </>
  );
}
