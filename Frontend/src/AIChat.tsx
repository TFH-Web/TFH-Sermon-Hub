import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import './AIChat.css';
import { Icon } from '@iconify-icon/react';
import ErrorBox from '$/components/ErrorBox';
import MainLayout from '$/components/MainLayout';
import { sermons } from '$/data/sermons';
import useChatRequest from '$/hooks/useChatRequest';
import { apiErrorMessage } from '$/lib/api';
import type {
	ChatAnswer,
	ChatHistoryTurn,
	ChatRequest,
	ChatSource,
} from '$/types/chat';

type Message =
	| { id: number; role: 'user'; text: string }
	| {
			id: number;
			role: 'ai';
			text: string;
			aiGenerated: boolean;
			sources: ChatSource[];
	  };

const prompts = [
	'What has Dave said about forgiveness?',
	'Sermons on overcoming anxiety',
	'Find scriptures about grace from 2025',
	'Summarize the Hope Rising series',
	'What is Dave\'s main point in "Under Grace"?',
];

// At most this many prior turns are sent as context; matches the server's chat.MAX_HISTORY_TURNS.
const MAX_HISTORY_TURNS = 6;

function formatDuration(seconds: number) {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}

// The greeting message is local UI copy, not a model answer, so it's excluded here.
function buildHistory(messages: Message[]): ChatHistoryTurn[] {
	return messages
		.filter(m => m.role === 'user' || m.aiGenerated)
		.map(m => ({
			role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
			content: m.text,
		}))
		.slice(-MAX_HISTORY_TURNS);
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
	const [lastRequest, setLastRequest] = useState<ChatRequest | null>(null);
	const [chatError, setChatError] = useState<string | null>(null);
	const chatRequest = useChatRequest();
	const msgsRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only reset conversation when the sermon context changes
	useEffect(() => {
		if (sermonId && sermonTitle) {
			const series = sermonSeries ?? canonicalSermon?.series?.title ?? null;
			const snippet = sermonSnippet ?? null;
			setMessages([
				{
					id: nextId(),
					role: 'ai',
					aiGenerated: false,
					sources: [],
					text: `I'm ready to answer questions about **${sermonTitle}**${sermonSpeaker ? ` by ${sermonSpeaker}` : ''}${series ? `, part of the **${series}** series` : ''}${sermonDate ? ` (${sermonDate})` : ''}. ${snippet ? `${snippet} ` : ''}Ask me anything about the message, key themes, scripture references, or specific moments from the transcript.`,
				},
			]);
		} else {
			setMessages([]);
		}
		setChatError(null);
	}, [sermonId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: messages and the pending state are the scroll triggers
	useEffect(() => {
		if (msgsRef.current) {
			msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
		}
	}, [messages, chatRequest.isPending]);

	function onAnswer(answer: ChatAnswer) {
		setMessages(prev => [
			...prev,
			{
				id: nextId(),
				role: 'ai',
				text: answer.answer,
				aiGenerated: answer.ai_generated,
				sources: answer.sources,
			},
		]);
	}

	function onFailure(error: unknown) {
		setChatError(
			apiErrorMessage(error, 'Could not get an answer. Please try again.'),
		);
	}

	function send(text?: string) {
		const msg = (text ?? input).trim();
		if (!msg || chatRequest.isPending) return;
		setInput('');
		setChatError(null);
		setMessages(prev => [...prev, { id: nextId(), role: 'user', text: msg }]);

		const parsedSermonId = sermonId ? Number(sermonId) : null;
		const request: ChatRequest = {
			message: msg,
			sermonId:
				parsedSermonId !== null && Number.isInteger(parsedSermonId)
					? parsedSermonId
					: null,
			history: buildHistory(messages),
		};
		setLastRequest(request);
		chatRequest.mutate(request, { onSuccess: onAnswer, onError: onFailure });
	}

	function retry() {
		if (!lastRequest || chatRequest.isPending) return;
		chatRequest.mutate(lastRequest, {
			onSuccess: onAnswer,
			onError: onFailure,
		});
	}

	function askAboutSermon(source: ChatSource) {
		const params = new URLSearchParams({
			sermonId: String(source.sermon_id),
			title: source.title,
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
									{msg.role === 'ai' && msg.aiGenerated && (
										<p className="AIChat-ai-label">AI generated</p>
									)}
									{msg.role === 'ai' && msg.sources.length > 0 && (
										<div className="AIChat-refs">
											{msg.sources.map(source => (
												<div key={source.source_id} className="AIChat-ref">
													<a
														className="AIChat-ref-info"
														href={source.url}
														target="_blank"
														rel="noreferrer"
													>
														<span className="AIChat-ref-title">
															{source.title}
														</span>
														<span className="AIChat-ref-meta">
															{formatDuration(source.start_sec)}–
															{formatDuration(source.end_sec)}
														</span>
													</a>
													<button
														type="button"
														className="AIChat-ref-chat"
														title={`Ask AI about "${source.title}"`}
														onClick={() => askAboutSermon(source)}
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
						{chatRequest.isPending && (
							<div className="AIChat-msg">
								<div className="AIChat-avatar AIChat-avatar--ai">
									<Icon icon="lucide:message-circle" width={14} height={14} />
								</div>
								<div className="AIChat-bubble AIChat-bubble--ai AIChat-bubble--typing">
									Searching sermons…
								</div>
							</div>
						)}
						{chatError && !chatRequest.isPending && (
							<ErrorBox message={chatError} onRetry={retry} />
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
