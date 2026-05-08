'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && pathname !== '/login') router.push('/login')
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )

  if (pathname === '/login') return <>{children}</>

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {children}
      </main>
    </div>
  )
}
