import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  accounts,
  assets,
  budgets,
  cardInvoices,
  cards,
  categories,
  debts,
  goals,
  installments,
  notifications,
  recurrences,
  scenarios,
  transactions,
  userProfiles,
  users,
  type InsertUser,
} from "../drizzle/schema";
import { calculateDebtPayoff, calculateEmergencyMonths, calculateGoalMonthlyContribution, calculateIncomeCommitment, calculateNetWorth, calculateSavingsRate, simulateProjection } from "../shared/finance";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function ensureProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.insert(userProfiles).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
  return (await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1))[0]!;
}

export async function getFinanceSnapshot(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [profile, accountsRows, categoriesRows, transactionRows, recurrenceRows, budgetRows, goalRows, cardRows, invoiceRows, installmentRows, debtRows, assetRows, scenarioRows, notificationRows] = await Promise.all([
    ensureProfile(userId),
    db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(asc(accounts.name)),
    db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.name)),
    db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.occurredAt)),
    db.select().from(recurrences).where(eq(recurrences.userId, userId)).orderBy(asc(recurrences.nextOccurrenceAt)),
    db.select().from(budgets).where(eq(budgets.userId, userId)),
    db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.targetDate)),
    db.select().from(cards).where(eq(cards.userId, userId)),
    db.select().from(cardInvoices).where(eq(cardInvoices.userId, userId)).orderBy(asc(cardInvoices.dueAt)),
    db.select().from(installments).where(eq(installments.userId, userId)),
    db.select().from(debts).where(eq(debts.userId, userId)).orderBy(asc(debts.dueDay)),
    db.select().from(assets).where(eq(assets.userId, userId)).orderBy(asc(assets.name)),
    db.select().from(scenarios).where(eq(scenarios.userId, userId)).orderBy(asc(scenarios.name)),
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)),
  ]);
  return { profile, accounts: accountsRows, categories: categoriesRows, transactions: transactionRows, recurrences: recurrenceRows, budgets: budgetRows, goals: goalRows, cards: cardRows, invoices: invoiceRows, installments: installmentRows, debts: debtRows, assets: assetRows, scenarios: scenarioRows, notifications: notificationRows };
}

function currentMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthlyAmount(amount: number, frequency: "weekly" | "monthly" | "yearly") {
  if (frequency === "weekly") return Math.round(amount * 4.345);
  if (frequency === "yearly") return Math.round(amount / 12);
  return amount;
}

