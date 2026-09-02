"use client"

import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

interface TariffPeriod {
  START_TIME: string
  END_TIME: string
  TARIFF_TYPE: string
  APPLIES_TO_DAYS: string
  ENERGY_DIRECTION: string
  PEAK_RATE: number
  SHOULDER_RATE: number
  OFFPEAK_RATE: number
  SUPER_OFFPEAK_RATE: number
  PEAK_EXPORT_RATE: number
  SHOULDER_EXPORT_RATE: number
  OFFPEAK_EXPORT_RATE: number
  SUPER_OFFPEAK_EXPORT_RATE: number
  DAILY_CHARGE: number
}

interface UsageRow {
  USAGE_HOUR_START: string
  USAGE_KWH: number
  DAY_OF_WEEK: number
  TIME_SLOT: string
  DAY_NAME: string
  DATE_STR: string
}

interface ChartDataPoint {
  label: string
  peak: number
  shoulder: number
  offpeak: number
  superoffpeak: number
  dailyCharge: number
}

export interface SummaryData {
  peakKwh: number
  shoulderKwh: number
  offpeakKwh: number
  superoffpeakKwh: number
  totalKwh: number
  peakCost: number
  shoulderCost: number
  offpeakCost: number
  superoffpeakCost: number
  dailyChargeCost: number
  totalCost: number
}

interface EnergyChartProps {
  startDate: string
  endDate: string
  usageType: "Import" | "Export"
  unitMode: "kwh" | "dollar"
  viewMode: "day" | "week" | "month" | "year"
  providerId: number | null
  onSummaryReady?: (summary: SummaryData) => void
}

function classifyTariff(timeSlot: string, dayOfWeek: number, tariffs: TariffPeriod[]): string {
  const time = timeSlot + ":00"
  const isWeekend = dayOfWeek >= 6

  for (const t of tariffs) {
    const appliesToDay = t.APPLIES_TO_DAYS === "all" ||
      (t.APPLIES_TO_DAYS === "weekdays" && !isWeekend) ||
      (t.APPLIES_TO_DAYS === "weekends" && isWeekend)

    if (!appliesToDay) continue

    const startTime = t.START_TIME
    const endTime = t.END_TIME

    if (startTime <= endTime) {
      if (time >= startTime && time < endTime) return t.TARIFF_TYPE
    } else {
      if (time >= startTime || time < endTime) return t.TARIFF_TYPE
    }
  }
  return "offpeak"
}

function getRate(tariffType: string, usageType: "Import" | "Export", tariffs: TariffPeriod[]): number {
  if (tariffs.length === 0) return 0
  const t = tariffs[0]
  if (usageType === "Export") {
    switch (tariffType) {
      case "peak": return t.PEAK_EXPORT_RATE
      case "shoulder": return t.SHOULDER_EXPORT_RATE
      case "superoffpeak": return t.SUPER_OFFPEAK_EXPORT_RATE
      default: return t.OFFPEAK_EXPORT_RATE
    }
  }
  switch (tariffType) {
    case "peak": return t.PEAK_RATE
    case "shoulder": return t.SHOULDER_RATE
    case "superoffpeak": return t.SUPER_OFFPEAK_RATE
    default: return t.OFFPEAK_RATE
  }
}

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

function formatHourLabel(h: string): string {
  const hour = parseInt(h, 10)
  if (hour === 0) return "12am"
  if (hour === 12) return "12pm"
  if (hour < 12) return `${hour}am`
  return `${hour - 12}pm`
}

type TierKey = "peak" | "shoulder" | "offpeak" | "superoffpeak"
const ZERO_TIERS = { peak: 0, shoulder: 0, offpeak: 0, superoffpeak: 0 }

