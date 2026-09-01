"use client"

import Image from "next/image"
import { APP_TITLE, LOGO_SRC } from "@/lib/constants"
import { useProvider } from "@/components/provider-context"

export function AppHeader() {
  const { providers, selectedProviderId, setSelectedProviderId } = useProvider()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border" style={{ backgroundColor: "var(--octopus-deep-navy)" }}>
      <div className="w-full px-4 h-14 flex items-center gap-3">
        {LOGO_SRC && (
          <Image
            src={LOGO_SRC}
            alt={`${APP_TITLE} logo`}
            width={32}
            height={32}
            className="shrink-0"
          />
        )}
        <span className="text-sm font-medium tracking-tight" style={{ color: "var(--octopus-white)" }}>
          {APP_TITLE}
        </span>
        <div className="ml-auto">
          <select
            value={selectedProviderId ?? ""}
            onChange={e => setSelectedProviderId(Number(e.target.value))}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-transparent cursor-pointer"
            style={{ color: "var(--octopus-cyan)", backgroundColor: "var(--octopus-dark-purple)" }}
          >
            {providers.map(p => (
              <option key={p.PROVIDER_ID} value={p.PROVIDER_ID}>
                {p.PROVIDER_NAME} - {p.PLAN_NAME}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  )
}
