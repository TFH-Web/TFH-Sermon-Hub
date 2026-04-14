import { type SubmitEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '$/components/MainLayout';
import SearchBar from '$/components/SearchBar';
import SearchFilters from '$/components/SearchFilters';
import './AISearch.css';

type ContentType = 'all' | 'sermon' | 'transcript' | 'note';

const contentOptions: { label: string; value: ContentType }[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Sermons', value: 'sermon' },
	{ label: 'Transcripts', value: 'transcript' },
	{ label: 'Notes', value: 'note' },
];

export default function AISearch() {
	const navigate = useNavigate();
	const [query, setQuery] = useState('');
	const [type, setType] = useState<ContentType>('all');
	const [speaker, setSpeaker] = useState('any');
	const [date, setDate] = useState('any');

	function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
		e.preventDefault();

		const params = new URLSearchParams();

		if (query.trim()) params.set('q', query.trim());
		if (type !== 'all') params.set('type', type);
		if (speaker !== 'any') params.set('speaker', speaker);
		if (date !== 'any') params.set('date', date);

		navigate(`/ai-search/results?${params.toString()}`);
	}

	return (
		<MainLayout title="AI Search">
			<section className="AISearch">
				<h1 className="AISearch-title">AI-Powered Sermon Search</h1>

				<p className="AISearch-subtitle">
					Natural language search across transcripts, tags, speakers, and topics
				</p>

				<form onSubmit={handleSubmit} className="AISearch-form">
					<SearchBar query={query} onQueryChange={setQuery} />

					<SearchFilters
						contentOptions={contentOptions}
						type={type}
						onTypeChange={setType}
						speaker={speaker}
						onSpeakerChange={setSpeaker}
						date={date}
						onDateChange={setDate}
					/>
				</form>
			</section>
		</MainLayout>
	);
}
