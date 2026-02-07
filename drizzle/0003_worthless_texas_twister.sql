CREATE TABLE `brainstorm_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`title` text,
	`status` text DEFAULT 'active' NOT NULL,
	`generated_stories` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brainstorm_sessions_project_id_idx` ON `brainstorm_sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX `brainstorm_sessions_created_at_idx` ON `brainstorm_sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `brainstorm_sessions_project_created_idx` ON `brainstorm_sessions` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `brainstorm_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`generated_stories` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `brainstorm_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brainstorm_messages_session_id_idx` ON `brainstorm_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `brainstorm_messages_session_created_idx` ON `brainstorm_messages` (`session_id`,`created_at`);