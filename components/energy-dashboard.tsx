"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { startOfWeek, endOfWeek, addWeeks, subWeeks, format, startOfMonth, endOfMonth, addMonths, subMonths, startOfDay, endOfDay, addDays, subDays, getDaysInMonth, getDay, isSameDay } from "date-fns"
import { EnergyChart } from "@/components/energy-chart"
import { HourlyStatsChart } from "@/components/hourly-stats-chart"
import { ChevronLeft, ChevronRight, Zap, Calendar, BarChart3 } from "lucide-react"

type ViewMode = "day" | "week" | "month" | "stats"
type UsageType = "Import" | "Export"
type UnitMode = "kwh" | "dollar"

function CalendarPicker({ value, onChange, onClose }: { value: Date; onChange: (d: Date) => void; onClose: () => void }) {
  const [viewDate, setViewDate] = useState(startOfMonth(value))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  const daysInMonth = getDaysInMonth(viewDate)
  const firstDayOfMonth = getDay(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1))
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1 // Monday-start

  const days: (number | null)[] = []
  for (let i = 0; i < offset; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  return (
    <div ref={ref} className="absolute top-full mt-2 right-0 z-50 rounded-xl border border-border p-4 shadow-xl" style={{ backgroundColor: "var(--octopus-dark-purple)", minWidth: 280 }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1 rounded hover:bg-[var(--octopus-mid-purple)]">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium">{format(viewDate, "MMMM yyyy")}</span>
        <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1 rounded hover:bg-[var(--octopus-mid-purple)]">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => (
          <div key={d} className="text-[var(--muted-foreground)] py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {days.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />
          const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day)
          const isSelected = isSameDay(date, value)
          const isToday = isSameDay(date, new Date())
          return (
            <button
              key={day}
              onClick={() => { onChange(date); onClose() }}
              className={`w-8 h-8 rounded-lg transition-colors ${
                isSelected
                  ? "text-[var(--octopus-deep-navy)] font-bold"
                  : isToday
                    ? "border border-[var(--octopus-cyan)] text-[var(--octopus-cyan)]"
                    : "hover:bg-[var(--octopus-mid-purple)] text-[var(--octopus-white)]"
              }`}
              style={isSelected ? { backgroundColor: "var(--octopus-cyan)" } : {}}
            >
              {day}
            </button>
          )
        })}
      </div>
      <button
        onClick={() => { onChange(new Date()); onClose() }}
        className="mt-3 w-full py-1.5 text-sm font-medium rounded-lg transition-colors hover:bg-[var(--octopus-mid-purple)]"
        style={{ color: "var(--octopus-cyan)" }}
      >
        Today
      </button>
    </div>
  )
}

