"use client"

import { EnergyDashboard } from "@/components/energy-dashboard"
import { ChatPane } from "@/components/chat-pane"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <main className="flex h-[calc(100vh-80px)] gap-4 py-6 px-4 max-w-[1600px] mx-auto">
      <div className="flex-1 overflow-y-auto min-w-0">
        <EnergyDashboard />
      </div>
      <div className="w-[380px] shrink-0">
        <ChatPane />
      </div>
    </main>
  )
}
