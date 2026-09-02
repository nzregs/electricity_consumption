import { querySnowflake } from "@/lib/snowflake"
import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const startDate = searchParams.get("startDate")
  const endDate = searchParams.get("endDate")
  const usageType = searchParams.get("usageType") || "Import"
  const providerId = searchParams.get("providerId")

  if (!startDate || !endDate) {
    return Response.json({ error: "startDate and endDate are required" }, { status: 400 })
  }

  try {
    const providerFilter = providerId
      ? `WHERE p.PROVIDER_ID = ${Number(providerId)}`
      : `WHERE p.CURRENT_PROVIDER = TRUE`

    const tariffRows = await querySnowflake(`
      SELECT tp.START_TIME, tp.END_TIME, tp.TARIFF_TYPE, tp.APPLIES_TO_DAYS, tp.ENERGY_DIRECTION,
             p.PEAK_RATE, p.SHOULDER_RATE, p.OFFPEAK_RATE, COALESCE(p.SUPER_OFFPEAK_RATE, 0) AS SUPER_OFFPEAK_RATE,
             p.PEAK_EXPORT_RATE, p.SHOULDER_EXPORT_RATE, p.OFFPEAK_EXPORT_RATE, COALESCE(p.SUPER_OFFPEAK_EXPORT_RATE, 0) AS SUPER_OFFPEAK_EXPORT_RATE,
             p.DAILY_CHARGE
      FROM REGANHOME.PUBLIC.ELECTRICITY_PROVIDERS p
      JOIN REGANHOME.PUBLIC.ELECTRICITY_TARIFF_PERIODS tp ON p.PROVIDER_ID = tp.PROVIDER_ID
      ${providerFilter}
        AND tp.IS_ACTIVE = TRUE
        AND tp.ENERGY_DIRECTION = '${usageType === "Import" ? "import" : "export"}'
    `)

    const statsRows = await querySnowflake(`
      SELECT
        HOUR(u.USAGE_HOUR_START) AS hour,
        MIN(u.USAGE_KWH) AS min_kwh,
        AVG(u.USAGE_KWH) AS avg_kwh,
        MAX(u.USAGE_KWH) AS max_kwh,
        COUNT(DISTINCT DATE(u.USAGE_HOUR_START)) AS sample_count
      FROM REGANHOME.PUBLIC.ELECTRICITY_USAGE u
      WHERE u.USAGE_HOUR_START >= '${startDate}'
        AND u.USAGE_HOUR_START < '${endDate}'
        AND u.USAGE_TYPE = '${usageType}'
      GROUP BY HOUR(u.USAGE_HOUR_START)
      ORDER BY hour
    `)

    const icpRows = await querySnowflake(`
      SELECT DISTINCT ICP FROM REGANHOME.PUBLIC.ELECTRICITY_USAGE LIMIT 1
    `)

    return Response.json({
      stats: statsRows,
      tariffs: tariffRows,
      icp: icpRows[0]?.ICP || "Unknown",
      params: { startDate, endDate, usageType }
    })
  } catch (e) {
    console.error(new Date().toISOString(), "[stats-api]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to fetch stats data" },
      { status: 500 }
    )
  }
}
