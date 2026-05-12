CREATE TABLE IF NOT EXISTS "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"action_type" varchar(50),
	"decision_reasoning" text,
	"confidence_score" numeric(5, 2),
	"was_executed" boolean DEFAULT false,
	"guardian_blocked" boolean DEFAULT false,
	"tx_hash" varchar(66),
	"og_decision_cid" varchar(200),
	"user_overrode" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_address" varchar(42) NOT NULL,
	"og_agent_id" varchar(200) NOT NULL,
	"soul_token_id" bigint,
	"soul_source_address" varchar(42),
	"mode" varchar(20) DEFAULT 'OBSERVE' NOT NULL,
	"is_active" boolean DEFAULT true,
	"actions_taken" integer DEFAULT 0,
	"last_action_at" timestamp with time zone,
	"deployed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_deployments_og_agent_id_unique" UNIQUE("og_agent_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "behavior_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"version" integer NOT NULL,
	"og_storage_cid" varchar(200) NOT NULL,
	"og_storage_tx" varchar(66),
	"total_actions_trained" integer,
	"performance_score" numeric(6, 2),
	"vector_dimensions" integer DEFAULT 512,
	"model_metadata" jsonb,
	"is_current" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" bigint NOT NULL,
	"transaction_type" varchar(20) NOT NULL,
	"seller_address" varchar(42),
	"buyer_address" varchar(42),
	"price_eth" numeric(20, 8),
	"rental_duration_days" integer,
	"tx_hash" varchar(66),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "soul_nfts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" bigint NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"model_id" uuid,
	"og_storage_cid" varchar(200) NOT NULL,
	"mint_tx" varchar(66),
	"performance_score" numeric(6, 2),
	"total_actions_trained" integer,
	"is_rentable" boolean DEFAULT false,
	"rental_price_per_day" numeric(20, 8),
	"is_for_sale" boolean DEFAULT false,
	"sale_price" numeric(20, 8),
	"times_rented" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "soul_nfts_token_id_unique" UNIQUE("token_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"ens_name" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	"last_seen" timestamp with time zone,
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"chain_id" integer NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"protocol" varchar(100),
	"asset_in" varchar(42),
	"asset_out" varchar(42),
	"amount_usd" numeric(20, 6),
	"gas_used" bigint,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"raw_data" jsonb,
	"indexed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wallet_actions_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agent_id_agent_deployments_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_deployments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "behavior_models" ADD CONSTRAINT "behavior_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "soul_nfts" ADD CONSTRAINT "soul_nfts_model_id_behavior_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."behavior_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_actions" ADD CONSTRAINT "wallet_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_actions_agent_id" ON "agent_actions" ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_actions_created_at" ON "agent_actions" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_behavior_models_user_id" ON "behavior_models" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marketplace_transactions_token_id" ON "marketplace_transactions" ("token_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wallet_actions_user_id" ON "wallet_actions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wallet_actions_block_timestamp" ON "wallet_actions" ("block_timestamp");