export async function getDashboardData(userId: number) {
  const snapshot = await getFinanceSnapshot(userId);
  const now = new Date();
  const monthKey = currentMonthKey(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const currentTransactions = snapshot.transactions.filter(item => item.occurredAt >= monthStart && item.occurredAt < nextMonthStart);
  const paidTransactions = snapshot.transactions.filter(item => item.paymentStatus === "paid");
  const accountBalances = snapshot.accounts.map(account => ({
    ...account,
    balanceCents: account.openingBalanceCents + paidTransactions.filter(item => item.accountId === account.id).reduce((sum, item) => sum + (item.type === "income" ? item.amountCents : -item.amountCents), 0),
  }));
  const monthIncomeCents = currentTransactions.filter(item => item.type === "income").reduce((sum, item) => sum + item.amountCents, 0);
  const monthExpensesCents = currentTransactions.filter(item => item.type === "expense").reduce((sum, item) => sum + item.amountCents, 0);
  const monthlyRecurringIncomeCents = snapshot.recurrences.filter(item => item.isActive && item.type === "income").reduce((sum, item) => sum + monthlyAmount(item.amountCents, item.frequency), 0);
  const fixedExpenseCents = snapshot.recurrences.filter(item => item.isActive && item.type === "expense").reduce((sum, item) => sum + monthlyAmount(item.amountCents, item.frequency), 0) + snapshot.debts.filter(item => item.status === "active").reduce((sum, item) => sum + item.monthlyPaymentCents, 0);
  const monthlyIncomeCents = snapshot.profile.monthlyIncomeCents || Math.max(monthIncomeCents, monthlyRecurringIncomeCents);
  const accountAssetCents = accountBalances.filter(account => !account.isArchived).reduce((sum, account) => sum + account.balanceCents, 0);
  const assetCents = accountAssetCents + snapshot.assets.reduce((sum, item) => sum + item.valueCents, 0);
  const liabilityCents = snapshot.debts.filter(item => item.status !== "paid").reduce((sum, item) => sum + item.balanceCents, 0) + snapshot.invoices.filter(item => item.status !== "paid").reduce((sum, item) => sum + item.totalCents, 0);
  const netWorthCents = calculateNetWorth(assetCents, liabilityCents);
  const categoryMap = new Map(snapshot.categories.map(category => [category.id, category]));
  const categorySpend = snapshot.categories.filter(category => category.type === "expense").map(category => ({
    categoryId: category.id,
    name: category.name,
    color: category.color,
    amountCents: currentTransactions.filter(item => item.type === "expense" && item.categoryId === category.id).reduce((sum, item) => sum + item.amountCents, 0),
  })).filter(item => item.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents);
  const budgetProgress = snapshot.budgets.filter(budget => budget.monthKey === monthKey).map(budget => {
    const category = categoryMap.get(budget.categoryId);
    const spentCents = currentTransactions.filter(item => item.type === "expense" && item.categoryId === budget.categoryId).reduce((sum, item) => sum + item.amountCents, 0);
    return { ...budget, categoryName: category?.name ?? "Categoria", color: category?.color ?? "#7864A8", spentCents, progress: budget.limitCents ? Math.round((spentCents / budget.limitCents) * 100) : 0 };
  });
  const essentialExpenseCents = currentTransactions.filter(item => item.type === "expense" && item.categoryId && categoryMap.get(item.categoryId)?.essential).reduce((sum, item) => sum + item.amountCents, 0) || fixedExpenseCents;
  const reserveCents = accountBalances.filter(account => account.type === "savings" || account.type === "cash").reduce((sum, item) => sum + item.balanceCents, 0);
  const goalContributionCents = snapshot.goals.filter(goal => goal.status === "active").reduce((sum, goal) => sum + goal.monthlyContributionCents, 0);
  const upcoming = [
    ...snapshot.transactions.filter(item => item.paymentStatus !== "paid" && item.dueAt).map(item => ({ id: `transaction-${item.id}`, label: item.description, dueAt: item.dueAt!, amountCents: item.amountCents, type: "Conta" })),
    ...snapshot.invoices.filter(item => item.status !== "paid").map(item => ({ id: `invoice-${item.id}`, label: `Fatura ${snapshot.cards.find(card => card.id === item.cardId)?.name ?? "cartão"}`, dueAt: item.dueAt, amountCents: item.totalCents, type: "Cartão" })),
    ...snapshot.debts.filter(item => item.status === "active").map(item => ({ id: `debt-${item.id}`, label: item.creditor, dueAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), item.dueDay)), amountCents: item.monthlyPaymentCents, type: "Dívida" })),
  ].filter(item => item.dueAt >= now).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()).slice(0, 6);
  const cashflow = Array.from({ length: 6 }, (_, position) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + position, 1));
    const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    const list = snapshot.transactions.filter(item => item.occurredAt >= start && item.occurredAt < end);
    return { label: month.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), receitas: list.filter(item => item.type === "income").reduce((sum, item) => sum + item.amountCents, 0), despesas: list.filter(item => item.type === "expense").reduce((sum, item) => sum + item.amountCents, 0) };
  });
  const monthOffset = (dueAt: Date) => Math.max(1, Math.min(120, (dueAt.getUTCFullYear() - now.getUTCFullYear()) * 12 + dueAt.getUTCMonth() - now.getUTCMonth() + 1));
  const cardCommitmentEvents = [
    ...snapshot.invoices.filter(invoice => invoice.status !== "paid").map(invoice => ({ month: monthOffset(invoice.dueAt), amountCents: invoice.totalCents, kind: "expense" as const })),
    ...snapshot.installments.flatMap(item => Array.from({ length: Math.max(0, item.totalInstallments - item.currentInstallment + 1) }, (_, index) => ({ month: Math.max(1, monthOffset(item.firstDueAt) + index), amountCents: item.installmentCents, kind: "expense" as const }))),
  ];
  const projectionBase = {
    startingBalanceCents: accountAssetCents,
    monthlyIncomeCents,
    monthlyFixedExpenseCents: fixedExpenseCents,
    monthlyVariableExpenseCents: monthExpensesCents,
    monthlyContributionCents: goalContributionCents,
    annualIncomeGrowthRate: snapshot.profile.annualIncomeGrowthRate,
    annualInflationRate: snapshot.profile.annualInflationRate,
    annualInvestmentReturnRate: snapshot.profile.annualInvestmentReturnRate,
    oneOffEvents: cardCommitmentEvents,
  };
  const projection = simulateProjection({ ...projectionBase, months: 120 });
  const goalForecast = snapshot.goals.map(goal => {
    const progress = goal.targetCents > 0 ? Math.min(100, Math.round((goal.currentCents / goal.targetCents) * 100)) : 0;
    const monthlyContributionCents = goal.monthlyContributionCents;
    const remainingCents = Math.max(0, goal.targetCents - goal.currentCents);
    const monthsToCompletion = monthlyContributionCents > 0 ? Math.ceil(remainingCents / monthlyContributionCents) : null;
    const estimatedCompletionAt = monthsToCompletion === null ? null : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsToCompletion, 1));
    const requiredContributionCents = goal.targetDate ? calculateGoalMonthlyContribution(goal.targetCents, goal.currentCents, goal.targetDate, now) : monthlyContributionCents;
    return { goalId: goal.id, progress, monthsToCompletion, estimatedCompletionAt, requiredContributionCents };
  });
  const debtForecast = snapshot.debts.map(debt => ({
    debtId: debt.id,
    regular: calculateDebtPayoff(debt.balanceCents, debt.monthlyPaymentCents, debt.annualInterestRate),
    withExtra300: calculateDebtPayoff(debt.balanceCents, debt.monthlyPaymentCents, debt.annualInterestRate, 30000),
  }));
  return {
    ...snapshot,
    accounts: accountBalances,
    summary: {
      balanceCents: accountAssetCents,
      monthIncomeCents,
      monthExpensesCents,
      savedCents: monthIncomeCents - monthExpensesCents,
      savingsRate: calculateSavingsRate(monthIncomeCents, monthExpensesCents),
      incomeCommitment: calculateIncomeCommitment(monthlyIncomeCents, fixedExpenseCents),
      netWorthCents,
      assetCents,
      liabilityCents,
      emergencyMonths: calculateEmergencyMonths(reserveCents, essentialExpenseCents),
      endOfMonthCents: accountAssetCents + monthlyIncomeCents - monthExpensesCents - fixedExpenseCents,
    },
    budgetProgress,
    categorySpend,
    upcoming,
    cashflow,
    projection,
    projectionBase,
    goalForecast,
    debtForecast,
  };
}

