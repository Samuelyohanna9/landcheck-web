import "../styles/social-links.css";

const SOCIAL_LINKS = [
  {
    key: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/land.check/",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/landcheck/",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M14.4 22v-8.6h2.9l.4-3.4h-3.3V7.8c0-1 .3-1.6 1.7-1.6h1.8V3.1c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2.5H8v3.4h2.9V22h3.5Z" />
      </svg>
    ),
  },
  {
    key: "youtube",
    label: "YouTube",
    href: "https://www.youtube.com/@LandCheckGreen",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
        <path d="M10.3 9.3v5.4l4.8-2.7-4.8-2.7Z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@landcheckgeo",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.6 2c.4 2.4 1.9 4 4.4 4.2v3.1c-1.5.1-2.9-.4-4.1-1.3v6.4c0 3.4-2.8 6.2-6.2 6.2S4.5 17.8 4.5 14.4c0-3.3 2.6-6 5.9-6.2v3.2c-1.6.2-2.8 1.5-2.8 3 0 1.7 1.4 3.1 3.1 3.1s3.1-1.4 3.1-3.1V2h2.8Z" />
      </svg>
    ),
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/landcheck-geospatial/",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="2.5" y="2.5" width="19" height="19" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="7.2" cy="8" r="1.35" />
        <path d="M6.1 10.6h2.2V18H6.1v-7.4Z" />
        <path d="M10.6 10.6h2.1v1c.5-.7 1.3-1.2 2.4-1.2 1.9 0 3 1.2 3 3.5V18h-2.2v-3.7c0-1.1-.4-1.8-1.4-1.8-.8 0-1.3.5-1.5 1.1-.1.2-.1.5-.1.8V18h-2.2v-7.4Z" />
      </svg>
    ),
  },
] as const;

export default function SocialLinks({ className }: { className?: string }) {
  return (
    <div className={`social-links${className ? ` ${className}` : ""}`}>
      {SOCIAL_LINKS.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="social-links-icon"
          aria-label={`LandCheck on ${item.label}`}
          title={item.label}
        >
          {item.icon}
        </a>
      ))}
    </div>
  );
}
