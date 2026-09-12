import { useState } from "react";
import MainLayout from "$/components/MainLayout";
import NewSeriesModal from "$/modals/NewSeriesModal";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Series } from "$/types/series";
import { Sermon } from '$/types/sermon';
import "./Series.css";

// Mock data for sermon series, each series will have a unique gradient color for the banner
// const series = [
// 	{
// 		title: 'A Life of Freedom',
// 		speaker: 'Multiple Speakers',
// 		year: 2026,
// 		sermonCount: 2,
// 		banner: 'linear-gradient(135deg, #4a6741 0%, #3a5232 100%)',
// 	},
// 	{
// 		title: 'A Study in the Book of Philippians',
// 		speaker: 'Multiple Speakers',
// 		year: 2026,
// 		sermonCount: 5,
// 		banner: 'linear-gradient(135deg, #1e2f40 0%, #162430 100%)',
// 	},
// 	{
// 		title: 'New Ground',
// 		speaker: 'Dave Patterson',
// 		year: 2026,
// 		sermonCount: 2,
// 		banner: 'linear-gradient(135deg, #7a6030 0%, #5e4920 100%)',
// 	},
// 	{
// 		title: 'I Can Relate',
// 		speaker: 'Dave Patterson',
// 		year: 2025,
// 		sermonCount: 2,
// 		banner: 'linear-gradient(135deg, #3d5c3a 0%, #2d4529 100%)',
// 	},
// 	{
// 		title: 'New Testament Believer',
// 		speaker: 'Dave Patterson',
// 		year: 2025,
// 		sermonCount: 1,
// 		banner: 'linear-gradient(135deg, #5b4a7a 0%, #46385f 100%)',
// 	},
// ];


let seriess : Series[];
// const [seriess, setSeriess] = useState<Sermon[]>([]);

