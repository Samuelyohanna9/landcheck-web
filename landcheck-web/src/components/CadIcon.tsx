// Minimal inline icon set for the Feature CAD Editor's compact toolbar.
// Plain stroke-based SVGs (no icon library dependency), following the same
// convention as GpsIcon.tsx elsewhere in the app.
export type CadIconName =
  | "select"
  | "box-select"
  | "lasso"
  | "line"
  | "polygon"
  | "wand"
  | "fit"
  | "zoom-in"
  | "zoom-out"
  | "clear"
  | "add"
  | "modify"
  | "delete"
  | "satellite"
  | "grid"
  | "layers"
  | "inspector"
  | "table"
  | "info"
  | "close"
  | "cad"
  | "undo"
  | "redo"
  | "preview"
  | "export"
  | "duplicate"
  | "measure"
  | "boundary"
  | "road"
  | "river"
  | "fence"
  | "building"
  | "point"
  | "text"
  | "dimension";

export default function CadIcon({ name, className = "" }: { name: CadIconName; className?: string }) {
  switch (name) {
    case "select":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3.5 19 10l-6.2 1.8L10.8 18 5 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg>;
    case "box-select":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3.2 2.6" /></svg>;
    case "lasso":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5c4.5 0 7.5 2.4 7.5 5.6 0 3-2.7 5.2-6.5 5.6-2.4.2-3.4 1-3.4 2 0 .9.8 1.5 1.9 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.6 2.4" /><circle cx="8.5" cy="19" r="1.7" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "line":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 19.5 19.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="4.5" cy="19.5" r="1.8" fill="currentColor" /><circle cx="19.5" cy="4.5" r="1.8" fill="currentColor" /></svg>;
    case "polygon":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3.5 8 5.8-3 9.2H7l-3-9.2 8-5.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
    case "wand":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 19 9-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M14.5 4.5v2.4M19.1 9v2.4M11.7 7.3h-2.4M21.4 7.3H19M17.6 4.5l-1.5 1.7M17.6 11.7l-1.5-1.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
    case "fit":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "zoom-in":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="M20 20 15.2 15.2M10.5 7.5v6M7.5 10.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "zoom-out":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="M20 20 15.2 15.2M7.5 10.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "clear":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 11 6-6 6.5 6.5-6 6H9L4.5 13l2.5-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M9 17H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "add":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12 8.3v7.4M8.3 12h7.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "modify":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14.3 4.7 5 5L8.5 20.5l-5.3 1 1-5.3L14.3 4.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m12.2 6.8 5 5" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "delete":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M7.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "satellite":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9.3" y="9.3" width="5.4" height="5.4" rx="1" transform="rotate(45 12 12)" stroke="currentColor" strokeWidth="1.5" /><path d="m6.2 6.2-2.1-2.1M17.8 17.8l2.1 2.1M4.5 15.5l-1.5 1.5M19.5 8.5l1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M12 15.5 8.5 19a2 2 0 1 1-2.8-2.8L9 12.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "grid":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "layers":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3.5 8 4.3-8 4.3-8-4.3 8-4.3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m4 12 8 4.3 8-4.3M4 16 12 20.3 20 16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case "inspector":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h9M4 12h5M4 18h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="16.5" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.4" /><circle cx="11.5" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.4" /><circle cx="14.5" cy="18" r="1.8" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case "table":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.4" stroke="currentColor" strokeWidth="1.5" /><path d="M3.5 9.5h17M9.3 4.5v15M15 4.5v15" stroke="currentColor" strokeWidth="1.3" /></svg>;
    case "info":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12 11v5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="8.1" r="1.05" fill="currentColor" /></svg>;
    case "close":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5.5 5.5 13 13M18.5 5.5l-13 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "cad":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 15.5v-7l4 5.5 4-5.5v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "undo":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 8H5V4M5 8c1.8-2.2 4.4-3.5 7.3-3.5A8.5 8.5 0 1 1 4.2 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "redo":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 8h2V4M19 8c-1.8-2.2-4.4-3.5-7.3-3.5A8.5 8.5 0 1 0 19.8 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "preview":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "export":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M4.5 14.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "duplicate":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.5" /><path d="M15.5 5.5h-9a1 1 0 0 0-1 1v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "measure":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="9" width="18" height="6" rx="1" transform="rotate(-20 12 12)" stroke="currentColor" strokeWidth="1.5" /><path d="m8.3 10.6.7 1.6M11.6 9.3l.7 1.6M14.9 8l.7 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
    case "boundary":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8 12 4l8 4-2 8H6L4 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="3 2.2" /></svg>;
    case "road":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 3.5 5 20.5M15 3.5l4 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M12 5v2.4M12 10.4v2.4M12 15.8v2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "river":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 8c2 0 2 2.2 4 2.2S8.5 8 10.5 8s2 2.2 4 2.2S16.5 8 18.5 8s2 2.2 3 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M2.5 14.5c2 0 2 2.2 4 2.2s2-2.2 4-2.2 2 2.2 4 2.2 2-2.2 4-2.2 2 2.2 3 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "fence":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3.5v17M12 3.5v17M18 3.5v17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M3 8.5h18M3 14.5h18" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case "building":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="8.5" width="14" height="12" stroke="currentColor" strokeWidth="1.5" /><path d="M9 20.5v-4h6v4" stroke="currentColor" strokeWidth="1.5" /><path d="M9 12h1.4M13.6 12H15M9 15.3h1.4M13.6 15.3H15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
    case "point":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.4 2.2" /><circle cx="12" cy="12" r="2.1" fill="currentColor" /></svg>;
    case "text":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 6h14M12 6v13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "dimension":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8v3M20 8v3M4 9.5h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="m5 16 3-3M8 16l3-3M11 16l3-3M14 16l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
    default:
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" /></svg>;
  }
}
