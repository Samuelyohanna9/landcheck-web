import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../../api/client";
import { copyText, naira, whatsappShareHref } from "../../../utils/estateMarketing";
import EstateIcon from "../EstateIcon";

type BoardRow = {
  rank: number; name: string; leads: number; whatsapp_clicks: number; inspections_booked: number; inspections_attended: number; reservations: number; sales: number;
  is_you: boolean; sales_value?: string; commission_earned?: string; commission_paid?: string;
};
type AgentLink = { campaign_id: number; agent: string; email: string | null; phone: string | null; page_url: string; share_url: string; link_opens: number };

export default function MarketingAgentsTab({ estateId, organizationId, canManage, published }: { estateId: string; organizationId: number; canManage: boolean; published: boolean }) {
  const [days, setDays] = useState(30);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [moneyVisible, setMoneyVisible] = useState(false);
  const [links, setLinks] = useState<AgentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadBoard = useCallback(async () => {
    try {
      const response = await api.get(`/estates/organizations/${organizationId}/marketing/leaderboard`, { params: { days } });
      setBoard(response.data.rows || []);
      setMoneyVisible(Boolean(response.data.money_visible));
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The leaderboard could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [organizationId, days]);

  useEffect(() => { setLoading(true); void loadBoard(); }, [loadBoard]);

  const generateLinks = async () => {
    setGenerating(true);
    try {
      const response = await api.post(`/estates/${estateId}/marketing/agent-links`);
      setLinks(response.data.links || []);
      if (!(response.data.links || []).length) toast("Add a sales agent or marketer first (Commissions page), then generate their links.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Agent links could not be generated."));
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (value: string) => {
    if (await copyText(value)) toast.success("Link copied.");
    else toast.error("Copy failed - select the link and copy it manually.");
  };

  return (
    <div className="edash-mk-stack">
      <div className="edash-card"><div className="edash-card-inner">
        <div className="edash-card-head">
          <h3 className="edash-card-title">Agent leaderboard</h3>
          <div className="edash-mk-segment" role="group" aria-label="Period">
            {[7, 30, 90].map((value) => <button key={value} type="button" className={days === value ? "is-active" : ""} onClick={() => setDays(value)}>{value} days</button>)}
          </div>
        </div>
        {loading ? <p className="edash-mk-empty">Loading...</p> : board.length === 0 ? (
          <p className="edash-mk-empty">No sales agents yet. Add agents or marketers on the <Link to="/estates/commissions" style={{ color: "var(--edash-brand-dark)", fontWeight: 700 }}>Commissions</Link> page and they will appear here.</p>
        ) : (
          <div className="edash-mk-scroll">
            <table className="edash-mk-table">
              <thead><tr><th>#</th><th>Agent</th><th className="num">WhatsApp</th><th className="num">Leads</th><th className="num">Inspections</th><th className="num">Reserved</th><th className="num">Sold</th>{moneyVisible && <><th className="num">Sales value</th><th className="num">Commission</th></>}</tr></thead>
              <tbody>
                {board.map((row) => (
                  <tr key={row.rank + row.name}>
                    <td><span className={`edash-mk-rank${row.rank <= 3 && row.sales > 0 ? " is-top" : ""}`}>{row.rank}</span></td>
                    <td>{row.name}{row.is_you && <span className="edash-mk-you">You</span>}</td>
                    <td className="num">{row.whatsapp_clicks}</td><td className="num">{row.leads}</td>
                    <td className="num">{row.inspections_attended}/{row.inspections_booked}</td><td className="num">{row.reservations}</td><td className="num">{row.sales}</td>
                    {moneyVisible && <><td className="num">{row.sales_value !== undefined ? naira(row.sales_value) : "-"}</td><td className="num">{row.commission_earned !== undefined ? naira(row.commission_earned) : "-"}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="edash-mk-hint">Ranked by sales value, then sales, reservations and attended inspections. Inspections show attended / booked. Commission figures are visible to owners and managers only.</p>
      </div></div>

      {canManage && (
        <div className="edash-card"><div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Personal referral links</h3>
            <button type="button" className="edash-btn-primary" disabled={generating || !published} onClick={() => void generateLinks()}>{generating ? "Generating..." : links.length ? "Refresh links" : "Generate links for all agents"}</button>
          </div>
          {!published && <p className="edash-mk-empty">Publish your Estate page first.</p>}
          {published && links.length === 0 && <p className="edash-mk-empty">Every agent gets one permanent link for this estate. Anything a buyer does through it - opening the page, chatting on WhatsApp, booking an inspection, reserving a plot - is credited to that agent, and the buyer sees the agent's name and WhatsApp number.</p>}
          {links.length > 0 && (
            <div className="edash-mk-followups">
              {links.map((link) => (
                <div className="edash-mk-followup" key={link.campaign_id}>
                  <div><strong>{link.agent}</strong><small>{link.link_opens} link opens{link.phone ? ` · ${link.phone}` : ""}{link.email ? ` · ${link.email}` : ""}</small></div>
                  <div className="edash-mk-actions">
                    <button type="button" className="edash-mk-chip-btn" onClick={() => void copy(link.share_url)}><EstateIcon name="share" />Copy link</button>
                    <a className="edash-mk-chip-btn is-wa" href={whatsappShareHref(`See the live plot map and reserve online: ${link.share_url}`)} target="_blank" rel="noreferrer"><EstateIcon name="whatsapp" />Share</a>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="edash-mk-hint">Agents open their own workspace (invite link from the Commissions page) to get the same marketing kit with their name and number on it, follow up leads, and track their commission tier.</p>
        </div></div>
      )}
    </div>
  );
}
