import { createServer, type ServerResponse } from "node:http";
import OpenAI from "openai";
import { ZodError } from "zod";
import { createPaymentAdvisor, paymentEventSchema } from "./payment_advisor.js";

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer | string>): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service.");

const advise = createPaymentAdvisor(apiKey);
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/payment-events") {
    reply(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const event = paymentEventSchema.parse(await readJson(request));
    reply(response, 200, await advise(event));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "Invalid payment event" });
      return;
    }
    if (error instanceof OpenAI.APIError && error.status && error.status < 500) {
      reply(response, error.status, { error: error.message });
      return;
    }
    console.error(error);
    reply(response, 502, { error: "Notification could not be created" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Payment event service listening on http://localhost:${port}`));
