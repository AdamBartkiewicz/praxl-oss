import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { db } from "@/db";
import { chatMessages, skills } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { TRPCError } from "@trpc/server";

export const chatRouter = router({
  // Get chat history for a skill
  getHistory: authedProcedure.input(z.string()).query(async ({ ctx, input: skillId }) => {
    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.id, skillId), eq(skills.userId, ctx.userId)),
    });
    if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

    return db.query.chatMessages.findMany({
      where: and(eq(chatMessages.skillId, skillId), eq(chatMessages.userId, ctx.userId)),
      orderBy: [chatMessages.createdAt],
    });
  }),

  // Save a message
  saveMessage: authedProcedure
    .input(
      z.object({
        skillId: z.string(),
        role: z.enum(["user", "assistant", "tool-action"]),
        content: z.string().max(50000),
        messageType: z.enum(["chat", "edit", "field-update", "status"]).default("chat"),
        metadata: z.record(z.string(), z.unknown()).default({}),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

      const result = await db.insert(chatMessages).values({
        skillId: input.skillId,
        userId: ctx.userId,
        role: input.role,
        content: input.content,
        messageType: input.messageType,
        metadata: input.metadata,
      }).returning({ id: chatMessages.id });
      return { id: result[0]?.id ?? "" };
    }),

  // Clear chat history for a skill
  clearHistory: authedProcedure.input(z.string()).mutation(async ({ ctx, input: skillId }) => {
    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.id, skillId), eq(skills.userId, ctx.userId)),
    });
    if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

    await db
      .delete(chatMessages)
      .where(and(eq(chatMessages.skillId, skillId), eq(chatMessages.userId, ctx.userId)));
    return { success: true };
  }),
});
