import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '$/components/MainLayout';

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
			<section
				style={{
					width: '100%',
					maxWidth: '980px',
					margin: '0 auto',
					textAlign: 'center',
					padding: '48px 24px 40px',
				}}
			>
				<h1
					style={{
						fontSize: '3.3rem',
						lineHeight: 1.05,
						marginBottom: '10px',
						color: '#1f1f1f',
						fontWeight: 700,
						letterSpacing: '-0.03em',
					}}
				>
					AI-Powered Sermon Search
				</h1>

				<p
					style={{
						marginBottom: '34px',
						color: '#7c7c7c',
						fontSize: '1.02rem',
					}}
				>
					Natural language search across transcripts, tags, speakers, and topics
				</p>

				<form onSubmit={handleSubmit}>
					<div
						style={{
							display: 'flex',
							justifyContent: 'center',
							width: '100%',
							maxWidth: '820px',
							margin: '0 auto 18px',
						}}
					>
						<input
							type="text"
							placeholder="e.g. What has Dave said about overcoming anxiety?"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							style={{
								flex: 1,
								height: '56px',
								padding: '0 18px',
								border: '1px solid #d8d8d8',
								borderRight: 'none',
								borderTopLeftRadius: '12px',
								borderBottomLeftRadius: '12px',
								background: '#ffffff',
								color: '#2b2b2b',
								fontSize: '1rem',
								outline: 'none',
							}}
						/>
						<button
							type="submit"
							style={{
								width: '120px',
								height: '56px',
								background: '#7a9166',
								color: '#ffffff',
								border: '1px solid #7a9166',
								borderTopRightRadius: '12px',
								borderBottomRightRadius: '12px',
								fontWeight: 700,
								cursor: 'pointer',
							}}
						>
							Search
						</button>
					</div>

					<div
						style={{
							display: 'flex',
							justifyContent: 'center',
							alignItems: 'center',
							gap: '10px',
							flexWrap: 'wrap',
						}}
					>
						{contentOptions.map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => setType(option.value)}
								style={{
									height: '40px',
									padding: '0 16px',
									borderRadius: '999px',
									border: '1px solid #d8d8d8',
									background: type === option.value ? '#7a9166' : '#ffffff',
									color: type === option.value ? '#ffffff' : '#363636',
									fontWeight: 600,
									cursor: 'pointer',
								}}
							>
								{option.label}
							</button>
						))}

						<select
							value={speaker}
							onChange={(e) => setSpeaker(e.target.value)}
							style={{
								height: '40px',
								padding: '0 12px',
								borderRadius: '8px',
								border: '1px solid #d8d8d8',
								background: '#ffffff',
								color: '#363636',
								minWidth: '130px',
								outline: 'none',
							}}
						>
							<option value="any">Any Speaker</option>
							<option value="Dave">Dave</option>
							<option value="Michael">Michael</option>
							<option value="Tim">Tim</option>
						</select>

						<select
							value={date}
							onChange={(e) => setDate(e.target.value)}
							style={{
								height: '40px',
								padding: '0 12px',
								borderRadius: '8px',
								border: '1px solid #d8d8d8',
								background: '#ffffff',
								color: '#363636',
								minWidth: '115px',
								outline: 'none',
							}}
						>
							<option value="any">Any Date</option>
							<option value="2024">2024</option>
							<option value="2023">2023</option>
							<option value="2022">2022</option>
						</select>
					</div>
				</form>
			</section>
		</MainLayout>
	);
}
