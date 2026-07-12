CREATE TABLE "cli_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(100) DEFAULT 'CLI token' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_prefix" varchar(24) NOT NULL,
	"scopes" jsonb DEFAULT '["cli"]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "cli_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "cli_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
