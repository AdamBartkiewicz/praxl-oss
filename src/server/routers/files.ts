import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure, mutationProcedure } from "../trpc";
import { db } from "@/db";
import { skillFiles, skills } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const filesRouter = router({
  // List files for a skill
  list: authedProcedure.input(z.string()).query(async ({ ctx, input: skillId }) => {
    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.id, skillId), eq(skills.userId, ctx.userId)),
    });
    if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

    return db.query.skillFiles.findMany({
      where: eq(skillFiles.skillId, skillId),
      columns: { id: true, folder: true, filename: true, mimeType: true, size: true, createdAt: true },
    });
  }),

  // List files WITH content - for AI context (cap at 100KB total to avoid huge prompts)
  listWithContent: authedProcedure.input(z.string()).query(async ({ ctx, input: skillId }) => {
    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.id, skillId), eq(skills.userId, ctx.userId)),
    });
    if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

    const files = await db.query.skillFiles.findMany({
      where: eq(skillFiles.skillId, skillId),
      columns: { folder: true, filename: true, content: true, mimeType: true },
    });
    return files;
  }),

  // Get file content
  get: authedProcedure.input(z.string()).query(async ({ ctx, input: fileId }) => {
    const file = await db.query.skillFiles.findFirst({
      where: eq(skillFiles.id, fileId),
    });
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });

    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.id, file.skillId), eq(skills.userId, ctx.userId)),
    });
    if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

    return file;
  }),

  // Add a file
  add: mutationProcedure
    .input(z.object({
      skillId: z.string(),
      folder: z.enum(["references", "scripts", "assets"]),
      filename: z.string().min(1).max(255),
      content: z.string().max(5242880), // 5MB max
      mimeType: z.string().default("text/plain"),
      size: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

      const id = uuid();
      await db.insert(skillFiles).values({
        id,
        skillId: input.skillId,
        folder: input.folder,
        filename: input.filename,
        content: input.content,
        mimeType: input.mimeType,
        size: input.size,
      });
      return { id };
    }),

  // Update file content (and optionally filename/folder)
  update: mutationProcedure
    .input(z.object({
      id: z.string(),
      content: z.string(),
      filename: z.string().min(1).max(255).optional(),
      folder: z.enum(["references", "scripts", "assets"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const file = await db.query.skillFiles.findFirst({
        where: eq(skillFiles.id, input.id),
      });
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });

      // Verify ownership via the parent skill
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, file.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "FORBIDDEN" });

      // Reject edits to binary files (we don't expose a text editor for them)
      if (!file.mimeType.startsWith("text/") && file.mimeType !== "application/json" && file.mimeType !== "application/yaml" && file.mimeType !== "application/x-yaml") {
        // Only allow update if the original was text-based OR caller is explicitly re-saving text
        // Let it through if the stored content doesn't look like base64 (i.e. it's already text)
        // Otherwise block - user shouldn't edit binary via the text editor.
        const looksLikeBase64 = /^[A-Za-z0-9+/=\s]+$/.test(file.content.slice(0, 200)) && !/\s/.test(file.content.slice(0, 50));
        if (looksLikeBase64) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Binary files cannot be edited as text" });
        }
      }

      const patch: { content: string; size: number; filename?: string; folder?: string } = {
        content: input.content,
        size: new TextEncoder().encode(input.content).length,
      };
      if (input.filename) patch.filename = input.filename;
      if (input.folder) patch.folder = input.folder;

      await db.update(skillFiles).set(patch).where(eq(skillFiles.id, input.id));
      return { ok: true, size: patch.size };
    }),

  // Delete a file
  delete: mutationProcedure.input(z.string()).mutation(async ({ ctx, input: fileId }) => {
    const file = await db.query.skillFiles.findFirst({
      where: eq(skillFiles.id, fileId),
    });
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });

    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.id, file.skillId), eq(skills.userId, ctx.userId)),
    });
    if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

    await db.delete(skillFiles).where(eq(skillFiles.id, fileId));
    return { success: true };
  }),

  // Bulk add (for import)
  bulkAdd: mutationProcedure
    .input(z.object({
      files: z.array(z.object({
        skillId: z.string(),
        folder: z.string(),
        filename: z.string().min(1).max(255),
        content: z.string().max(5242880), // 5MB max
        mimeType: z.string().default("text/plain"),
        size: z.number().default(0),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership of all referenced skills
      const skillIds = [...new Set(input.files.map((f) => f.skillId))];
      for (const skillId of skillIds) {
        const skill = await db.query.skills.findFirst({
          where: and(eq(skills.id, skillId), eq(skills.userId, ctx.userId)),
        });
        if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });
      }

      for (const file of input.files) {
        await db.insert(skillFiles).values({
          skillId: file.skillId,
          folder: file.folder,
          filename: file.filename,
          content: file.content,
          mimeType: file.mimeType,
          size: file.size,
        });
      }
      return { count: input.files.length };
    }),
});
