export type TransactionKind = "income" | "expense";

export type ProjectionInput = {
  startingBalanceCents: number;
  monthlyIncomeCents: number;
  monthlyFixedExpenseCents: number;
  monthlyVariableExpenseCents: number;
  monthlyContributionCents: number;
  annualIncomeGrowthRate: number;
  annualInflationRate: number;
  annualInvestmentReturnRate: number;
  months: number;
  oneOffEvents?: Array<{ month: number; amountCents: number; kind: TransactionKind }>;
};

export type ProjectionPoint = {
  month: number;
  balanceCents: number;
  netWorthCents: number;
  incomeCents: number;
  expensesCents: number;
  contributedCents: number;
};

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function calculateSavingsRate(incomeCents: number, expenseCents: number) {
  if (incomeCents <= 0) return 0;
  return Math.round(((incomeCents - expenseCents) / incomeCents) * 1000) / 10;
}

export function calculateIncomeCommitment(incomeCents: number, fixedExpenseCents: number) {
  if (incomeCents <= 0) return 0;
  return Math.round((fixedExpenseCents / incomeCents) * 1000) / 10;
}

export function calculateNetWorth(assetCents: number, liabilityCents: number) {
  return assetCents - liabilityCents;
}

export function calculateEmergencyMonths(reserveCents: number, essentialMonthlyExpenseCents: number) {
  if (essentialMonthlyExpenseCents <= 0) return 0;
  return Math.round((reserveCents / essentialMonthlyExpenseCents) * 10) / 10;
}

export function calculateGoalMonthlyContribution(
  targetCents: number,
  currentCents: number,
  targetDate: Date,
  today = new Date(),
) {
  const outstanding = Math.max(0, targetCents - currentCents);
  const months = Math.max(
    1,
    (targetDate.getFullYear() - today.getFullYear()) * 12 + targetDate.getMonth() - today.getMonth(),
  );
  return Math.ceil(outstanding / months);
}

export function simulateProjection(input: ProjectionInput): ProjectionPoint[] {
  const points: ProjectionPoint[] = [];
  let balance = input.startingBalanceCents;
  let invested = 0;

  for (let month = 1; month <= input.months; month += 1) {
    const yearIndex = Math.floor((month - 1) / 12);
    const monthlyIncome = Math.round(
      input.monthlyIncomeCents * Math.pow(1 + input.annualIncomeGrowthRate / 100, yearIndex),
    );
    const inflationFactor = Math.pow(1 + input.annualInflationRate / 100, yearIndex);
    const expenses = Math.round(
      (input.monthlyFixedExpenseCents + input.monthlyVariableExpenseCents) * inflationFactor,
    );
    const events = (input.oneOffEvents ?? []).filter(event => event.month === month);
    const additionalIncome = events
      .filter(event => event.kind === "income")
      .reduce((sum, event) => sum + event.amountCents, 0);
    const additionalExpenses = events
      .filter(event => event.kind === "expense")
      .reduce((sum, event) => sum + event.amountCents, 0);
    const contribution = Math.max(0, input.monthlyContributionCents);
    const monthlyInvestmentRate = input.annualInvestmentReturnRate / 100 / 12;

    invested = Math.round(invested * (1 + monthlyInvestmentRate) + contribution);
    balance += monthlyIncome + additionalIncome - expenses - additionalExpenses - contribution;

    points.push({
      month,
      balanceCents: balance,
      netWorthCents: balance + invested,
      incomeCents: monthlyIncome + additionalIncome,
      expensesCents: expenses + additionalExpenses,
      contributedCents: contribution,
    });
  }

  return points;
}

export function calculateDebtPayoff(
  balanceCents: number,
  monthlyPaymentCents: number,
  annualInterestRate: number,
  extraPaymentCents = 0,
) {
  const payment = monthlyPaymentCents + extraPaymentCents;
  const monthlyRate = annualInterestRate / 100 / 12;
  if (balanceCents <= 0 || payment <= 0) return { months: 0, interestCents: 0 };

  let remaining = balanceCents;
  let interest = 0;
  let months = 0;
  while (remaining > 0 && months < 1200) {
    const accrued = Math.round(remaining * monthlyRate);
    interest += accrued;
    remaining = Math.max(0, remaining + accrued - payment);
    months += 1;
  }
  return { months, interestCents: interest };
}
