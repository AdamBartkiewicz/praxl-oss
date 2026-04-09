import { z } from "zod";
import { router, authedProcedure, mutationProcedure } from "../trpc";
import { db } from "@/db";
import { organizations, orgMembers, orgInvites, users, skills, projects } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";

import { v4 as uuid } from "uuid";
import { TRPCError } from "@trpc/server";
import { getPlanLimits } from "@/lib/plans";

export const orgRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const memberships = await db.query.orgMembers.findMany({
      where: eq(orgMembers.userId, ctx.userId),
      with: { org: true },
    });

    return memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      imageUrl: m.org.imageUrl,
      role: m.role,
      memberCount: 0, // will be enriched below
      joinedAt: m.joinedAt,
    }));
  }),

  get: authedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const membership = await db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.orgId, input), eq(orgMembers.userId, ctx.userId)),
      with: { org: true },
    });
    if (!membership) throw new TRPCError({ code: "NOT_FOUND" });

    const members = await db.query.orgMembers.findMany({
      where: eq(orgMembers.orgId, input),
      with: { user: true },
    });

    return {
      ...membership.org,
      role: membership.role,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        imageUrl: m.user.imageUrl,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  }),

  create: mutationProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const orgId = uuid();

      await db.insert(organizations).values({
        id: orgId,
        name: input.name,
        slug,
        ownerId: ctx.userId,
      });

      await db.insert(orgMembers).values({
        
        orgId,
        userId: ctx.userId,
        role: "owner",
      });

      return db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    }),

  invite: mutationProcedure
    .input(z.object({ orgId: z.string(), email: z.string().email(), role: z.enum(["admin", "member", "viewer"]).default("member") }))
    .mutation(async ({ ctx, input }) => {
      // Check caller is admin/owner
      const membership = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, ctx.userId)),
      });
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners and admins can invite members" });
      }

      const limit = getPlanLimits("pro").maxOrgMembers;
      if (typeof limit === "number") {
        const [{ c }] = await db.select({ c: count() }).from(orgMembers).where(eq(orgMembers.orgId, input.orgId));
        const [{ c: pending }] = await db.select({ c: count() }).from(orgInvites).where(eq(orgInvites.orgId, input.orgId));
        const total = Number(c) + Number(pending);
        if (total >= limit) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Organization member limit reached (${total}/${limit} including pending invites).`,
          });
        }
      }

      const token = uuid();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(orgInvites).values({

        orgId: input.orgId,
        email: input.email,
        role: input.role,
        token,
        expiresAt,
      });

      return { token, expiresAt };
    }),

  acceptInvite: mutationProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await db.query.orgInvites.findFirst({
        where: eq(orgInvites.token, input.token),
      });

      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite" });
      if (new Date(invite.expiresAt) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite expired" });
      }

      // Check not already a member
      const existing = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, invite.orgId), eq(orgMembers.userId, ctx.userId)),
      });
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Already a member" });

      await db.insert(orgMembers).values({
        
        orgId: invite.orgId,
        userId: ctx.userId,
        role: invite.role,
      });

      // Delete used invite
      await db.delete(orgInvites).where(eq(orgInvites.id, invite.id));

      return { success: true };
    }),

  members: authedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    // Verify caller is member
    const membership = await db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.orgId, input), eq(orgMembers.userId, ctx.userId)),
    });
    if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

    return db.query.orgMembers.findMany({
      where: eq(orgMembers.orgId, input),
      with: { user: true },
    });
  }),

  removeMember: mutationProcedure
    .input(z.object({ orgId: z.string(), memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const callerMembership = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, ctx.userId)),
      });
      if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const targetMember = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.id, input.memberId), eq(orgMembers.orgId, input.orgId)),
      });
      if (!targetMember) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found in this organization" });

      await db.delete(orgMembers).where(eq(orgMembers.id, targetMember.id));
      return { success: true };
    }),

  updateRole: mutationProcedure
    .input(z.object({ orgId: z.string(), memberId: z.string(), role: z.enum(["admin", "member", "viewer"]) }))
    .mutation(async ({ ctx, input }) => {
      const callerMembership = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, ctx.userId)),
      });
      if (!callerMembership || callerMembership.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owner can change roles" });
      }

      // Verify target member belongs to this org (prevent IDOR)
      const targetMember = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.id, input.memberId), eq(orgMembers.orgId, input.orgId)),
      });
      if (!targetMember) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found in this organization" });

      // Prevent owner from demoting themselves
      if (targetMember.userId === ctx.userId && targetMember.role === "owner") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role as owner. Transfer ownership first." });
      }

      await db.update(orgMembers).set({ role: input.role }).where(eq(orgMembers.id, targetMember.id));
      return { success: true };
    }),

  updateOrg: mutationProcedure
    .input(z.object({
      orgId: z.string(),
      name: z.string().min(1).max(100).optional(),
      imageUrl: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, ctx.userId)),
      });
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners and admins can edit organization settings" });
      }
      const updates: Record<string, unknown> = {};
      if (input.name) {
        updates.name = input.name;
        updates.slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
      if (input.imageUrl !== undefined) updates.imageUrl = input.imageUrl;
      if (Object.keys(updates).length > 0) {
        await db.update(organizations).set(updates).where(eq(organizations.id, input.orgId));
      }
      return db.query.organizations.findFirst({ where: eq(organizations.id, input.orgId) });
    }),

  leave: mutationProcedure
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, ctx.userId)),
      });
      if (!membership) throw new TRPCError({ code: "NOT_FOUND" });
      if (membership.role === "owner") {
        // Check if there are other members
        const others = await db.query.orgMembers.findMany({
          where: eq(orgMembers.orgId, input.orgId),
        });
        if (others.length > 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Transfer ownership before leaving. You're the only owner." });
        }
        // Last person - delete the org
        await db.delete(orgInvites).where(eq(orgInvites.orgId, input.orgId));
        await db.delete(orgMembers).where(eq(orgMembers.orgId, input.orgId));
        await db.delete(organizations).where(eq(organizations.id, input.orgId));
        return { deleted: true };
      }
      await db.delete(orgMembers).where(eq(orgMembers.id, membership.id));
      return { left: true };
    }),

  deleteOrg: mutationProcedure
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      if (org.ownerId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can delete an organization" });
      }
      // Unlink skills and projects from org (don't delete them - reassign to owner)
      await db.update(skills).set({ orgId: null }).where(eq(skills.orgId, input.orgId));
      await db.update(projects).set({ orgId: null }).where(eq(projects.orgId, input.orgId));
      // Delete org data
      await db.delete(orgInvites).where(eq(orgInvites.orgId, input.orgId));
      await db.delete(orgMembers).where(eq(orgMembers.orgId, input.orgId));
      await db.delete(organizations).where(eq(organizations.id, input.orgId));
      return { deleted: true };
    }),

  transferOwnership: mutationProcedure
    .input(z.object({ orgId: z.string(), newOwnerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org || org.ownerId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can transfer ownership" });
      }
      // Verify new owner is a member
      const newOwnerMembership = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, input.newOwnerId)),
      });
      if (!newOwnerMembership) throw new TRPCError({ code: "BAD_REQUEST", message: "New owner must be an existing member" });
      // Transfer
      await db.update(organizations).set({ ownerId: input.newOwnerId }).where(eq(organizations.id, input.orgId));
      await db.update(orgMembers).set({ role: "owner" }).where(eq(orgMembers.id, newOwnerMembership.id));
      // Demote old owner to admin
      const oldOwnerMembership = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, ctx.userId)),
      });
      if (oldOwnerMembership) {
        await db.update(orgMembers).set({ role: "admin" }).where(eq(orgMembers.id, oldOwnerMembership.id));
      }
      return { transferred: true };
    }),
});
