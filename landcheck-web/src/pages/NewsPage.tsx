import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/inner-pages.css";
import "../styles/news.css";
import NavBar from "../components/NavBar";

type ArticleItem = {
  id: string;
  tag: string;
  title: string;
  date: string;
  summary: string;
  image?: string;
  imageAlt?: string;
  sections: Array<{ heading?: string; paragraphs: string[] }>;
};

const articles: ArticleItem[] = [
  {
    id: "ecf-partnership",
    tag: "Case study",
    title: "LandCheck signs strategic partnership MoU with Environmental Care Foundation",
    date: "2026-05-15",
    summary:
      "A partnership story that helps position LandCheck as a serious implementation and reporting partner for environmental programmes in Nigeria.",
    image: "/ecf-partnership.jpeg",
    imageAlt: "LandCheck and ECF representatives at partnership event, Adamawa State",
    sections: [
      {
        paragraphs: [
          "LandCheck Geospatial Technologies Limited entered into a formal Memorandum of Understanding with the Environmental Care Foundation, an Adamawa State-based organisation working across environmental action, climate adaptation, and community development.",
          "For sales and partnership conversations, this is more than a news update. It is proof that real organisations are already willing to collaborate with LandCheck around field execution, programme visibility, and stakeholder reporting.",
        ],
      },
      {
        heading: "Why the story matters",
        paragraphs: [
          "Case studies reduce procurement anxiety. A CSR manager, NGO lead, or donor representative needs to know whether your product is already trusted by actors who understand field delivery in Nigeria.",
          "Even an early pilot partnership can show that the product is not just a concept. It signals relevance, implementation fit, and local credibility.",
        ],
      },
    ],
  },
  {
    id: "corporate-tree-projects",
    tag: "Guide",
    title: "How to manage corporate tree-planting projects without losing control",
    date: "2026-07-21",
    summary:
      "A practical structure for turning a CSR tree-planting idea into a verified programme with clear roles, evidence, and reporting.",
    sections: [
      {
        paragraphs: [
          "Corporate tree-planting projects often fail when organisations focus only on the planting day. The real work starts earlier with project design and continues long after the initial field activity.",
          "A strong programme should define approved locations, species strategy, land rights, field-agent structure, maintenance plan, review flow, and reporting cadence before implementation begins.",
        ],
      },
      {
        heading: "What the implementation stack should include",
        paragraphs: [
          "First, create a mapped project structure so every planting site, assignment, and field record belongs to a controlled programme. Second, assign field staff through named work orders instead of informal instructions. Third, enforce photo and GPS evidence so every completed step is reviewable.",
          "Finally, build a reporting layer that allows managers to see survival, maintenance, evidence coverage, and operational backlog without waiting for manual spreadsheet aggregation.",
        ],
      },
    ],
  },
  {
    id: "csr-reporting-checklist",
    tag: "Checklist",
    title: "CSR reporting checklist for field implementation programmes",
    date: "2026-07-21",
    summary:
      "The minimum information a CSR manager should expect before presenting a tree-planting programme internally or externally.",
    sections: [
      {
        paragraphs: [
          "A credible CSR report should answer simple but demanding questions: What was promised, where did it happen, who implemented it, how was it verified, what remains unresolved, and what proof can be shown to stakeholders?",
          "That means the reporting pack should include project scope, mapped locations, implementation status, evidence capture rate, species or activity breakdown, field-risk notes, maintenance progress, and clear exportable summaries.",
        ],
      },
      {
        heading: "What to check before sharing the report",
        paragraphs: [
          "Confirm that project locations are approved and mapped, planting or activity records are tied to supervisors or agents, and evidence photos are attached to the right field events. Review whether there is a clear distinction between completed work, pending work, and rejected submissions.",
          "The goal is not only to look professional. The goal is to make reporting defensible when a board member, donor, partner, or journalist asks for proof.",
        ],
      },
    ],
  },
  {
    id: "gps-verification",
    tag: "Verification",
    title: "GPS verification for environmental projects: why proof matters",
    date: "2026-07-21",
    summary:
      "Coordinates, timestamped photos, and supervisor review are what separate credible field reporting from unverifiable claims.",
    sections: [
      {
        paragraphs: [
          "Environmental projects are difficult to trust when the only evidence is a narrative summary or a folder of disconnected photos. GPS verification changes that by tying each field record to an actual place and workflow event.",
          "When field records are linked to coordinates, polygons, timestamps, images, and reviewer status, organisations can trace the path from assignment to execution to reporting more confidently.",
        ],
      },
      {
        heading: "Why this improves trust",
        paragraphs: [
          "Verification is not just about maps. It is about operational accountability. A manager should be able to see who was assigned, what was captured, whether the evidence was approved, and what still needs follow-up.",
          "For CSR, donor, and public-facing programmes, this is the difference between activity claims and implementation proof.",
        ],
      },
    ],
  },
  {
    id: "environmental-monitoring",
    tag: "Operations",
    title: "Environmental project monitoring made easier with live implementation data",
    date: "2026-07-21",
    summary:
      "Why organisations should move from ad hoc spreadsheets to live implementation oversight for environmental projects.",
    sections: [
      {
        paragraphs: [
          "Environmental programmes become harder to manage as soon as teams scale beyond a single location or supervisor. Separate spreadsheets for assignments, evidence, maintenance, and reporting usually lead to blind spots.",
          "A live monitoring system lets managers see current activity, outstanding maintenance, evidence gaps, rejected submissions, mapped project areas, and staff workload in one place.",
        ],
      },
      {
        heading: "What changes in practice",
        paragraphs: [
          "Instead of waiting for monthly consolidation, managers can track progress as the field work happens. That makes it easier to intervene when delivery slips, proof is incomplete, or the programme is drifting away from stated objectives.",
          "Monitoring becomes more useful when it is operational, not only historical.",
        ],
      },
    ],
  },
  {
    id: "esg-reporting-easier",
    tag: "ESG",
    title: "ESG reporting made easier when field evidence is structured from day one",
    date: "2026-07-21",
    summary:
      "How live implementation records can support cleaner sustainability and ESG reporting workflows.",
    sections: [
      {
        paragraphs: [
          "Many ESG reporting teams struggle because implementation evidence was never captured in a structured way. By the time reporting season arrives, teams are trying to rebuild the programme story from scattered notes and images.",
          "A stronger approach is to structure the operational record from the first assignment. That includes mapped project units, named assignees, verified submissions, maintenance history, and exportable summaries.",
        ],
      },
      {
        heading: "Why this matters for corporate teams",
        paragraphs: [
          "Not every organisation has in-house environmental implementation staff. When the execution system is already producing traceable field records, reporting teams can reuse the data with less friction and less risk.",
          "That does not replace sustainability judgement. It improves the quality of the operational evidence that feeds it.",
        ],
      },
    ],
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@graph": articles.map((article) => ({
    "@type": "BlogPosting",
    "@id": `https://landcheck.online/news#${article.id}`,
    headline: article.title,
    datePublished: article.date,
    dateModified: article.date,
    description: article.summary,
    url: `https://landcheck.online/news#${article.id}`,
    author: {
      "@type": "Organization",
      name: "LandCheck Geospatial Technologies Limited",
      url: "https://landcheck.online/",
    },
    publisher: {
      "@type": "Organization",
      name: "LandCheck Geospatial Technologies Limited",
      logo: {
        "@type": "ImageObject",
        url: "https://landcheck.online/green-logo-cropped-820.png",
      },
    },
    image: article.image ? `https://landcheck.online${article.image}` : "https://landcheck.online/green-logo-cropped-820.png",
    articleSection: article.tag,
  })),
};

