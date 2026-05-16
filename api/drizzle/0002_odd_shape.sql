ALTER TABLE "agent_deployments" ADD COLUMN "active_model_id" uuid;--> statement-breakpoint
ALTER TABLE "behavior_models" ADD COLUMN "og_storage_seq" varchar(20);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_active_model_id_behavior_models_id_fk" FOREIGN KEY ("active_model_id") REFERENCES "public"."behavior_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
