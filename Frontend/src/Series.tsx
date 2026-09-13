import { useState } from "react";
import MainLayout from "$/components/MainLayout";
import NewSeriesModal from "$/modals/NewSeriesModal";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Series } from "$/types/series";
import { Sermon } from "$/types/sermon";
import { Speaker } from "$/types/speaker";
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

let seriess: Series[]; //stores all officially recognized series into an array

// Component to display the list of sermon series
export default function Seriess() {
  const [newSeriesOpen, setNewSeriesOpen] = useState(false);

  //querying for series data (id, title)
  const seriesQuery = useQuery({
    queryKey: ["series"],
    queryFn: async () => {
      const res = await axios.get("/api/series");
      seriess = await Series.array().parseAsync(res.data); //stores queried data into seriess
      return seriess;
    },
  });

  const [sermons, setSermons] = useState<Sermon[]>([]); //using useState in order to use forEach loop

  //querying for sermon data (id, title, videoLink, duration, date, description, tags, transcript, summary, speaker, series, status)
  const sermonQuery = useQuery({
    queryKey: ["sermons"],
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

  //create type to store stats
  type SeriesStats = {
    count: number;
    startYear: number;
    endYear: number;
    speakers: Speaker[];
  };

  const statsBySeriesId = new Map<number, SeriesStats>();

  //now that we have both the series and sermon data, we can display the page
  if (seriesQuery.isSuccess && sermonQuery.isSuccess) {
    // console.log("setting up stats");
    //mapping stats for each series in one pass corresponding to series.id
    console.log(`looking through ${sermons.length} sermons`);
    sermons.forEach((sermon: Sermon) => {
      let seriesId = sermon.series?.id as number;

      if (seriesId == undefined) {
        seriesId = -1; //if no series, then use -1 for ungrouped sermons
      }

      //create new key if this is the first time adding to a series
      if (!statsBySeriesId.has(seriesId)) {
        console.log(`new series: ${seriesId}`);
        statsBySeriesId.set(seriesId, {
          count: 0,
          startYear: Number.MAX_SAFE_INTEGER,
          endYear: Number.MIN_SAFE_INTEGER,
          speakers: [],
        });
      }
      const currentStats = statsBySeriesId.get(seriesId);

      if (currentStats) {
        currentStats.count++;
        currentStats.startYear = Math.min(
          currentStats.startYear,
          sermon.date.getFullYear(),
        );
        currentStats.endYear = Math.max(
          currentStats.endYear,
          sermon.date.getFullYear(),
        );
        if (!currentStats.speakers.includes(sermon.speaker)) {
          currentStats.speakers.push(sermon.speaker);
        }
      }
    });

    // console.log("loading main series page");
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

                  {(statsBySeriesId.get(series.id)?.count ?? 0) != 1
                    ? `${statsBySeriesId.get(series.id)?.count ?? 0} sermons`
                    : `1 sermon`}

                  {` • series ID ${series.id}`}

                  {statsBySeriesId.get(series.id)?.startYear === statsBySeriesId.get(series.id)?.endYear
                    ? ` • date ${statsBySeriesId.get(series.id)?.startYear ?? `unknown`}`
                    : ` • date ${statsBySeriesId.get(series.id)?.startYear ?? `unknown`} - ${statsBySeriesId.get(series.id)?.endYear ?? `unknown`}`}

                  {statsBySeriesId.get(series.id)?.speakers.length === 0
                    ? (` • no speakers`)
                    : statsBySeriesId.get(series.id)?.speakers.length === 1
                      ? (` • ${statsBySeriesId.get(series.id)?.speakers[0].lastName}`)
                      : (` • multiple speakers`)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* New Series Modal, opens when the New Series button is clicked */}
        <NewSeriesModal
          isOpen={newSeriesOpen}
          onClose={() => setNewSeriesOpen(false)}
        />
      </MainLayout>
    );
  }
}
