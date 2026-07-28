type GreenWorkMerchantsPanelProps = {
  publicSponsorshipProject: any;
  revealedMerchantCredentials: any;
  setRevealedMerchantCredentials: (value: any) => void;
  newMerchantOrgName: string;
  setNewMerchantOrgName: (value: string) => void;
  newMerchantContactName: string;
  setNewMerchantContactName: (value: string) => void;
  newMerchantContactEmail: string;
  setNewMerchantContactEmail: (value: string) => void;
  newMerchantContactPhone: string;
  setNewMerchantContactPhone: (value: string) => void;
  newMerchantProjectId: string;
  setNewMerchantProjectId: (value: string) => void;
  projects: any[];
  isPublicSponsorshipProject: (accessModel: any, publicSponsorEnabled: any) => boolean;
  newMerchantPrice: string;
  setNewMerchantPrice: (value: string) => void;
  createMerchant: () => void | Promise<void>;
  creatingMerchant: boolean;
  merchantsError: string | null;
  merchantsLoading: boolean;
  merchants: any[];
  expandedMerchantId: number | null;
  setExpandedMerchantId: (value: number | null) => void;
  setMerchantDetail: (value: any) => void;
  loadMerchantDetail: (merchantId: number) => void | Promise<void>;
  rotatingMerchantKeyId: number | null;
  rotateMerchantKey: (merchantId: number) => void | Promise<void>;
  rotatingMerchantWebhookSecretId: number | null;
  rotateMerchantWebhookSecret: (merchantId: number) => void | Promise<void>;
  sendMerchantLoginInvite: (email: string) => void | Promise<void>;
  merchantDetailLoading: boolean;
  merchantDetail: any;
  merchantWebhookEvents: any[];
  formatCurrencyAmount: (amount: number | null | undefined, currency?: string | null) => string;
  formatDateLabel: (value: string | null | undefined) => string;
};

