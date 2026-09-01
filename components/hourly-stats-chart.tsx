"use client"

import { useEffect, useState } from "react"
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Line, Scatter, ZAxis
} from "recharts"

interface TariffPeriod {
  PEAK_RATE: number
  SHOULDER_RATE: number
  OFFPEAK_RATE: number
  PEAK_EXPORT_RATE: number
  SHOULDER_EXPORT_RATE: number
  OFFPEAK_EXPORT_RATE: number
}

interface StatsRow {
  HOUR: number
  MIN_KWH: number
  AVG_KWH: number
  MAX_KWH: number
  SAMPLE_COUNT: number
}

interface ChartPoint {
  label: string
  hour: number
  min: number
  avg: number
  max: number
  base: number  // invisible base of the range bar
  range: number // visible height of the range bar
  samples: number
}

interface HourlyStatsChartProps {
  startDate: string
  endDate: string
  usageType: "Import" | "Export"
  unitMode: "kwh" | "dollar"
}

function formatHourLabel(h: number): string {
  if (h === 0) return "12am"
  if (h === 12) return "12pm"
  if (h < 12) return `${h}am`
  return `${h - 12}pm`
}

function getAvgRate(usageType: "Import" | "Export", tariffs: TariffPeriod[]): number {
  if (tariffs.length === 0) return 0
  const t = tariffs[0]
  if (usageType === "Export") {
    return (t.PEAK_EXPORT_RATE + t.SHOULDER_EXPORT_RATE + t.OFFPEAK_EXPORT_RATE) / 3
  }
  return (t.PEAK_RATE + t.SHOULDER_RATE + t.OFFPEAK_RATE) / 3
}

function StatsTooltip({ active, payload, unitMode }: any) {
  if (!active || !payload || payload.length === 0) return null

  const point = payload[0]?.payload as ChartPoint | undefined
  if (!point) return null

  const fmt = (v: number) => unitMode === "dollar" ? `$${v.toFixed(3)}` : `${v.toFixed(2)} kWh`

  return (
    <div className="rounded-xl p-4 shadow-xl" style={{ backgroundColor: "#FFFFFF", minWidth: 160 }}>
      <div className="text-sm font-bold text-gray-900 mb-2">{point.label}</div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Max</span>
          <span className="font-medium text-gray-900">{fmt(point.max)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Mean</span>
          <span className="font-bold text-gray-900">{fmt(point.avg)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Min</span>
          <span className="font-medium text-gray-900">{fmt(point.min)}</span>
        </div>
      </div>
      <div className="text-xs text-gray-400 mt-2">{point.samples} samples</div>
    </div>
  )
}

export function HourlyStatsChart({ startDate, endDate, usageType, unitMode }: HourlyStatsChartProps) {
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [icp, setIcp] = useState("")
  const [loading, setLoading] = useState(true)
  const [totalDays, setTotalDays] = useState(0)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/stats?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&usageType=${usageType}`
        )
        if (!res.ok) throw new Error("Failed to fetch stats")
        const data = await res.json()

        const stats: StatsRow[] = data.stats
        const tariffs: TariffPeriod[] = data.tariffs
        setIcp(data.icp)

        const rate = unitMode === "dollar" ? getAvgRate(usageType, tariffs) : 1
        const maxSamples = Math.max(...stats.map(s => s.SAMPLE_COUNT), 1)
        setTotalDays(maxSamples)

        const points: ChartPoint[] = Array.from({ length: 24 }, (_, h) => {
          const row = stats.find(s => s.HOUR === h)
          const minVal = (row ? Number(row.MIN_KWH) : 0) * rate
          const avgVal = (row ? Number(row.AVG_KWH) : 0) * rate
          const maxVal = (row ? Number(row.MAX_KWH) : 0) * rate

          return {
            label: formatHourLabel(h),
            hour: h,
            min: Number(minVal.toFixed(3)),
            avg: Number(avgVal.toFixed(3)),
            max: Number(maxVal.toFixed(3)),
            base: Number(minVal.toFixed(3)),
            range: Number((maxVal - minVal).toFixed(3)),
            samples: row ? row.SAMPLE_COUNT : 0,
          }
        })

        setChartData(points)
      } catch (err) {
        console.error("Stats fetch error:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [startDate, endDate, usageType, unitMode])

  const unit = unitMode === "kwh" ? "kWh" : "NZ$"
  const color = usageType === "Import" ? "#E020B0" : "#4ECDC4"
  const meanColor = "#00E5FF"

  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading...</div>
      </div>
    )
  }

  const overallAvg = chartData.length > 0
    ? chartData.reduce((s, d) => s + d.avg, 0) / chartData.filter(d => d.samples > 0).length
    : 0

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-3xl font-bold" style={{ color: "var(--octopus-white)" }}>
            {unitMode === "dollar" ? `$${overallAvg.toFixed(3)}` : `${overallAvg.toFixed(2)}`}{" "}
            <span className="text-lg font-normal">{unit}/hr avg</span>
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
            Based on {totalDays} days of data
          </p>
        </div>
        <div className="text-right text-xs" style={{ color: "var(--muted-foreground)" }}>
          ICP: {icp}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--octopus-mid-purple)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--octopus-white)", fontSize: 11 }}
              axisLine={{ stroke: "var(--octopus-mid-purple)" }}
              tickLine={false}
              interval={1}
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
            <Tooltip content={<StatsTooltip unitMode={unitMode} />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            {/* Invisible base bar */}
            <Bar dataKey="base" stackId="range" fill="transparent" radius={0} isAnimationActive={false} />
            {/* Visible range bar (min to max) */}
            <Bar dataKey="range" stackId="range" radius={[3, 3, 3, 3]} isAnimationActive={true}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1} />
              ))}
            </Bar>
            {/* Mean line */}
            <Line
              type="monotone"
              dataKey="avg"
              stroke={meanColor}
              strokeWidth={2}
              dot={{ r: 3, fill: meanColor, stroke: meanColor }}
              activeDot={{ r: 5, fill: meanColor, stroke: "#FFFFFF", strokeWidth: 2 }}
              isAnimationActive={true}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 text-sm" style={{ color: "var(--octopus-white)" }}>
        <div className="flex items-center gap-2">
          <span className="w-6 h-3 rounded-sm" style={{ backgroundColor: color, opacity: 0.5, border: `1px solid ${color}` }} />
          <span>Min–Max range</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meanColor }} />
          <span>Mean</span>
        </div>
      </div>
    </div>
  )
}
