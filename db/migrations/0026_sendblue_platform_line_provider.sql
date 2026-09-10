ALTER TABLE "platform_lines" DROP CONSTRAINT "platform_lines_provider_check";
--> statement-breakpoint
ALTER TABLE "platform_lines" ADD CONSTRAINT "platform_lines_provider_check" CHECK ("platform_lines"."provider" IN ('linq', 'sendblue'));