export async function getScenarioComparison(userId: number, input: { months: number; incomeAdjustmentCents: number; expenseAdjustmentCents: number; monthlyContributionAdjustmentCents: number; incomeGrowthAdjustmentRate: number; inflationAdjustmentRate: number; investmentReturnAdjustmentRate: number; oneOffPurchaseCents: number; incomeLossMonths: number; newDebtPaymentCents: number }) {
  const dashboard = await getDashboardData(userId);
  const base = dashboard.projectionBase;
  const scenario = (overrides: Partial<typeof input>) => simulateProjection({
    ...base,
    months: input.months,
    monthlyIncomeCents: Math.max(0, base.monthlyIncomeCents + (overrides.incomeAdjustmentCents ?? input.incomeAdjustmentCents)),
    monthlyFixedExpenseCents: Math.max(0, base.monthlyFixedExpenseCents + (overrides.newDebtPaymentCents ?? input.newDebtPaymentCents)),
    monthlyVariableExpenseCents: Math.max(0, base.monthlyVariableExpenseCents + (overrides.expenseAdjustmentCents ?? input.expenseAdjustmentCents)),
    monthlyContributionCents: Math.max(0, base.monthlyContributionCents + (overrides.monthlyContributionAdjustmentCents ?? input.monthlyContributionAdjustmentCents)),
    annualIncomeGrowthRate: base.annualIncomeGrowthRate + (overrides.incomeGrowthAdjustmentRate ?? input.incomeGrowthAdjustmentRate),
    annualInflationRate: Math.max(0, base.annualInflationRate + (overrides.inflationAdjustmentRate ?? input.inflationAdjustmentRate)),
    annualInvestmentReturnRate: base.annualInvestmentReturnRate + (overrides.investmentReturnAdjustmentRate ?? input.investmentReturnAdjustmentRate),
    oneOffEvents: [
      ...(base.oneOffEvents ?? []),
      ...(input.oneOffPurchaseCents > 0 ? [{ month: 1, amountCents: input.oneOffPurchaseCents, kind: "expense" as const }] : []),
      ...Array.from({ length: input.incomeLossMonths }, (_, index) => ({ month: index + 1, amountCents: base.monthlyIncomeCents, kind: "expense" as const })),
    ],
  });
  const zero = { incomeAdjustmentCents: 0, expenseAdjustmentCents: 0, monthlyContributionAdjustmentCents: 0, incomeGrowthAdjustmentRate: 0, inflationAdjustmentRate: 0, investmentReturnAdjustmentRate: 0, oneOffPurchaseCents: 0, incomeLossMonths: 0, newDebtPaymentCents: 0 };
  return {
    atual: scenario(zero),
    conservador: scenario({ ...zero, incomeGrowthAdjustmentRate: -2, inflationAdjustmentRate: 2, investmentReturnAdjustmentRate: -2 }),
    otimista: scenario({ ...zero, incomeGrowthAdjustmentRate: 3, monthlyContributionAdjustmentCents: 50000, investmentReturnAdjustmentRate: 2 }),
    personalizado: scenario({}),
  };
}

