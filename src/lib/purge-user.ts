import { db } from "@/db";
import {
  users, skills, skillVersions, skillFiles, skillTargetAssignments,
  syncLog, syncTargets, aiSuggestions, chatMessages, projects,
  appSettings, orgMembers, localSkillState, skillChangeRequests,
} from "@/db/schema";
import { eq } from "drizzle-orm";

/** Delete all user data from the database. Used by account deletion and webhook. */
export async function purgeUserData(userId: string) {
  // Delete skills children first (assignments, files, versions), then skills
  const userSkills = await db.select({ id: skills.id }).from(skills).where(eq(skills.userId, userId));
  const skillIds = userSkills.map((s) => s.id);
  if (skillIds.length > 0) {
    for (const sid of skillIds) {
      await db.delete(skillTargetAssignments).where(eq(skillTargetAssignments.skillId, sid));
      await db.delete(skillFiles).where(eq(skillFiles.skillId, sid));
      await db.delete(skillVersions).where(eq(skillVersions.skillId, sid));
      await db.delete(aiSuggestions).where(eq(aiSuggestions.skillId, sid));
      await db.delete(syncLog).where(eq(syncLog.skillId, sid));
      await db.delete(chatMessages).where(eq(chatMessages.skillId, sid));
    }
  }
  await db.delete(chatMessages).where(eq(chatMessages.userId, userId));
  await db.delete(skillChangeRequests).where(eq(skillChangeRequests.userId, userId));
  await db.delete(localSkillState).where(eq(localSkillState.userId, userId));
  await db.delete(skills).where(eq(skills.userId, userId));
  await db.delete(syncTargets).where(eq(syncTargets.userId, userId));
  await db.delete(projects).where(eq(projects.userId, userId));
  await db.delete(appSettings).where(eq(appSettings.userId, userId));
  await db.delete(orgMembers).where(eq(orgMembers.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}
