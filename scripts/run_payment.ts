async function main(): Promise<void> {
  const event = {
    eventId: "evt_demo_1042",
    customerId: "cus_demo_81",
    amountCents: 14900,
    currency: "usd",
    riskScore: 22,
    kind: "payment_captured"
  };

  const response = await fetch("http://localhost:3000/payment-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event)
  });
  const result: unknown = await response.json();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
