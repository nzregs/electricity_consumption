import { querySnowflake } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

const SCHEMA_CONTEXT = `You are an energy usage assistant for a New Zealand household. You have access to the following Snowflake tables in the REGANHOME.PUBLIC schema:

1. ELECTRICITY_USAGE - Hourly electricity consumption readings
   Columns: ICP (VARCHAR - meter identifier), USAGE_HOUR_START (TIMESTAMP_NTZ - start of the usage hour), USAGE_HOUR_END (TIMESTAMP_NTZ - nullable), USAGE_KWH (NUMBER(10,2) - electricity consumed in kWh), USAGE_TYPE (VARCHAR - "Import" for consumption, "Export" for solar generation), DAILY_CHARGE (NUMBER(10,2) - daily supply charge in $), RETAILER (VARCHAR - energy retailer name), SOURCEFILE (VARCHAR)
   Note: Each row is one hour of usage. To get dates use DATE(USAGE_HOUR_START). To get hour use HOUR(USAGE_HOUR_START). To get day of week use DAYNAME(USAGE_HOUR_START).

2. ELECTRICITY_PROVIDERS - Provider/plan info with rates
   Columns: PROVIDER_ID (NUMBER PK), PROVIDER_NAME (VARCHAR), PLAN_NAME (VARCHAR), DAILY_CHARGE (NUMBER(10,4) $/day), PEAK_RATE (NUMBER $/kWh), SHOULDER_RATE (NUMBER $/kWh), OFFPEAK_RATE (NUMBER $/kWh), PEAK_EXPORT_RATE (NUMBER), SHOULDER_EXPORT_RATE (NUMBER), OFFPEAK_EXPORT_RATE (NUMBER), IS_ACTIVE (BOOLEAN)

3. ELECTRICITY_TARIFF_PERIODS - Time-of-use tariff period definitions
   Columns: TARIFF_PERIOD_ID (NUMBER PK), PROVIDER_ID (NUMBER FK), PERIOD_NUMBER (NUMBER), PERIOD_NAME (VARCHAR e.g. "Period 1"), START_TIME (TIME), END_TIME (TIME), TARIFF_TYPE (VARCHAR - "peak","shoulder","offpeak"), APPLIES_TO_DAYS (VARCHAR - "weekdays","weekends","all"), ENERGY_DIRECTION (VARCHAR - "import","export"), IS_ACTIVE (BOOLEAN)

The ICP is 0145237680LCE44. Current provider is Octopus Energy (PROVIDER_ID=602, plan "Flexi - Low User"). Daily charge is $1.725/day. Data spans from 2024-01-01 to 2026-06-28. Currency is NZD.

Important: Filter by USAGE_TYPE = ''Import'' for consumption queries and ''Export'' for generation/export queries unless the user asks about both.`

const SQL_SYSTEM_PROMPT = `${SCHEMA_CONTEXT}

Given the user's question, write a single Snowflake SQL query to answer it. Return ONLY the SQL query, no explanation, no markdown fencing. If the question cannot be answered with SQL against these tables, return exactly: CANNOT_ANSWER`

const ANSWER_SYSTEM_PROMPT = `${SCHEMA_CONTEXT}

You are given the user's question and the SQL query results. Provide a concise, helpful answer in 1-3 sentences. Format numbers with appropriate units (kWh, $). If the results are empty, say so clearly.`

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

function sfEscape(str: string): string {
  return str.replace(/'/g, "''").replace(/\\/g, "\\\\")
}

async function cortexComplete(systemPrompt: string, userPrompt: string): Promise<string> {
  const sql = `SELECT SNOWFLAKE.CORTEX.COMPLETE(
    'claude-4-sonnet',
    [
      {'role': 'system', 'content': '${sfEscape(systemPrompt)}'},
      {'role': 'user', 'content': '${sfEscape(userPrompt)}'}
    ],
    {'temperature': 0.1, 'max_tokens': 1000}
  ):choices[0]:messages::VARCHAR AS response`

  const result = await querySnowflake(sql)
  return result[0]?.RESPONSE ?? ""
}

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages: ChatMessage[] }
    const lastUserMessage = messages.filter(m => m.role === "user").pop()

    if (!lastUserMessage) {
      return Response.json({ error: "No user message provided" }, { status: 400 })
    }

    const userQuestion = lastUserMessage.content

    // Step 1: Generate SQL from the user's question
    const generatedText = await cortexComplete(SQL_SYSTEM_PROMPT, userQuestion)

    if (!generatedText) {
      return Response.json({ reply: "I'm sorry, I couldn't process that question. Please try again." })
    }

    // If the model says it can't answer
    if (generatedText.includes("CANNOT_ANSWER")) {
      return Response.json({
        reply: "I can only answer questions about your electricity usage, tariffs, and costs. Could you rephrase your question?"
      })
    }

    // Clean SQL - strip markdown fencing if present
    let sql = generatedText.replace(/```sql\n?/gi, "").replace(/```\n?/g, "").trim()
    // Safety: only allow SELECT queries
    if (!sql.toUpperCase().startsWith("SELECT") && !sql.toUpperCase().startsWith("WITH")) {
      return Response.json({
        reply: "I can only answer read-only questions about your data. Please ask a question about your electricity usage."
      })
    }

    // Step 2: Execute the generated SQL
    let queryResults: Record<string, any>[]
    try {
      queryResults = await querySnowflake(sql)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      console.error("Generated SQL failed:", sql, msg)
      return Response.json({
        reply: "I tried to query your data but encountered an error. Could you try rephrasing your question?"
      })
    }

    // Step 3: Summarize the results
    const resultsStr = JSON.stringify(queryResults.slice(0, 50), null, 2)
    const answerPrompt = `Question: ${userQuestion}\n\nSQL Results (${queryResults.length} rows):\n${resultsStr}`

    const answer = await cortexComplete(ANSWER_SYSTEM_PROMPT, answerPrompt)

    return Response.json({
      reply: answer || "I couldn't generate an answer.",
      sql
    })
  } catch (err) {
    console.error("Chat API error:", err)
    return Response.json(
      { error: "Failed to process your question. Please try again." },
      { status: 500 }
    )
  }
}
