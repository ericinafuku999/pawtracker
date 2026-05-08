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
  const [userAvatar, setUserAvatar] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || '')
        setUserAvatar(user.user_metadata?.avatar_url || '')
      }
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-52 min-w-[208px] bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-gray-100">
        <div className="font-semibold text-base">🐾 PawTracker</div>
        <div className="text-xs text-gray-400 mt-0.5">Dog Care Business</div>
      </div>
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
                  className={`flex items-center gap-2 px-3 py-2 text-sm mx-1 rounded-lg transition-colors ${
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
            {userAvatar
              ? <img src={userAvatar} className="w-6 h-6 rounded-full" alt="" />
              : <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700">{userEmail[0].toUpperCase()}</div>
            }
            <span className="text-xs text-gray-500 truncate">{userEmail}</span>
          </div>
        )}
        <button onClick={signOut} className="btn w-full justify-center text-xs text-gray-500">
          Sign out
        </button>
      </div>
    </aside>
  )
}
