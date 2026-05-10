'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Booking, Expense } from '@/lib/types'
import { formatCurrency, monthLabel, formatDate } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import AppShell from '@/components/AppShell'
import BookingCalendar from '@/components/BookingCalendar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Period = 'month' | 'quarter' | 'year' | 'all' | 'pick' | 'custom'

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
function getDepMonthKey(b: Booking) { return b.departure_date.substr(0, 7) }

function parseLocalDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function filterBookings(bookings: Booking[], period: Period, pickedMonth: string, customStart: string, customEnd: string) {
  const now = new Date()
  const nowMonth = getMonthKey(now)
  const nowQuarter = Math.floor(now.getMonth() / 3)
  const nowYear = now.getFullYear()
  return bookings.filter(b => {
    if (b.status === 'cancelled') return false
    if (period === 'all') return true
    const depMonth = getDepMonthKey(b)
    const [y, m] = depMonth.split('-').map(Number)
    if (period === 'pick') return depMonth === pickedMonth
    if (period === 'custom') {
      if (!customStart || !customEnd) return false
      const dep = parseLocalDate(b.departure_date)
      return dep >= parseLocalDate(customStart) && dep <= parseLocalDate(customEnd)
    }
    if (period === 'month') return depMonth === nowMonth
    if (period === 'quarter') return Math.floor((m - 1) / 3) === nowQuarter && y === nowYear
    if (period === 'year') return y === nowYear
    return true
  })
}

function getMonthRevenue(bookings: Booking[]) {
  const monthMap: Record<string, { rover: number; venmo: number }> = {}
  bookings.filter(b => b.status !== 'cancelled' && b.payment_status === 'paid' && b.amount_received > 0).forEach(b => {
    const mk = getDepMonthKey(b)
    if (!monthMap[mk]) monthMap[mk] = { rover: 0, venmo: 0 }
    if (b.payment_type === 'Rover') monthMap[mk].rover += b.amount_received
    else monthMap[mk].venmo += b.amount_received
  })
  return monthMap
}

