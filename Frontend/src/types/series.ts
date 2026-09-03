import z from "zod";

export const Series = z.object({
	id: z.number(),
	title: z.string(),
});
export type Series = z.infer<typeof Series>;
