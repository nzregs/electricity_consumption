import { querySnowflake } from "@/lib/snowflake"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await querySnowflake(`
      SELECT
        MIN(USAGE_HOUR_START) AS min_date,
        MAX(USAGE_HOUR_START) AS max_date
      FROM REGANHOME.PUBLIC.ELECTRICITY_USAGE
    `)

    return Response.json({
      minDate: rows[0]?.MIN_DATE ?? null,
      maxDate: rows[0]?.MAX_DATE ?? null,
    })
  } catch (e) {
    console.error(new Date().toISOString(), "[data-range-api]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to fetch data range" },
      { status: 500 }
    )
  }
}
