import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import './AIChat.css';
import { Icon } from '@iconify-icon/react';
import MainLayout from '$/components/MainLayout';
import { sermons } from '$/data/sermons';

type RefSermon = {
	id: number;
	title: string;
	speaker: string;
	date: string;
	match: number;
};

type Message =
	| { id: number; role: 'user'; text: string }
	| { id: number; role: 'ai'; text: string; sermons?: RefSermon[] };

const prompts = [
	'What has Dave said about forgiveness?',
	'Sermons on overcoming anxiety',
	'Find scriptures about grace from 2025',
	'Summarize the Hope Rising series',
	'What is Dave\'s main point in "Under Grace"?',
];

const MOCK_SERMONS: RefSermon[] = [
	{
		id: 1,
		title: 'Under Grace',
		speaker: 'Dave Patterson',
		date: 'Feb 23, 2026',
		match: 98,
	},
	{
		id: 2,
		title: 'Anchored in Hope',
		speaker: 'Guest Speaker',
		date: 'Feb 9, 2026',
		match: 87,
	},
	{
		id: 3,
		title: 'Walking in Freedom',
		speaker: 'Dave Patterson',
		date: 'Feb 16, 2026',
		match: 81,
	},
];

const GENERAL_RESPONSES = [
	'I found **12 sermons** matching that query. Here are the top results ranked by transcript relevance:',
	'Based on the transcripts, Pastor Dave consistently connects this theme to grace and personal transformation. Here are the most relevant sermons:',
	'Across **8 sermons** in the Hope Rising and Live Your Best Life series, this topic comes up repeatedly:',
	"Great question — here's what I found across all sermon transcripts:",
];

function formatDuration(seconds: number) {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}

function buildSermonResponses(data: {
	title: string;
	speaker: string;
	date: string;
	snippet?: string | null;
	series?: string | null;
	tags?: string[];
	duration?: number;
}): string[] {
	const { title, speaker, date, snippet, series, tags, duration } = data;
	const firstName = speaker.split(' ')[0];

	const responses: string[] = [];

	responses.push(
		snippet
			? `**${title}** by ${speaker} (${date}): ${snippet}`
			: `**${title}** was delivered by ${speaker} on ${date}.${series ? ` It's part of the **${series}** series.` : ''}`,
	);

	const ctx: string[] = [];
	if (series) ctx.push(`part of the **${series}** series`);
	if (tags?.length) ctx.push(`covering themes of ${tags.join(', ')}`);
	if (duration) ctx.push(`running ${formatDuration(duration)}`);

	responses.push(
		ctx.length
			? `This message is ${ctx.join(', ')}. ${firstName} builds a practical framework throughout the transcript — ask me about any specific moment or theme.`
			: `${firstName} builds a practical framework throughout this message. Is there a specific theme or moment you'd like to explore further?`,
	);

	responses.push(
		`Based on the transcript of **${title}**, ${firstName} ties the central themes back to scripture consistently. What would you like to go deeper on — key scriptures, main points, or how it connects to other messages${series ? ` in the ${series} series` : ''}?`,
	);

	return responses;
}

function renderText(text: string) {
	const parts = text.split(/\*\*(.+?)\*\*/g);
	return parts.map((part, i) =>
		i % 2 === 1 ? <strong key={part}>{part}</strong> : part,
	);
}

let msgIdCounter = 0;
function nextId() {
	return ++msgIdCounter;
}

