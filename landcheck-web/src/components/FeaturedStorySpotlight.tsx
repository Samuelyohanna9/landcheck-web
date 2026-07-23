import { useNavigate } from "react-router-dom";
import "../styles/featured-story-spotlight.css";
import type { NewsArticle } from "../data/newsArticles";

export default function FeaturedStorySpotlight({ article }: { article: NewsArticle }) {
  const navigate = useNavigate();

  return (
    <section className="fs-spotlight">
      <button
        type="button"
        className="fs-spotlight-media"
        onClick={() => navigate(`/news/${article.slug}`)}
        style={article.heroImage ? { backgroundImage: `url("${article.heroImage}")` } : undefined}
      >
        <span className="fs-spotlight-overlay" aria-hidden="true" />
        <span className="fs-spotlight-content">
          <span className="fs-spotlight-eyebrow">Field story · Funded by a public sponsor</span>
          <span className="fs-spotlight-title">{article.title}</span>
          <span className="fs-spotlight-summary">{article.summary}</span>
          <span className="fs-spotlight-actions">
            <span className="fs-spotlight-cta">Read the story →</span>
            <a
              className="fs-spotlight-sponsor"
              href="/sponsor"
              onClick={(event) => event.stopPropagation()}
            >
              Sponsor a tree like this one
            </a>
          </span>
        </span>
      </button>
    </section>
  );
}
