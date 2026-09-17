export default function SponsorTreeShowcase() {
  const openProjects = () => {
    document.getElementById("gps-projects")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="lp-sponsor-section">
      <div className="lp-sponsor-inner">
        <div className="lp-sponsor-text">
          <span className="lp-sponsor-eyebrow">LANDCHECK GREEN</span>
          <h1>
            Sponsor a Tree.<br />
            Track Its Journey.
          </h1>
          <p>
            Support verified tree planting projects and monitor your environmental impact
            through GPS tracking, photo updates, maintenance records, and carbon reporting.
          </p>
          <ul className="lp-sponsor-bullets">
            <li className="lp-sponsor-bullet">
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5" />
                <path d="M8 12l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <strong>GPS Tracking</strong>
                <span>Know exactly where your trees are planted on the map</span>
              </div>
            </li>
            <li className="lp-sponsor-bullet">
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5" />
                <path d="M8 12l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <strong>Photo Updates</strong>
                <span>See photo evidence as your tree grows over time</span>
              </div>
            </li>
            <li className="lp-sponsor-bullet">
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5" />
                <path d="M8 12l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <strong>Maintenance Records</strong>
                <span>Track watering, pruning, and full care history</span>
              </div>
            </li>
            <li className="lp-sponsor-bullet">
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5" />
                <path d="M8 12l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <strong>Carbon Reporting</strong>
                <span>Measure your CO2 offset with verified impact data</span>
              </div>
            </li>
          </ul>
          <div className="lp-sponsor-ctas">
            <button type="button" className="lp-sponsor-btn-primary" onClick={openProjects}>
              Sponsor a Tree
            </button>
            <a
              href="https://play.google.com/store/apps/details?id=online.landcheck.mobile"
              target="_blank"
              rel="noopener noreferrer"
              className="lp-sponsor-playstore"
            >
              <svg viewBox="0 0 24 28" width="20" height="24" fill="none" aria-hidden="true">
                <path d="M1.5 0.8L13.8 13 1.5 25.2V0.8z" fill="#34A853" />
                <path d="M1.5 0.8L13.8 13 20.5 6.5 5.2 0z" fill="#4285F4" />
                <path d="M1.5 25.2L13.8 13 20.5 19.5 5.2 26z" fill="#FBBC05" />
                <path d="M20.5 6.5L13.8 13l6.7 6.5 2.5-6.5-2.5-6.5z" fill="#EA4335" />
              </svg>
              <div className="lp-sponsor-playstore-text">
                <small>Get it on</small>
                <strong>Google Play</strong>
              </div>
            </a>
          </div>
        </div>
        <div className="lp-sponsor-visual">
          <div className="lp-sponsor-phone-wrap">
            <div className="lp-sponsor-phone-frame">
              <div className="lp-sponsor-phone-screen">
                <img
                  src="/sponsor-tree-app.jpeg"
                  alt="LandCheck Green - Sponsor a Tree app screenshot"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  width="280"
                  height="560"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