export function EnergyDashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [usageType, setUsageType] = useState<UsageType>("Import")
  const [unitMode, setUnitMode] = useState<UnitMode>("kwh")
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [showCalendar, setShowCalendar] = useState(false)
  const [dataRange, setDataRange] = useState<{ minDate: string | null; maxDate: string | null }>({ minDate: null, maxDate: null })

  useEffect(() => {
    fetch("/api/data-range")
      .then(r => r.json())
      .then(d => setDataRange(d))
      .catch(() => {})
  }, [])

  const getDateRange = useCallback(() => {
    switch (viewMode) {
      case "day":
        return { start: startOfDay(currentDate), end: endOfDay(currentDate) }
      case "week":
        return { start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) }
      case "month":
        return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) }
      case "stats":
        // Stats uses the containing week or month — default to week
        return { start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) }
    }
  }, [viewMode, currentDate])

  const navigatePrev = () => {
    switch (viewMode) {
      case "day": setCurrentDate(d => subDays(d, 1)); break
      case "week": case "stats": setCurrentDate(d => subWeeks(d, 1)); break
      case "month": setCurrentDate(d => subMonths(d, 1)); break
    }
  }

  const navigateNext = () => {
    switch (viewMode) {
      case "day": setCurrentDate(d => addDays(d, 1)); break
      case "week": case "stats": setCurrentDate(d => addWeeks(d, 1)); break
      case "month": setCurrentDate(d => addMonths(d, 1)); break
    }
  }

  const { start, end } = getDateRange()
  const dateRangeLabel = viewMode === "day"
    ? format(start, "d MMMM yyyy")
    : viewMode === "stats"
      ? `Hourly stats: ${format(start, "d MMM")} - ${format(end, "d MMM yyyy")}`
      : `${format(start, "d MMMM yyyy")} - ${format(end, "d MMMM yyyy")}`

  return (
    <div className="space-y-4">
      {/* Navigation bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-xl border border-border p-1">
          {(["day", "week", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 text-sm rounded-lg capitalize transition-colors ${
                viewMode === mode
                  ? "text-[var(--octopus-deep-navy)] font-medium"
                  : "text-[var(--octopus-white)] hover:bg-[var(--octopus-mid-purple)]"
              }`}
              style={viewMode === mode ? { backgroundColor: "var(--octopus-cyan)" } : {}}
            >
              {mode}
            </button>
          ))}
          <button
            onClick={() => setViewMode("stats")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-colors ${
              viewMode === "stats"
                ? "text-[var(--octopus-deep-navy)] font-medium"
                : "text-[var(--octopus-white)] hover:bg-[var(--octopus-mid-purple)]"
            }`}
            style={viewMode === "stats" ? { backgroundColor: "var(--octopus-cyan)" } : {}}
          >
            <BarChart3 size={14} />
            Stats
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={navigatePrev} className="p-2 rounded-lg border border-border hover:bg-[var(--octopus-mid-purple)]">
            <ChevronLeft size={18} />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className="p-2 rounded-lg border border-border hover:bg-[var(--octopus-mid-purple)] transition-colors"
              title="Pick a date"
            >
              <Calendar size={18} />
            </button>
            {showCalendar && (
              <CalendarPicker
                value={currentDate}
                onChange={(d) => setCurrentDate(d)}
                onClose={() => setShowCalendar(false)}
              />
            )}
          </div>
          <button onClick={navigateNext} className="p-2 rounded-lg border border-border hover:bg-[var(--octopus-mid-purple)]">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Tabs for consumption/export */}
      <div className="flex gap-2">
        <button
          onClick={() => setUsageType("Import")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            usageType === "Import"
              ? "bg-[var(--octopus-mid-purple)] text-[var(--octopus-white)] border border-[var(--octopus-purple)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--octopus-white)]"
          }`}
        >
          <Zap size={14} />
          Electricity
        </button>
        <button
          onClick={() => setUsageType("Export")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            usageType === "Export"
              ? "bg-[var(--octopus-mid-purple)] text-[var(--octopus-white)] border border-[var(--octopus-purple)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--octopus-white)]"
          }`}
        >
          <Zap size={14} />
          Electricity Exported
        </button>
      </div>

      {/* Chart card */}
      <div className="rounded-xl border border-border p-6" style={{ backgroundColor: "var(--octopus-dark-purple)" }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: "var(--octopus-white)" }}>
              <Zap size={16} style={{ color: "var(--octopus-pink)" }} />
              {usageType === "Import" ? "Electricity" : "Electricity Exported"}
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              {dateRangeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={unitMode === "kwh" ? "text-[var(--octopus-white)]" : "text-[var(--muted-foreground)]"}>kWh</span>
            <button
              onClick={() => setUnitMode(unitMode === "kwh" ? "dollar" : "kwh")}
              className="relative w-10 h-5 rounded-full transition-colors"
              style={{ backgroundColor: unitMode === "kwh" ? "var(--octopus-mid-purple)" : "var(--octopus-cyan)" }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ left: unitMode === "kwh" ? "2px" : "22px" }}
              />
            </button>
            <span className={unitMode === "dollar" ? "text-[var(--octopus-white)]" : "text-[var(--muted-foreground)]"}>NZ$</span>
          </div>
        </div>

        {/* Chart */}
        {viewMode === "stats" ? (
          <HourlyStatsChart
            startDate={format(start, "yyyy-MM-dd")}
            endDate={format(end, "yyyy-MM-dd'T'23:59:59")}
            usageType={usageType}
            unitMode={unitMode}
          />
        ) : (
          <EnergyChart
            startDate={format(start, "yyyy-MM-dd")}
            endDate={format(end, "yyyy-MM-dd'T'23:59:59")}
            usageType={usageType}
            unitMode={unitMode}
            viewMode={viewMode}
          />
        )}
      </div>

      {/* Data range indicator */}
      {dataRange.minDate && dataRange.maxDate && (
        <p className="text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
          Data available from{" "}
          <span className="text-[var(--octopus-white)]">{format(new Date(dataRange.minDate), "d MMM yyyy")}</span>
          {" "}to{" "}
          <span className="text-[var(--octopus-white)]">{format(new Date(dataRange.maxDate), "d MMM yyyy")}</span>
        </p>
      )}
    </div>
  )
}