export default function AIChat() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	const sermonId = searchParams.get('sermonId');
	const sermonTitle = searchParams.get('title');
	const sermonSpeaker = searchParams.get('speaker');
	const sermonDate = searchParams.get('date');
	const sermonSnippet = searchParams.get('snippet');
	const sermonSeries = searchParams.get('series');

	const canonicalSermon = sermonId
		? sermons.find(s => s.id === Number(sermonId))
		: null;

	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [isTyping, setIsTyping] = useState(false);
	const msgsRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only reset conversation when the sermon context changes
	useEffect(() => {
		if (sermonId && sermonTitle && sermonSpeaker) {
			const series = sermonSeries ?? canonicalSermon?.series ?? null;
			const snippet = sermonSnippet ?? null;
			setMessages([
				{
					id: nextId(),
					role: 'ai',
					text: `I'm ready to answer questions about **${sermonTitle}** by ${sermonSpeaker}${series ? `, part of the **${series}** series` : ''}${sermonDate ? ` (${sermonDate})` : ''}. ${snippet ? `${snippet} ` : ''}Ask me anything about the message, key themes, scripture references, or specific moments from the transcript.`,
				},
			]);
		} else {
			setMessages([]);
		}
		setIsTyping(false);
	}, [sermonId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: messages and isTyping are the scroll triggers
	useEffect(() => {
		if (msgsRef.current) {
			msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
		}
	}, [messages, isTyping]);

	function send(text?: string) {
		const msg = (text ?? input).trim();
		if (!msg || isTyping) return;
		setInput('');

		const userCount = messages.filter(m => m.role === 'user').length;
		setMessages(prev => [...prev, { id: nextId(), role: 'user', text: msg }]);
		setIsTyping(true);

		setTimeout(() => {
			setIsTyping(false);
			if (sermonId && sermonTitle && sermonSpeaker) {
				const responses = buildSermonResponses({
					title: sermonTitle,
					speaker: sermonSpeaker,
					date: sermonDate ?? '',
					snippet: sermonSnippet,
					series: sermonSeries ?? canonicalSermon?.series,
					tags: canonicalSermon?.tags,
					duration: canonicalSermon?.duration,
				});
				setMessages(prev => [
					...prev,
					{
						id: nextId(),
						role: 'ai',
						text: responses[userCount % responses.length],
					},
				]);
			} else {
				setMessages(prev => [
					...prev,
					{
						id: nextId(),
						role: 'ai',
						text: GENERAL_RESPONSES[userCount % GENERAL_RESPONSES.length],
						sermons: MOCK_SERMONS,
					},
				]);
			}
		}, 1100);
	}

	function askAboutSermon(sermon: RefSermon) {
		const params = new URLSearchParams({
			sermonId: String(sermon.id),
			title: sermon.title,
			speaker: sermon.speaker,
			date: sermon.date,
		});
		navigate(`/ai-chat?${params.toString()}`);
	}

	const isEmpty = messages.length === 0;

	return (
		<MainLayout title="AI Chat">
			<div className="AIChat">
				{isEmpty ? (
					<div className="AIChat-empty">
						<div className="AIChat-icon">
							<Icon icon="lucide:message-circle" width={26} height={26} />
						</div>
						<h2 className="AIChat-title">Ask about any sermon</h2>
						<p className="AIChat-subtitle">
							Ask questions across transcripts, topics, speakers, and Scripture
							references. The AI searches everything to find the best answers.
						</p>
						<div className="AIChat-prompts">
							{prompts.map(prompt => (
								<button
									key={prompt}
									className="AIChat-prompt"
									type="button"
									onClick={() => setInput(prompt)}
								>
									{prompt}
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="AIChat-msgs" ref={msgsRef}>
						{messages.map(msg => (
							<div
								key={msg.id}
								className={`AIChat-msg${msg.role === 'user' ? ' AIChat-msg--user' : ''}`}
							>
								<div className={`AIChat-avatar AIChat-avatar--${msg.role}`}>
									{msg.role === 'user' ? (
										'SG'
									) : (
										<Icon icon="lucide:message-circle" width={14} height={14} />
									)}
								</div>
								<div className={`AIChat-bubble AIChat-bubble--${msg.role}`}>
									<p>{renderText(msg.text)}</p>
									{msg.role === 'ai' && msg.sermons && (
										<div className="AIChat-refs">
											{msg.sermons.map(s => (
												<div key={s.id} className="AIChat-ref">
													<button
														type="button"
														className="AIChat-ref-info"
														onClick={() => navigate(`/sermons/${s.id}`)}
													>
														<span className="AIChat-ref-title">{s.title}</span>
														<span className="AIChat-ref-meta">
															{s.speaker} &bull; {s.date} &bull;{' '}
															<span className="AIChat-ref-match">
																{s.match}% match
															</span>
														</span>
													</button>
													<button
														type="button"
														className="AIChat-ref-chat"
														title={`Ask AI about "${s.title}"`}
														onClick={() => askAboutSermon(s)}
													>
														<Icon
															icon="lucide:message-circle"
															width={14}
															height={14}
														/>
													</button>
												</div>
											))}
										</div>
									)}
								</div>
							</div>
						))}
						{isTyping && (
							<div className="AIChat-msg">
								<div className="AIChat-avatar AIChat-avatar--ai">
									<Icon icon="lucide:message-circle" width={14} height={14} />
								</div>
								<div className="AIChat-bubble AIChat-bubble--ai AIChat-bubble--typing">
									Searching sermons…
								</div>
							</div>
						)}
					</div>
				)}

				<div className="AIChat-input-row">
					<input
						className="AIChat-input"
						type="text"
						placeholder="Ask anything about sermons, speakers, topics, or scripture..."
						value={input}
						onChange={e => setInput(e.target.value)}
						onKeyDown={e => {
							if (e.key === 'Enter') send();
						}}
					/>
					<button className="AIChat-send" type="button" onClick={() => send()}>
						<Icon icon="lucide:send" width={16} height={16} />
						Send
					</button>
				</div>
			</div>
		</MainLayout>
	);
}
