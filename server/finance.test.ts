import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accounts, assets, budgets, cardInvoices, cards, categories, debts, goals, installments, notifications, recurrences, scenarios, transactions, userProfiles } from "../drizzle/schema";
import { calculateDebtPayoff, calculateEmergencyMonths, calculateGoalMonthlyContribution, calculateIncomeCommitment, calculateNetWorth, calculateSavingsRate, simulateProjection } from "../shared/finance";

describe("motor financeiro", () => {
  it("calcula taxa de economia e comprometimento de renda", () => {
    expect(calculateSavingsRate(850000, 570000)).toBe(32.9);
    expect(calculateIncomeCommitment(850000, 357000)).toBe(42);
  });

  it("calcula patrimônio líquido e cobertura de reserva", () => {
    expect(calculateNetWorth(4500000, 1250000)).toBe(3250000);
    expect(calculateEmergencyMonths(1280000, 400000)).toBe(3.2);
  });

  it("estima o aporte mensal para a data de uma meta", () => {
    const contribution = calculateGoalMonthlyContribution(3000000, 1200000, new Date("2027-12-01T12:00:00Z"), new Date("2026-12-01T12:00:00Z"));
    expect(contribution).toBe(150000);
  });

  it("projeta a evolução do saldo e do patrimônio considerando aportes", () => {
    const projection = simulateProjection({
      startingBalanceCents: 100000,
      monthlyIncomeCents: 500000,
      monthlyFixedExpenseCents: 200000,
      monthlyVariableExpenseCents: 100000,
      monthlyContributionCents: 50000,
      annualIncomeGrowthRate: 0,
      annualInflationRate: 0,
      annualInvestmentReturnRate: 0,
      months: 3,
    });
    expect(projection).toHaveLength(3);
    expect(projection[0]).toMatchObject({ balanceCents: 250000, netWorthCents: 300000 });
    expect(projection[2]?.netWorthCents).toBe(700000);
  });

  it("inclui compromissos pontuais de faturas e parcelas na projeção mensal", () => {
    const projection = simulateProjection({
      startingBalanceCents: 100000,
      monthlyIncomeCents: 200000,
      monthlyFixedExpenseCents: 50000,
      monthlyVariableExpenseCents: 0,
      monthlyContributionCents: 0,
      annualIncomeGrowthRate: 0,
      annualInflationRate: 0,
      annualInvestmentReturnRate: 0,
      months: 3,
      oneOffEvents: [
        { month: 1, amountCents: 30000, kind: "expense" },
        { month: 2, amountCents: 30000, kind: "expense" },
        { month: 2, amountCents: 120000, kind: "expense" },
      ],
    });
    expect(projection.map(point => point.balanceCents)).toEqual([220000, 220000, 370000]);
    expect(projection[1]?.expensesCents).toBe(200000);
  });

  it("demonstra que uma amortização extra reduz o prazo e os juros", () => {
    const regular = calculateDebtPayoff(1000000, 100000, 12);
    const accelerated = calculateDebtPayoff(1000000, 100000, 12, 30000);
    expect(accelerated.months).toBeLessThan(regular.months);
    expect(accelerated.interestCents).toBeLessThan(regular.interestCents);
  });
});

describe("isolamento de dados", () => {
  it("exige a coluna userId em todo agregado financeiro persistido", () => {
    const userOwnedTables = [accounts, assets, budgets, cardInvoices, cards, categories, debts, goals, installments, notifications, recurrences, scenarios, transactions, userProfiles];
    userOwnedTables.forEach(table => expect(getTableColumns(table)).toHaveProperty("userId"));
  });
});
