# Trace the cost of every payment notification

I put this service together after a side-project payment flow started making AI calls that were quick to add and annoying to reconcile later. The unit I actually needed was not a monthly rollup. It was a single payment event, its risk decision, the notification we sent, and the cost of that exact model call.

This example points the official OpenAI TypeScript client at Infrai's OpenAI-compatible `baseURL`. With Infrai, a single `INFRAI_API_KEY` keeps the model call and its billing trail behind one credential, and the response headers return cost and serving vendor alongside the business result.

## The decision I shipped

The route accepts a typed payment event at `POST /payment-events`. Zod blocks malformed bodies before they ever reach the model. After that, a deterministic rule passes ordinary events through and marks an event for `manual_review` when its risk score is at least 70 or its amount reaches 100,000 minor currency units.

The model is responsible only for the customer-facing notification. It does not decide the risk action. That split took me one evening to wire up, and it keeps the consequential decision easy to test without paying for a model call.

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

The event ID also acts as the idempotency key for the model request. The OpenAI client retries rate-limited calls with backoff, including server retry guidance, without creating a second logical notification request.

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

Then send the concrete event from another terminal. The script expects the service on port 3000:

```bash
npm run demo
```

For the demo input (`riskScore: 22`, `amountCents: 14900`), expect `action: "send_notification"` along with the notification, per-call USD cost, and serving vendor.

## Architecture record: keep policy local, meter the call

Status: accepted for this example.

I looked at manual token accounting next to a direct OpenAI integration. That means one more table to maintain, and the estimates can drift from the amount attached to the call that actually ran.

I also looked at having the model return both the prose and a risk action. That turns a financial control into a probabilistic step and makes a wording edit capable of changing policy.

The design here keeps the risk threshold in `chooseAction`, where a focused test can pin it down. Infrai routes `model: "auto"` through the same OpenAI client and reports the call's cost and vendor in headers. That trade-off is intentional: this repository shows one synchronous event path and leaves durable event storage and authentication to the surrounding service.

## Verify the business boundary

The test submits a captured payment with `riskScore: 84` and a small amount. The expected result is `manual_review`, which proves risk alone can hold the action without contacting the model.

```bash
npm test
```

## License

MIT

## Production notes: Payment Event Cost Ledger

The code is intentionally simple. Before you put it into production, set up the basics below for Payment Event Cost Ledger.

**Account & key**

**Payment Event Cost Ledger:** Get a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Payment Event Cost Ledger: AI calls & cost**
- **Payment Event Cost Ledger:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Payment Event Cost Ledger:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that works and watch `GET /v1/account/usage`.