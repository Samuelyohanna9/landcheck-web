// Shared professional icon set for the public sponsorship funnel
// (GreenPublicSponsor + GreenFootprintCalculator) — plain inline SVGs, no emoji.
export default function GpsIcon({ name, className = "" }: { name: string; className?: string }) {
  switch (name) {
    case "tree":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 6.5 11h3L5 19h6v3h2v-3h6l-4.5-8h3L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
    case "certificate":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4" width="17" height="12.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" /><path d="M7 8h10M7 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="9.5" cy="19.5" r="1.6" stroke="currentColor" strokeWidth="1.4" /><path d="m8.3 19.9-1.1 2.6 2.3-1 2.3 1-1.1-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "tag":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.6 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.6c0 .4.16.78.44 1.06l8.9 8.9a1.5 1.5 0 0 0 2.12 0l6.6-6.6a1.5 1.5 0 0 0 0-2.12l-8.9-8.9a1.5 1.5 0 0 0-1.06-.44Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="8.3" cy="8.3" r="1.4" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case "lock":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" /><path d="M7.8 10.5V7.8a4.2 4.2 0 1 1 8.4 0v2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="15" r="1.5" fill="currentColor" /></svg>;
    case "pin":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-6.3 7-11.6A7 7 0 0 0 5 9.4C5 14.7 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="12" cy="9.3" r="2.4" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "package":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.5 7.5 8.5-4 8.5 4-8.5 4-8.5-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M3.5 7.5v9l8.5 4 8.5-4v-9M12 11.5V20.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
    case "check-circle":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="m8.3 12.3 2.4 2.4 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "hourglass":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 4 3 5.6 4.5 6.5-1.5.9-4.5 2.5-4.5 6.5M16.5 3.5c0 4-3 5.6-4.5 6.5 1.5.9 4.5 2.5 4.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "alert":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4 3 20h18L12 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 10.5v4M12 17.2v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
    case "sparkle":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 1.7 4.8L18.5 9l-4.8 1.7L12 15.5l-1.7-4.8L5.5 9l4.8-1.7L12 3ZM19 15l.9 2.5L22.5 18l-2.6.9L19 21.5l-.9-2.6-2.6-.9 2.6-.9L19 15Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
    case "search":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "user":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.8" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "menu":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "close":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5.5 5.5 13 13M18.5 5.5l-13 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "leaf":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 5C12 5 7 9 5 15c2.5 1.5 5.6 1.8 8.3.6 2.8-1.2 4.9-3.8 5.7-7.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 16c2-3 5-5.3 9-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "calculator":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M7.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8.2" cy="11.2" r="0.9" fill="currentColor" /><circle cx="12" cy="11.2" r="0.9" fill="currentColor" /><circle cx="15.8" cy="11.2" r="0.9" fill="currentColor" /><circle cx="8.2" cy="14.6" r="0.9" fill="currentColor" /><circle cx="12" cy="14.6" r="0.9" fill="currentColor" /><circle cx="15.8" cy="14.6" r="0.9" fill="currentColor" /><circle cx="8.2" cy="18" r="0.9" fill="currentColor" /><circle cx="12" cy="18" r="0.9" fill="currentColor" /><circle cx="15.8" cy="18" r="0.9" fill="currentColor" /></svg>;
    case "car":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 16v-3.2c0-.5.2-.9.55-1.25l1.7-1.7c.3-.3.7-.45 1.1-.45h9.3c.4 0 .8.15 1.1.45l1.7 1.7c.35.35.55.8.55 1.25V16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><rect x="3" y="16" width="18" height="3.2" rx="1.2" stroke="currentColor" strokeWidth="1.6" /><circle cx="7.2" cy="19.2" r="1.4" stroke="currentColor" strokeWidth="1.4" /><circle cx="16.8" cy="19.2" r="1.4" stroke="currentColor" strokeWidth="1.4" /><path d="M6 12.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "plane":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13.5 3.5c.7 0 1.3.6 1.3 1.3v5.1l6 3.6v2l-6-1.9v4.4l2 1.5v1.6l-3.8-1.2-3.8 1.2v-1.6l2-1.5v-4.4l-6 1.9v-2l6-3.6V4.8c0-.7.6-1.3 1.3-1.3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" /></svg>;
    case "bolt":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 3 5.5 13.5h5L10 21l8-11h-5.2L13 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
    case "meal":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5v6.2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3.5M8.5 11.7V20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M16.5 3.5c-1.4 0-2.5 1.7-2.5 4.6 0 2.2 1 3.4 2 3.9v8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "chart":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M3 20.5h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "refresh":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12a7 7 0 0 1 12-4.9L19 9M19 4v5h-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M19 12a7 7 0 0 1-12 4.9L5 15M5 20v-5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "arrow-left":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "arrow-right":
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    default:
      return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" /></svg>;
  }
}