async function assertOwns(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, table: typeof accounts | typeof categories, id: number, userId: number) {
  const row = (await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.userId, userId))).limit(1))[0];
  if (!row) throw new Error("Registro relacionado não pertence a este usuário");
}

export async function createTransaction(userId: number, input: { accountId?: number | null; categoryId?: number | null; recurrenceId?: number | null; description: string; type: "income" | "expense"; amountCents: number; occurredAt: Date; dueAt?: Date | null; paymentStatus: "paid" | "pending" | "overdue"; paymentMethod?: string | null; notes?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (input.accountId) await assertOwns(db, accounts, input.accountId, userId);
  if (input.categoryId) await assertOwns(db, categories, input.categoryId, userId);
  await db.insert(transactions).values({ ...input, userId });
}

export async function updateTransaction(userId: number, id: number, input: { accountId?: number | null; categoryId?: number | null; description: string; type: "income" | "expense"; amountCents: number; occurredAt: Date; dueAt?: Date | null; paymentStatus: "paid" | "pending" | "overdue"; paymentMethod?: string | null; notes?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (input.accountId) await assertOwns(db, accounts, input.accountId, userId);
  if (input.categoryId) await assertOwns(db, categories, input.categoryId, userId);
  await db.update(transactions).set(input).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function deleteTransaction(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function seedDemoData(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const profile = await ensureProfile(userId);
  if (profile.demoEnabled) return;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  await db.insert(categories).values([
    { userId, name: "Salário", type: "income", color: "#4A9B75", icon: "wallet", isDemo: true },
    { userId, name: "Moradia", type: "expense", color: "#A87870", icon: "home", essential: true, isDemo: true },
    { userId, name: "Alimentação", type: "expense", color: "#D18A4B", icon: "utensils", essential: true, isDemo: true },
    { userId, name: "Transporte", type: "expense", color: "#7A8DC1", icon: "car", essential: true, isDemo: true },
    { userId, name: "Lazer", type: "expense", color: "#B977A7", icon: "sparkles", isDemo: true },
    { userId, name: "Investimentos", type: "expense", color: "#687E70", icon: "chart", isDemo: true },
  ]);
  const demoCategories = await db.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.isDemo, true)));
  const category = (name: string) => demoCategories.find(item => item.name === name)!;
  await db.insert(accounts).values([
    { userId, name: "Conta principal", type: "checking", color: "#7864A8", openingBalanceCents: 250000, isDemo: true },
    { userId, name: "Reserva tranquila", type: "savings", color: "#4A9B75", openingBalanceCents: 1280000, isDemo: true },
  ]);
  const demoAccounts = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isDemo, true)));
  const checking = demoAccounts.find(item => item.type === "checking")!;
  const savings = demoAccounts.find(item => item.type === "savings")!;
  await db.insert(transactions).values([
    { userId, accountId: checking.id, categoryId: category("Salário").id, description: "Salário mensal", type: "income", amountCents: 850000, occurredAt: monthStart, paymentStatus: "paid", paymentMethod: "Transferência", isDemo: true },
    { userId, accountId: checking.id, categoryId: category("Moradia").id, description: "Aluguel", type: "expense", amountCents: 240000, occurredAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5)), paymentStatus: "paid", paymentMethod: "PIX", isDemo: true },
    { userId, accountId: checking.id, categoryId: category("Alimentação").id, description: "Mercado da semana", type: "expense", amountCents: 89250, occurredAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 12)), paymentStatus: "paid", paymentMethod: "Cartão", isDemo: true },
    { userId, accountId: checking.id, categoryId: category("Transporte").id, description: "Combustível", type: "expense", amountCents: 27000, occurredAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 14)), paymentStatus: "paid", paymentMethod: "Cartão", isDemo: true },
    { userId, accountId: savings.id, categoryId: category("Investimentos").id, description: "Aporte mensal", type: "expense", amountCents: 120000, occurredAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 18)), paymentStatus: "paid", paymentMethod: "Transferência", isDemo: true },
    { userId, accountId: checking.id, categoryId: category("Lazer").id, description: "Cinema e jantar", type: "expense", amountCents: 18600, occurredAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 20)), paymentStatus: "paid", paymentMethod: "Cartão", isDemo: true },
  ]);
  await db.insert(recurrences).values([
    { userId, accountId: checking.id, categoryId: category("Moradia").id, description: "Aluguel", type: "expense", amountCents: 240000, frequency: "monthly", nextOccurrenceAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 5)), isDemo: true },
    { userId, accountId: checking.id, categoryId: category("Salário").id, description: "Salário", type: "income", amountCents: 850000, frequency: "monthly", nextOccurrenceAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), isDemo: true },
  ]);
  await db.insert(budgets).values([
    { userId, categoryId: category("Alimentação").id, monthKey: currentMonthKey(now), limitCents: 100000, isDemo: true },
    { userId, categoryId: category("Transporte").id, monthKey: currentMonthKey(now), limitCents: 60000, isDemo: true },
    { userId, categoryId: category("Lazer").id, monthKey: currentMonthKey(now), limitCents: 40000, isDemo: true },
  ]);
  await db.insert(goals).values({ userId, accountId: savings.id, name: "Reserva de emergência", targetCents: 3000000, currentCents: 1280000, monthlyContributionCents: 100000, targetDate: new Date(Date.UTC(now.getUTCFullYear() + 1, 11, 1)), color: "#4A9B75", isDemo: true });
  await db.insert(cards).values({ userId, paymentAccountId: checking.id, name: "Cartão Aurora", brand: "Visa", limitCents: 800000, closingDay: 20, dueDay: 28, color: "#5B477F", isDemo: true });
  const card = (await db.select().from(cards).where(and(eq(cards.userId, userId), eq(cards.isDemo, true))).limit(1))[0]!;
  await db.insert(cardInvoices).values({ userId, cardId: card.id, referenceMonth: currentMonthKey(now), dueAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 28)), totalCents: 134800, status: "open", isDemo: true });
  await db.insert(installments).values({ userId, cardId: card.id, description: "Notebook — 4 de 10", installmentCents: 35000, totalInstallments: 10, currentInstallment: 4, firstDueAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 28)), isDemo: true });
  await db.insert(assets).values({ userId, name: "CDB liquidez diária", type: "investment", valueCents: 780000, updatedValueAt: now, isDemo: true });
  await db.insert(scenarios).values([
    { userId, name: "Conservador", expenseAdjustmentCents: 45000, incomeGrowthAdjustmentRate: -2, investmentReturnAdjustmentRate: -2, isPreset: true },
    { userId, name: "Otimista", monthlyContributionAdjustmentCents: 50000, incomeGrowthAdjustmentRate: 3, investmentReturnAdjustmentRate: 2, isPreset: true },
  ]);
  await db.update(userProfiles).set({ demoEnabled: true, monthlyIncomeCents: 850000, annualIncomeGrowthRate: 4, annualInflationRate: 4, annualInvestmentReturnRate: 8, onboardingCompleted: true }).where(eq(userProfiles.userId, userId));
}

