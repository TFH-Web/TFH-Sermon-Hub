import z from 'zod';

export const ChatSource = z.object({
	source_id: z.number(),
	chunk_id: z.number(),
	sermon_id: z.number(),
	title: z.string(),
	youtube_video_id: z.string().length(11),
	start_sec: z.number(),
	end_sec: z.number(),
	url: z.httpUrl(),
});
export type ChatSource = z.infer<typeof ChatSource>;

export const ChatAnswer = z.object({
	answer: z.string(),
	ai_generated: z.boolean(),
	supported: z.boolean(),
	sources: ChatSource.array(),
});
export type ChatAnswer = z.infer<typeof ChatAnswer>;

export interface ChatHistoryTurn {
	role: 'user' | 'assistant';
	content: string;
}

export interface ChatRequest {
	message: string;
	sermonId: number | null;
	history: ChatHistoryTurn[];
}

// One entry in a chat conversation. Lives here (not in a component) so plain helpers can use it too.
export type Message =
	| { id: number; role: 'user'; text: string }
	| {
			id: number;
			role: 'ai';
			text: string;
			aiGenerated: boolean;
			sources: ChatSource[];
	  };