// Component to display the list of sermon series
export default function Seriess() {
  const [newSeriesOpen, setNewSeriesOpen] = useState(false);

  //querying for series data (id, title)
  const seriesQuery = useQuery({
    queryKey: ["series"],
    queryFn: async () => {
      const res = await axios.get("/api/series");
      seriess = await Series.array().parseAsync(res.data);
      return seriess;
    },
  });


  const [sermons, setSermons] = useState<Sermon[]>([]);

  //querying for sermon data (id, title, videoLink, duration, date, description, tags, transcript, summary, speaker, series, status)
  const sermonQuery = useQuery({
    queryKey: ["series"],
    queryFn: async () => {
      const res = await axios.get("/api/sermons");
      setSermons(await Sermon.array().parseAsync(res.data));
      return sermons;
    },
  });

  // TODO: error state at error
  if (seriesQuery.isError) {
    seriess = [];
    return (
      <MainLayout title="Series" className="Series">
        <h1>Error! Series Not Found!</h1>
      </MainLayout>
    );
  }

  if (sermonQuery.isError) {
    setSermons([]);
    return (
      <MainLayout title="Series" className="Series">
        <h1>Error! Sermon Data Not Found!</h1>
      </MainLayout>
    );
  }

  // TODO: loading state while pending
  if (seriesQuery.isPending || sermonQuery.isPending)
    return (
      <MainLayout title="Series" className="Series">
        <h1>Loading Series...</h1>
      </MainLayout>
    );




  // //getting stats for each series in one pass
  // //create type to store stats
  type SeriesStats = {
    count: number;
    startYear: number;
    endYear: number;
    speakers: number[];
  }
  


const statsBySeriesId = new Map<number, SeriesStats>();
  
if (seriesQuery.isSuccess && sermonQuery.isSuccess) {
  //map stats with key corresponding to series.id
  sermons.forEach((sermon : Sermon) => {
    const seriesId = (sermon.series?.id as number);
    const currentStats = statsBySeriesId.get(seriesId);

    if (currentStats) {
      currentStats.count++;
      currentStats.startYear = Math.min(currentStats.startYear, sermon.date.getFullYear());
      currentStats.endYear = Math.min(currentStats.startYear, sermon.date.getFullYear());
      if (!currentStats.speakers.includes(sermon.speaker.id)) {
        currentStats.speakers.push(sermon.speaker.id);
      }
    }
  }
  );

  return (
     <MainLayout title="Series">
      {/* Top Right New Series Button */}
      <div className="series-header">
        {/* Title for page */}
        <p className="series-section-title">Sermon Series</p>
        {/* Wired up NewSeriesModal from TFH-299 */}
        <button
          type="button"
          className="new-series-button"
          onClick={() => setNewSeriesOpen(true)}
        >
          + New Series
        </button>
      </div>

      {/* Series List as a Grid */}
      {/* <div className="series-grid">
        {series.map((series) => (
          <div key={series.title} className="series-card">
            <div
              className="series-banner"
              style={{ background: series.banner }}
            >
              <span className="series-banner-title">{series.title}</span>
            </div>
            <div className="series-info">
              <div className="series-name">{series.title}</div>
              <div className="series-meta-data">
                {series.sermonCount} sermons • {series.speaker} • {series.year}
              </div>
            </div>
          </div>
        ))} */}




      <div className="series-grid">
        {seriess.map((series) => (
          <div key={series.id} className="series-card">
            <div
              className="series-banner"
              // style={{ background: series.banner }}
            >
              <span className="series-banner-title">{series.title}</span>
            </div>
            <div className="series-info">
              <div className="series-name">{series.title}</div>
              <div className="series-meta-data">
                {statsBySeriesId.get(series.id)?.count ?? 0} sermons • sermon ID {series.id} 
                </div>
            </div>
          </div>
        ))}
      </div>

                {/* • {statsBySeriesId.get(series.id)?.startYear == statsBySeriesId.get(series.id)?.endYear ? statsBySeriesId.get(series.id)?.startYear : '${statsBySeriesId.get(series.id)?.startYear} - ${statsBySeriesId.get(series.id)?.endYear}'} */}



      {/* New Series Modal, opens when the New Series button is clicked */}
      <NewSeriesModal
        isOpen={newSeriesOpen}
        onClose={() => setNewSeriesOpen(false)}
      />
    </MainLayout>
  )
}

  return (
    <MainLayout title="Series">
      {/* Top Right New Series Button */}
      <div className="series-header">
        {/* Title for page */}
        <p className="series-section-title">Sermon Series</p>
        {/* Wired up NewSeriesModal from TFH-299 */}
        <button
          type="button"
          className="new-series-button"
          onClick={() => setNewSeriesOpen(true)}
        >
          + New Series
        </button>
      </div>

      {/* Series List as a Grid */}
      {/* <div className="series-grid">
        {series.map((series) => (
          <div key={series.title} className="series-card">
            <div
              className="series-banner"
              style={{ background: series.banner }}
            >
              <span className="series-banner-title">{series.title}</span>
            </div>
            <div className="series-info">
              <div className="series-name">{series.title}</div>
              <div className="series-meta-data">
                {series.sermonCount} sermons • {series.speaker} • {series.year}
              </div>
            </div>
          </div>
        ))} */}




      <div className="series-grid">
        {seriess.map((series) => (
          <div key={series.id} className="series-card">
            <div
              className="series-banner"
              // style={{ background: series.banner }}
            >
              <span className="series-banner-title">{series.title}</span>
            </div>
            <div className="series-info">
              <div className="series-name">{series.title}</div>
              <div className="series-meta-data">
                {statsBySeriesId.get(series.id)?.count ?? 0} sermons • sermon ID {series.id} 
                </div>
            </div>
          </div>
        ))}
      </div>

                {/* • {statsBySeriesId.get(series.id)?.startYear == statsBySeriesId.get(series.id)?.endYear ? statsBySeriesId.get(series.id)?.startYear : '${statsBySeriesId.get(series.id)?.startYear} - ${statsBySeriesId.get(series.id)?.endYear}'} */}



      {/* New Series Modal, opens when the New Series button is clicked */}
      <NewSeriesModal
        isOpen={newSeriesOpen}
        onClose={() => setNewSeriesOpen(false)}
      />
    </MainLayout>
  );
}