interface DogProfile {
  id: string
  dog_name: string
  owner_name: string
  photo_url: string | null
}

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [dogProfiles, setDogProfiles] = useState<DogProfile[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [pickedMonth, setPickedMonth] = useState(getMonthKey(new Date()))
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [calSearch, setCalSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: bks }, { data: exps }, { data: dogs }] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user.id),
      supabase.from('expenses').select('*').eq('user_id', user.id),
      supabase.from('dogs').select('id, dog_name, owner_name, photo_url').eq('user_id', user.id),
    ])
    setBookings(bks || [])
    setExpenses(exps || [])
    setDogProfiles(dogs || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const arrivingToday = bookings.filter(b => b.status !== 'cancelled' && b.arrival_date === todayStr)
  const departingToday = bookings.filter(b => b.status !== 'cancelled' && b.departure_date === todayStr)
  const currentlyHere = bookings.filter(b => {
    if (b.status === 'cancelled') return false
    const arr = parseLocalDate(b.arrival_date)
    const dep = parseLocalDate(b.departure_date)
    return arr <= today && dep > today
  })

  // Match strictly by dog name + owner name, fall back to dog name only
  function getProfile(booking: Booking): DogProfile | null {
    const strict = dogProfiles.find(d =>
      d.dog_name.toLowerCase() === (booking.dog_names || '').toLowerCase() &&
      d.owner_name.toLowerCase() === (booking.customer_name || '').toLowerCase()
    )
    if (strict) return strict
    return dogProfiles.find(d =>
      d.dog_name.toLowerCase() === (booking.dog_names || '').toLowerCase()
    ) || null
  }

  function DogCard({ booking, showDates = false }: { booking: Booking; showDates?: boolean }) {
    const profile = getProfile(booking)

    function handleClick() {
      if (profile) router.push(`/dogs/${profile.id}`)
      else router.push(`/dogs/new?dogName=${encodeURIComponent(booking.dog_names)}&customerName=${encodeURIComponent(booking.customer_name)}&numDogs=${booking.number_of_dogs}&rate=${booking.rate_per_dog_day}`)
    }

    return (
      <div onClick={handleClick} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all cursor-pointer group">
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-emerald-50 flex-shrink-0 flex items-center justify-center border border-emerald-100 relative">
          {profile?.photo_url
            ? <img src={profile.photo_url} alt={booking.dog_names} className="w-full h-full object-cover" />
            : <span className="text-xl">🐾</span>
          }
          {!profile?.photo_url && (
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
              <span className="text-white text-xs font-bold">+ Photo</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{booking.dog_names}</div>
          <div className="text-xs text-gray-500 truncate">👤 {booking.customer_name}</div>
          {showDates && (
            <div className="text-xs text-gray-400">{formatDate(booking.arrival_date)} → {formatDate(booking.departure_date)}</div>
          )}
          <div className="text-xs text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
            {profile ? 'Edit profile →' : 'Create profile →'}
          </div>
        </div>
        <span className={`badge text-xs ${booking.payment_type === 'Rover' ? 'badge-teal' : 'badge-amber'}`}>{booking.payment_type}</span>
      </div>
    )
  }

  const bks = filterBookings(bookings, period, pickedMonth, customStart, customEnd)
  const rover = bks.filter(b => b.payment_status === 'paid' && b.payment_type === 'Rover').reduce((s, b) => s + b.amount_received, 0)
  const venmo = bks.filter(b => b.payment_status === 'paid' && b.payment_type === 'Venmo').reduce((s, b) => s + b.amount_received, 0)
  const totalReceived = rover + venmo
  const expectedRover = bks.filter(b => (b.payment_status === 'unpaid' || b.payment_status === 'partially paid') && b.payment_type === 'Rover').reduce((s, b) => s + b.amount_received, 0)
  const expectedVenmo = bks.filter(b => (b.payment_status === 'unpaid' || b.payment_status === 'partially paid') && b.payment_type === 'Venmo').reduce((s, b) => s + b.amount_received, 0)
  const expectedRevenue = expectedRover + expectedVenmo
  const projectedTotal = bks.reduce((s, b) => s + b.amount_received, 0)
  const cancelled = bookings.filter(b => b.status === 'cancelled')
  const lostRev = cancelled.reduce((s, b) => s + b.total_revenue, 0)
  const dogDays = bks.reduce((s, b) => s + b.dog_days, 0)
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0)
  const net = totalReceived - totalExp

  const monthMap = getMonthRevenue(bookings)
  const chartData = Object.entries(monthMap)
    .sort((a, b) => a[0] > b[0] ? 1 : -1)
    .slice(-6)
    .map(([k, v]) => ({ name: monthLabel(k), Rover: Math.round(v.rover), Venmo: Math.round(v.venmo) }))

  const expByCat: Record<string, number> = {}
  expenses.forEach(e => { expByCat[e.category] = (expByCat[e.category] || 0) + e.amount })
  const expChartData = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value: Math.round(value) }))
  const pieColors = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#6b7280']

  const metrics = [
    { label: 'Revenue Received', value: formatCurrency(totalReceived), sub: `Rover ${formatCurrency(rover)} · Venmo ${formatCurrency(venmo)}` },
    { label: 'Expected Revenue', value: formatCurrency(expectedRevenue), sub: `Rover ${formatCurrency(expectedRover)} · Venmo ${formatCurrency(expectedVenmo)}` },
    { label: 'Projected Total', value: formatCurrency(projectedTotal), sub: `paid + unpaid received` },
    { label: 'Net Profit', value: formatCurrency(net), color: net >= 0 ? 'text-emerald-600' : 'text-red-500', sub: `after $${totalExp.toFixed(0)} expenses` },
    { label: 'Dog-Days', value: dogDays.toString(), sub: dogDays ? `${formatCurrency(projectedTotal / dogDays)}/day` : '' },
    { label: 'Total Expenses', value: formatCurrency(totalExp) },
    { label: 'Cancelled', value: cancelled.length.toString(), sub: `${formatCurrency(lostRev)} lost` },
    { label: 'Margin', value: totalReceived > 0 ? ((net / totalReceived) * 100).toFixed(0) + '%' : '—' },
  ]

  const periods: { k: Period; label: string }[] = [
    { k: 'month', label: 'This Month' },
    { k: 'quarter', label: 'Quarter' },
    { k: 'year', label: 'Year' },
    { k: 'all', label: 'All Time' },
    { k: 'pick', label: 'Pick Month' },
    { k: 'custom', label: 'Custom Range' },
  ]

  if (loading) return <AppShell><div className="text-gray-400 text-sm">Loading…</div></AppShell>

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-500">Cash flow and performance overview</p>
      </div>

      {/* TODAY WIDGET */}
      {(arrivingToday.length > 0 || departingToday.length > 0 || currentlyHere.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div className="card border-emerald-200 bg-emerald-50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🟢</span>
              <div className="font-semibold text-sm text-emerald-800">Arriving Today</div>
              <span className="badge bg-emerald-200 text-emerald-800 ml-auto">{arrivingToday.length}</span>
            </div>
            {arrivingToday.length === 0
              ? <div className="text-xs text-emerald-600 text-center py-2">None today</div>
              : <div className="space-y-2">{arrivingToday.map(b => <DogCard key={b.id} booking={b} />)}</div>
            }
          </div>
          <div className="card border-red-200 bg-red-50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔴</span>
              <div className="font-semibold text-sm text-red-800">Departing Today</div>
              <span className="badge bg-red-200 text-red-800 ml-auto">{departingToday.length}</span>
            </div>
            {departingToday.length === 0
              ? <div className="text-xs text-red-500 text-center py-2">None today</div>
              : <div className="space-y-2">{departingToday.map(b => <DogCard key={b.id} booking={b} />)}</div>
            }
          </div>
          <div className="card border-blue-200 bg-blue-50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏠</span>
              <div className="font-semibold text-sm text-blue-800">Currently Here</div>
              <span className="badge bg-blue-200 text-blue-800 ml-auto">{currentlyHere.length}</span>
            </div>
            {currentlyHere.length === 0
              ? <div className="text-xs text-blue-500 text-center py-2">No guests right now</div>
              : <div className="space-y-2 max-h-48 overflow-y-auto">{currentlyHere.map(b => <DogCard key={b.id} booking={b} showDates />)}</div>
            }
          </div>
        </div>
      )}

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg">
          {periods.map(p => (
            <button key={p.k} onClick={() => setPeriod(p.k)}
              className={`px-2 md:px-3 py-1 rounded-md text-xs md:text-sm transition-colors ${period === p.k ? 'bg-white font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'pick' && (
          <input type="month" value={pickedMonth} onChange={e => setPickedMonth(e.target.value)} className="input w-auto text-sm" />
        )}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input w-auto text-sm" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input w-auto text-sm" />
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {metrics.map(m => (
          <div key={m.label} className="metric-card">
            <div className="text-xs text-gray-400 mb-1">{m.label}</div>
            <div className={`text-lg md:text-xl font-semibold ${m.color || ''}`}>{m.value}</div>
            {m.sub && <div className="text-xs text-gray-400 mt-0.5 hidden md:block">{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="font-medium text-sm mb-3">Revenue Received by Month</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '$' + v} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="Rover" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Venmo" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="font-medium text-sm mb-3">Rover vs Venmo (Received)</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={[{ name: 'Rover', value: Math.round(rover) }, { name: 'Venmo', value: Math.round(venmo) }]}
                cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value">
                <Cell fill="#10b981" /><Cell fill="#f59e0b" />
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Calendar */}
      <div className="card mb-4">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <div className="font-medium text-sm">Booking Calendar</div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input className="input text-xs pl-7 w-40 md:w-48" placeholder="Search dog or customer…" value={calSearch} onChange={e => setCalSearch(e.target.value)} />
              <span className="absolute left-2 top-2 text-gray-400 text-xs">🔍</span>
            </div>
            {calSearch && <button className="btn text-xs" onClick={() => setCalSearch('')}>Clear</button>}
            <Link href="/bookings" className="text-xs text-emerald-600 whitespace-nowrap">View all →</Link>
          </div>
        </div>
        <BookingCalendar bookings={bookings} searchQuery={calSearch} dogProfiles={dogProfiles} />
      </div>

      {/* Recent bookings + expenses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <div className="font-medium text-sm">Recent Bookings</div>
            <Link href="/bookings" className="text-xs text-emerald-600">View all →</Link>
          </div>
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-400">No bookings yet. <Link href="/bookings/new" className="text-emerald-600">Add one →</Link></p>
          ) : (
            <table className="w-full">
              <thead><tr><th className="th">Customer</th><th className="th">Dogs</th><th className="th">Received</th><th className="th">Status</th></tr></thead>
              <tbody>
                {bookings.slice(0, 5).map(b => (
                  <tr key={b.id} className="hover:bg-gray-50 cursor-pointer" onDoubleClick={() => router.push(`/bookings/${b.id}`)}>
                    <td className="td font-medium">{b.customer_name}</td>
                    <td className="td text-gray-500">{b.dog_names}</td>
                    <td className="td">{formatCurrency(b.amount_received)}</td>
                    <td className="td">
                      <span className={`badge ${b.status === 'active' ? 'badge-blue' : b.status === 'completed' ? 'badge-green' : 'badge-red'}`}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="font-medium text-sm mb-3">Expenses by Category</div>
          {expChartData.length === 0 ? (
            <p className="text-sm text-gray-400">No expenses yet. <Link href="/expenses/new" className="text-emerald-600">Add one →</Link></p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={expChartData} cx="50%" cy="50%" outerRadius={70} dataKey="value">
                  {expChartData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => '$' + v} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </AppShell>
  )
}