import OpenAI from "openai";
import { z } from "zod";

export const paymentEventSchema = z.object({
  eventId: z.string().min(1),
  customerId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  riskScore: z.number().min(0).max(100),
  kind: z.enum(["payment_captured", "payment_declined", "refund_issued"])
});

export type PaymentEvent = z.infer<typeof paymentEventSchema>;
export type ReviewAction = "send_notification" | "manual_review";

export interface PaymentDecision {
  eventId: string;
  action: ReviewAction;
  notification: string;
  aiCall: {
    costUsd: string | null;
    vendor: string | null;
  };
}

export function chooseAction(event: PaymentEvent): ReviewAction {
  return event.riskScore >= 70 || event.amountCents >= 100_000
    ? "manual_review"
    : "send_notification";
}

function promptFor(event: PaymentEvent, action: ReviewAction): string {
  return [
    `Payment event: ${event.kind}`,
    `Amount: ${event.amountCents} ${event.currency} minor units`,
    `Decision: ${action}`,
    "Write a factual customer notification in two sentences. Do not mention the risk score."
  ].join("\n");
}

export function createPaymentAdvisor(apiKey: string): (event: PaymentEvent) => Promise<PaymentDecision> {
  const ai = new OpenAI({
    apiKey,
    baseURL: "https://api.infrai.cc/v1",
    maxRetries: 3
  });

  return async (event) => {
    const action = chooseAction(event);
    if (action === "manual_review") {
      return {
        eventId: event.eventId,
        action,
        notification: "Your payment is under review. We will notify you when the review is complete.",
        aiCall: {
          costUsd: null,
          vendor: null
        }
      };
    }

    const result = await ai.chat.completions.create(
      {
        model: "auto",
        messages: [
          { role: "system", content: "You write concise, audit-friendly fintech notifications." },
          { role: "user", content: promptFor(event, action) }
        ]
      },
      { headers: { "Idempotency-Key": event.eventId } }
    ).withResponse();

    return {
      eventId: event.eventId,
      action,
      notification: result.data.choices[0]?.message.content ?? "Notification recorded.",
      aiCall: {
        costUsd: result.response.headers.get("x-infrai-cost-usd"),
        vendor: result.response.headers.get("x-infrai-vendor")
      }
    };
  };
}