export default function GreenWorkMerchantsPanel({
  publicSponsorshipProject,
  revealedMerchantCredentials,
  setRevealedMerchantCredentials,
  newMerchantOrgName,
  setNewMerchantOrgName,
  newMerchantContactName,
  setNewMerchantContactName,
  newMerchantContactEmail,
  setNewMerchantContactEmail,
  newMerchantContactPhone,
  setNewMerchantContactPhone,
  newMerchantProjectId,
  setNewMerchantProjectId,
  projects,
  isPublicSponsorshipProject,
  newMerchantPrice,
  setNewMerchantPrice,
  createMerchant,
  creatingMerchant,
  merchantsError,
  merchantsLoading,
  merchants,
  expandedMerchantId,
  setExpandedMerchantId,
  setMerchantDetail,
  loadMerchantDetail,
  rotatingMerchantKeyId,
  rotateMerchantKey,
  rotatingMerchantWebhookSecretId,
  rotateMerchantWebhookSecret,
  sendMerchantLoginInvite,
  merchantDetailLoading,
  merchantDetail,
  merchantWebhookEvents,
  formatCurrencyAmount,
  formatDateLabel,
}: GreenWorkMerchantsPanelProps) {
  return (
    <div className="green-work-card">
      <h3>Merchant Integrations</h3>
      <p className="green-work-note">
        Merchants sponsor trees automatically for their own customers via API or webhook - no manual order entry.
        Provision a merchant here to get an API key and (for Shopify) a webhook URL; their integration then creates
        sponsorship orders on its own, and shows up below for monitoring.
      </p>
      {!publicSponsorshipProject ? (
        <p className="green-work-note">Switch this project to the Public Sponsorship access route first.</p>
      ) : (
        <>
          {revealedMerchantCredentials ? (
            <div className="green-work-card" style={{ marginBottom: 16, borderColor: "#c5a059" }}>
              <h4 style={{ marginTop: 0 }}>Save these credentials now - they won't be shown again</h4>
              {revealedMerchantCredentials.api_key ? (
                <p className="green-work-note" style={{ wordBreak: "break-all" }}>
                  <strong>API key:</strong> {revealedMerchantCredentials.api_key}
                </p>
              ) : null}
              {revealedMerchantCredentials.webhook_secret ? (
                <p className="green-work-note" style={{ wordBreak: "break-all" }}>
                  <strong>Webhook secret:</strong> {revealedMerchantCredentials.webhook_secret}
                </p>
              ) : null}
              {revealedMerchantCredentials.webhook_url_shopify ? (
                <p className="green-work-note" style={{ wordBreak: "break-all" }}>
                  <strong>Shopify webhook URL:</strong> {revealedMerchantCredentials.webhook_url_shopify}
                </p>
              ) : null}
              <button type="button" onClick={() => setRevealedMerchantCredentials(null)}>
                I've saved this - dismiss
              </button>
            </div>
          ) : null}

          <div className="green-work-card" style={{ marginBottom: 16 }}>
            <h4 style={{ marginTop: 0 }}>Add Merchant</h4>
            <div className="work-actions" style={{ flexWrap: "wrap", gap: 8 }}>
              <input
                placeholder="Organization name (e.g. Kyalli)"
                value={newMerchantOrgName}
                onChange={(e) => setNewMerchantOrgName(e.target.value)}
              />
              <input
                placeholder="Contact name"
                value={newMerchantContactName}
                onChange={(e) => setNewMerchantContactName(e.target.value)}
              />
              <input
                placeholder="Contact email"
                value={newMerchantContactEmail}
                onChange={(e) => setNewMerchantContactEmail(e.target.value)}
              />
              <input
                placeholder="Contact phone (optional)"
                value={newMerchantContactPhone}
                onChange={(e) => setNewMerchantContactPhone(e.target.value)}
              />
              <select value={newMerchantProjectId} onChange={(e) => setNewMerchantProjectId(e.target.value)}>
                <option value="">Default project...</option>
                {projects
                  .filter((p) => isPublicSponsorshipProject(p.access_model, p.public_sponsor_enabled))
                  .map((p) => (
                    <option key={`merchant-project-${p.id}`} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <input
                placeholder="Agreed price/tree (optional, overrides public price)"
                value={newMerchantPrice}
                onChange={(e) => setNewMerchantPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              />
              <button type="button" onClick={() => void createMerchant()} disabled={creatingMerchant}>
                {creatingMerchant ? "Creating..." : "Add Merchant"}
              </button>
            </div>
          </div>

          {merchantsError ? <p className="green-work-note danger">{merchantsError}</p> : null}
          {merchantsLoading ? (
            <p className="green-work-note">Loading merchants...</p>
          ) : merchants.length === 0 ? (
            <p className="green-work-note">No merchants provisioned yet.</p>
          ) : (
            <div className="staff-list">
              {merchants.map((merchant) => {
                const expanded = expandedMerchantId === merchant.id;
                return (
                  <div key={`merchant-${merchant.id}`} className="staff-row">
                    <div className="staff-row-head">
                      <strong>{merchant.organization_name || "Merchant"}</strong>
                      <span>{merchant.sponsor_uid || "-"}</span>
                    </div>
                    <div className="work-actions" style={{ margin: "8px 0 6px", flexWrap: "wrap" }}>
                      <span className="green-work-live-pill neutral">Orders: {merchant.order_count ?? 0}</span>
                      <span className="green-work-live-pill ok">Trees: {merchant.tree_count ?? 0}</span>
                      <span className="green-work-live-pill info">Planted: {merchant.linked_count ?? 0}</span>
                      <span className={`green-work-live-pill ${merchant.is_active ? "ok" : "danger"}`}>
                        {merchant.is_active ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <div className="staff-row-meta">
                      Contact: {merchant.contact_name || "-"} | {merchant.contact_email || "-"}
                      {merchant.contact_phone ? ` | ${merchant.contact_phone}` : ""}
                    </div>
                    <div className="staff-row-meta">
                      Agreed price/tree:{" "}
                      {merchant.agreed_price_per_tree != null
                        ? formatCurrencyAmount(merchant.agreed_price_per_tree, "NGN")
                        : "Public project price"}
                    </div>
                    <div className="work-actions" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (expanded) {
                            setExpandedMerchantId(null);
                            setMerchantDetail(null);
                            return;
                          }
                          setExpandedMerchantId(merchant.id);
                          void loadMerchantDetail(merchant.id);
                        }}
                      >
                        {expanded ? "Hide details" : "View orders & webhook log"}
                      </button>
                      <button
                        type="button"
                        disabled={rotatingMerchantKeyId === merchant.id}
                        onClick={() => void rotateMerchantKey(merchant.id)}
                      >
                        {rotatingMerchantKeyId === merchant.id ? "Rotating..." : "Rotate API Key"}
                      </button>
                      <button
                        type="button"
                        disabled={rotatingMerchantWebhookSecretId === merchant.id}
                        onClick={() => void rotateMerchantWebhookSecret(merchant.id)}
                      >
                        {rotatingMerchantWebhookSecretId === merchant.id ? "Regenerating..." : "Regenerate Webhook Secret"}
                      </button>
                      <button type="button" onClick={() => void sendMerchantLoginInvite(merchant.contact_email)}>
                        Send Login Invite
                      </button>
                    </div>
                    <div className="staff-row-meta">
                      Merchant dashboard: they log in at /green/login with their contact email - "Send Login Invite"
                      emails them a link to set their password the first time.
                    </div>
                    {expanded ? (
                      merchantDetailLoading ? (
                        <p className="green-work-note">Loading details...</p>
                      ) : merchantDetail ? (
                        <div style={{ marginTop: 10 }}>
                          {merchantDetail.webhook_url_shopify ? (
                            <p className="green-work-note" style={{ wordBreak: "break-all" }}>
                              Shopify webhook URL: {merchantDetail.webhook_url_shopify}
                            </p>
                          ) : null}
                          <strong>Recent orders</strong>
                          {!merchantDetail.orders || merchantDetail.orders.length === 0 ? (
                            <p className="green-work-note">No orders yet - nothing has called the API/webhook for this merchant.</p>
                          ) : (
                            <div className="staff-list">
                              {merchantDetail.orders.map((order: any) => (
                                <div key={`merchant-order-${order.id}`} className="staff-row-meta">
                                  {order.order_uid} | Ext: {order.external_order_id || "-"} | Source: {order.source || "-"} |
                                  Qty: {order.quantity} | {formatCurrencyAmount(order.amount_total || 0, order.currency || "NGN")} |
                                  Status: {order.order_status} | Planted: {order.linked_count ?? 0}/{order.quantity} |{" "}
                                  {order.created_at ? formatDateLabel(order.created_at) : "-"}
                                </div>
                              ))}
                            </div>
                          )}
                          <strong style={{ display: "block", marginTop: 10 }}>Recent webhook events</strong>
                          {merchantWebhookEvents.length === 0 ? (
                            <p className="green-work-note">No webhook deliveries recorded yet.</p>
                          ) : (
                            <div className="staff-list">
                              {merchantWebhookEvents.map((event: any) => (
                                <div key={`merchant-webhook-event-${event.id}`} className="staff-row-meta">
                                  {event.platform} | {event.status}
                                  {event.error_message ? ` | Error: ${event.error_message}` : ""} |{" "}
                                  {event.created_at ? formatDateLabel(event.created_at) : "-"}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
