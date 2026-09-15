// Minimal inline icon set for the Estates dashboard - plain stroke SVGs, no icon library
// dependency, mirroring the convention already used by CadIcon.tsx for the Survey CAD editor.
export type EstateIconName =
  | "dashboard"
  | "map"
  | "plots"
  | "customers"
  | "payments"
  | "survey"
  | "staking"
  | "documents"
  | "development"
  | "hazard"
  | "reports"
  | "audit"
  | "settings"
  | "help"
  | "search"
  | "bell"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "plus"
  | "pin"
  | "layers"
  | "satellite"
  | "zoom-in"
  | "zoom-out"
  | "locate"
  | "expand"
  | "filter"
  | "house"
  | "person"
  | "clock"
  | "compass"
  | "phone"
  | "mail"
  | "download"
  | "upload"
  | "check-circle"
  | "alert-triangle"
  | "flood"
  | "erosion"
  | "shield"
  | "grid"
  | "menu"
  | "image"
  | "wallet"
  | "activity"
  | "chart-donut"
  | "lock"
  | "draw"
  | "trash";

export default function EstateIcon({ name, className = "" }: { name: EstateIconName; className?: string }) {
  switch (name) {
    case "dashboard":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" /><rect x="13" y="3.5" width="7.5" height="4.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" /><rect x="13" y="10.5" width="7.5" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.6" /><rect x="3.5" y="13.5" width="7.5" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.6" /></svg>;
    case "map":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13l-5.5 2-6-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M9 4.5v13M15 6.5v13" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "plots":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" stroke="currentColor" strokeWidth="1.5" /><rect x="13.5" y="3.5" width="7" height="7" stroke="currentColor" strokeWidth="1.5" /><rect x="3.5" y="13.5" width="7" height="7" stroke="currentColor" strokeWidth="1.5" /><rect x="13.5" y="13.5" width="7" height="7" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "customers":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.5" /><path d="M3.5 19.5c.6-3.4 2.9-5.3 5.5-5.3s4.9 1.9 5.5 5.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="17" cy="7.5" r="2.4" stroke="currentColor" strokeWidth="1.4" /><path d="M15.2 14.6c1.9.2 3.6 1.7 4.1 4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
    case "payments":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 6h9.5a2.5 2.5 0 0 1 2.5 2.5v.5H4v-.5A2.5 2.5 0 0 1 6.5 6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M4 9h14.5v7a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 16V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M4 12.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "survey":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" /><path d="m14.6 9.4-2.1 5.3-5.3 2.1 2.1-5.3 5.3-2.1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
    case "staking":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-10.8A6.5 6.5 0 0 1 12 3.5a6.5 6.5 0 0 1 6.5 6.7C18.5 15.4 12 21 12 21Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case "documents":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h7l4 4v13H7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M14 3.5v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M9.5 12h5M9.5 15.3h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
    case "development":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20.5V10l8-6 8 6v10.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M9 20.5v-6h6v6" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "hazard":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 21 19.5H3L12 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="16.6" r="1" fill="currentColor" /></svg>;
    case "reports":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="1.6" stroke="currentColor" strokeWidth="1.5" /><path d="M8 13.5v3M12 10.5v6M16 8v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "audit":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" /><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "settings":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.5" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
    case "help":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" /><path d="M9.6 9.3a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1 .8-1 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="12" cy="16.6" r="1" fill="currentColor" /></svg>;
    case "search":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.2" stroke="currentColor" strokeWidth="1.6" /><path d="m19.5 19.5-4.3-4.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "bell":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 10.5a6 6 0 1 1 12 0c0 4 1.5 5.3 1.5 5.3H4.5S6 14.5 6 10.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M9.7 18.8a2.4 2.4 0 0 0 4.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "chevron-down":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "chevron-left":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "chevron-right":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "close":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5.5 5.5 13 13M18.5 5.5l-13 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "plus":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "pin":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s6.5-5.9 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.1 6.5 11 6.5 11Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case "layers":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3.5 8 4.3-8 4.3-8-4.3 8-4.3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m4 12 8 4.3 8-4.3M4 16 12 20.3 20 16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case "satellite":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9.3" y="9.3" width="5.4" height="5.4" rx="1" transform="rotate(45 12 12)" stroke="currentColor" strokeWidth="1.5" /><path d="m6.2 6.2-2.1-2.1M17.8 17.8l2.1 2.1M4.5 15.5l-1.5 1.5M19.5 8.5l1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "zoom-in":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="M20 20 15.2 15.2M10.5 7.5v6M7.5 10.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "zoom-out":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="M20 20 15.2 15.2M7.5 10.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "locate":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.5" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "expand":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "filter":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16l-6 7.5v5.5l-4 2v-7.5L4 5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case "house":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 10v9.5h12V10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 19.5v-6h4v6" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "person":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.3" stroke="currentColor" strokeWidth="1.6" /><path d="M5 20c.7-4 3.3-6.2 7-6.2S18.3 16 19 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "clock":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" /><path d="M12 7.5V12l3.2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "compass":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" /><path d="m14.6 9.4-2.1 5.3-5.3 2.1 2.1-5.3 5.3-2.1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "phone":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.2 4.5h3l1.4 3.8-2 1.6a10.8 10.8 0 0 0 5.5 5.5l1.6-2 3.8 1.4v3a1.5 1.5 0 0 1-1.6 1.5A15.3 15.3 0 0 1 4.7 6.1a1.5 1.5 0 0 1 1.5-1.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
    case "mail":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="1.8" stroke="currentColor" strokeWidth="1.5" /><path d="m4.5 6.5 7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case "download":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M4.5 16v3a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "upload":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M4.5 14.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "check-circle":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" /><path d="m8.3 12.3 2.5 2.5 5-5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "alert-triangle":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 21 19.5H3L12 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="16.6" r="1" fill="currentColor" /></svg>;
    case "flood":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 9c2 0 2 2.2 4 2.2S8.5 9 10.5 9s2 2.2 4 2.2S16.5 9 18.5 9s2 2.2 3 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M2.5 15.5c2 0 2 2.2 4 2.2s2-2.2 4-2.2 2 2.2 4 2.2 2-2.2 4-2.2 2 2.2 3 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "erosion":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 18.5c4-8 6-11 9-13 3 2 5 5 9 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 18.5h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "shield":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 19 6v6c0 5-3 7.7-7 8.5-4-.8-7-3.5-7-8.5V6l7-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m9 12 2 2 4-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "grid":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "menu":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "lock":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="11" width="13" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="12" cy="15.2" r="1.3" fill="currentColor" /></svg>;
    case "draw":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 18.5 6.2 13 15 4.2a1.8 1.8 0 0 1 2.6 0l1.2 1.2a1.8 1.8 0 0 1 0 2.6L10 17l-5.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="m13.3 6 3.7 3.7" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case "trash":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 7v12.3A1.7 1.7 0 0 0 8.7 21h6.6a1.7 1.7 0 0 0 1.7-1.7V7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M10.2 11v6M13.8 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "image":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.8" stroke="currentColor" strokeWidth="1.5" /><circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.3" /><path d="m5.5 17.5 4.5-5 3.5 3.8 2.5-2.8 3 4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
    case "wallet":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="6.5" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M3.5 10.5h17" stroke="currentColor" strokeWidth="1.5" /><circle cx="16.5" cy="14.3" r="1.1" fill="currentColor" /></svg>;
    case "activity":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 12h4l2-6 4 12 2-6h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "chart-donut":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.5" /></svg>;
    default:
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" /></svg>;
  }
}
