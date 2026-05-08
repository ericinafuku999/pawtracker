'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Booking, Expense } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import AppShell from '@/components/AppShell'

type Tab = 'rev' | 'pay' | 'exp' | 'net' | 'cust' | 'cancel'

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
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click()
  }

  // Revenue by month
  const monthRev: Record<string, { rover: number; venmo: number; bks: number; dd: number; canc: number; unpaid: number }> = {}
  bookings.forEach(b => {
    const allocs = (b.month_allocations || [{ monthKey: b.arrival_date.substr(0, 7), revenue: b.total_revenue, dogDays: b.dog_days }]) as any[]
    allocs.forEach((a: any) => {
      if (!monthRev[a.monthKey]) monthRev[a.monthKey] = { rover: 0, venmo: 0, bks: 0, dd: 0, canc: 0, unpaid: 0 }
      if (b.status !== 'cancelled') {
        if (b.payment_type === 'Rover') monthRev[a.monthKey].rover += a.revenue
        else monthRev[a.monthKey].venmo += a.revenue
        monthRev[a.monthKey].bks++; monthRev[a.monthKey].dd += a.dogDays || 0
        monthRev[a.monthKey].unpaid += b.total_revenue - b.amount_received
      } else monthRev[a.monthKey].canc++
    })
  })

  const tabs: { k: Tab; label: string }[] = [
    { k: 'rev', label: 'Revenue' }, { k: 'pay', label: 'Payment Types' }, { k: 'exp', label: 'Expenses' },
    { k: 'net', label: 'Net Income' }, { k: 'cust', label: 'Customers' }, { k: 'cancel', label: 'Cancellations' }
  ]

  return (
    <AppShell>
      <div className="mb-5"><h1 className="text-xl font-semibold">Reports</h1><p className="text-sm text-gray-500">Revenue, expenses, and summaries</p></div>
      <div className="flex border-b border-gray-200 mb-5 gap-0">
        {tabs.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${tab === t.k ? 'border-emerald-500 text-emerald-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rev' && (
        <div>
          <div className="flex justify-end mb-3">
            <button className="btn text-xs" onClick={() => exportCSV([['Month','Rover','Venmo','Total','Bookings','Dog-Days','Cancelled','Unpaid'], ...Object.entries(monthRev).sort((a,b)=>a[0]>b[0]?1:-1).map(([k,v])=>[k,'$'+v.rover.toFixed(0),'$'+v.venmo.toFixed(0),'$'+(v.rover+v.venmo).toFixed(0),String(v.bks),String(v.dd),String(v.canc),'$'+Math.max(0,v.unpaid).toFixed(0)])], 'revenue-by-month.csv')}>↓ Export CSV</button>
          </div>
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Month</th><th className="th">Rover</th><th className="th">Venmo</th><th className="th">Total</th><th className="th">Bookings</th><th className="th">Dog-Days</th><th className="th">Cancelled</th><th className="th">Unpaid</th></tr></thead>
            <tbody>{Object.entries(monthRev).sort((a,b)=>a[0]>b[0]?1:-1).map(([k,v])=>(
              <tr key={k} className="hover:bg-gray-50"><td className="td font-medium">{k}</td><td className="td">${v.rover.toFixed(0)}</td><td className="td">${v.venmo.toFixed(0)}</td><td className="td font-semibold">${(v.rover+v.venmo).toFixed(0)}</td><td className="td">{v.bks}</td><td className="td">{v.dd}</td><td className="td">{v.canc}</td><td className="td text-red-500">${Math.max(0,v.unpaid).toFixed(0)}</td></tr>
            ))}</tbody>
          </table></div></div>
        </div>
      )}

      {tab === 'pay' && (() => {
        const allR = bookings.filter(b=>b.status!=='cancelled'&&b.payment_type==='Rover').reduce((s,b)=>s+b.total_revenue,0)
        const allV = bookings.filter(b=>b.status!=='cancelled'&&b.payment_type==='Venmo').reduce((s,b)=>s+b.total_revenue,0)
        const mm: Record<string,{r:number,v:number}> = {}
        bookings.filter(b=>b.status!=='cancelled').forEach(b=>{const k=b.arrival_date.substr(0,7);if(!mm[k])mm[k]={r:0,v:0};if(b.payment_type==='Rover')mm[k].r+=b.total_revenue;else mm[k].v+=b.total_revenue;})
        return <div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">All-time Rover</div><div className="text-xl font-semibold text-teal-600">{formatCurrency(allR)}</div></div>
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">All-time Venmo</div><div className="text-xl font-semibold text-amber-600">{formatCurrency(allV)}</div></div>
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Combined</div><div className="text-xl font-semibold">{formatCurrency(allR+allV)}</div></div>
          </div>
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Month</th><th className="th">Rover</th><th className="th">Venmo</th><th className="th">Total</th></tr></thead>
            <tbody>{Object.entries(mm).sort((a,b)=>a[0]>b[0]?1:-1).map(([k,v])=>(
              <tr key={k} className="hover:bg-gray-50"><td className="td">{k}</td><td className="td text-teal-600">${v.r.toFixed(0)}</td><td className="td text-amber-600">${v.v.toFixed(0)}</td><td className="td font-semibold">${(v.r+v.v).toFixed(0)}</td></tr>
            ))}</tbody>
          </table></div></div>
        </div>
      })()}

      {tab === 'exp' && (() => {
        const cats: Record<string,number> = {}; const monthly: Record<string,{tot:number,ded:number}> = {}
        expenses.forEach(e=>{cats[e.category]=(cats[e.category]||0)+e.amount;const mk=e.expense_date.substr(0,7);if(!monthly[mk])monthly[mk]={tot:0,ded:0};monthly[mk].tot+=e.amount;monthly[mk].ded+=e.deductible_amount;})
        return <div className="grid grid-cols-2 gap-4">
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Category</th><th className="th">Amount</th></tr></thead>
            <tbody>{Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=><tr key={k} className="hover:bg-gray-50"><td className="td">{k}</td><td className="td font-semibold">${v.toFixed(2)}</td></tr>)}</tbody>
          </table></div></div>
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Month</th><th className="th">Total</th><th className="th">Deductible</th></tr></thead>
            <tbody>{Object.entries(monthly).sort((a,b)=>a[0]>b[0]?1:-1).map(([k,v])=><tr key={k} className="hover:bg-gray-50"><td className="td">{k}</td><td className="td">${v.tot.toFixed(2)}</td><td className="td text-emerald-600">${v.ded.toFixed(2)}</td></tr>)}</tbody>
          </table></div></div>
        </div>
      })()}

      {tab === 'net' && (() => {
        const mm: Record<string,{rev:number,exp:number}> = {}
        bookings.filter(b=>b.status!=='cancelled').forEach(b=>{(b.month_allocations||[{monthKey:b.arrival_date.substr(0,7),revenue:b.total_revenue}] as any[]).forEach((a:any)=>{if(!mm[a.monthKey])mm[a.monthKey]={rev:0,exp:0};mm[a.monthKey].rev+=a.revenue;})})
        expenses.forEach(e=>{const mk=e.expense_date.substr(0,7);if(!mm[mk])mm[mk]={rev:0,exp:0};mm[mk].exp+=e.amount;})
        return <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
          <thead><tr><th className="th">Month</th><th className="th">Revenue</th><th className="th">Expenses</th><th className="th">Net Income</th><th className="th">Margin</th></tr></thead>
          <tbody>{Object.entries(mm).sort((a,b)=>a[0]>b[0]?1:-1).map(([k,v])=>{const n=v.rev-v.exp;const mg=v.rev>0?((n/v.rev)*100).toFixed(0):'0';return<tr key={k} className="hover:bg-gray-50"><td className="td font-medium">{k}</td><td className="td">{formatCurrency(v.rev)}</td><td className="td">{formatCurrency(v.exp)}</td><td className={`td font-semibold ${n>=0?'text-emerald-600':'text-red-500'}`}>{formatCurrency(n)}</td><td className="td">{mg}%</td></tr>})}</tbody>
        </table></div></div>
      })()}

      {tab === 'cust' && (() => {
        const custs: Record<string,{bks:number,dd:number,rev:number,rec:number}> = {}
        bookings.filter(b=>b.status!=='cancelled').forEach(b=>{if(!custs[b.customer_name])custs[b.customer_name]={bks:0,dd:0,rev:0,rec:0};custs[b.customer_name].bks++;custs[b.customer_name].dd+=b.dog_days;custs[b.customer_name].rev+=b.total_revenue;custs[b.customer_name].rec+=b.amount_received;})
        return <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
          <thead><tr><th className="th">Customer</th><th className="th">Bookings</th><th className="th">Dog-Days</th><th className="th">Revenue</th><th className="th">Received</th><th className="th">Outstanding</th></tr></thead>
          <tbody>{Object.entries(custs).sort((a,b)=>b[1].rev-a[1].rev).map(([k,v])=>{const out=Math.max(0,v.rev-v.rec);return<tr key={k} className="hover:bg-gray-50"><td className="td font-medium">{k}</td><td className="td">{v.bks}</td><td className="td">{v.dd}</td><td className="td">{formatCurrency(v.rev)}</td><td className="td">{formatCurrency(v.rec)}</td><td className={`td ${out>0?'text-red-500':''}`}>{formatCurrency(out)}</td></tr>})}</tbody>
        </table></div></div>
      })()}

      {tab === 'cancel' && (() => {
        const canc = bookings.filter(b=>b.status==='cancelled')
        const lost = canc.reduce((s,b)=>s+b.total_revenue,0)
        return <div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Cancelled Bookings</div><div className="text-xl font-semibold">{canc.length}</div></div>
            <div className="metric-card"><div className="text-xs text-gray-400 mb-1">Lost Revenue</div><div className="text-xl font-semibold text-red-500">{formatCurrency(lost)}</div></div>
          </div>
          <div className="card p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">Customer</th><th className="th">Arrival</th><th className="th">Departure</th><th className="th">Dog-Days</th><th className="th">Lost</th><th className="th">Reason</th></tr></thead>
            <tbody>{canc.map(b=><tr key={b.id} className="hover:bg-gray-50"><td className="td font-medium">{b.customer_name}</td><td className="td">{b.arrival_date}</td><td className="td">{b.departure_date}</td><td className="td">{b.dog_days}</td><td className="td text-red-500">{formatCurrency(b.total_revenue)}</td><td className="td text-gray-500">{b.cancellation_reason||'—'}</td></tr>)}</tbody>
          </table></div></div>
        </div>
      })()}
    </AppShell>
  )
}
