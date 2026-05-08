'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Booking, Expense } from '@/lib/types'
import { formatCurrency, monthLabel } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import AppShell from '@/components/AppShell'
import Link from 'next/link'

type Period = 'month' | 'quarter' | 'year' | 'all'

function filterByPeriod(bookings: Booking[], period: Period) {
  const now = new Date()
  return bookings.filter(b => {
    if (b.status === 'cancelled') return false
    const a = new Date(b.arrival_date)
    if (period === 'month') return a.getMonth() === now.getMonth() && a.getFullYear() === now.getFullYear()
    if (period === 'quarter') return Math.floor(a.getMonth() / 3) === Math.floor(now.getMonth() / 3) && a.getFullYear() === now.getFullYear()
    if (period === 'year') return a.getFullYear() === now.getFullYear()
    return true
  })
}

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [period, setPeriod] = useState<Period>('month')
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

  const bks = filterByPeriod(bookings, period)
  const rover = bks.filter(b => b.payment_type === 'Rover').reduce((s, b) => s + b.total_revenue, 0)
  const venmo = bks.filter(b => b.payment_type === 'Venmo').reduce((s, b) => s + b.total_revenue, 0)
  const received = bks.reduce((s, b) => s + b.amount_received, 0)
  const outstanding = bookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + b.total_revenue - b.amount_received, 0)
  const cancelled = bookings.filter(b => b.status === 'cancelled')
  const lostRev = cancelled.reduce((s, b) => s + b.total_revenue, 0)
  const dogDays = bks.reduce((s, b) => s + b.dog_days, 0)
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0)
  const net = received - totalExp

  // Monthly chart data
  const monthMap: Record<string, { rover: number; venmo: number }> = {}
  bookings.filter(b => b.status !== 'cancelled').forEach(b => {
    const allocs = b.month_allocations || [{ monthKey: b.arrival_date.substr(0, 7), revenue: b.total_revenue, dogDays: b.dog_days, days: b.number_of_days }]
    allocs.forEach((a: any) => {
      if (!monthMap[a.monthKey]) monthMap[a.monthKey] = { rover: 0, venmo: 0 }
      if (b.payment_type === 'Rover') monthMap[a.monthKey].rover += a.revenue
      else monthMap[a.monthKey].venmo += a.revenue
    })
  })
  const chartData = Object.entries(monthMap).sort((a, b) => a[0] > b[0] ? 1 : -1).slice(-6).map(([k, v]) => ({ name: monthLabel(k), Rover: Math.round(v.rover), Venmo: Math.round(v.venmo) }))

  const expByCat: Record<string, number> = {}
  expenses.forEach(e => { expByCat[e.category] = (expByCat[e.category] || 0) + e.amount })
  const expChartData = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value: Math.round(value) }))
  const pieColors = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#6b7280']

  const metrics = [
    { label: 'Total Revenue', value: formatCurrency(rover + venmo), sub: `Rover ${formatCurrency(rover)} · Venmo ${formatCurrency(venmo)}` },
    { label: 'Received', value: formatCurrency(received), sub: `${bks.length} bookings` },
    { label: 'Outstanding', value: formatCurrency(Math.max(0, outstanding)), color: 'text-red-500' },
    { label: 'Dog-Days', value: dogDays.toString(), sub: dogDays ? `${formatCurrency((rover + venmo) / dogDays)}/day` : '' },
    { label: 'Total Expenses', value: formatCurrency(totalExp) },
    { label: 'Net Profit', value: formatCurrency(net), color: net >= 0 ? 'text-emerald-600' : 'text-red-500' },
    { label: 'Cancelled', value: cancelled.length.toString(), sub: `${formatCurrency(lostRev)} lost` },
    { label: 'Margin', value: (rover + venmo > 0 ? ((net / (rover + venmo)) * 100).toFixed(0) : 0) + '%' },
  ]

  const periods: { k: Period; label: string }[] = [
    { k: 'month', label: 'This Month' },
    { k: 'quarter', label: 'Quarter' },
    { k: 'year', label: 'Year' },
    { k: 'all', label: 'All Time' },
  ]

  if (loading) return <AppShell><div className="text-gray-400 text-sm">Loading…</div></AppShell>

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-500">Cash flow and performance overview</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5">
        {periods.map(p => (
          <button key={p.k} onClick={() => setPeriod(p.k)}
            className={`px-3 py-1 rounded-md text-sm transition-colors ${period === p.k ? 'bg-white font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {p.label}
          </button>
        ))}
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
          <div className="font-medium text-sm mb-3">Revenue by Month</div>
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
          <div className="font-medium text-sm mb-3">Rover vs Venmo</div>
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
              <thead><tr><th className="th">Customer</th><th className="th">Revenue</th><th className="th">Status</th></tr></thead>
              <tbody>
                {bookings.slice(0, 5).map(b => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="td font-medium">{b.customer_name}</td>
                    <td className="td">{formatCurrency(b.total_revenue)}</td>
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
