import { z } from "zod";

export const chatMessageInputSchema = z.object({
  roomId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  tempId: z.string().uuid(),
});

export type ChatMessageInput = z.infer<typeof chatMessageInputSchema>;
