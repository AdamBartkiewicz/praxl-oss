import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, orgSkillShares } from "@/db/schema";
import { TRPCError } from "@trpc/server";

/**
 * Validates that a user is a member of the given org.
 * Throws FORBIDDEN if not a member.
 */
export async function validateOrgMembership(userId: string, orgId: string) {
  const membership = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)),
  });
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization" });
  }
  return membership;
}

/**
 * Returns skill IDs shared to an org workspace.
 * Used for org workspace queries - skills are shared explicitly, not owned by org.
 */
export async function getOrgSharedSkillIds(orgId: string): Promise<string[]> {
  const shares = await db.query.orgSkillShares.findMany({
    where: eq(orgSkillShares.orgId, orgId),
    columns: { skillId: true },
  });
  return shares.map((s) => s.skillId);
}

/**
 * Builds a Drizzle where clause for workspace-scoped queries.
 * - Personal workspace: user's own skills where orgId IS NULL
 * - Org workspace: skills shared to that org via orgSkillShares
 *
 * For org workspaces, call getOrgSharedSkillIds first and pass the IDs.
 */
export function buildPersonalFilter(
  table: { userId: any; orgId: any },
  userId: string,
) {
  return and(eq(table.userId, userId), isNull(table.orgId));
}

/**
 * Auto-create the org_skill_shares table if it doesn't exist.
 */
let migrationDone = false;
export async function ensureOrgSkillSharesTable() {
  if (migrationDone) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS org_skill_shares (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      shared_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shared_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE(org_id, skill_id)
    )
  `);
  migrationDone = true;
}
