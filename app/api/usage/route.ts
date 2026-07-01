import { querySnowflake } from "@/lib/snowflake"
import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const startDate = searchParams.get("startDate")
  const endDate = searchParams.get("endDate")
  const usageType = searchParams.get("usageType") || "Import"
  const groupBy = searchParams.get("groupBy") || "day"

  if (!startDate || !endDate) {
    return Response.json({ error: "startDate and endDate are required" }, { status: 400 })
  }

  try {
    // Get tariff periods for Octopus Flexi Low User
    const tariffRows = await querySnowflake(`
      SELECT tp.START_TIME, tp.END_TIME, tp.TARIFF_TYPE, tp.APPLIES_TO_DAYS, tp.ENERGY_DIRECTION,
             p.PEAK_RATE, p.SHOULDER_RATE, p.OFFPEAK_RATE,
             p.PEAK_EXPORT_RATE, p.SHOULDER_EXPORT_RATE, p.OFFPEAK_EXPORT_RATE,
             p.DAILY_CHARGE
      FROM REGANHOME.PUBLIC.ELECTRICITY_PROVIDERS p
      JOIN REGANHOME.PUBLIC.ELECTRICITY_TARIFF_PERIODS tp ON p.PROVIDER_ID = tp.PROVIDER_ID
      WHERE LOWER(p.PROVIDER_NAME) = 'octopus'
        AND LOWER(p.PLAN_NAME) = 'flexi low user'
        AND tp.IS_ACTIVE = TRUE
        AND tp.ENERGY_DIRECTION = '${usageType === "Import" ? "import" : "export"}'
    `)

    // Determine date truncation based on groupBy
    let dateTrunc: string
    let dateFormat: string
    switch (groupBy) {
      case "hour":
        dateTrunc = "HOUR"
        dateFormat = "YYYY-MM-DD HH24:MI"
        break
      case "week":
        dateTrunc = "WEEK"
        dateFormat = "YYYY-MM-DD"
        break
      case "month":
        dateTrunc = "MONTH"
        dateFormat = "YYYY-MM"
        break
      default:
        dateTrunc = "DAY"
        dateFormat = "YYYY-MM-DD"
    }

    // Get usage data grouped by period
    const usageRows = await querySnowflake(`
      SELECT
        TO_CHAR(DATE_TRUNC('${dateTrunc}', u.USAGE_HOUR_START), '${dateFormat}') AS period,
        DAYOFWEEKISO(u.USAGE_HOUR_START) AS day_of_week,
        TO_CHAR(u.USAGE_HOUR_START, 'HH24:MI') AS time_slot,
        DAYNAME(u.USAGE_HOUR_START) AS day_name,
        SUM(u.USAGE_KWH) AS total_kwh
      FROM REGANHOME.PUBLIC.ELECTRICITY_USAGE u
      WHERE u.USAGE_HOUR_START >= '${startDate}'
        AND u.USAGE_HOUR_START < '${endDate}'
        AND u.USAGE_TYPE = '${usageType}'
      GROUP BY period, day_of_week, time_slot, day_name
      ORDER BY period, time_slot
    `)

    return Response.json({
      usage: usageRows,
      tariffs: tariffRows,
      params: { startDate, endDate, usageType, groupBy }
    })
  } catch (e) {
    console.error(new Date().toISOString(), "[usage-api]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to fetch usage data" },
      { status: 500 }
    )
  }
}
