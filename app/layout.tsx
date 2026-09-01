import type { Metadata } from "next"
import type React from "react"
import { AppHeader } from "@/components/app-header"
import { QueryProvider } from "@/components/query-provider"
import { ProviderProvider } from "@/components/provider-context"
import { APP_TITLE, LOGO_SRC } from "@/lib/constants"
import "./globals.css"

export const metadata: Metadata = {
  title: APP_TITLE,
  description: "Electricity consumption and export dashboard",
  icons: { icon: LOGO_SRC },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://static.octopuscdn.com" />
        <link rel="stylesheet" href="https://static.octopuscdn.com/fonts/Chromatophore/fonts.min.css" />
      </head>
      <body className="antialiased">
        <QueryProvider>
          <ProviderProvider>
            <AppHeader />
            {children}
          </ProviderProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
