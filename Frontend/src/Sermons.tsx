import MainLayout from '$/components/MainLayout';
import { useState } from 'react';
import './Sermons.css';

// Mock data for sermons, replace later with actual data fetching
// Capatilize the tags to match the filter buttons
const sermons = [
	{ title: "Under Grace", speaker: "Dave Patterson", date: "Feb 23, 2026", time: "42:18", tags: "Grace, Faith", series: "Living Your Best Life"},
	{ title: "Walking in Freedom", speaker: "Dave Patterson", date: "Feb 16, 2026", time: "38:24", tags: "Freedom, Faith", series: "Living Your Best Life"},
	{ title: "Anchored in Hope", speaker: "Guest Speaker", date: "Feb 9, 2026", time: "44:10", tags: "Hope, Healing", series: "Hope Rising"},
	{ title: "Power of Community", speaker: "Dave Patterson", date: "Feb 2, 2026", time: "35:52", tags: "Community", series: "Together"},
	{ title: "Worship as a Lifestyle", speaker: "Dave Patterson", date: "Jan 26, 2026", time: "41:33", tags: "Worship, Prayer", series: "Together"},
	{ title: "Bold Faith", speaker: "Dave Patterson", date: "Jan 19, 2026", time: "", tags: "Failed", series: "Fearless"}	
]


export default function Sermons() {
	// Tracks the currently selected sermon filter, defaults to "All"
	const [selectedSermonFilter, setSelectedSermonFilter]  = useState("All")

	// Tracks the currently selected topic filter, defaults to "All"
	const [selectedTopic, setSelectedTopic] = useState("All")

	// Tracks the currently selected speaker filter, defaults to "All"
	const [selectedSpeaker, setSelectedSpeaker] = useState("All")

	// Tracks the currently selected series filter, defaults to "All"
	const [selectedSeries, setSelectedSeries] = useState("All")	

	// Tracks the currently selected "freshness" filter, defaults to "Newest"
	const [videoUploadRecency, setVideoUploadRecency] = useState("Newest")


	return (
		<MainLayout title="Sermons">			
			<h2>
			{/* Sermon Filter Buttons, clicks set as active and update the selectedSermonFilter state */}
			<div>
  				<button 
					className={selectedSermonFilter === "All" ? "active-sermon-filter" : ""}
					onClick={() => setSelectedSermonFilter("All")}>
					All Sermons</button>
				<button 
					className={selectedSermonFilter === "Published" ? "active-sermon-filter" : ""}
					onClick={() => setSelectedSermonFilter("Published")}>
					Published</button>
				<button 
					className={selectedSermonFilter === "Processing" ? "active-sermon-filter" : ""}	
					onClick={() => setSelectedSermonFilter("Processing")}>
					Processing</button>
				<button 
					className={selectedSermonFilter === "Draft" ? "active-sermon-filter" : ""}
					onClick={() => setSelectedSermonFilter("Draft")}>
					Draft</button>
				<button 
					className={selectedSermonFilter === "Failed" ? "active-sermon-filter" : ""}
					onClick={() => setSelectedSermonFilter("Failed")}>
					Failed</button>
			</div>
			</h2>


			{/* Sermon Topic Buttons, clicks set as active and update the selectedTopic state */}
			<div>
				<button 
					className={selectedTopic === "All" ? "active-topic-filter" : ""}
					onClick={() => setSelectedTopic("All")}>
					All</button>
				<button 
					className={selectedTopic === "Faith" ? "active-topic-filter" : ""}
					onClick={() => setSelectedTopic("Faith")}>
					Faith</button>
				<button 
					className={selectedTopic === "Hope" ? "active-topic-filter" : ""}
					onClick={() => setSelectedTopic("Hope")}>
					Hope</button>
				<button 
					className={selectedTopic === "Grace" ? "active-topic-filter" : ""}
					onClick={() => setSelectedTopic("Grace")}>
					Grace</button>
				<button 
					className={selectedTopic === "Healing" ? "active-topic-filter" : ""}
					onClick={() => setSelectedTopic("Healing")}>
					Healing</button>
				<button 
					className={selectedTopic === "Anxiety" ? "active-topic-filter" : ""}
					onClick={() => setSelectedTopic("Anxiety")}>
					Anxiety</button>					
			</div>
			

			{/* Sermon Speaker dropdown, selection updates the selectedSpeaker state */}
			<div>
				<select onChange={(e) => setSelectedSpeaker(e.target.value)}>
					<option value="All">All Speakers</option>
					<option value="Dave Patterson">Dave Patterson</option>
					<option value="Guest Speaker">Guest Speaker</option>
				</select>

			{/* Sermon Series dropdown, selection updates the selectedSeries state */}			
				<select onChange={(e) => setSelectedSeries(e.target.value)}>
					<option value="All">All Series</option>
					<option value="Living Your Best Life">Living Your Best Life</option>
					<option value="Hope Rising">Hope Rising</option>
					<option value="Together">Together</option>
				</select>

			{/* Video Upload Recency dropdown, selection updates the videoUploadRecency state */}		
				<select onChange={(e) => setVideoUploadRecency(e.target.value)}>
					<option value="Newest">Sort: Newest</option>
					<option value="Oldest">Sort: Oldest</option>
					<option value="Relevancy">Sort: Relevant</option>
				</select>
			</div>

			

			<div>				
				{sermons
					.filter(sermon =>
						(selectedTopic === "All" || sermon.tags.includes(selectedTopic)) &&
						(selectedSpeaker === "All" || sermon.speaker === selectedSpeaker) &&
						(selectedSeries === "All" || sermon.series === selectedSeries) 						
					)					
				.map((sermon) => (
					<div key={sermon.title}>
					<h3>{sermon.title}</h3>
					<p>{sermon.speaker} | {sermon.series} | {sermon.date} | {sermon.time} | {sermon.tags}</p>
					</div>
				))}
			</div>

		</MainLayout>
	);
}
