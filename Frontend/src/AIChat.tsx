import { useState } from 'react';
import './AIChat.css';
import { Icon } from '@iconify-icon/react';
import MainLayout from '$/components/MainLayout';

// Sample prompts shown on the landing state-replace with API call when backend is ready
const prompts = [
	'What has Dave said about forgiveness?',
	'Sermons on overcoming anxiety',
	'Find scriptures about grace from 2025',
	'Summarize the Hope Rising series',
	'What is Dave\'s main point in "Under Grace"?',
];

export default function AIChat() {
	const [input, setInput] = useState('');
	return (
		<MainLayout title="AI Chat">
			<div className="AIChat">
				<div className="AIChat-empty">
					<div className="AIChat-icon">
						<Icon icon="lucide:message-circle" width={26} height={26} />
					</div>
					<h2 className="AIChat-title">Ask about any sermon</h2>
					<p className="AIChat-subtitle">
						Ask questions across transcripts, topics, speakers, and Scripture
						references. The AI searches everything to find the best answers.
					</p>
					{/* Each prompt renders as a pill button — clicking will populate the chat input once TFH-335 is wired up */}
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
				<div className="AIChat-input-row">
					<input
						className="AIChat-input"
						type="text"
						placeholder="Ask anything about sermons, speakers, topics, or scripture..."
						value={input}
						onChange={e => setInput(e.target.value)}
					/>
					<button className="AIChat-send" type="button">
						<Icon icon="lucide:send" width={16} height={16} />
						Send
					</button>
				</div>
			</div>
		</MainLayout>
	);
}
