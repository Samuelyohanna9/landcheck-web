import { describePlotEvent, type PlotHistoryEvent } from "../../utils/plotHistory";
import EstateIcon from "./EstateIcon";

/** Everything that ever happened to one plot - payments, allocation, the customer, commission
 * payouts, documents, survey/staking, hazard/soil screening, site updates, approval milestones
 * and live inspections - reverse-chronological, connected by a line with a checkmark at every
 * entry (every row here already happened, so there's no "pending" state the way a live job's
 * step list has one - see EstateProgressSteps for that variant). */
export default function PlotHistoryList({ events }: { events: PlotHistoryEvent[] }) {
  if (!events.length) {
    return (
      <div className="edash-tab-empty">
        <EstateIcon name="audit" />
        <span>No recorded activity for this plot yet.</span>
      </div>
    );
  }

  return (
    <ul className="edash-progress-steps edash-plot-history-list">
      {events.map((event) => {
        const { title, detail } = describePlotEvent(event);
        return (
          <li key={event.id} className="edash-progress-step edash-progress-step--done">
            <span className="edash-progress-step-dot" aria-hidden="true">&#10003;</span>
            <div className="edash-progress-step-label">
              <strong>{title}</strong>
              {detail && <span className="edash-plot-history-detail">{detail}</span>}
              <small>{new Date(event.created_at).toLocaleString()}{event.actor ? ` · ${event.actor}` : ""}</small>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
