import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { accounts, assets, budgets, cardInvoices, cards, categories, debts, goals, installments, recurrences, scenarios, transactions, userProfiles } from "../../drizzle/schema";
import { createTransaction, deleteTransaction, ensureProfile, getDashboardData, getDb, getFinanceSnapshot, getScenarioComparison, seedDemoData, updateTransaction } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const money = z.number().int().min(0);
const date = z.coerce.date();
const optionalId = z.number().int().positive().nullable().optional();

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
  return db;
}

async function ownRelated(db: Awaited<ReturnType<typeof database>>, table: typeof accounts | typeof categories | typeof cards, id: number | null | undefined, userId: number) {
  if (!id) return;
  const row = (await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.userId, userId))).limit(1))[0];
  if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "O registro relacionado não pertence a você." });
}

export const financeRouter = router({
  dashboard: protectedProcedure.query(({ ctx }) => getDashboardData(ctx.user.id)),
  snapshot: protectedProcedure.query(({ ctx }) => getFinanceSnapshot(ctx.user.id)),
  initialize: protectedProcedure.mutation(({ ctx }) => ensureProfile(ctx.user.id)),
  seedDemo: protectedProcedure.mutation(async ({ ctx }) => {
    await seedDemoData(ctx.user.id);
    return { success: true };
  }),
  profile: router({
    update: protectedProcedure.input(z.object({ monthlyIncomeCents: money, reserveCents: money.optional(), annualIncomeGrowthRate: z.number().int().min(-50).max(100).optional(), annualInflationRate: z.number().int().min(0).max(100).optional(), annualInvestmentReturnRate: z.number().int().min(-50).max(100).optional(), onboardingCompleted: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await ensureProfile(ctx.user.id);
      await db.update(userProfiles).set(input).where(eq(userProfiles.userId, ctx.user.id));
      return { success: true };
    }),
  }),
  accounts: router({
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(120), type: z.enum(["checking", "savings", "investment", "cash", "other"]), color: z.string().min(4).max(20).default("#7864A8"), openingBalanceCents: money })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.insert(accounts).values({ ...input, userId: ctx.user.id });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(120), type: z.enum(["checking", "savings", "investment", "cash", "other"]), color: z.string().min(4).max(20), openingBalanceCents: money })).mutation(async ({ ctx, input }) => {
      const db = await database(); const { id, ...values } = input;
      await db.update(accounts).set(values).where(and(eq(accounts.id, id), eq(accounts.userId, ctx.user.id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.delete(accounts).where(and(eq(accounts.id, input.id), eq(accounts.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  categories: router({
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(80), type: z.enum(["income", "expense"]), color: z.string().min(4).max(20).default("#7864A8"), essential: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.insert(categories).values({ ...input, icon: "circle", userId: ctx.user.id });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(80), type: z.enum(["income", "expense"]), color: z.string().min(4).max(20), essential: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await database(); const { id, ...values } = input;
      await db.update(categories).set(values).where(and(eq(categories.id, id), eq(categories.userId, ctx.user.id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.delete(categories).where(and(eq(categories.id, input.id), eq(categories.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  transactions: router({
    create: protectedProcedure.input(z.object({ accountId: optionalId, categoryId: optionalId, description: z.string().min(2).max(180), type: z.enum(["income", "expense"]), amountCents: money.positive(), occurredAt: date, dueAt: date.nullable().optional(), paymentStatus: z.enum(["paid", "pending", "overdue"]).default("paid"), paymentMethod: z.string().max(50).nullable().optional(), notes: z.string().max(1000).nullable().optional(), recurrenceFrequency: z.enum(["weekly", "monthly", "yearly"]).nullable().optional(), recurrenceEndAt: date.nullable().optional() })).mutation(async ({ ctx, input }) => {
      const { recurrenceFrequency, recurrenceEndAt, ...values } = input;
      let recurrenceId: number | undefined;
      if (recurrenceFrequency) {
        const db = await database();
        await ownRelated(db, accounts, values.accountId, ctx.user.id);
        await ownRelated(db, categories, values.categoryId, ctx.user.id);
        const inserted = await db.insert(recurrences).values({ userId: ctx.user.id, accountId: values.accountId ?? null, categoryId: values.categoryId ?? null, description: values.description, type: values.type, amountCents: values.amountCents, frequency: recurrenceFrequency, nextOccurrenceAt: values.occurredAt, endAt: recurrenceEndAt ?? null }).$returningId();
        recurrenceId = inserted[0]?.id;
      }
      await createTransaction(ctx.user.id, { ...values, recurrenceId });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), accountId: optionalId, categoryId: optionalId, description: z.string().min(2).max(180), type: z.enum(["income", "expense"]), amountCents: money.positive(), occurredAt: date, dueAt: date.nullable().optional(), paymentStatus: z.enum(["paid", "pending", "overdue"]), paymentMethod: z.string().max(50).nullable().optional(), notes: z.string().max(1000).nullable().optional() })).mutation(async ({ ctx, input }) => {
      const { id, ...values } = input;
      await updateTransaction(ctx.user.id, id, values);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await deleteTransaction(ctx.user.id, input.id);
      return { success: true };
    }),
  }),
  budgets: router({
    upsert: protectedProcedure.input(z.object({ categoryId: z.number().int().positive(), monthKey: z.string().regex(/^\d{4}-\d{2}$/), limitCents: money.positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await ownRelated(db, categories, input.categoryId, ctx.user.id);
      await db.insert(budgets).values({ ...input, userId: ctx.user.id }).onDuplicateKeyUpdate({ set: { limitCents: input.limitCents } });
      return { success: true };
    }),
  }),
  goals: router({
    create: protectedProcedure.input(z.object({ accountId: optionalId, name: z.string().min(2).max(140), targetCents: money.positive(), currentCents: money.default(0), monthlyContributionCents: money.default(0), targetDate: date.nullable().optional(), color: z.string().min(4).max(20).default("#7864A8") })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await ownRelated(db, accounts, input.accountId, ctx.user.id);
      await db.insert(goals).values({ ...input, userId: ctx.user.id });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), accountId: optionalId, name: z.string().min(2).max(140), targetCents: money.positive(), currentCents: money, monthlyContributionCents: money, targetDate: date.nullable().optional(), color: z.string().min(4).max(20), status: z.enum(["active", "completed", "paused"]) })).mutation(async ({ ctx, input }) => {
      const db = await database(); const { id, ...values } = input;
      await ownRelated(db, accounts, values.accountId, ctx.user.id);
      await db.update(goals).set(values).where(and(eq(goals.id, id), eq(goals.userId, ctx.user.id)));
      return { success: true };
    }),
    addContribution: protectedProcedure.input(z.object({ id: z.number().int().positive(), amountCents: money.positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      const goal = (await db.select().from(goals).where(and(eq(goals.id, input.id), eq(goals.userId, ctx.user.id))).limit(1))[0];
      if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Meta não encontrada." });
      const currentCents = goal.currentCents + input.amountCents;
      await db.update(goals).set({ currentCents, status: currentCents >= goal.targetCents ? "completed" : "active" }).where(and(eq(goals.id, input.id), eq(goals.userId, ctx.user.id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.delete(goals).where(and(eq(goals.id, input.id), eq(goals.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  recurrences: router({
    create: protectedProcedure.input(z.object({ accountId: optionalId, categoryId: optionalId, description: z.string().min(2).max(180), type: z.enum(["income", "expense"]), amountCents: money.positive(), frequency: z.enum(["weekly", "monthly", "yearly"]), nextOccurrenceAt: date, endAt: date.nullable().optional() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await ownRelated(db, accounts, input.accountId, ctx.user.id);
      await ownRelated(db, categories, input.categoryId, ctx.user.id);
      await db.insert(recurrences).values({ ...input, userId: ctx.user.id });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), accountId: optionalId, categoryId: optionalId, description: z.string().min(2).max(180), type: z.enum(["income", "expense"]), amountCents: money.positive(), frequency: z.enum(["weekly", "monthly", "yearly"]), nextOccurrenceAt: date, endAt: date.nullable().optional(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await database(); const { id, ...values } = input;
      await ownRelated(db, accounts, values.accountId, ctx.user.id); await ownRelated(db, categories, values.categoryId, ctx.user.id);
      await db.update(recurrences).set(values).where(and(eq(recurrences.id, id), eq(recurrences.userId, ctx.user.id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.delete(recurrences).where(and(eq(recurrences.id, input.id), eq(recurrences.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  cards: router({
    create: protectedProcedure.input(z.object({ paymentAccountId: optionalId, name: z.string().min(2).max(100), brand: z.string().max(30).nullable().optional(), limitCents: money.positive(), closingDay: z.number().int().min(1).max(31), dueDay: z.number().int().min(1).max(31), color: z.string().min(4).max(20).default("#5B477F") })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await ownRelated(db, accounts, input.paymentAccountId, ctx.user.id);
      await db.insert(cards).values({ ...input, userId: ctx.user.id });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), paymentAccountId: optionalId, name: z.string().min(2).max(100), brand: z.string().max(30).nullable().optional(), limitCents: money.positive(), closingDay: z.number().int().min(1).max(31), dueDay: z.number().int().min(1).max(31), color: z.string().min(4).max(20) })).mutation(async ({ ctx, input }) => {
      const db = await database(); const { id, ...values } = input;
      await ownRelated(db, accounts, values.paymentAccountId, ctx.user.id);
      await db.update(cards).set(values).where(and(eq(cards.id, id), eq(cards.userId, ctx.user.id)));
      return { success: true };
    }),
    addInvoice: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), referenceMonth: z.string().regex(/^\d{4}-\d{2}$/), dueAt: date, totalCents: money.positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await ownRelated(db, cards, input.cardId, ctx.user.id);
      await db.insert(cardInvoices).values({ ...input, userId: ctx.user.id, status: "open" }).onDuplicateKeyUpdate({ set: { dueAt: input.dueAt, totalCents: input.totalCents, status: "open" } });
      return { success: true };
    }),
    addInstallment: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), description: z.string().min(2).max(160), installmentCents: money.positive(), totalInstallments: z.number().int().min(2).max(120), currentInstallment: z.number().int().min(1).max(120), firstDueAt: date })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await ownRelated(db, cards, input.cardId, ctx.user.id);
      if (input.currentInstallment > input.totalInstallments) throw new TRPCError({ code: "BAD_REQUEST", message: "A parcela atual não pode ser maior que o total." });
      await db.insert(installments).values({ ...input, userId: ctx.user.id });
      return { success: true };
    }),
    payInvoice: protectedProcedure.input(z.object({ invoiceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      const invoice = (await db.select().from(cardInvoices).where(and(eq(cardInvoices.id, input.invoiceId), eq(cardInvoices.userId, ctx.user.id))).limit(1))[0];
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Fatura não encontrada." });
      if (invoice.status === "paid") return { success: true, skipped: true };
      const card = (await db.select().from(cards).where(and(eq(cards.id, invoice.cardId), eq(cards.userId, ctx.user.id))).limit(1))[0];
      await db.update(cardInvoices).set({ status: "paid" }).where(and(eq(cardInvoices.id, invoice.id), eq(cardInvoices.userId, ctx.user.id)));
      await db.insert(transactions).values({ userId: ctx.user.id, accountId: card?.paymentAccountId ?? null, description: `Pagamento de fatura — ${card?.name ?? "cartão"}`, type: "expense", amountCents: invoice.totalCents, occurredAt: new Date(), dueAt: invoice.dueAt, paymentStatus: "paid", paymentMethod: "Pagamento de fatura" });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.delete(cards).where(and(eq(cards.id, input.id), eq(cards.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  debts: router({
    create: protectedProcedure.input(z.object({ accountId: optionalId, creditor: z.string().min(2).max(140), originalCents: money.positive(), balanceCents: money.positive(), annualInterestRate: z.number().int().min(0).max(200).default(0), installmentsTotal: z.number().int().min(1).max(720), monthlyPaymentCents: money.positive(), dueDay: z.number().int().min(1).max(31) })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await ownRelated(db, accounts, input.accountId, ctx.user.id);
      await db.insert(debts).values({ ...input, userId: ctx.user.id });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), accountId: optionalId, creditor: z.string().min(2).max(140), originalCents: money.positive(), balanceCents: money, annualInterestRate: z.number().int().min(0).max(200), installmentsTotal: z.number().int().min(1).max(720), monthlyPaymentCents: money.positive(), dueDay: z.number().int().min(1).max(31), status: z.enum(["active", "paid", "overdue"]) })).mutation(async ({ ctx, input }) => {
      const db = await database(); const { id, ...values } = input;
      await ownRelated(db, accounts, values.accountId, ctx.user.id);
      await db.update(debts).set(values).where(and(eq(debts.id, id), eq(debts.userId, ctx.user.id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.delete(debts).where(and(eq(debts.id, input.id), eq(debts.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  assets: router({
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(140), type: z.enum(["investment", "property", "vehicle", "other"]), valueCents: money.positive(), updatedValueAt: date })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.insert(assets).values({ ...input, userId: ctx.user.id });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(140), type: z.enum(["investment", "property", "vehicle", "other"]), valueCents: money.positive(), updatedValueAt: date })).mutation(async ({ ctx, input }) => {
      const db = await database(); const { id, ...values } = input;
      await db.update(assets).set(values).where(and(eq(assets.id, id), eq(assets.userId, ctx.user.id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.delete(assets).where(and(eq(assets.id, input.id), eq(assets.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
  scenarios: router({
    compare: protectedProcedure.input(z.object({ months: z.number().int().min(3).max(120), incomeAdjustmentCents: z.number().int(), expenseAdjustmentCents: z.number().int(), monthlyContributionAdjustmentCents: z.number().int(), incomeGrowthAdjustmentRate: z.number().int().min(-50).max(100), inflationAdjustmentRate: z.number().int().min(-50).max(100), investmentReturnAdjustmentRate: z.number().int().min(-50).max(100), oneOffPurchaseCents: money, incomeLossMonths: z.number().int().min(0).max(24), newDebtPaymentCents: money })).query(({ ctx, input }) => getScenarioComparison(ctx.user.id, input)),
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(100), incomeAdjustmentCents: z.number().int().default(0), expenseAdjustmentCents: z.number().int().default(0), monthlyContributionAdjustmentCents: z.number().int().default(0), incomeGrowthAdjustmentRate: z.number().int().default(0), inflationAdjustmentRate: z.number().int().default(0), investmentReturnAdjustmentRate: z.number().int().default(0), oneOffPurchaseCents: money.default(0), incomeLossMonths: z.number().int().min(0).max(24).default(0) })).mutation(async ({ ctx, input }) => {
      const db = await database();
      await db.insert(scenarios).values({ ...input, userId: ctx.user.id });
      return { success: true };
    }),
  }),
});
