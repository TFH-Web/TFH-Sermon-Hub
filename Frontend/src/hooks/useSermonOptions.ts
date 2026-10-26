// The speakers and series the Edit Sermon modal offers.
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Series } from '$/types/series';
import { Speaker } from '$/types/speaker';

/**
 * Every speaker, and up to 100 series. The cache keys and parsing are the Sermons page's own, so the two share one copy.
 * Nothing is asked for until `enabled`, so viewing a sermon costs no extra requests before its Edit popup opens.
 */
export function useSermonOptions(enabled: boolean) {
	const speakers = useQuery({
		queryKey: ['speakers'],
		queryFn: async () => {
			const res = await axios.get('/api/speakers');
			return Speaker.array().parseAsync(res.data);
		},
		enabled,
	});

	const series = useQuery({
		queryKey: ['series'],
		queryFn: async () => {
			// Up to 100 series, so the list has every option.
			const res = await axios.get('/api/series?page=1&per_page=100');
			return Series.array().parseAsync(res.data.items);
		},
		enabled,
	});

	return { speakers: speakers.data, series: series.data };
}
