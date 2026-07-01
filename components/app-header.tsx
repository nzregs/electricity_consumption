import Image from "next/image"
import { APP_TITLE, LOGO_SRC } from "@/lib/constants"

export function AppHeader() {
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
        <div className="ml-auto text-xs" style={{ color: "var(--octopus-cyan)" }}>
          OctopusFlexi - Low User
        </div>
      </div>
    </header>
  )
}
