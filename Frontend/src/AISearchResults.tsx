import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useSearchParams } from "react-router-dom";
import MainLayout from "$/components/MainLayout";
import SearchResultCard from "$/components/SearchResultCard";
import "./AISearchResults.css";

export type SearchResult = {
  id: number;
  title: string;
  type: string;
  speaker: string;
  date: string;
  summary: string;
  ai_score: number;
};

async function fetchResults(
  q: string,
  type: string,
  speaker: string,
  date: string,
): Promise<SearchResult[]> {
  const res = await axios.get<SearchResult[]>("/api/search", {
    params: { q, type, speaker, date },
  });
  return res.data;
}

export default function AISearchResults() {
  const [searchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const type = searchParams.get("type") ?? "all";
  const speaker = searchParams.get("speaker") ?? "any";
  const date = searchParams.get("date") ?? "any";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["search-results", q, type, speaker, date],
    queryFn: () => fetchResults(q, type, speaker, date),
  });

  return (
    <MainLayout title="AI Search Results">
      <main className="AISearchResults">
        <div className="AISearchResults-container">
          <h1 className="AISearchResults-title">AI Search Results</h1>

          <p className="AISearchResults-meta">
            Query: <strong>{q || "(empty query)"}</strong> | Type:{" "}
            <strong>{type}</strong> | Speaker: <strong>{speaker}</strong> |
            Date: <strong>{date}</strong>
          </p>

          {isLoading && (
            <div className="AISearchResults-stateCard">
              <p className="AISearchResults-stateText">Loading results...</p>
            </div>
          )}

          {isError && (
            <div className="AISearchResults-stateCard">
              <p className="AISearchResults-stateText AISearchResults-stateText--error">
                Could not load results.
              </p>
            </div>
          )}

          {data && data.length === 0 && (
            <div className="AISearchResults-stateCard">
              <p className="AISearchResults-stateText">No results found.</p>
            </div>
          )}

          {data && data.length > 0 && (
            <div className="AISearchResults-list">
              {data.map((item) => (
                <SearchResultCard key={item.id} result={item} />
              ))}
            </div>
          )}
        </div>
      </main>
    </MainLayout>
  );
}
