import { useNavigate } from "react-router-dom";
import "../styles/inner-pages.css";
import "../styles/news.css";
import NavBar from "../components/NavBar";

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "LandCheck Signs Strategic Partnership MoU with Environmental Care Foundation",
  "datePublished": "2026-05-15",
  "dateModified": "2026-05-15",
  "author": {
    "@type": "Organization",
    "name": "LandCheck Geospatial Technologies Limited",
    "url": "https://landcheck.online/"
  },
  "publisher": {
    "@type": "Organization",
    "name": "LandCheck Geospatial Technologies Limited",
    "logo": {
      "@type": "ImageObject",
      "url": "https://landcheck.online/green-logo-cropped-820.png"
    }
  },
  "image": {
    "@type": "ImageObject",
    "url": "https://landcheck.online/ecf-partnership.jpeg",
    "description": "LandCheck and ECF representatives at partnership event, Adamawa State"
  },
  "url": "https://landcheck.online/news",
  "description": "LandCheck Geospatial Technologies and the Environmental Care Foundation (ECF) have formalised a strategic partnership to expand the reach of LandCheck Green across environmental and humanitarian programmes in Nigeria.",
  "about": {
    "@type": "Thing",
    "name": "LandCheck Green — Tree Monitoring and Environmental Programs"
  }
};

export default function NewsPage() {
  const navigate = useNavigate();

  return (
    <div className="ip-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_SCHEMA) }}
      />
      <NavBar activeRoute="/news" />

      <main>
        <section className="np-page-header">
          <div className="ip-container">
            <h1>News</h1>
            <p>Updates from LandCheck Geospatial Technologies</p>
          </div>
        </section>

        <div className="np-articles-wrap">
          <div className="ip-container">
            <article className="np-article">
              <div className="np-article-meta">
                <span className="np-tag">Partnership</span>
                <time dateTime="2026-05-15">May 2026</time>
              </div>

              <h2>
                LandCheck Signs Strategic Partnership MoU with Environmental Care Foundation
              </h2>
              <p className="np-lead">
                LandCheck Geospatial Technologies and the Environmental Care Foundation (ECF)
                have formalised a strategic partnership to expand the reach of LandCheck Green
                across environmental and humanitarian programmes in Nigeria.
              </p>

              <figure className="np-figure">
                <img
                  src="/ecf-partnership.jpeg"
                  alt="LandCheck and ECF representatives at partnership event, Adamawa State"
                  loading="lazy"
                  width="800"
                  height="480"
                />
                <figcaption>
                  Representatives at the ECF partnership event, Adamawa State, May 2026
                </figcaption>
              </figure>

              <div className="np-body">
                <p>
                  LandCheck Geospatial Technologies Limited has entered into a formal Memorandum
                  of Understanding (MoU) with the Environmental Care Foundation (ECF), an
                  Adamawa State-based environmental organisation dedicated to gender equity,
                  climate change adaptation, and sustainable community development.
                </p>

                <p>
                  ECF runs the GCAN Project — the Gender, Climate Change and Nutrition
                  Integration Initiative — in collaboration with the International Food Policy
                  Research Institute (IFPRI) and UN Women, and is an established voice in
                  environmental and nutrition policy in North-East Nigeria.
                </p>

                <h3>Scope of the Partnership</h3>
                <p>
                  Under the agreement, ECF will serve as a Founding Strategic Partner of
                  LandCheck and will introduce NGOs, donor-funded programmes, CSR initiatives,
                  land restoration projects, and government-linked institutions to LandCheck
                  Green and LandCheck Work. ECF may also support awareness creation, stakeholder
                  engagement, and business development activities for LandCheck's products.
                </p>

                <p>
                  In turn, LandCheck will identify ECF as a strategic or ecosystem partner in
                  proposals, campaigns, and public materials — and ECF will be prioritised for
                  pilot collaborations and early access to new platform features. As a Founding
                  Strategic Partner, ECF also receives a discount on
                  LandCheck's standard subscription plans.
                </p>

                <h3>Why This Matters</h3>
                <p>
                  LandCheck Green is built for exactly the kind of programmes ECF runs —
                  GPS-verified tree inventories, agricultural monitoring, humanitarian site
                  assessments, and audit-ready field reports for donors and government. The
                  partnership brings LandCheck's geospatial capabilities directly into ECF's
                  established network of environmental and development organisations across
                  Nigeria.
                </p>

                <blockquote className="np-quote">
                  <p>
                    "This partnership is a natural fit. ECF already works at the intersection
                    of environmental action and community resilience, which is exactly where
                    LandCheck's tools add the most value. We are proud to have them as our
                    first Founding Strategic Partner."
                  </p>
                  <cite>— Samuel Yohanna, Founder, LandCheck Geospatial Technologies</cite>
                </blockquote>

                <p>
                  The MoU was signed in May 2026 and is governed under the laws of the Federal
                  Republic of Nigeria. The agreement is effective for an initial term of twelve
                  months.
                </p>

                <p>
                  For more information about LandCheck Green and how your organisation can work
                  with us, visit the{" "}
                  <button
                    type="button"
                    className="np-inline-link"
                    onClick={() => navigate("/green-partners")}
                  >
                    LandCheck Green page
                  </button>{" "}
                  or contact{" "}
                  <a href="mailto:landchecktech@gmail.com">landchecktech@gmail.com</a>.
                </p>
              </div>
            </article>
          </div>
        </div>
      </main>

      <footer className="ip-footer">
        <div className="ip-footer-inner">
          <span>
            &copy; {new Date().getFullYear()} LandCheck Geospatial Technologies Limited
          </span>
          <div className="ip-footer-links">
            <button type="button" onClick={() => navigate("/")}>Home</button>
            <button type="button" onClick={() => navigate("/privacy")}>Privacy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