async function addNotificationIfAbsent(userId: number, type: "invoice" | "debt" | "recurrence" | "goal" | "budget" | "insight", referenceType: string, referenceId: number, title: string, body: string, dueAt: Date | null) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const existing = (await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.referenceType, referenceType), eq(notifications.referenceId, referenceId))).limit(1))[0];
  if (existing) return false;
  await db.insert(notifications).values({ userId, type, referenceType, referenceId, title, body, dueAt });
  return true;
}

export async function generateFinancialNotifications() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const allUsers = await db.select({ id: users.id }).from(users);
  const now = new Date();
  const soon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3);
  const goalSoon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  let created = 0;

  for (const user of allUsers) {
    const snapshot = await getFinanceSnapshot(user.id);
    for (const invoice of snapshot.invoices.filter(item => item.status !== "paid" && item.dueAt >= now && item.dueAt <= soon)) {
      const card = snapshot.cards.find(item => item.id === invoice.cardId);
      if (await addNotificationIfAbsent(user.id, "invoice", "invoice", invoice.id, "Fatura próxima do vencimento", `A fatura do ${card?.name ?? "cartão"} vence em breve.`, invoice.dueAt)) created += 1;
    }
    for (const recurrence of snapshot.recurrences.filter(item => item.isActive && item.nextOccurrenceAt >= now && item.nextOccurrenceAt <= soon)) {
      if (await addNotificationIfAbsent(user.id, "recurrence", "recurrence", recurrence.id, "Conta recorrente próxima", `${recurrence.description} está programada para os próximos dias.`, recurrence.nextOccurrenceAt)) created += 1;
    }
    for (const goal of snapshot.goals.filter(item => item.status === "active" && item.targetDate && item.targetDate >= now && item.targetDate <= goalSoon)) {
      if (await addNotificationIfAbsent(user.id, "goal", "goal", goal.id, "Prazo de meta se aproxima", `A meta “${goal.name}” tem um prazo próximo. Revise seus aportes planejados.`, goal.targetDate!)) created += 1;
    }
    for (const debt of snapshot.debts.filter(item => item.status === "active")) {
      const dueAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), debt.dueDay));
      if (dueAt >= now && dueAt <= soon && await addNotificationIfAbsent(user.id, "debt", "debt", debt.id, "Parcela de dívida próxima", `A parcela de ${debt.creditor} vence em breve.`, dueAt)) created += 1;
    }
    const dashboard = await getDashboardData(user.id);
    for (const budget of dashboard.budgetProgress.filter(item => item.progress >= 80)) {
      if (await addNotificationIfAbsent(user.id, "budget", "budget", budget.id, "Orçamento em atenção", `Você já utilizou ${budget.progress}% do orçamento de ${budget.categoryName} neste mês.`, null)) created += 1;
    }
  }
  return { created };
}
