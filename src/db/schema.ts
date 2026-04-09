import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Auth & Organization ────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  imageUrl: text("image_url"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orgMembers = pgTable("org_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("member"), // owner, admin, member, viewer
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

// Skill usage events - tracked via CLI atime monitoring
export const skillUsageEvents = pgTable("skill_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  skillSlug: varchar("skill_slug", { length: 255 }).notNull(),
  platform: varchar("platform", { length: 50 }).notNull(),
  usedAt: timestamp("used_at").notNull(),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
});

// AI usage tracking - per-user, per-month counters for rate limiting
export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  month: varchar("month", { length: 7 }).notNull(), // "2026-04"
  reviewCount: integer("review_count").notNull().default(0),
  generateCount: integer("generate_count").notNull().default(0),
  chatCount: integer("chat_count").notNull().default(0),
});

// GDPR data subject requests (access, erasure, etc.) - audit trail for compliance
export const dataRequests = pgTable("data_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"), // nullable: user may be deleted, or request from non-user via email
  email: varchar("email", { length: 255 }).notNull(),
  type: varchar("type", { length: 30 }).notNull(), // access | erasure | rectification | restriction | portability | objection | consent_withdrawal | other
  source: varchar("source", { length: 20 }).notNull().default("in_app"), // in_app | email | other
  status: varchar("status", { length: 20 }).notNull().default("received"), // received | in_progress | completed | rejected
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
  handledBy: text("handled_by"), // admin userId who processed the request
});

export const orgInvites = pgTable("org_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("member"),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sharing: users explicitly share personal skills to org workspaces
export const orgSkillShares = pgTable("org_skill_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  sharedBy: text("shared_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedAt: timestamp("shared_at").notNull().defaultNow(),
});

// ─── Core Skills ────────────────────────────────────────────────────────────

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
  slug: varchar("slug", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  content: text("content").notNull().default(""),
  categoryId: text("category_id"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  platformHints: jsonb("platform_hints").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  currentVersion: integer("current_version").notNull().default(1),
  license: text("license"),
  compatibility: text("compatibility"),
  allowedTools: text("allowed_tools"),
  skillMetadata: jsonb("skill_metadata").$type<Record<string, string>>().default({}),
  skillCategory: text("skill_category"),
  pattern: text("pattern"),
  aiNotes: jsonb("ai_notes").$type<Array<{ note: string; createdAt: string }>>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const skillVersions = pgTable("skill_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  description: text("description").notNull().default(""),
  changelog: text("changelog"),
  author: text("author").notNull().default("user"),
  diffFromPrevious: text("diff_from_previous").default(""),
  files: jsonb("files").$type<Array<{ folder: string; filename: string; content: string; mimeType: string }>>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  context: text("context").default(""),
  template: text("template"),
  icon: text("icon"),
  color: text("color"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Sync ───────────────────────────────────────────────────────────────────

export const syncTargets = pgTable("sync_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
  platform: text("platform").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  basePath: text("base_path").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  syncMode: text("sync_mode").notNull().default("manual"),
  includeTags: jsonb("include_tags").$type<string[]>().default([]),
  excludeTags: jsonb("exclude_tags").$type<string[]>().default([]),
  includeProjects: jsonb("include_projects").$type<string[]>().default([]),
});

export const syncLog = pgTable("sync_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").notNull().references(() => syncTargets.id, { onDelete: "cascade" }),
  versionSynced: integer("version_synced").notNull(),
  status: text("status").notNull().default("success"),
  error: text("error"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

// Skill → Target assignments (which skills sync to which platforms)
export const skillTargetAssignments = pgTable("skill_target_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").notNull().references(() => syncTargets.id, { onDelete: "cascade" }),
  deployedVersion: integer("deployed_version").notNull().default(1),
  deployedAt: timestamp("deployed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Local skill state reported by CLI
export const localSkillState = pgTable("local_skill_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id),
  platform: text("platform").notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  localPath: text("local_path").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  lastModified: timestamp("last_modified"),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
});

// Incoming changes from CLI (like pull requests)
export const skillChangeRequests = pgTable("skill_change_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id),
  skillId: uuid("skill_id").references(() => skills.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 255 }).notNull(),
  source: text("source").notNull().default("local"), // "local" | "github"
  platform: text("platform").notNull(), // which tool the change came from
  oldContent: text("old_content"), // content before change (null if new skill)
  newContent: text("new_content").notNull(), // proposed new content
  status: text("status").notNull().default("pending"), // pending | accepted | rejected
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// ─── AI & Chat ──────────────────────────────────────────────────────────────

export const aiSuggestions = pgTable("ai_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  suggestion: text("suggestion").notNull(),
  proposedContent: text("proposed_content").notNull(),
  diff: text("diff").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  messageType: text("message_type").notNull().default("chat"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Files & Settings ───────────────────────────────────────────────────────

export const skillFiles = pgTable("skill_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  folder: text("folder").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  content: text("content").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull().default("text/plain"),
  size: integer("size").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id),
  key: varchar("key", { length: 255 }).notNull(),
  value: text("value").notNull(),
});

// ─── Marketplace Index ─────────────────────────────────────────────────────

export const marketplaceSkills = pgTable("marketplace_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: varchar("creator_id", { length: 100 }).notNull(), // matches Creator.id
  creatorName: varchar("creator_name", { length: 255 }).notNull(),
  repo: varchar("repo", { length: 255 }).notNull(), // owner/repo
  slug: varchar("slug", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  path: text("path").notNull(), // path in repo
  category: varchar("category", { length: 50 }).notNull().default("curated"),
  searchText: text("search_text").notNull().default(""), // name + description + slug lowercased for search
  indexedAt: timestamp("indexed_at").notNull().defaultNow(),
});

// ─── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  skills: many(skills),
  projects: many(projects),
  orgMemberships: many(orgMembers),
  ownedOrgs: many(organizations),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, { fields: [organizations.ownerId], references: [users.id] }),
  members: many(orgMembers),
  skills: many(skills),
  projects: many(projects),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  org: one(organizations, { fields: [orgMembers.orgId], references: [organizations.id] }),
  user: one(users, { fields: [orgMembers.userId], references: [users.id] }),
}));

