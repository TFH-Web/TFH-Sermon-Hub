import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { ChatAnswer, type ChatRequest } from '$/types/chat';

// Validates the response against the documented /api/chat contract, the same way Sermon.parse does for sermons.
export default function useChatRequest() {
	return useMutation({
		mutationFn: async (request: ChatRequest): Promise<ChatAnswer> => {
			const response = await axios.post('/api/chat', {
				message: request.message,
				sermonId: request.sermonId,
				history: request.history,
			});
			return ChatAnswer.parse(response.data);
		},
	});
}
