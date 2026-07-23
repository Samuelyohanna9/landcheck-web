import { useNavigate, useParams } from "react-router-dom";
import "../styles/inner-pages.css";
import "../styles/news.css";
import NavBar from "../components/NavBar";
import { getArticleBySlug, newsArticles } from "../data/newsArticles";

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function NewsArticlePage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const article = getArticleBySlug(slug);

  if (!article) {
    return (
      <div className="ip-page np-page">
        <NavBar activeRoute="/news" />
        <main>
          <section className="np-page-header">
            <div className="ip-container">
              <span className="ip-eyebrow">LandCheck insights</span>
              <h1>Story not found</h1>
              <p>This story may have moved. Browse all LandCheck stories instead.</p>
              <a className="np-inline-link" href="/news">
                Back to all stories
              </a>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const related = newsArticles.filter((a) => a.slug !== article.slug).slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    datePublished: article.date,
    description: article.summary,
    author: { "@type": "Organization", name: "LandCheck Geospatial Technologies Limited" },
  };

  return (
    <div className="ip-page np-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <NavBar activeRoute="/news" />

      <main>
        <article className="np-story">
          <div className="ip-container np-story-container">
            <a className="np-back-link" href="/news">
              ← All stories
            </a>

            <div className="np-story-meta">
              <span className="np-tag">{article.tag}</span>
              {article.location ? <span className="np-story-location">{article.location}</span> : null}
              <time dateTime={article.date}>{formatDate(article.date)}</time>
              <span className="np-story-readtime">{article.readMinutes} min read</span>
            </div>

            <h1>{article.title}</h1>
            <p className="np-lead">{article.summary}</p>
          </div>

          {article.heroImage ? (
            <figure className="np-story-hero">
              <img src={article.heroImage} alt={article.heroImageAlt || article.title} loading="eager" />
            </figure>
          ) : null}

          <div className="ip-container np-story-container">
            <div className="np-body">
              {article.sections.map((section, index) => (
                <section key={`${article.slug}-section-${index}`}>
                  {section.heading ? <h3>{section.heading}</h3> : null}
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ))}
            </div>

            {article.sponsored ? (
              <div className="np-sponsor-cta">
                <span className="np-tag np-tag--light">Funded by a public sponsor</span>
                <h3>This tree exists because one person decided to fund it.</h3>
                <p>
                  Every LandCheck Green public sponsorship funds a real, GPS-tracked tree at a real location — planted
                  and photographed by a field agent, and visible to the sponsor from a phone.
                </p>
                <div className="np-cta-actions">
                  <a href="/sponsor">Sponsor a tree</a>
                  <a href="/green-partners">See how it works</a>
                </div>
              </div>
            ) : (
              <div className="np-cta-card">
                <h3>Need the product view, not just the article?</h3>
                <p>
                  See the corporate landing page, brochure, dashboard previews, and reporting proof built for CSR
                  managers and programme supervisors.
                </p>
                <div className="np-cta-actions">
                  <button type="button" onClick={() => navigate("/green-partners")}>
                    Open LC Green Corporate
                  </button>
                  <a href="/lc-green-corporate-brochure.pdf" download>
                    Download brochure
                  </a>
                </div>
              </div>
            )}

            {related.length > 0 ? (
              <div className="np-related">
                <h3>More stories</h3>
                <div className="np-related-grid">
                  {related.map((item) => (
                    <a key={item.slug} className="np-related-card" href={`/news/${item.slug}`}>
                      {item.heroImage ? <img src={item.heroImage} alt="" loading="lazy" /> : null}
                      <span className="np-tag">{item.tag}</span>
                      <h4>{item.title}</h4>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </article>
      </main>

      <footer className="ip-footer">
        <div className="ip-footer-inner">
          <span>&copy; {new Date().getFullYear()} LandCheck Geospatial Technologies Limited</span>
          <div className="ip-footer-links">
            <button type="button" onClick={() => navigate("/")}>
              Home
            </button>
            <button type="button" onClick={() => navigate("/privacy")}>
              Privacy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
