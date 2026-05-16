'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Booking, Expense } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { exportToExcel } from '@/lib/exportExcel'
import AppShell from '@/components/AppShell'

type Tab = 'rev' | 'pay' | 'exp' | 'net' | 'cust' | 'cancel'

function getDepMonthKey(b: Booking) { return b.departure_date.substr(0, 7) }
function totalAmount(b: Booking) { return b.amount_received + (b.tip_amount || 0) }

export default function ReportsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [tab, setTab] = useState<Tab>('rev')
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
  }, [])

  useEffect(() => { load() }, [load])

  function exportCSV(rows: string[][], filename: string) {
    const csv = rows.map(r => r.map(c => JSON.stringify(c ?? '')).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = filename; a.click()
  }

  function getMonthlyStats() {
    const months: Record<string, {
      received: number, expected: number, projected: number,
      rover: number, venmo: number,
      roverExpected: number, venmoExpected: number,
      bookings: number, dogDays: number, cancelled: number, lostRev: number
    }> = {}

    bookings.filter(b => b.status !== 'cancelled').forEach(b => {
      const mk = getDepMonthKey(b)
      if (!months[mk]) months[mk] = { received: 0, expected: 0, projected: 0, rover: 0, venmo: 0, roverExpected: 0, venmoExpected: 0, bookings: 0, dogDays: 0, cancelled: 0, lostRev: 0 }
      months[mk].bookings++
      months[mk].dogDays += b.dog_days
      months[mk].projected += totalAmount(b)
      if (b.payment_status === 'paid') {
        months[mk].received += totalAmount(b)
        if (b.payment_type === 'Rover') months[mk].rover += totalAmount(b)
        else months[mk].venmo += totalAmount(b)
      } else {
        months[mk].expected += totalAmount(b)
        if (b.payment_type === 'Rover') months[mk].roverExpected += totalAmount(b)
        else months[mk].venmoExpected += totalAmount(b)
      }
    })

    bookings.filter(b => b.status === 'cancelled').forEach(b => {
      const mk = getDepMonthKey(b)
      if (!months[mk]) months[mk] = { received: 0, expected: 0, projected: 0, rover: 0, venmo: 0, roverExpected: 0, venmoExpected: 0, bookings: 0, dogDays: 0, cancelled: 0, lostRev: 0 }
      months[mk].cancelled++
      months[mk].lostRev += b.total_revenue
    })

    return months
  }

  const monthlyStats = getMonthlyStats()

  const monthlyExp: Record<string, { tot: number; ded: number }> = {}
  expenses.forEach(e => {
    const mk = e.expense_date.substr(0, 7)
    if (!monthlyExp[mk]) monthlyExp[mk] = { tot: 0, ded: 0 }
    monthlyExp[mk].tot += e.amount
    monthlyExp[mk].ded += e.deductible_amount
  })

  const sortedMonths = Object.keys(monthlyStats).sort()

  const tabs: { k: Tab; label: string }[] = [
    { k: 'rev', label: 'Revenue' },
    { k: 'pay', label: 'Payment Types' },
    { k: 'exp', label: 'Expenses' },
    { k: 'net', label: 'Net Income' },
    { k: 'cust', label: 'Customers' },
    { k: 'cancel', label: 'Cancellations' },
  ]

  return (
    <AppShell>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-gray-500">Revenue, expenses, and summaries</p>
        </div>
        <button
          className="btn btn-primary text-xs flex items-center gap-1.5"
          onClick={() => exportToExcel(bookings, expenses, 'PawTracker')}>
          📊 Export to Excel
        </button>
      </div>

      <div className="flex border-b border-gray-200 mb-5 gap-0 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.k ? 'border-emerald-500 text-emerald-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rev' && (
        <div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-xs text-blue-700">
            <strong>Revenue Received</strong> = expected amount + tip for paid bookings ·
            <strong> Expected</strong> = expected amount + tip for unpaid/partial ·
            <strong> Projected</strong> = all bookings · all filtered by departure month
          </div>
          <div className="flex justify-end mb-3">
            <button className="btn text-xs" onClick={() => exportCSV([
              ['Month','Revenue Received','Expected Revenue','Projected Total','Bookings','Dog-Days','Cancelled','Lost Revenue'],
              ...sortedMonths.map(mk => {
                const v = monthlyStats[mk]
                return [mk, v.received.toFixed(2), v.expected.toFixed(2), v.projected.toFixed(2), String(v.bookings), String(v.dogDays), String(v.cancelled), v.lostRev.toFixed(2)]
              })
            ], 'revenue-by-month.csv')}>↓ Export CSV</button>
          </div>
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr>
              <th className="th">Month</th>
              <th className="th">Revenue Received</th>
              <th className="th">Expected Revenue</th>
              <th className="th">Projected Total</th>
              <th className="th">Bookings</th>
              <th className="th">Dog-Days</th>
              <th className="th">Cancelled</th>
              <th className="th">Lost Revenue</th>
            </tr></thead>
            <tbody>{sortedMonths.map(mk => {
              const v = monthlyStats[mk]
              return <tr key={mk} className="hover:bg-gray-50">
                <td className="td font-medium">{mk}</td>
                <td className="td text-emerald-600 font-semibold">{formatCurrency(v.received)}</td>
                <td className="td text-amber-600">{formatCurrency(v.expected)}</td>
                <td className="td font-semibold">{formatCurrency(v.projected)}</td>
                <td className="td">{v.bookings}</td>
                <td className="td">{v.dogDays}</td>
                <td className="td">{v.cancelled}</td>
                <td className="td text-red-500">{formatCurrency(v.lostRev)}</td>
              </tr>
            })}</tbody>
          </table></div></div>
        </div>
      )}

      {tab === 'pay' && (() => {
        const allRover = bookings.filter(b => b.status !== 'cancelled' && b.payment_status === 'paid' && b.payment_type === 'Rover').reduce((s, b) => s + totalAmount(b), 0)
        const allVenmo = bookings.filter(b => b.status !== 'cancelled' && b.payment_status === 'paid' && b.payment_type === 'Venmo').reduce((s, b) => s + totalAmount(b), 0)
        return <div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">All-time Rover Received</div><div className="text-xl font-semibold text-teal-600">{formatCurrency(allRover)}</div></div>
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">All-time Venmo Received</div><div className="text-xl font-semibold text-amber-600">{formatCurrency(allVenmo)}</div></div>
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Combined Received</div><div className="text-xl font-semibold">{formatCurrency(allRover + allVenmo)}</div></div>
          </div>
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr>
              <th className="th">Month</th>
              <th className="th">Rover Received</th>
              <th className="th">Venmo Received</th>
              <th className="th">Rover Expected</th>
              <th className="th">Venmo Expected</th>
              <th className="th">Projected Total</th>
            </tr></thead>
            <tbody>{sortedMonths.map(mk => {
              const v = monthlyStats[mk]
              return <tr key={mk} className="hover:bg-gray-50">
                <td className="td">{mk}</td>
                <td className="td text-teal-600">{formatCurrency(v.rover)}</td>
                <td className="td text-amber-600">{formatCurrency(v.venmo)}</td>
                <td className="td text-teal-400">{formatCurrency(v.roverExpected)}</td>
                <td className="td text-amber-400">{formatCurrency(v.venmoExpected)}</td>
                <td className="td font-semibold">{formatCurrency(v.projected)}</td>
              </tr>
            })}</tbody>
          </table></div></div>
        </div>
      })()}

      {tab === 'exp' && (() => {
        const cats: Record<string, number> = {}
        expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount })
        return <div className="grid grid-cols-2 gap-4">
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Category</th><th className="th">Amount</th></tr></thead>
            <tbody>{Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
              <tr key={k} className="hover:bg-gray-50"><td className="td">{k}</td><td className="td font-semibold">${v.toFixed(2)}</td></tr>
            )}</tbody>
          </table></div></div>
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Month</th><th className="th">Total</th><th className="th">Deductible</th></tr></thead>
            <tbody>{Object.entries(monthlyExp).sort((a, b) => a[0] > b[0] ? 1 : -1).map(([k, v]) =>
              <tr key={k} className="hover:bg-gray-50"><td className="td">{k}</td><td className="td">${v.tot.toFixed(2)}</td><td className="td text-emerald-600">${v.ded.toFixed(2)}</td></tr>
            )}</tbody>
          </table></div></div>
        </div>
      })()}

      {tab === 'net' && (() => {
        const allMonths = Array.from(new Set([...Object.keys(monthlyStats), ...Object.keys(monthlyExp)])).sort()
        return <div>
          <div className="flex justify-end mb-3">
            <button className="btn text-xs" onClick={() => exportCSV([
              ['Month','Revenue Received','Expected Revenue','Projected Total','Expenses','Net Profit','Margin'],
              ...allMonths.map(mk => {
                const s = monthlyStats[mk] || { received: 0, expected: 0, projected: 0 }
                const exp = monthlyExp[mk]?.tot || 0
                const net = s.received - exp
                const margin = s.received > 0 ? ((net / s.received) * 100).toFixed(0) + '%' : '—'
                return [mk, s.received.toFixed(2), s.expected.toFixed(2), s.projected.toFixed(2), exp.toFixed(2), net.toFixed(2), margin]
              })
            ], 'net-income.csv')}>↓ Export CSV</button>
          </div>
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr>
              <th className="th">Month</th>
              <th className="th">Revenue Received</th>
              <th className="th">Expected Revenue</th>
              <th className="th">Projected Total</th>
              <th className="th">Expenses</th>
              <th className="th">Net Profit</th>
              <th className="th">Margin</th>
            </tr></thead>
            <tbody>{allMonths.map(mk => {
              const s = monthlyStats[mk] || { received: 0, expected: 0, projected: 0 }
              const exp = monthlyExp[mk]?.tot || 0
              const net = s.received - exp
              const margin = s.received > 0 ? ((net / s.received) * 100).toFixed(0) + '%' : '—'
              return <tr key={mk} className="hover:bg-gray-50">
                <td className="td font-medium">{mk}</td>
                <td className="td text-emerald-600 font-semibold">{formatCurrency(s.received)}</td>
                <td className="td text-amber-600">{formatCurrency(s.expected)}</td>
                <td className="td font-semibold">{formatCurrency(s.projected)}</td>
                <td className="td">{formatCurrency(exp)}</td>
                <td className={`td font-semibold ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(net)}</td>
                <td className="td">{margin}</td>
              </tr>
            })}</tbody>
          </table></div></div>
        </div>
      })()}

      {tab === 'cust' && (() => {
        const custs: Record<string, { bks: number; dd: number; received: number; expected: number; projected: number }> = {}
        bookings.filter(b => b.status !== 'cancelled').forEach(b => {
          const k = b.customer_name || 'Unknown'
          if (!custs[k]) custs[k] = { bks: 0, dd: 0, received: 0, expected: 0, projected: 0 }
          custs[k].bks++
          custs[k].dd += b.dog_days
          custs[k].projected += totalAmount(b)
          if (b.payment_status === 'paid') custs[k].received += totalAmount(b)
          else custs[k].expected += totalAmount(b)
        })
        return <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
          <thead><tr>
            <th className="th">Customer</th>
            <th className="th">Bookings</th>
            <th className="th">Dog-Days</th>
            <th className="th">Revenue Received</th>
            <th className="th">Expected Revenue</th>
            <th className="th">Projected Total</th>
          </tr></thead>
          <tbody>{Object.entries(custs).sort((a, b) => b[1].projected - a[1].projected).map(([k, v]) =>
            <tr key={k} className="hover:bg-gray-50">
              <td className="td font-medium">{k}</td>
              <td className="td">{v.bks}</td>
              <td className="td">{v.dd}</td>
              <td className="td text-emerald-600">{formatCurrency(v.received)}</td>
              <td className="td text-amber-600">{formatCurrency(v.expected)}</td>
              <td className="td font-semibold">{formatCurrency(v.projected)}</td>
            </tr>
          )}</tbody>
        </table></div></div>
      })()}

      {tab === 'cancel' && (() => {
        const canc = bookings.filter(b => b.status === 'cancelled')
        const lost = canc.reduce((s, b) => s + b.total_revenue, 0)
        return <div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Cancelled Bookings</div><div className="text-xl font-semibold">{canc.length}</div></div>
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Lost Revenue</div><div className="text-xl font-semibold text-red-500">{formatCurrency(lost)}</div></div>
          </div>
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr>
              <th className="th">Customer</th>
              <th className="th">Dogs</th>
              <th className="th">Arrival</th>
              <th className="th">Departure</th>
              <th className="th">Dog-Days</th>
              <th className="th">Lost</th>
              <th className="th">Reason</th>
            </tr></thead>
            <tbody>{canc.map(b =>
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="td font-medium">{b.customer_name}</td>
                <td className="td">{b.dog_names}</td>
                <td className="td">{b.arrival_date}</td>
                <td className="td">{b.departure_date}</td>
                <td className="td">{b.dog_days}</td>
                <td className="td text-red-500">{formatCurrency(b.total_revenue)}</td>
                <td className="td text-gray-500">{b.cancellation_reason || '—'}</td>
              </tr>
            )}</tbody>
          </table></div></div>
        </div>
      })()}
    </AppShell>
  )
}