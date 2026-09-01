import { querySnowflake, getServiceToken, readTomlDefaultConnection } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

const SEMANTIC_VIEW = "REGANHOME.PUBLIC.ELECTRICITY_CONSUMPTION"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface AnalystContentBlock {
  type: "text" | "sql" | "suggestions"
  text?: string
  statement?: string
  suggestions?: string[]
}

function sfEscape(str: string): string {
  return str.replace(/'/g, "''").replace(/\\/g, "\\\\")
}

// --- SPCS Mode: Cortex Analyst REST API with semantic view ---

function getSnowflakeHost(): string {
  if (process.env.SNOWFLAKE_HOST) return process.env.SNOWFLAKE_HOST
  if (process.env.SNOWFLAKE_ACCOUNT_URL) return process.env.SNOWFLAKE_ACCOUNT_URL.replace(/^https?:\/\//, "")
  const tomlConn = readTomlDefaultConnection()
  if (tomlConn?.host) return tomlConn.host
  const account = process.env.SNOWFLAKE_ACCOUNT || tomlConn?.account || ""
  if (account) return `${account.toLowerCase().replace(/_/g, "-")}.snowflakecomputing.com`
  throw new Error("Cannot determine Snowflake host")
}

async function callCortexAnalystREST(userQuestion: string): Promise<{ text: string; sql?: string; suggestions?: string[] }> {
  const host = getSnowflakeHost()
  const token = getServiceToken()
  const url = `https://${host}/api/v2/cortex/analyst/message`

  const body = {
    messages: [{ role: "user", content: [{ type: "text", text: userQuestion }] }],
    semantic_view: SEMANTIC_VIEW,
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-Snowflake-Authorization-Token-Type": "OAUTH",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Cortex Analyst API ${response.status}: ${errorText}`)
  }

  const data = await response.json() as { message: { content: AnalystContentBlock[] } }
  const blocks = data.message?.content ?? []

  let textParts: string[] = []
  let sql: string | undefined
  let suggestions: string[] = []

  for (const block of blocks) {
    if (block.type === "text" && block.text) textParts.push(block.text)
    else if (block.type === "sql" && block.statement) sql = block.statement
    else if (block.type === "suggestions" && block.suggestions) suggestions = block.suggestions
  }

  return { text: textParts.join("\n"), sql, suggestions }
}

// --- Local Dev Mode: CORTEX.COMPLETE text-to-SQL fallback ---

const SCHEMA_CONTEXT = `You are an energy usage assistant for a New Zealand household. You have access to the following Snowflake tables in the REGANHOME.PUBLIC schema:

1. ELECTRICITY_USAGE - Hourly electricity consumption readings
   Columns: ICP (VARCHAR - meter identifier), USAGE_HOUR_START (TIMESTAMP_NTZ - start of the usage hour), USAGE_HOUR_END (TIMESTAMP_NTZ - nullable), USAGE_KWH (NUMBER(10,2) - electricity consumed in kWh), USAGE_TYPE (VARCHAR - "Import" for consumption, "Export" for solar generation), DAILY_CHARGE (NUMBER(10,2) - daily supply charge in $), RETAILER (VARCHAR - energy retailer name), SOURCEFILE (VARCHAR)
   Note: Each row is one hour of usage. To get dates use DATE(USAGE_HOUR_START). To get hour use HOUR(USAGE_HOUR_START). To get day of week use DAYNAME(USAGE_HOUR_START).

2. ELECTRICITY_PROVIDERS - Provider/plan info with rates
   Columns: PROVIDER_ID (NUMBER PK), PROVIDER_NAME (VARCHAR), PLAN_NAME (VARCHAR), DAILY_CHARGE (NUMBER(10,4) $/day), PEAK_RATE (NUMBER $/kWh), SHOULDER_RATE (NUMBER $/kWh), OFFPEAK_RATE (NUMBER $/kWh), PEAK_EXPORT_RATE (NUMBER), SHOULDER_EXPORT_RATE (NUMBER), OFFPEAK_EXPORT_RATE (NUMBER), IS_ACTIVE (BOOLEAN)

3. ELECTRICITY_TARIFF_PERIODS - Time-of-use tariff period definitions
   Columns: TARIFF_PERIOD_ID (NUMBER PK), PROVIDER_ID (NUMBER FK), PERIOD_NUMBER (NUMBER), PERIOD_NAME (VARCHAR e.g. "Period 1"), START_TIME (TIME), END_TIME (TIME), TARIFF_TYPE (VARCHAR - "peak","shoulder","offpeak"), APPLIES_TO_DAYS (VARCHAR - "weekdays","weekends","all"), ENERGY_DIRECTION (VARCHAR - "import","export"), IS_ACTIVE (BOOLEAN)

The ICP is 0145237680LCE44. The ELECTRICITY_PROVIDERS table has a CURRENT_PROVIDER boolean column - use WHERE CURRENT_PROVIDER = TRUE to find the active provider. Data spans from 2024-01-01 to 2026-06-28. Currency is NZD.

Important: Filter by USAGE_TYPE = ''Import'' for consumption queries and ''Export'' for generation/export queries unless the user asks about both.`

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

async function callCortexAnalystLocal(userQuestion: string): Promise<{ text: string; sql?: string }> {
  const sqlPrompt = `${SCHEMA_CONTEXT}\n\nGiven the user's question, write a single Snowflake SQL query to answer it. Return ONLY the SQL query, no explanation, no markdown fencing. If the question cannot be answered with SQL against these tables, return exactly: CANNOT_ANSWER`

  const generatedText = await cortexComplete(sqlPrompt, userQuestion)

  if (!generatedText || generatedText.includes("CANNOT_ANSWER")) {
    return { text: "I can only answer questions about your electricity usage, tariffs, and costs. Could you rephrase your question?" }
  }

  let sql = generatedText.replace(/```sql\n?/gi, "").replace(/```\n?/g, "").trim()
  if (!sql.toUpperCase().startsWith("SELECT") && !sql.toUpperCase().startsWith("WITH")) {
    return { text: "I can only answer read-only questions about your data." }
  }

  return { text: "", sql }
}

// --- Shared: Execute SQL and summarize results ---

async function executeAndSummarize(sql: string, userQuestion: string, analystText: string): Promise<{ reply: string; sql: string }> {
  let queryResults: Record<string, any>[]
  try {
    queryResults = await querySnowflake(sql)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("Generated SQL failed:", sql, msg)
    return {
      reply: analystText || "I tried to query your data but encountered an error. Could you try rephrasing your question?",
      sql
    }
  }

  const resultsStr = JSON.stringify(queryResults.slice(0, 50), null, 2)
  const answerPrompt = `Question: ${userQuestion}\n\nSQL Results (${queryResults.length} rows):\n${resultsStr}`

  const answer = await cortexComplete(
    "You are an energy usage assistant. Given the user's question and SQL results, provide a concise helpful answer in 1-3 sentences. Format numbers with appropriate units (kWh, $NZD). If results are empty, say so clearly.",
    answerPrompt
  )

  return { reply: answer || analystText || "I couldn't generate an answer.", sql }
}

// --- Main handler ---

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages: ChatMessage[] }
    const lastUserMessage = messages.filter(m => m.role === "user").pop()

    if (!lastUserMessage) {
      return Response.json({ error: "No user message provided" }, { status: 400 })
    }

    const userQuestion = lastUserMessage.content
    const isSpcs = !!getServiceToken()

    let text = ""
    let sql: string | undefined
    let suggestions: string[] | undefined

    if (isSpcs) {
      // Production: Use Cortex Analyst REST API with the semantic view
      const result = await callCortexAnalystREST(userQuestion)
      text = result.text
      sql = result.sql
      suggestions = result.suggestions
    } else {
      // Local dev: Use CORTEX.COMPLETE text-to-SQL
      const result = await callCortexAnalystLocal(userQuestion)
      text = result.text
      sql = result.sql
    }

    // If we got SQL, execute it and summarize
    if (sql) {
      const result = await executeAndSummarize(sql, userQuestion, text)
      return Response.json(result)
    }

    // No SQL - return text or suggestions
    if (suggestions && suggestions.length > 0) {
      const suggestionText = text + "\n\nHere are some questions I can answer:\n" + suggestions.map(s => `- ${s}`).join("\n")
      return Response.json({ reply: suggestionText })
    }

    return Response.json({ reply: text || "I couldn't generate an answer. Please try rephrasing your question." })
  } catch (err) {
    console.error("Chat API error:", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return Response.json(
      { error: `Failed to process your question: ${message}` },
      { status: 500 }
    )
  }
}
