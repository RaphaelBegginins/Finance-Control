import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const userProfiles = mysqlTable("userProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  monthlyIncomeCents: int("monthlyIncomeCents").default(0).notNull(),
  reserveCents: int("reserveCents").default(0).notNull(),
  annualIncomeGrowthRate: int("annualIncomeGrowthRate").default(0).notNull(),
  annualInflationRate: int("annualInflationRate").default(4).notNull(),
  annualInvestmentReturnRate: int("annualInvestmentReturnRate").default(8).notNull(),
  onboardingCompleted: boolean("onboardingCompleted").default(false).notNull(),
  demoEnabled: boolean("demoEnabled").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("userProfiles_userId_unique").on(table.userId)]);

export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  type: mysqlEnum("type", ["checking", "savings", "investment", "cash", "other"]).notNull(),
  color: varchar("color", { length: 20 }).default("#7864A8").notNull(),
  openingBalanceCents: int("openingBalanceCents").default(0).notNull(),
  isArchived: boolean("isArchived").default(false).notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("accounts_userId_idx").on(table.userId)]);

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  color: varchar("color", { length: 20 }).default("#7864A8").notNull(),
  icon: varchar("icon", { length: 40 }).default("circle").notNull(),
  essential: boolean("essential").default(false).notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("categories_userId_type_idx").on(table.userId, table.type)]);

export const recurrences = mysqlTable("recurrences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: int("accountId").references(() => accounts.id, { onDelete: "set null" }),
  categoryId: int("categoryId").references(() => categories.id, { onDelete: "set null" }),
  description: varchar("description", { length: 180 }).notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  amountCents: int("amountCents").notNull(),
  frequency: mysqlEnum("frequency", ["weekly", "monthly", "yearly"]).default("monthly").notNull(),
  nextOccurrenceAt: timestamp("nextOccurrenceAt").notNull(),
  endAt: timestamp("endAt"),
  isActive: boolean("isActive").default(true).notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("recurrences_userId_active_idx").on(table.userId, table.isActive)]);

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: int("accountId").references(() => accounts.id, { onDelete: "set null" }),
  categoryId: int("categoryId").references(() => categories.id, { onDelete: "set null" }),
  recurrenceId: int("recurrenceId").references(() => recurrences.id, { onDelete: "set null" }),
  description: varchar("description", { length: 180 }).notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  amountCents: int("amountCents").notNull(),
  occurredAt: timestamp("occurredAt").notNull(),
  dueAt: timestamp("dueAt"),
  paymentStatus: mysqlEnum("paymentStatus", ["paid", "pending", "overdue"]).default("paid").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 50 }),
  notes: text("notes"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("transactions_userId_occurredAt_idx").on(table.userId, table.occurredAt), index("transactions_userId_status_idx").on(table.userId, table.paymentStatus)]);

export const budgets = mysqlTable("budgets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: int("categoryId").notNull().references(() => categories.id, { onDelete: "cascade" }),
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  limitCents: int("limitCents").notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("budgets_user_category_month_unique").on(table.userId, table.categoryId, table.monthKey)]);

export const goals = mysqlTable("goals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: int("accountId").references(() => accounts.id, { onDelete: "set null" }),
  name: varchar("name", { length: 140 }).notNull(),
  targetCents: int("targetCents").notNull(),
  currentCents: int("currentCents").default(0).notNull(),
  monthlyContributionCents: int("monthlyContributionCents").default(0).notNull(),
  targetDate: timestamp("targetDate"),
  color: varchar("color", { length: 20 }).default("#7864A8").notNull(),
  status: mysqlEnum("status", ["active", "completed", "paused"]).default("active").notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("goals_userId_status_idx").on(table.userId, table.status)]);

export const cards = mysqlTable("cards", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  paymentAccountId: int("paymentAccountId").references(() => accounts.id, { onDelete: "set null" }),
  name: varchar("name", { length: 100 }).notNull(),
  brand: varchar("brand", { length: 30 }),
  limitCents: int("limitCents").notNull(),
  closingDay: int("closingDay").notNull(),
  dueDay: int("dueDay").notNull(),
  color: varchar("color", { length: 20 }).default("#5B477F").notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("cards_userId_idx").on(table.userId)]);

export const cardInvoices = mysqlTable("cardInvoices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cardId: int("cardId").notNull().references(() => cards.id, { onDelete: "cascade" }),
  referenceMonth: varchar("referenceMonth", { length: 7 }).notNull(),
  dueAt: timestamp("dueAt").notNull(),
  totalCents: int("totalCents").default(0).notNull(),
  status: mysqlEnum("status", ["open", "closed", "paid", "overdue"]).default("open").notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("cardInvoices_user_card_month_unique").on(table.userId, table.cardId, table.referenceMonth), index("cardInvoices_user_due_idx").on(table.userId, table.dueAt)]);

export const installments = mysqlTable("installments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cardId: int("cardId").notNull().references(() => cards.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 160 }).notNull(),
  installmentCents: int("installmentCents").notNull(),
  totalInstallments: int("totalInstallments").notNull(),
  currentInstallment: int("currentInstallment").default(1).notNull(),
  firstDueAt: timestamp("firstDueAt").notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("installments_user_card_idx").on(table.userId, table.cardId)]);

export const debts = mysqlTable("debts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: int("accountId").references(() => accounts.id, { onDelete: "set null" }),
  creditor: varchar("creditor", { length: 140 }).notNull(),
  originalCents: int("originalCents").notNull(),
  balanceCents: int("balanceCents").notNull(),
  annualInterestRate: int("annualInterestRate").default(0).notNull(),
  installmentsTotal: int("installmentsTotal").default(1).notNull(),
  monthlyPaymentCents: int("monthlyPaymentCents").notNull(),
  dueDay: int("dueDay").notNull(),
  status: mysqlEnum("status", ["active", "paid", "overdue"]).default("active").notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("debts_userId_status_idx").on(table.userId, table.status)]);

export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 140 }).notNull(),
  type: mysqlEnum("type", ["investment", "property", "vehicle", "other"]).notNull(),
  valueCents: int("valueCents").notNull(),
  updatedValueAt: timestamp("updatedValueAt").notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("assets_userId_idx").on(table.userId)]);

export const scenarios = mysqlTable("scenarios", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  incomeAdjustmentCents: int("incomeAdjustmentCents").default(0).notNull(),
  expenseAdjustmentCents: int("expenseAdjustmentCents").default(0).notNull(),
  monthlyContributionAdjustmentCents: int("monthlyContributionAdjustmentCents").default(0).notNull(),
  incomeGrowthAdjustmentRate: int("incomeGrowthAdjustmentRate").default(0).notNull(),
  inflationAdjustmentRate: int("inflationAdjustmentRate").default(0).notNull(),
  investmentReturnAdjustmentRate: int("investmentReturnAdjustmentRate").default(0).notNull(),
  oneOffPurchaseCents: int("oneOffPurchaseCents").default(0).notNull(),
  incomeLossMonths: int("incomeLossMonths").default(0).notNull(),
  isPreset: boolean("isPreset").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("scenarios_userId_idx").on(table.userId)]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["invoice", "debt", "recurrence", "goal", "budget", "insight"]).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  referenceType: varchar("referenceType", { length: 50 }),
  referenceId: int("referenceId"),
  dueAt: timestamp("dueAt"),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("notifications_userId_read_idx").on(table.userId, table.isRead), index("notifications_userId_due_idx").on(table.userId, table.dueAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