function CustomTooltip({ active, payload, label, unitMode, colors, labels }: any) {
  if (!active || !payload || payload.length === 0) return null

  const data: Record<string, number> = {}
  for (const entry of payload) {
    data[entry.dataKey] = entry.value
  }

  const peak = data.peak || 0
  const shoulder = data.shoulder || 0
  const offpeak = data.offpeak || 0
  const superoffpeak = data.superoffpeak || 0
  const dailyCharge = data.dailyCharge || 0
  const total = peak + shoulder + offpeak + superoffpeak + dailyCharge

  const formatVal = (v: number) => unitMode === "dollar" ? `$${v.toFixed(2)}` : `${v.toFixed(2)} kWh`

  const rows: { color: string; value: number; label: string; striped: boolean }[] = [
    { color: colors.peak, value: peak, label: labels.peak, striped: false },
    { color: colors.shoulder, value: shoulder, label: labels.shoulder, striped: false },
    { color: colors.offpeak, value: offpeak, label: labels.offpeak, striped: false },
    { color: colors.superoffpeak, value: superoffpeak, label: labels.superoffpeak, striped: false },
  ].filter(r => r.value > 0)

  if (unitMode === "dollar" && dailyCharge > 0) {
    rows.push({ color: colors.dailyCharge, value: dailyCharge, label: "Standing Charge", striped: true })
  }

  return (
    <div className="rounded-xl p-4 shadow-xl" style={{ backgroundColor: "#FFFFFF", minWidth: 160 }}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-start gap-2 mb-2">
          <span
            className="w-1 h-8 rounded-full mt-0.5 shrink-0"
            style={row.striped ? {
              background: `repeating-linear-gradient(45deg, ${row.color}, ${row.color} 2px, #FFFFFF 2px, #FFFFFF 4px)`
            } : {
              backgroundColor: row.color
            }}
          />
          <div>
            <div className="text-sm font-bold text-gray-900">{formatVal(row.value)}</div>
            <div className="text-xs text-gray-500">{row.label}</div>
          </div>
        </div>
      ))}
      <div className="mt-2 pt-2 border-t border-gray-200">
        <div className="text-base font-bold text-gray-900">{formatVal(total)}</div>
        <div className="text-xs text-gray-500">Total</div>
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

