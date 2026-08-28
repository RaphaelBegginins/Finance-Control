CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('checking','savings','investment','cash','other') NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#7864A8',
	`openingBalanceCents` int NOT NULL DEFAULT 0,
	`isArchived` boolean NOT NULL DEFAULT false,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`type` enum('investment','property','vehicle','other') NOT NULL,
	`valueCents` int NOT NULL,
	`updatedValueAt` timestamp NOT NULL,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`limitCents` int NOT NULL,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budgets_id` PRIMARY KEY(`id`),
	CONSTRAINT `budgets_user_category_month_unique` UNIQUE(`userId`,`categoryId`,`monthKey`)
);
--> statement-breakpoint
CREATE TABLE `cardInvoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cardId` int NOT NULL,
	`referenceMonth` varchar(7) NOT NULL,
	`dueAt` timestamp NOT NULL,
	`totalCents` int NOT NULL DEFAULT 0,
	`status` enum('open','closed','paid','overdue') NOT NULL DEFAULT 'open',
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cardInvoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `cardInvoices_user_card_month_unique` UNIQUE(`userId`,`cardId`,`referenceMonth`)
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`paymentAccountId` int,
	`name` varchar(100) NOT NULL,
	`brand` varchar(30),
	`limitCents` int NOT NULL,
	`closingDay` int NOT NULL,
	`dueDay` int NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#5B477F',
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#7864A8',
	`icon` varchar(40) NOT NULL DEFAULT 'circle',
	`essential` boolean NOT NULL DEFAULT false,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int,
	`creditor` varchar(140) NOT NULL,
	`originalCents` int NOT NULL,
	`balanceCents` int NOT NULL,
	`annualInterestRate` int NOT NULL DEFAULT 0,
	`installmentsTotal` int NOT NULL DEFAULT 1,
	`monthlyPaymentCents` int NOT NULL,
	`dueDay` int NOT NULL,
	`status` enum('active','paid','overdue') NOT NULL DEFAULT 'active',
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `debts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int,
	`name` varchar(140) NOT NULL,
	`targetCents` int NOT NULL,
	`currentCents` int NOT NULL DEFAULT 0,
	`monthlyContributionCents` int NOT NULL DEFAULT 0,
	`targetDate` timestamp,
	`color` varchar(20) NOT NULL DEFAULT '#7864A8',
	`status` enum('active','completed','paused') NOT NULL DEFAULT 'active',
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `installments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cardId` int NOT NULL,
	`description` varchar(160) NOT NULL,
	`installmentCents` int NOT NULL,
	`totalInstallments` int NOT NULL,
	`currentInstallment` int NOT NULL DEFAULT 1,
	`firstDueAt` timestamp NOT NULL,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `installments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('invoice','debt','recurrence','goal','budget','insight') NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`referenceType` varchar(50),
	`referenceId` int,
	`dueAt` timestamp,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recurrences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int,
	`categoryId` int,
	`description` varchar(180) NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`amountCents` int NOT NULL,
	`frequency` enum('weekly','monthly','yearly') NOT NULL DEFAULT 'monthly',
	`nextOccurrenceAt` timestamp NOT NULL,
	`endAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recurrences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`incomeAdjustmentCents` int NOT NULL DEFAULT 0,
	`expenseAdjustmentCents` int NOT NULL DEFAULT 0,
	`monthlyContributionAdjustmentCents` int NOT NULL DEFAULT 0,
	`incomeGrowthAdjustmentRate` int NOT NULL DEFAULT 0,
	`inflationAdjustmentRate` int NOT NULL DEFAULT 0,
	`investmentReturnAdjustmentRate` int NOT NULL DEFAULT 0,
	`oneOffPurchaseCents` int NOT NULL DEFAULT 0,
	`incomeLossMonths` int NOT NULL DEFAULT 0,
	`isPreset` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scenarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int,
	`categoryId` int,
	`recurrenceId` int,
	`description` varchar(180) NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`amountCents` int NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`dueAt` timestamp,
	`paymentStatus` enum('paid','pending','overdue') NOT NULL DEFAULT 'paid',
	`paymentMethod` varchar(50),
	`notes` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`monthlyIncomeCents` int NOT NULL DEFAULT 0,
	`reserveCents` int NOT NULL DEFAULT 0,
	`annualIncomeGrowthRate` int NOT NULL DEFAULT 0,
	`annualInflationRate` int NOT NULL DEFAULT 4,
	`annualInvestmentReturnRate` int NOT NULL DEFAULT 8,
	`onboardingCompleted` boolean NOT NULL DEFAULT false,
	`demoEnabled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `userProfiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assets` ADD CONSTRAINT `assets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cardInvoices` ADD CONSTRAINT `cardInvoices_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cardInvoices` ADD CONSTRAINT `cardInvoices_cardId_cards_id_fk` FOREIGN KEY (`cardId`) REFERENCES `cards`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cards` ADD CONSTRAINT `cards_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cards` ADD CONSTRAINT `cards_paymentAccountId_accounts_id_fk` FOREIGN KEY (`paymentAccountId`) REFERENCES `accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debts` ADD CONSTRAINT `debts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debts` ADD CONSTRAINT `debts_accountId_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goals` ADD CONSTRAINT `goals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goals` ADD CONSTRAINT `goals_accountId_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `installments` ADD CONSTRAINT `installments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `installments` ADD CONSTRAINT `installments_cardId_cards_id_fk` FOREIGN KEY (`cardId`) REFERENCES `cards`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurrences` ADD CONSTRAINT `recurrences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurrences` ADD CONSTRAINT `recurrences_accountId_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurrences` ADD CONSTRAINT `recurrences_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scenarios` ADD CONSTRAINT `scenarios_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_accountId_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_recurrenceId_recurrences_id_fk` FOREIGN KEY (`recurrenceId`) REFERENCES `recurrences`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userProfiles` ADD CONSTRAINT `userProfiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `accounts_userId_idx` ON `accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `assets_userId_idx` ON `assets` (`userId`);--> statement-breakpoint
CREATE INDEX `cardInvoices_user_due_idx` ON `cardInvoices` (`userId`,`dueAt`);--> statement-breakpoint
CREATE INDEX `cards_userId_idx` ON `cards` (`userId`);--> statement-breakpoint
CREATE INDEX `categories_userId_type_idx` ON `categories` (`userId`,`type`);--> statement-breakpoint
CREATE INDEX `debts_userId_status_idx` ON `debts` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `goals_userId_status_idx` ON `goals` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `installments_user_card_idx` ON `installments` (`userId`,`cardId`);--> statement-breakpoint
CREATE INDEX `notifications_userId_read_idx` ON `notifications` (`userId`,`isRead`);--> statement-breakpoint
CREATE INDEX `notifications_userId_due_idx` ON `notifications` (`userId`,`dueAt`);--> statement-breakpoint
CREATE INDEX `recurrences_userId_active_idx` ON `recurrences` (`userId`,`isActive`);--> statement-breakpoint
CREATE INDEX `scenarios_userId_idx` ON `scenarios` (`userId`);--> statement-breakpoint
CREATE INDEX `transactions_userId_occurredAt_idx` ON `transactions` (`userId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `transactions_userId_status_idx` ON `transactions` (`userId`,`paymentStatus`);