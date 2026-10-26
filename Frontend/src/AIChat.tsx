import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import './AIChat.css';
import { Icon } from '@iconify-icon/react';
import { nextId, useChatConversation } from '$/components/ChatContext';
import ErrorBox from '$/components/ErrorBox';
import MainLayout from '$/components/MainLayout';
import useChatRequest from '$/hooks/useChatRequest';
import { apiErrorMessage } from '$/lib/api';
import { buildHistory, formatDuration, MAX_MESSAGE_CHARS } from '$/lib/chat';
import type { ChatAnswer, ChatRequest, ChatSource } from '$/types/chat';

const prompts = [
	'What has Dave said about forgiveness?',
	'Sermons on overcoming anxiety',
	'Find scriptures about grace from 2025',
	'Summarize the Hope Rising series',
	'What is Dave\'s main point in "Under Grace"?',
];

function renderText(text: string) {
	const parts = text.split(/\*\*(.+?)\*\*/g);
	return parts.map((part, i) =>
		i % 2 === 1 ? <strong key={part}>{part}</strong> : part,
	);
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

	// Each selected sermon keeps its own conversation, separate from the general one.
	const scopeKey = sermonId ?? 'general';
	const {
		messages,
		setMessages,
		request: requestState,
		beginRequest,
		completeRequest,
	} = useChatConversation(scopeKey);
	const [input, setInput] = useState('');
	const chatRequest = useChatRequest();
	const msgsRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only seed a greeting when switching to a scope with no history yet
	useEffect(() => {
		// This scope already has a conversation (from an earlier visit), so resume it instead of re-greeting or wiping it.
		if (messages.length === 0 && sermonId && sermonTitle) {
			const series = sermonSeries;
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
		}
	}, [sermonId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: messages and the pending state are the scroll triggers
	useEffect(() => {
		if (msgsRef.current) {
			msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
		}
	}, [messages, requestState.pending]);

	function callbacks(id: number) {
		return {
			onSuccess: (answer: ChatAnswer) => completeRequest(id, { answer }),
			onError: (error: unknown) =>
				completeRequest(id, {
					error: apiErrorMessage(
						error,
						'Could not get an answer. Please try again.',
					),
				}),
		};
	}

	function send(text?: string) {
		const msg = (text ?? input).trim();
		if (!msg || requestState.pending) return;

		const parsedSermonId = sermonId ? Number(sermonId) : null;
		const request: ChatRequest = {
			message: msg,
			sermonId:
				parsedSermonId !== null && Number.isInteger(parsedSermonId)
					? parsedSermonId
					: null,
			history: buildHistory(messages),
		};
		const id = beginRequest(request);
		if (id === null) return;
		setInput('');
		setMessages(prev => [...prev, { id: nextId(), role: 'user', text: msg }]);
		chatRequest.mutate(request, callbacks(id));
	}

	function retry() {
		if (!requestState.lastRequest || requestState.pending) return;
		const id = beginRequest(requestState.lastRequest);
		if (id !== null)
			chatRequest.mutate(requestState.lastRequest, callbacks(id));
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
						{requestState.pending && (
							<div className="AIChat-msg">
								<div className="AIChat-avatar AIChat-avatar--ai">
									<Icon icon="lucide:message-circle" width={14} height={14} />
								</div>
								<div className="AIChat-bubble AIChat-bubble--ai AIChat-bubble--typing">
									Searching sermons…
								</div>
							</div>
						)}
						{requestState.error && !requestState.pending && (
							<ErrorBox message={requestState.error} onRetry={retry} />
						)}
					</div>
				)}

				<div className="AIChat-input-row">
					{/* The server rejects a question over this length, and Retry would resend the same one. Counts UTF-16 units, so never looser than the server's code-point limit. */}
					<input
						className="AIChat-input"
						type="text"
						maxLength={MAX_MESSAGE_CHARS}
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