export const skillsRelations = relations(skills, ({ one, many }) => ({
  user: one(users, { fields: [skills.userId], references: [users.id] }),
  org: one(organizations, { fields: [skills.orgId], references: [organizations.id] }),
  project: one(projects, { fields: [skills.projectId], references: [projects.id] }),
  versions: many(skillVersions),
  files: many(skillFiles),
  syncLogs: many(syncLog),
  aiSuggestions: many(aiSuggestions),
  chatMessages: many(chatMessages),
}));

export const skillVersionsRelations = relations(skillVersions, ({ one }) => ({
  skill: one(skills, { fields: [skillVersions.skillId], references: [skills.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  org: one(organizations, { fields: [projects.orgId], references: [organizations.id] }),
  skills: many(skills),
}));

export const syncTargetsRelations = relations(syncTargets, ({ one, many }) => ({
  user: one(users, { fields: [syncTargets.userId], references: [users.id] }),
  syncLogs: many(syncLog),
  assignments: many(skillTargetAssignments),
}));

export const skillTargetAssignmentsRelations = relations(skillTargetAssignments, ({ one }) => ({
  skill: one(skills, { fields: [skillTargetAssignments.skillId], references: [skills.id] }),
  target: one(syncTargets, { fields: [skillTargetAssignments.targetId], references: [syncTargets.id] }),
}));

export const syncLogRelations = relations(syncLog, ({ one }) => ({
  skill: one(skills, { fields: [syncLog.skillId], references: [skills.id] }),
  target: one(syncTargets, { fields: [syncLog.targetId], references: [syncTargets.id] }),
}));

export const skillFilesRelations = relations(skillFiles, ({ one }) => ({
  skill: one(skills, { fields: [skillFiles.skillId], references: [skills.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  skill: one(skills, { fields: [chatMessages.skillId], references: [skills.id] }),
  user: one(users, { fields: [chatMessages.userId], references: [users.id] }),
}));

export const appSettingsRelations = relations(appSettings, ({ one }) => ({
  user: one(users, { fields: [appSettings.userId], references: [users.id] }),
}));

export const aiSuggestionsRelations = relations(aiSuggestions, ({ one }) => ({
  skill: one(skills, { fields: [aiSuggestions.skillId], references: [skills.id] }),
}));

export const orgSkillSharesRelations = relations(orgSkillShares, ({ one }) => ({
  org: one(organizations, { fields: [orgSkillShares.orgId], references: [organizations.id] }),
  skill: one(skills, { fields: [orgSkillShares.skillId], references: [skills.id] }),
  sharer: one(users, { fields: [orgSkillShares.sharedBy], references: [users.id] }),
}));
