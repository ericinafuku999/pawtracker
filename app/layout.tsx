import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PawTracker — Dog Care Business',
  description: 'Cash flow and booking tracker for dog care businesses',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
