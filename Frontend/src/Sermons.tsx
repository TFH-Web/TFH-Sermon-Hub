import MainLayout from '$/components/MainLayout';
import { useState } from 'react';

// Mock data for sermons, replace later with actual data fetching
const sermons = [
	{ title: "Under Grace", speaker: "Dave Patterson", date: "Feb 23, 2026", time: "42:18", tags: "grace, faith", series: ""},
	{ title: "Walking in Freedom", speaker: "Dave Patterson", date: "Feb 16, 2026", time: "38:24", tags: "freedom, faith", series: ""},
	{ title: "Anchored in Hope", speaker: "Geust Speaker", date: "Feb 9, 2026", time: "44:10", tags: "hope, healing", series: ""},
	{ title: "Power of Community", speaker: "Dave Patterson", date: "Feb 2, 2026", time: "35:52", tags: "community", series: ""},
	{ title: "Worship as a Lifestyle", speaker: "Dave Patterson", date: "Jan 26, 2026", time: "41:33", tags: "worship, prayer", series: ""},
	{ title: "Bold Faith", speaker: "Dave Patterson", date: "Jan 19, 2026", time: "", tags: "failed", series: ""}	
]






export default function Sermons() {
	// Tracks the currently selected topic filter, defaults to "All"
	const [selectedTopic, setSelectedTopic] = useState("All")

	// Tracks the currently selected speaker filter, defaults to "All"
	const [selectedSpeaker, setSelectedSpeaker] = useState("All")

	// Tracks the currently selected series filter, defaults to "All"
	const [selectedSeries, setSelectedSeries] = useState("All")



	return (
		<MainLayout title="Sermons">
			<h2>Stinky cheese</h2>
		</MainLayout>
	);
}