export function EnergyChart({ startDate, endDate, usageType, unitMode, viewMode, providerId, onSummaryReady }: EnergyChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [icp, setIcp] = useState("")
  const [loading, setLoading] = useState(true)
  const [hasSuperoffpeak, setHasSuperoffpeak] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const providerParam = providerId ? `&providerId=${providerId}` : ""
        const res = await fetch(
          `/api/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&usageType=${usageType}${providerParam}`
        )
        if (!res.ok) throw new Error("Failed to fetch data")
        const data = await res.json()

        const tariffs: TariffPeriod[] = data.tariffs
        const usage: UsageRow[] = data.usage
        setIcp(data.icp)

        const hasSop = tariffs.some(t => t.TARIFF_TYPE === "superoffpeak")
        setHasSuperoffpeak(hasSop)

        const grouped: Record<string, { peak: number; shoulder: number; offpeak: number; superoffpeak: number }> = {}

        for (const row of usage) {
          const dayOfWeek = row.DAY_OF_WEEK
          const tariffType = classifyTariff(row.TIME_SLOT, dayOfWeek, tariffs)
          const kwh = Number(row.USAGE_KWH) || 0

          let key: string
          if (viewMode === "day") {
            key = row.TIME_SLOT.substring(0, 2)
          } else if (viewMode === "year") {
            key = row.DATE_STR.substring(0, 7)
          } else {
            key = row.DATE_STR
          }

          if (!grouped[key]) grouped[key] = { ...ZERO_TIERS }

          if (tariffType === "peak") {
            grouped[key].peak += kwh
          } else if (tariffType === "shoulder") {
            grouped[key].shoulder += kwh
          } else if (tariffType === "superoffpeak") {
            grouped[key].superoffpeak += kwh
          } else {
            grouped[key].offpeak += kwh
          }
        }

        const dailyChargeRate = tariffs.length > 0 ? Number(tariffs[0].DAILY_CHARGE) : 0

        let chartPoints: ChartDataPoint[]
        if (viewMode === "week") {
          const [sy, sm, sd] = startDate.split("-").map(Number)
          chartPoints = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(sy, sm - 1, sd + i)
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
            const dayIdx = d.getDay()
            const label = DAY_LABELS[dayIdx === 0 ? 6 : dayIdx - 1]
            const g = grouped[dateStr] || ZERO_TIERS
            return {
              label,
              peak: Number(g.peak.toFixed(2)),
              shoulder: Number(g.shoulder.toFixed(2)),
              offpeak: Number(g.offpeak.toFixed(2)),
              superoffpeak: Number(g.superoffpeak.toFixed(2)),
              dailyCharge: dailyChargeRate,
            }
          })
        } else if (viewMode === "day") {
          const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
          const perHourCharge = dailyChargeRate / 24
          chartPoints = hours.map(h => {
            const g = grouped[h] || ZERO_TIERS
            return {
              label: formatHourLabel(h),
              peak: Number(g.peak.toFixed(2)),
              shoulder: Number(g.shoulder.toFixed(2)),
              offpeak: Number(g.offpeak.toFixed(2)),
              superoffpeak: Number(g.superoffpeak.toFixed(2)),
              dailyCharge: Number(perHourCharge.toFixed(4)),
            }
          })
        } else {
          const [sy, sm, sd] = startDate.split("-").map(Number)
          const endDateStr = endDate.substring(0, 10)
          const [ey, em, ed] = endDateStr.split("-").map(Number)
          const allDates: string[] = []
          const cursor = new Date(sy, sm - 1, sd)
          const end = new Date(ey, em - 1, ed)
          while (cursor <= end) {
            const ds = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
            allDates.push(ds)
            cursor.setDate(cursor.getDate() + 1)
          }
          chartPoints = allDates.map(d => {
            const g = grouped[d] || ZERO_TIERS
            return {
              label: d.substring(8),
              peak: Number(g.peak.toFixed(2)),
              shoulder: Number(g.shoulder.toFixed(2)),
              offpeak: Number(g.offpeak.toFixed(2)),
              superoffpeak: Number(g.superoffpeak.toFixed(2)),
              dailyCharge: dailyChargeRate,
            }
          })
        }

        if (viewMode === "year") {
          const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
          const [sy] = startDate.split("-").map(Number)
          chartPoints = Array.from({ length: 12 }, (_, i) => {
            const monthKey = `${sy}-${String(i + 1).padStart(2, "0")}`
            const daysInMonth = new Date(sy, i + 1, 0).getDate()
            const g = grouped[monthKey] || ZERO_TIERS
            return {
              label: MONTH_LABELS[i],
              peak: Number(g.peak.toFixed(2)),
              shoulder: Number(g.shoulder.toFixed(2)),
              offpeak: Number(g.offpeak.toFixed(2)),
              superoffpeak: Number(g.superoffpeak.toFixed(2)),
              dailyCharge: dailyChargeRate * daysInMonth,
            }
          })
        }

        const numDays = viewMode === "day" ? 1 : viewMode === "week" ? 7 : viewMode === "year" ? 365 : chartPoints.length

        const peakKwh = chartPoints.reduce((sum, d) => sum + d.peak, 0)
        const shoulderKwh = chartPoints.reduce((sum, d) => sum + d.shoulder, 0)
        const offpeakKwh = chartPoints.reduce((sum, d) => sum + d.offpeak, 0)
        const superoffpeakKwh = chartPoints.reduce((sum, d) => sum + d.superoffpeak, 0)
        const totalKwh = peakKwh + shoulderKwh + offpeakKwh + superoffpeakKwh

        const peakRate = getRate("peak", usageType, tariffs)
        const shoulderRate = getRate("shoulder", usageType, tariffs)
        const offpeakRate = getRate("offpeak", usageType, tariffs)
        const superoffpeakRate = getRate("superoffpeak", usageType, tariffs)

        const dailyChargeCost = usageType === "Export" ? 0 : numDays * dailyChargeRate

        const computedSummary: SummaryData = {
          peakKwh, shoulderKwh, offpeakKwh, superoffpeakKwh, totalKwh,
          peakCost: peakKwh * peakRate,
          shoulderCost: shoulderKwh * shoulderRate,
          offpeakCost: offpeakKwh * offpeakRate,
          superoffpeakCost: superoffpeakKwh * superoffpeakRate,
          dailyChargeCost,
          totalCost: peakKwh * peakRate + shoulderKwh * shoulderRate + offpeakKwh * offpeakRate + superoffpeakKwh * superoffpeakRate + dailyChargeCost,
        }
        setSummary(computedSummary)
        onSummaryReady?.(computedSummary)

        if (unitMode === "dollar") {
          const showDailyCharge = usageType === "Import"
          chartPoints = chartPoints.map(d => ({
            ...d,
            peak: Number((d.peak * peakRate).toFixed(2)),
            shoulder: Number((d.shoulder * shoulderRate).toFixed(2)),
            offpeak: Number((d.offpeak * offpeakRate).toFixed(2)),
            superoffpeak: Number((d.superoffpeak * superoffpeakRate).toFixed(2)),
            dailyCharge: showDailyCharge ? Number(d.dailyCharge.toFixed(2)) : 0,
          }))
        } else {
          chartPoints = chartPoints.map(d => ({ ...d, dailyCharge: 0 }))
        }

        setChartData(chartPoints)
      } catch (err) {
        console.error("Chart data fetch error:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [startDate, endDate, usageType, unitMode, viewMode, providerId])

  const unit = unitMode === "kwh" ? "kWh" : "NZ$"
  const totalDisplay = unitMode === "kwh"
    ? `${summary?.totalKwh?.toFixed(2) || "0"}`
    : `$${summary?.totalCost?.toFixed(2) || "0"}`

  const colors = usageType === "Import"
    ? { peak: "#2DD4A0", shoulder: "#E020B0", offpeak: "#D8A0E8", superoffpeak: "#FFD166", dailyCharge: "#E880C8" }
    : { peak: "#4ECDC4", shoulder: "#60F0F8", offpeak: "#9B7DFF", superoffpeak: "#FFD166", dailyCharge: "#E880C8" }

  const isExport = usageType === "Export"
  const labels = {
    peak: isExport ? "Peak Export" : "Peak",
    shoulder: isExport ? "Shoulder Export" : "Shoulder",
    offpeak: isExport ? "Off-peak Export" : "Off-peak",
    superoffpeak: isExport ? "Super Off-peak Export" : "Super Off-peak",
  }

  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-3xl font-bold" style={{ color: "var(--octopus-white)" }}>
            {totalDisplay} <span className="text-lg font-normal">{unit}</span>
          </p>
        </div>
        <div className="text-right text-xs" style={{ color: "var(--muted-foreground)" }}>
          ICP: {icp}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
            <defs>
              <pattern id="dailyChargeStripes" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#E880C8" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
              </pattern>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--octopus-mid-purple)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--octopus-white)", fontSize: 12 }}
              axisLine={{ stroke: "var(--octopus-mid-purple)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "var(--octopus-white)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => unitMode === "dollar" ? `$${v}` : `${v}`}
              label={{
                value: unit,
                angle: -90,
                position: "insideLeft",
                style: { fill: "var(--muted-foreground)", fontSize: 11 }
              }}
            />
            <Tooltip content={<CustomTooltip unitMode={unitMode} colors={colors} labels={labels} />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Bar dataKey="dailyCharge" stackId="a" fill="url(#dailyChargeStripes)" radius={[0, 0, 0, 0]} name="Daily charge" />
            {hasSuperoffpeak && <Bar dataKey="superoffpeak" stackId="a" fill={colors.superoffpeak} radius={[0, 0, 0, 0]} name={labels.superoffpeak} />}
            <Bar dataKey="offpeak" stackId="a" fill={colors.offpeak} radius={[0, 0, 0, 0]} name={labels.offpeak} />
            <Bar dataKey="shoulder" stackId="a" fill={colors.shoulder} radius={[0, 0, 0, 0]} name={labels.shoulder} />
            <Bar dataKey="peak" stackId="a" fill={colors.peak} radius={[4, 4, 0, 0]} name={labels.peak} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {summary && (
        <div className="mt-6 space-y-2 text-sm" style={{ color: "var(--octopus-white)" }}>
          <SummaryRow
            color={colors.offpeak}
            label={labels.offpeak}
            percentage={summary.totalKwh > 0 ? Math.round((summary.offpeakKwh / summary.totalKwh) * 100) : 0}
            value={unitMode === "kwh" ? `${summary.offpeakKwh.toFixed(2)} kWh` : `$${summary.offpeakCost.toFixed(2)}`}
          />
          {hasSuperoffpeak && (
            <SummaryRow
              color={colors.superoffpeak}
              label={labels.superoffpeak}
              percentage={summary.totalKwh > 0 ? Math.round((summary.superoffpeakKwh / summary.totalKwh) * 100) : 0}
              value={unitMode === "kwh" ? `${summary.superoffpeakKwh.toFixed(2)} kWh` : `$${summary.superoffpeakCost.toFixed(2)}`}
            />
          )}
          <SummaryRow
            color={colors.shoulder}
            label={labels.shoulder}
            percentage={summary.totalKwh > 0 ? Math.round((summary.shoulderKwh / summary.totalKwh) * 100) : 0}
            value={unitMode === "kwh" ? `${summary.shoulderKwh.toFixed(2)} kWh` : `$${summary.shoulderCost.toFixed(2)}`}
          />
          <SummaryRow
            color={colors.peak}
            label={labels.peak}
            percentage={summary.totalKwh > 0 ? Math.round((summary.peakKwh / summary.totalKwh) * 100) : 0}
            value={unitMode === "kwh" ? `${summary.peakKwh.toFixed(2)} kWh` : `$${summary.peakCost.toFixed(2)}`}
          />
          {usageType === "Import" && unitMode === "dollar" && (
          <SummaryRow
            color={colors.dailyCharge}
            label="Daily charge"
            percentage={0}
            value={`$${summary.dailyChargeCost.toFixed(2)}`}
            striped
          />
          )}
          <div className="flex justify-between pt-2 border-t border-[var(--octopus-mid-purple)] font-medium">
            <span>{usageType === "Import" ? "TOTAL" : "EXPORTED"}</span>
            <span style={{ color: "var(--octopus-cyan)" }}>
              {unitMode === "kwh" ? `${summary.totalKwh.toFixed(2)} kWh` : `$${summary.totalCost.toFixed(2)}`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryRow({ color, label, percentage, value, striped }: { color: string; label: string; percentage: number; value: string; striped?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={striped ? {
            background: `repeating-linear-gradient(45deg, ${color}, ${color} 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)`
          } : {
            backgroundColor: color
          }}
        />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-4">
        <span style={{ color: "var(--muted-foreground)" }}>{percentage}%</span>
        <span className="w-24 text-right">{value}</span>
      </div>
    </div>
  )
}
