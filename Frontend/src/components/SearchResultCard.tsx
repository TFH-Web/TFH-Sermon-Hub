import type { SearchResult } from "$/AISearchResults";
import "./SearchResultCard.css";

interface SearchResultCardProps {
  result: SearchResult;
}

export default function SearchResultCard({ result }: SearchResultCardProps) {
  return (
    <article className="SearchResultCard">
      <div className="SearchResultCard-row">
        <div className="SearchResultCard-main">
          <h2 className="SearchResultCard-title">{result.title}</h2>

          <p className="SearchResultCard-meta">
            {result.type} • {result.speaker} • {result.date}
          </p>

          <p className="SearchResultCard-summary">{result.summary}</p>
        </div>

        <div className="SearchResultCard-score">
          AI Score: {result.ai_score.toFixed(2)}
        </div>
      </div>
    </article>
  );
}
