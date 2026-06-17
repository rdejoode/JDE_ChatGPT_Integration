// server.js
import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const JDE_BASE_URL = process.env.JDE_BASE_URL; 
// example: https://jde-ais.company.com

async function getJdeToken() {
  const res = await fetch(`${JDE_BASE_URL}/jderest/v2/tokenrequest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.JDE_USERNAME,
      password: process.env.JDE_PASSWORD,
      environment: process.env.JDE_ENVIRONMENT,
      role: process.env.JDE_ROLE,
    }),
  });

  if (!res.ok) throw new Error(`JDE login failed: ${res.status}`);
  const data = await res.json();

  return data.userInfo?.token || data.token;
}

async function callJdeOrchestration(orchestrationName, inputs) {
  const token = await getJdeToken();

  const res = await fetch(
    `${JDE_BASE_URL}/jderest/v3/orchestrator/${orchestrationName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "jde-AIS-Auth": token,
      },
      body: JSON.stringify(inputs),
    }
  );

  if (!res.ok) throw new Error(`JDE orchestration failed: ${res.status}`);

  return await res.json();
}

// Example endpoint: ask about a sales order
app.post("/ask", async (req, res) => {
  const { question } = req.body;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: question,
    tools: [
      {
        type: "function",
        name: "get_sales_order_status",
        description: "Get the status of a JD Edwards sales order",
        parameters: {
          type: "object",
          properties: {
            orderNumber: {
              type: "string",
              description: "The JDE sales order number",
            },
          },
          required: ["orderNumber"],
          additionalProperties: false,
        },
      },
    ],
  });

  const toolCall = response.output.find(
    item => item.type === "function_call"
  );

  if (!toolCall) {
    return res.json({ answer: response.output_text });
  }

  const args = JSON.parse(toolCall.arguments);

  const jdeResult = await callJdeOrchestration("GetSalesOrderStatus", {
    orderNumber: args.orderNumber,
  });

  const finalResponse = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "user", content: question },
      {
        role: "assistant",
        content: `JDE returned this data: ${JSON.stringify(jdeResult)}`,
      },
    ],
  });

  res.json({ answer: finalResponse.output_text });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
