import { naira } from "./estateMarketing";

export type PlotHistoryEvent = {
  id: number;
  action: string;
  entity_type: string;
  actor: string | null;
  created_at: string;
  details: Record<string, any> | null;
};

function titleCaseStatus(value: unknown): string {
  return String(value || "").replace(/_/g, " ");
}

/** Turns a raw audit action + its after_data into the title/subtitle a plot's "Plot History" view
 * shows for that row. Only actions this endpoint (GET /estates/plots/{id}/timeline) can actually
 * return need an entry here - everything else falls back to a humanized version of the action
 * string, same as before this richer formatting existed. */
const TEMPLATES: Record<string, (details: Record<string, any>) => { title: string; detail?: string }> = {
  "plot.created": (d) => ({ title: "Plot created", detail: d.area_sqm ? `${Math.round(d.area_sqm)} m²` : undefined }),
  "plot.geometry_updated": () => ({ title: "Plot boundary edited" }),
  "plot.subdivided": () => ({ title: "Plot subdivided" }),
  "plot.deleted": () => ({ title: "Plot deleted" }),
  "plot.public_address_updated": () => ({ title: "Public address updated" }),
  "plot.public_price_updated": (d) => ({ title: "Public price updated", detail: d.price != null ? naira(d.price) : undefined }),
  "plot.development_status_changed": (d) => ({ title: "Development status changed", detail: d.status ? titleCaseStatus(d.status) : undefined }),
  "plot.title_verification_changed": (d) => ({ title: d.title_verified ? "Title marked verified" : "Title verification removed" }),
  "plot.dgps_exported": () => ({ title: "DGPS coordinates exported" }),

  "allocation.allocated": () => ({ title: "Plot allocated to buyer" }),
  "allocation.released": () => ({ title: "Allocation released" }),
  "allocation.reservation_protected_by_payment": () => ({ title: "Reservation protected by a payment" }),
  "allocation.payment_reminder_sent": (d) => ({ title: "Payment reminder sent", detail: [d.channel, d.method].filter(Boolean).map(titleCaseStatus).join(" - ") || undefined }),

  "customer.created": (d) => ({ title: "Customer added", detail: d.name || undefined }),
  "customer.sms_sent": (d) => ({ title: "SMS sent to customers", detail: d.sent != null ? `${d.sent} sent` : undefined }),
  "customer.whatsapp_chat_started": () => ({ title: "WhatsApp chat started with customer" }),
  "customer.whatsapp_message_sent": () => ({ title: "WhatsApp message sent to customer" }),
  "customer.whatsapp_message_failed": () => ({ title: "WhatsApp message to customer failed" }),

  "payment.recorded": (d) => ({ title: "Payment recorded", detail: d.amount != null ? naira(d.amount) : undefined }),
  "payment.confirmed": () => ({ title: "Payment confirmed" }),
  "payment.voided": (d) => ({ title: "Payment voided", detail: d.reason || undefined }),
  "payment.evidence_uploaded": () => ({ title: "Payment evidence uploaded" }),
  "payment.evidence_downloaded": () => ({ title: "Payment evidence downloaded" }),
  "payment.receipt_downloaded": () => ({ title: "Payment receipt downloaded" }),

  "commission.paid": (d) => ({ title: "Commission paid to agent", detail: d.amount != null ? naira(d.amount) : undefined }),

  "document.uploaded": () => ({ title: "Document uploaded" }),
  "document.downloaded": () => ({ title: "Document downloaded" }),

  "survey_request.created": () => ({ title: "Survey request created" }),
  "survey_request.assigned": () => ({ title: "Survey request assigned" }),
  "survey_request.started": () => ({ title: "Survey started" }),
  "survey_request.completed": () => ({ title: "Survey completed" }),
  "survey_request.cancelled": () => ({ title: "Survey request cancelled" }),

  "staking_task.created": () => ({ title: "Staking task created" }),
  "staking_task.started": () => ({ title: "Staking started" }),
  "staking_task.completed": () => ({ title: "Staking completed" }),
  "staking_task.dgps_exported": () => ({ title: "Staking DGPS coordinates exported" }),

  "hazard.assessment_completed": () => ({ title: "Hazard screening completed" }),
  "soil_analysis.completed": () => ({ title: "Soil analysis completed" }),
  "soil_analysis.geotech_survey_requested": () => ({ title: "Geotechnical survey requested" }),

  "progress_update.created": (d) => ({ title: "Site update posted", detail: d.kind ? titleCaseStatus(d.kind) : undefined }),
  "progress_update.updated": () => ({ title: "Site update edited" }),
  "progress_update.deleted": () => ({ title: "Site update deleted" }),

  "approval_milestone.created": (d) => ({ title: "Approval milestone added", detail: d.milestone_type ? titleCaseStatus(d.milestone_type) : undefined }),
  "approval_milestone.updated": (d) => ({ title: "Approval milestone updated", detail: d.status ? titleCaseStatus(d.status) : undefined }),
  "approval_milestone.deleted": () => ({ title: "Approval milestone removed" }),

  "live_inspection.created": () => ({ title: "Live video inspection scheduled" }),
  "live_inspection.requested": () => ({ title: "Buyer requested a live video inspection" }),
  "live_inspection.time_approved": () => ({ title: "Live inspection time confirmed" }),
  "live_inspection.started": () => ({ title: "Live inspection started" }),
  "live_inspection.ended": () => ({ title: "Live inspection ended" }),
  "live_inspection.cancelled": () => ({ title: "Live inspection cancelled" }),
  "live_inspection.reschedule_requested": () => ({ title: "Buyer asked to reschedule the live inspection" }),
};

export function describePlotEvent(event: PlotHistoryEvent): { title: string; detail?: string } {
  const template = TEMPLATES[event.action];
  if (template) return template(event.details || {});
  return { title: titleCaseStatus(event.action) };
}
