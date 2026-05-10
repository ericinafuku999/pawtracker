'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const navItems = [
  { section: 'Overview', items: [
    { href: '/', label: 'Dashboard', icon: '▦' },
    { href: '/reports', label: 'Reports', icon: '↗' },
  ]},
  { section: 'Bookings', items: [
    { href: '/bookings', label: 'All Bookings', icon: '📅' },
    { href: '/bookings/new', label: 'Add Booking', icon: '+' },
  ]},
  { section: 'Dogs & Customers', items: [
    { href: '/dogs', label: 'Dog Profiles', icon: '🐾' },
    { href: '/dogs/new', label: 'Add Dog', icon: '+' },
  ]},
  { section: 'Expenses', items: [
    { href: '/expenses', label: 'All Expenses', icon: '🧾' },
    { href: '/expenses/new', label: 'Add Expense', icon: '+' },
  ]},
  { section: 'Tools', items: [
    { href: '/import', label: 'Import CSV', icon: '↑' },
  ]},
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [userEmail, setUserEmail] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserEmail(user.email || '')
    })
  }, [])

  useEffect(() => { setOpen(false) }, [pathname])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navContent = (
    <>
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map(group => (
          <div key={group.section}>
            <div className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              {group.section}
            </div>
            {group.items.map(item => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-2 px-3 py-2.5 md:py-2 text-sm mx-1 rounded-lg transition-colors ${
                    active ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  <span className="w-4 text-center text-xs">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-100">
        {userEmail && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700">
              {userEmail[0].toUpperCase()}
            </div>
            <span className="text-xs text-gray-500 truncate">{userEmail}</span>
          </div>
        )}
        <button onClick={signOut} className="btn w-full justify-center text-xs text-gray-500">
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-base hover:opacity-80 transition-opacity">🐾 PawTracker</Link>
        <button onClick={() => setOpen(!open)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          )}
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setOpen(false)} />
      )}

      {/* Mobile slide-out drawer */}
      <div className={`md:hidden fixed top-0 left-0 bottom-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <div className="font-semibold text-base">🐾 PawTracker</div>
            <div className="text-xs text-gray-400 mt-0.5">Dog Care Business</div>
          </Link>
          <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
        {navContent}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 min-w-[208px] bg-white border-r border-gray-200 flex-col h-screen sticky top-0">
        <div className="p-4 border-b border-gray-100">
          <Link href="/" className="block hover:opacity-80 transition-opacity">
            <div className="font-semibold text-base">🐾 PawTracker</div>
            <div className="text-xs text-gray-400 mt-0.5">Dog Care Business</div>
          </Link>
        </div>
        {navContent}
      </aside>
    </>
  )
}