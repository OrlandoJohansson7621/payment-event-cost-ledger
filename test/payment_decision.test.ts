import assert from "node:assert/strict";
import test from "node:test";
import { chooseAction, paymentEventSchema } from "../src/payment_advisor.js";

test("a high-risk payment is held for manual review", () => {
  const event = paymentEventSchema.parse({
    eventId: "evt_risk_7",
    customerId: "cus_42",
    amountCents: 5800,
    currency: "usd",
    riskScore: 84,
    kind: "payment_captured"
  });

  assert.equal(chooseAction(event), "manual_review");
});
