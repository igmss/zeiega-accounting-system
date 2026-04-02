/**
 * Test Webhook Logic in isolation (Javascript)
 */

const STATUS_PRIORITY = { 
  pending: 0, 
  processing: 1, 
  producing: 1, 
  shipped: 2, 
  completed: 3, 
  delivered: 3, 
  cancelled: -1 
};

function shouldUpdateStatus(currentStatus, newStatus) {
  const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;
  const newPriority = STATUS_PRIORITY[newStatus] ?? 0;
  
  return newPriority >= currentPriority || newStatus === "cancelled";
}

function testStatusLogic() {
  const cases = [
    { current: "pending", new: "processing", expected: true },
    { current: "processing", new: "shipped", expected: true },
    { current: "shipped", new: "processing", expected: false }, // Regression
    { current: "completed", new: "pending", expected: false }, // Regression
    { current: "processing", new: "cancelled", expected: true }, // Cancellation override
    { current: "shipped", new: "shipped", expected: true }, // Idempotent
  ];

  console.log("--- Status Priority Logic Test ---");
  cases.forEach(({ current, new: newStatus, expected }) => {
    const result = shouldUpdateStatus(current, newStatus);
    const pass = result === expected;
    console.log(`${pass ? "✅" : "❌"} ${current} -> ${newStatus}: result=${result}, expected=${expected}`);
  });
}

function testCoercionLogic() {
  const cases = [
    { total: "100.50", subtotal: "90", expected: 100.50 },
    { total: 100.50, subtotal: 90, expected: 100.50 },
    { total: undefined, subtotal: "90", expected: 90 },
    { total: null, subtotal: 90, expected: 90 },
    { total: "invalid", subtotal: "80", expected: 80 }, // Number("invalid") is NaN
  ];

  console.log("\n--- Total Amount Coercion Test ---");
  cases.forEach(({ total, subtotal, expected }) => {
    const calculated = Number(total) || Number(subtotal) || 0;
    const pass = calculated === expected;
    console.log(`${pass ? "✅" : "❌"} total=${total}, subtotal=${subtotal}: got=${calculated}, expected=${expected}`);
  });
}

testStatusLogic();
testCoercionLogic();
