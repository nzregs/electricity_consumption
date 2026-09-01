"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"

interface Provider {
  PROVIDER_ID: number
  PROVIDER_NAME: string
  PLAN_NAME: string
  DAILY_CHARGE: number
  CURRENT_PROVIDER: boolean
}

interface ProviderContextValue {
  providers: Provider[]
  selectedProviderId: number | null
  setSelectedProviderId: (id: number) => void
  selectedProvider: Provider | null
}

const ProviderContext = createContext<ProviderContextValue>({
  providers: [],
  selectedProviderId: null,
  setSelectedProviderId: () => {},
  selectedProvider: null,
})

export function useProvider() {
  return useContext(ProviderContext)
}

export function ProviderProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)

  useEffect(() => {
    fetch("/api/providers")
      .then(r => r.json())
      .then(data => {
        const list: Provider[] = data.providers || []
        setProviders(list)
        const current = list.find(p => p.CURRENT_PROVIDER)
        if (current) setSelectedProviderId(current.PROVIDER_ID)
        else if (list.length > 0) setSelectedProviderId(list[0].PROVIDER_ID)
      })
      .catch(() => {})
  }, [])

  const selectedProvider = providers.find(p => p.PROVIDER_ID === selectedProviderId) || null

  return (
    <ProviderContext.Provider value={{ providers, selectedProviderId, setSelectedProviderId, selectedProvider }}>
      {children}
    </ProviderContext.Provider>
  )
}
