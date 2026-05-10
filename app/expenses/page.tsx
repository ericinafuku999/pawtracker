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
  const [filters, setFilters] = useState({ category: '', tax: '' })
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

  const now = new Date()
  const currentYear = now.getFullYear()

  function monthLabel(mk: string) {
    const [y, m] = mk.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
  }

  const filtered = expenses.filter(e => {
    if (filters.category && e.category !== filters.category) return false
    if (filters.tax === 'yes' && !e.tax_deductible) return false
    if (filters.tax === 'no' && e.tax_deductible) return false
    return true
  })

  const yearExpenses = filtered.filter(e => e.expense_date.startsWith(String(currentYear)))
  const yearTotal = yearExpenses.reduce((s, e) => s + e.amount, 0)
  const yearDeductible = yearExpenses.filter(e => e.tax_deductible).reduce((s, e) => s + e.deductible_amount, 0)
  const yearNonDeductible = yearTotal - yearDeductible
  const allTotal = filtered.reduce((s, e) => s + e.amount, 0)
  const allDeductible = filtered.filter(e => e.tax_deductible).reduce((s, e) => s + e.deductible_amount, 0)

  const grouped: Record<string, Expense[]> = {}
  filtered.forEach(e => {
    const mk = e.expense_date.substr(0, 7)
    if (!grouped[mk]) grouped[mk] = []
    grouped[mk].push(e)
  })
  const sortedMonths = Object.keys(grouped).sort().reverse()

  const categories = Array.from(new Set(expenses.map(e => e.category))).sort()
  const sf = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilters(f => ({ ...f, [k]: e.target.value }))

  function exportCSV() {
    const rows = filtered.map(e => [e.expense_date, e.vendor, e.category, e.amount, e.business_use_percentage, e.deductible_amount.toFixed(2), e.payment_method || '', e.tax_deductible ? 'yes' : 'no', e.notes || ''].join(','))
    const csv = ['Date,Vendor,Category,Amount,BizPct,Deductible,Payment,Tax,Notes', ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'expenses.csv'; a.click()
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    load()
  }

  return (
    <AppShell>
      <div className="flex justify-between items-start mb-5">
        <div><h1 className="text-xl font-semibold">Expenses</h1><p className="text-sm text-gray-500">Operational costs for tax purposes</p></div>
        <Link href="/expenses/new" className="btn btn-primary">+ New Expense</Link>
      </div>

      {/* Year summary */}
      <div className="card mb-5 border-emerald-100 bg-emerald-50">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm text-emerald-800">📋 {currentYear} Tax Year Summary</div>
          <button className="btn text-xs" onClick={exportCSV}>↓ Export CSV</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3 border border-emerald-100">
            <div className="text-xs text-gray-400 mb-1">Total Expenses</div>
            <div className="text-xl font-semibold">${yearTotal.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{yearExpenses.length} transactions</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-emerald-100">
            <div className="text-xs text-gray-400 mb-1">Tax Deductible</div>
            <div className="text-xl font-semibold text-emerald-600">${yearDeductible.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{yearExpenses.filter(e => e.tax_deductible).length} items</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-emerald-100">
            <div className="text-xs text-gray-400 mb-1">Not Deductible</div>
            <div className="text-xl font-semibold text-gray-500">${yearNonDeductible.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{yearExpenses.filter(e => !e.tax_deductible).length} items</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-emerald-100">
            <div className="text-xs text-gray-400 mb-1">All-Time Total</div>
            <div className="text-xl font-semibold">${allTotal.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-0.5">${allDeductible.toFixed(2)} deductible</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        <select className="input w-auto text-xs" onChange={sf('category')}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="input w-auto text-xs" onChange={sf('tax')}>
          <option value="">All</option>
          <option value="yes">Deductible</option>
          <option value="no">Not Deductible</option>
        </select>
      </div>

      {/* Grouped by month */}
      {loading ? (
        <div className="card text-center text-gray-400 py-8">Loading…</div>
      ) : sortedMonths.length === 0 ? (
        <div className="card text-center text-gray-400 py-8">No expenses found</div>
      ) : sortedMonths.map(mk => {
        const monthExpenses = grouped[mk]
        const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0)
        const monthDeductible = monthExpenses.filter(e => e.tax_deductible).reduce((s, e) => s + e.deductible_amount, 0)

        return (
          <div key={mk} className="mb-6">
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="font-semibold text-sm text-gray-700">{monthLabel(mk)}</h2>
              <div className="flex gap-3 text-xs text-gray-500">
                <span>{monthExpenses.length} expense{monthExpenses.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    <th className="th">Date</th>
                    <th className="th">Vendor</th>
                    <th className="th">Category</th>
                    <th className="th">Amount</th>
                    <th className="th">Biz %</th>
                    <th className="th">Deductible</th>
                    <th className="th">Payment</th>
                    <th className="th">Tax</th>
                    <th className="th">Notes</th>
                    <th className="th"></th>
                  </tr></thead>
                  <tbody>
                    {monthExpenses.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="td whitespace-nowrap">{formatDate(e.expense_date)}</td>
                        <td className="td font-medium">{e.vendor}</td>
                        <td className="td"><span className="badge badge-gray">{e.category}</span></td>
                        <td className="td font-semibold">${e.amount.toFixed(2)}</td>
                        <td className="td">{e.business_use_percentage}%</td>
                        <td className="td text-emerald-600">${e.deductible_amount.toFixed(2)}</td>
                        <td className="td text-gray-500">{e.payment_method || '—'}</td>
                        <td className="td">
                          <span className={`badge ${e.tax_deductible ? 'badge-green' : 'badge-red'}`}>
                            {e.tax_deductible ? 'yes' : 'no'}
                          </span>
                        </td>
                        <td className="td text-gray-500 max-w-[120px] truncate">{e.notes || '—'}</td>
                        <td className="td">
                          <div className="flex gap-1">
                            <button className="btn text-xs py-1 px-2" onClick={() => router.push(`/expenses/${e.id}`)}>Edit</button>
                            <button className="btn btn-danger text-xs py-1 px-2" onClick={() => deleteExpense(e.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td className="td" colSpan={3}>
                        <span className="font-semibold text-sm text-gray-700">Month Total</span>
                      </td>
                      <td className="td font-bold text-gray-900">${monthTotal.toFixed(2)}</td>
                      <td className="td"></td>
                      <td className="td font-bold text-emerald-600">${monthDeductible.toFixed(2)}</td>
                      <td className="td" colSpan={4}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </AppShell>
  )
}