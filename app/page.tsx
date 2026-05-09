'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Booking, Expense } from '@/lib/types'
import { formatCurrency, monthLabel } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import AppShell from '@/components/AppShell'
import BookingCalendar from '@/components/BookingCalendar'
import Link from 'next/link'

type Period = 'month' | 'quarter' | 'year' | 'all' | 'pick' | 'custom'

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
function getDepMonthKey(b: Booking) { return b.departure_date.substr(0, 7) }

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
      const dep = new Date(b.departure_date)
      return dep >= new Date(customStart) && dep <= new Date(customEnd)
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

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [pickedMonth, setPickedMonth] = useState(getMonthKey(new Date()))
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [calSearch, setCalSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: bks }, { data: exps }] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user.id),
      supabase.from('expenses').select('*').eq('user_id', user.id),
    ])
    setBookings(bks || [])
    setExpenses(exps || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {periods.map(p => (
            <button key={p.k} onClick={() => setPeriod(p.k)}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${period === p.k ? 'bg-white font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'pick' && (
          <input type="month" value={pickedMonth} onChange={e => setPickedMonth(e.target.value)} className="input w-auto text-sm" />
        )}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input w-auto text-sm" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input w-auto text-sm" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        {metrics.map(m => (
          <div key={m.label} className="metric-card">
            <div className="text-xs text-gray-400 mb-1">{m.label}</div>
            <div className={`text-xl font-semibold ${m.color || ''}`}>{m.value}</div>
            {m.sub && <div className="text-xs text-gray-400 mt-0.5">{m.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="font-medium text-sm mb-3">Revenue Received by Month</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => '$' + v} />
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

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className="font-medium text-sm">Booking Calendar</div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input className="input text-xs pl-7 w-48" placeholder="Search dog or customer…" value={calSearch} onChange={e => setCalSearch(e.target.value)} />
              <span className="absolute left-2 top-2 text-gray-400 text-xs">🔍</span>
            </div>
            {calSearch && <button className="btn text-xs" onClick={() => setCalSearch('')}>Clear</button>}
            <Link href="/bookings" className="text-xs text-emerald-600">View all →</Link>
          </div>
        </div>
        <BookingCalendar bookings={bookings} searchQuery={calSearch} />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
                  <tr key={b.id} className="hover:bg-gray-50">
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