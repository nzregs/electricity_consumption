import { querySnowflake } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await querySnowflake(`
      SELECT PROVIDER_ID, PROVIDER_NAME, PLAN_NAME, DAILY_CHARGE,
             PEAK_RATE, SHOULDER_RATE, OFFPEAK_RATE,
             PEAK_EXPORT_RATE, SHOULDER_EXPORT_RATE, OFFPEAK_EXPORT_RATE,
             CURRENT_PROVIDER
      FROM REGANHOME.PUBLIC.ELECTRICITY_PROVIDERS
      WHERE IS_ACTIVE = TRUE
      ORDER BY CURRENT_PROVIDER DESC, PROVIDER_NAME, PLAN_NAME
    `)
    return Response.json({ providers: rows })
  } catch (e) {
    console.error(new Date().toISOString(), "[providers-api]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to fetch providers" },
      { status: 500 }
    )
  }
}
