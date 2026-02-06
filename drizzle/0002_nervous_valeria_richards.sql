CREATE TABLE `runner_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`story_id` text,
	`log_content` text NOT NULL,
	`log_type` text DEFAULT 'stdout' NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `runner_logs_project_id_idx` ON `runner_logs` (`project_id`);--> statement-breakpoint
CREATE INDEX `runner_logs_timestamp_idx` ON `runner_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `runner_logs_project_timestamp_idx` ON `runner_logs` (`project_id`,`timestamp`);