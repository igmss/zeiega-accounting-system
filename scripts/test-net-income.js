/**
 * Test Net Income Calculation Logic (Javascript)
 * This mimics the logic in FinancialStatementsService.generateIncomeStatement
 */

const AccountType = {
  REVENUE: "revenue",
  CONTRA_REVENUE: "contra_revenue",
  COGS: "cogs",
  EXPENSE: "expense",
  OTHER: "other",
};

// Mocked CHART_OF_ACCOUNTS
const CHART_OF_ACCOUNTS = {
  "4001": { code: "4001", type: AccountType.REVENUE, normalBalance: "credit" },
  "5001": { code: "5001", type: AccountType.COGS, normalBalance: "debit" },
  "6001": { code: "6001", type: AccountType.EXPENSE, normalBalance: "debit" },
  "7001": { code: "7001", type: AccountType.OTHER, normalBalance: "debit" },  // Interest Expense
  "7003": { code: "7003", type: AccountType.OTHER, normalBalance: "credit" }, // Asset Disposal Gain
};

function isDebitNormalBalance(code) {
  return CHART_OF_ACCOUNTS[code]?.normalBalance === "debit";
}

async function testCalculation() {
  // Mock balances (Net Balance returned by getAccountBalance)
  // Positive means normal balance (Credit for Revenue, Debit for Expense)
  const balances = {
    "4001": 10000, // Revenue (Credit 10k)
    "5001": 4000,  // COGS (Debit 4k)
    "6001": 2000,  // Expense (Debit 2k)
    "7001": 500,   // Interest Expense (Debit 500)
    "7003": 1200,  // Asset Disposal Gain (Credit 1200)
  };

  const revenueTotal = balances["4001"];
  const cogsTotal = balances["5001"];
  const grossProfit = revenueTotal - cogsTotal; // 6000

  const operatingTotal = balances["6001"]; // 2000
  const operatingIncome = grossProfit - operatingTotal; // 4000

  // OTHER aggregation logic
  const otherItems = [
    { code: "7001", amount: balances["7001"] },
    { code: "7003", amount: balances["7003"] },
  ];

  const otherTotal = otherItems.reduce((sum, item) => {
    const isDebit = isDebitNormalBalance(item.code);
    const contribution = isDebit ? item.amount : -item.amount;
    console.log(`Account ${item.code}: amount=${item.amount}, isDebit=${isDebit}, contribution=${contribution}`);
    return sum + contribution;
  }, 0);

  console.log(`Other Total (Net Expense): ${otherTotal}`); // Should be 500 - 1200 = -700

  const netIncome = operatingIncome - otherTotal; 
  console.log(`Net Income: ${netIncome}`); // Should be 4000 - (-700) = 4700

  // Verification
  const expectedNetIncome = 10000 - 4000 - 2000 - 500 + 1200; // 4700
  if (netIncome === expectedNetIncome) {
    console.log("✅ SUCCESS: Net Income calculation is correct.");
  } else {
    console.log(`❌ FAILURE: Expected ${expectedNetIncome}, got ${netIncome}`);
  }
}

testCalculation();
