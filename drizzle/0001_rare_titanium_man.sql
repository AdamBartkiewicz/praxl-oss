CREATE TABLE "local_skill_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"slug" varchar(255) NOT NULL,
	"local_path" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"last_modified" timestamp,
	"reported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_target_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_skill_state" ADD CONSTRAINT "local_skill_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_target_assignments" ADD CONSTRAINT "skill_target_assignments_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_target_assignments" ADD CONSTRAINT "skill_target_assignments_target_id_sync_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."sync_targets"("id") ON DELETE cascade ON UPDATE no action;