export default function NewsPage() {
  const navigate = useNavigate();
  const featured = useMemo(() => articles[0], []);

  return (
    <div className="ip-page np-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <NavBar activeRoute="/news" />

      <main>
        <section className="np-page-header">
          <div className="ip-container">
            <span className="ip-eyebrow">LandCheck insights</span>
            <h1>CSR, ESG, and implementation reporting insights</h1>
            <p>
              Articles, case studies, and practical guides that help organisations understand how to run and verify
              environmental programmes more credibly.
            </p>
          </div>
        </section>

        <section className="np-library">
          <div className="ip-container">
            <div className="np-library-grid">
              {articles.map((article) => (
                <article key={article.id} className="np-library-card">
                  <div className="np-article-meta">
                    <span className="np-tag">{article.tag}</span>
                    <time dateTime={article.date}>{article.date}</time>
                  </div>
                  <h2>{article.title}</h2>
                  <p>{article.summary}</p>
                  <a href={`#${article.id}`}>Read article</a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="np-featured">
          <div className="ip-container">
            <article className="np-featured-card" id={featured.id}>
              <div className="np-featured-copy">
                <div className="np-article-meta">
                  <span className="np-tag">{featured.tag}</span>
                  <time dateTime={featured.date}>{featured.date}</time>
                </div>
                <h2>{featured.title}</h2>
                <p className="np-lead">{featured.summary}</p>
              </div>
              {featured.image ? (
                <figure className="np-figure">
                  <img
                    src={featured.image}
                    alt={featured.imageAlt || featured.title}
                    loading="lazy"
                    width="900"
                    height="540"
                  />
                </figure>
              ) : null}
            </article>
          </div>
        </section>

        <section className="np-articles-wrap">
          <div className="ip-container">
            {articles.map((article) => (
              <article key={article.id} id={article.id} className="np-article">
                {article.id !== featured.id ? (
                  <>
                    <div className="np-article-meta">
                      <span className="np-tag">{article.tag}</span>
                      <time dateTime={article.date}>{article.date}</time>
                    </div>
                    <h2>{article.title}</h2>
                    <p className="np-lead">{article.summary}</p>
                  </>
                ) : null}

                <div className="np-body">
                  {article.sections.map((section, index) => (
                    <section key={`${article.id}-section-${index}`}>
                      {section.heading ? <h3>{section.heading}</h3> : null}
                      {section.paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </section>
                  ))}
                </div>
              </article>
            ))}

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
          </div>
        </section>
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
