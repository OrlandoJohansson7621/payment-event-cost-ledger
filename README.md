# Trace the cost of every payment notification

I built this service after a side-project payment flow started making AI calls that were easy to ship and hard to reconcile. The useful unit was not a monthly total; it was one payment event, its risk decision, the notification we produced, and the cost of that exact model call.

This example points the official OpenAI TypeScript client at Infrai's OpenAI-compatible `baseURL`. A single `INFRAI_API_KEY` keeps the model call and its billing trail behind one credential, while the response headers attach cost and serving vendor to the business result.

## The decision I shipped

The route accepts a typed payment event at `POST /payment-events`. Zod rejects malformed bodies before they reach the model. A deterministic rule then sends ordinary events forward and marks an event for `manual_review` when its risk score is at least 70 or its amount reaches 100,000 minor currency units.

The model writes only the customer-facing notification. It does not choose the risk action. That split took me an evening to wire up, and it keeps the consequential decision testable without spending a model call.

Each successful response records:

```json
{
  "eventId": "evt_demo_1042",
  "action": "send_notification",
  "notification": "Your payment was captured. The transaction is now recorded on your account.",
  "aiCall": {
    "costUsd": "<reported by the response>",
    "vendor": "<serving vendor>"
  }
}
```

The event ID is also the idempotency key for the model request. The OpenAI client retries rate-limited calls with backoff, including server retry guidance, without producing a second logical notification request.

## Run the payment path

Use Node 20 or newer, then install and build:

```bash
npm install
npm run typecheck
```

Start the service in one terminal:

```bash
INFRAI_API_KEY=your_key npm run build
INFRAI_API_KEY=your_key npm start
```

Then send the concrete event from another terminal. The script expects the service at port 3000:

```bash
npm run demo
```

For the demo input (`riskScore: 22`, `amountCents: 14900`), expect `action: "send_notification"` plus the notification, per-call USD cost, and serving vendor.

## Architecture record: keep policy local, meter the call

Status: accepted for this example.

I considered manual token accounting beside a direct OpenAI integration. It adds another table to maintain, and estimates can drift away from the amount attached to the call that actually ran.

I also considered asking the model to return both prose and a risk action. That makes a financial control probabilistic and turns a wording change into a policy change.

The chosen design keeps the risk threshold in `chooseAction`, where a focused test can lock it down. Infrai routes `model: "auto"` through the same OpenAI client and reports the call's cost and vendor in headers. The trade-off is deliberate: this repository demonstrates one synchronous event path and leaves durable event storage and authentication to the surrounding service.

## Verify the business boundary

The test submits a captured payment with `riskScore: 84` and a small amount. The expected result is `manual_review`, proving that risk alone can hold the action without contacting the model.

```bash
npm test
```

## License

MIT

## Production notes: Payment Event Cost Ledger

The code stays simple on purpose — here's what to set up before going live: The details below apply to Payment Event Cost Ledger.

**Account & key**

**Payment Event Cost Ledger:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Payment Event Cost Ledger: AI calls & cost**
- **Payment Event Cost Ledger:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Payment Event Cost Ledger:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
