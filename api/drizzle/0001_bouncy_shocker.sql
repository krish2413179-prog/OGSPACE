ALTER TABLE "behavior_models" ADD COLUMN "model_type" varchar(20) DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE "behavior_models" ADD COLUMN "source_address" varchar(42);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_behavior_models_type" ON "behavior_models" ("model_type");