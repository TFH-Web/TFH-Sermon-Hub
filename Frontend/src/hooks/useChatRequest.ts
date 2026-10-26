import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { ChatAnswer, type ChatRequest } from '$/types/chat';

interface ChatCallbacks {
	onSuccess: (answer: ChatAnswer) => void;
	onError: (error: unknown) => void;
}

interface ChatAttempt extends ChatCallbacks {
	request: ChatRequest;
}

// Validates the response against the documented /api/chat contract, the same way Sermon.parse does for sermons.
export default function useChatRequest() {
	const mutation = useMutation({
		mutationFn: async ({ request }: ChatAttempt): Promise<ChatAnswer> => {
			const response = await axios.post('/api/chat', {
				message: request.message,
				sermonId: request.sermonId,
				history: request.history,
			});
			return ChatAnswer.parse(response.data);
		},
		// Hook-level callbacks run even after the route's mutation observer unmounts.
		// Carry the original callbacks in the variables: later renders/scopes must
		// not replace the owner of an earlier request, including concurrent scopes.
		onSuccess: (answer, attempt) => attempt.onSuccess(answer),
		onError: (error, attempt) => attempt.onError(error),
	});
	return {
		mutate(request: ChatRequest, callbacks: ChatCallbacks) {
			mutation.mutate({ request, ...callbacks });
		},
	};
}
