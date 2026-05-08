'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Expense } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ category: '', month: '', tax: '' })
  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('expenses').select('*').eq('user_id', user.id).order('expense_date', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = expenses.filter(e => {
    if (filters.category && e.category !== filters.category) return false
    if (filters.month && !e.expense_date.startsWith(filters.month)) return false
    if (filters.tax === 'yes' && !e.tax_deductible) return false
    if (filters.tax === 'no' && e.tax_deductible) return false
    return true
  })

  const totalExp = filtered.reduce((s, e) => s + e.amount, 0)
  const totalDed = filtered.filter(e => e.tax_deductible).reduce((s, e) => s + e.deductible_amount, 0)

  const categories = Array.from(new Set(expenses.map(e => e.category))).sort()
  const months = Array.from(new Set(expenses.map(e => e.expense_date.substr(0, 7)))).sort().reverse()
  const sf = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilters(f => ({ ...f, [k]: e.target.value }))

  function exportCSV() {
    const rows = filtered.map(e => [e.expense_date, e.vendor, e.category, e.amount, e.business_use_percentage, e.deductible_amount.toFixed(2), e.payment_method || '', e.tax_deductible ? 'yes' : 'no', e.notes || ''].join(','))
    const csv = ['Date,Vendor,Category,Amount,BizPct,Deductible,Payment,Tax,Notes', ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'expenses.csv'
    a.click()
  }

  return (
    <AppShell>
      <div className="flex justify-between items-start mb-5">
        <div><h1 className="text-xl font-semibold">Expenses</h1><p className="text-sm text-gray-500">Operational costs for tax purposes</p></div>
        <Link href="/expenses/new" className="btn btn-primary">+ New Expense</Link>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Filtered Total</div><div className="text-xl font-semibold">${totalExp.toFixed(0)}</div></div>
        <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Tax Deductible</div><div className="text-xl font-semibold text-emerald-600">${totalDed.toFixed(0)}</div></div>
        <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Transactions</div><div className="text-xl font-semibold">{filtered.length}</div></div>
        <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Avg per Expense</div><div className="text-xl font-semibold">${filtered.length ? (totalExp / filtered.length).toFixed(0) : 0}</div></div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        <select className="input w-auto text-xs" onChange={sf('category')}><option value="">All Categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
        <select className="input w-auto text-xs" onChange={sf('month')}><option value="">All Months</option>{months.map(m => <option key={m} value={m}>{m}</option>)}</select>
        <select className="input w-auto text-xs" onChange={sf('tax')}><option value="">All</option><option value="yes">Deductible</option><option value="no">Not Deductible</option></select>
        <button className="btn text-xs" onClick={exportCSV}>↓ Export CSV</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="th">Date</th><th className="th">Vendor</th><th className="th">Category</th>
              <th className="th">Amount</th><th className="th">Biz %</th><th className="th">Deductible</th>
              <th className="th">Payment</th><th className="th">Tax</th><th className="th">Notes</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="td text-center text-gray-400 py-8">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="td text-center text-gray-400 py-8">No expenses found</td></tr>
              ) : filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="td whitespace-nowrap">{formatDate(e.expense_date)}</td>
                  <td className="td font-medium">{e.vendor}</td>
                  <td className="td"><span className="badge badge-gray">{e.category}</span></td>
                  <td className="td font-semibold">${e.amount.toFixed(2)}</td>
                  <td className="td">{e.business_use_percentage}%</td>
                  <td className="td text-emerald-600">${e.deductible_amount.toFixed(2)}</td>
                  <td className="td text-gray-500">{e.payment_method || '—'}</td>
                  <td className="td"><span className={`badge ${e.tax_deductible ? 'badge-green' : 'badge-red'}`}>{e.tax_deductible ? 'yes' : 'no'}</span></td>
                  <td className="td text-gray-500 max-w-[120px] truncate">{e.notes || '—'}</td>
                  <td className="td"><button className="btn text-xs py-1 px-2" onClick={() => router.push(`/expenses/${e.id}`)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
