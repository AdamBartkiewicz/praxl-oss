CREATE TABLE "marketplace_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar(100) NOT NULL,
	"creator_name" varchar(255) NOT NULL,
	"repo" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"path" text NOT NULL,
	"category" varchar(50) DEFAULT 'curated' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "context" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "template" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "files" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "ai_notes" jsonb DEFAULT '[]'::jsonb;