'use client'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { Booking } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import BookingCalendar from '@/components/BookingCalendar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function BookingsContent() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'calendar'>('calendar')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: '', payType: '', payStatus: '' })
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const supabase = createClient()
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('bookings').select('*').eq('user_id', user.id).order('departure_date', { ascending: false })
    setBookings(data || [])
    setLoading(false)
    const scrollY = sessionStorage.getItem('bookings_scroll')
    if (scrollY) {
      setTimeout(() => { window.scrollTo(0, parseInt(scrollY)); sessionStorage.removeItem('bookings_scroll') }, 100)
    }
  }, [])

  useEffect(() => {
    const savedView = localStorage.getItem('bookings_view') as 'list' | 'calendar'
    if (savedView) setView(savedView)
    load()
  }, [load])

  function switchView(v: 'list' | 'calendar') {
    setView(v)
    localStorage.setItem('bookings_view', v)
  }

  function handleEdit(id: string) {
    sessionStorage.setItem('bookings_scroll', String(window.scrollY))
    router.push(`/bookings/${id}`)
  }

  const filtered = bookings.filter(b => {
    if (filters.status && b.status !== filters.status) return false
    if (filters.payType && b.payment_type !== filters.payType) return false
    if (filters.payStatus && b.payment_status !== filters.payStatus) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(b.customer_name || '').toLowerCase().includes(q) && !(b.dog_names || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const grouped: Record<string, Booking[]> = {}
  filtered.forEach(b => {
    const mk = b.departure_date.substr(0, 7)
    if (!grouped[mk]) grouped[mk] = []
    grouped[mk].push(b)
  })
  const sortedMonths = Object.keys(grouped).sort().reverse()

  async function confirmCancel() {
    if (!cancelId) return
    await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: cancelReason, updated_at: new Date().toISOString() }).eq('id', cancelId)
    setCancelId(null); setCancelReason(''); load()
  }

  function exportCSV() {
    const rows = filtered.map(b => [b.customer_name, b.dog_names, b.number_of_dogs, b.arrival_date, b.departure_date, b.number_of_days, b.dog_days, b.rate_per_dog_day, b.total_revenue, b.payment_type, b.payment_status, b.amount_received, b.status, b.cancellation_reason || '', b.notes || ''].join(','))
    const csv = ['Customer,Dogs,NumDogs,Arrival,Departure,Days,DogDays,Rate,Revenue,PayType,PayStatus,Received,Status,CancelReason,Notes', ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'bookings.csv'; a.click()
  }

  const sf = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilters(f => ({ ...f, [k]: e.target.value }))

  function sBadge(s: string) {
    if (s === 'active') return <span className="badge badge-blue">active</span>
    if (s === 'completed') return <span className="badge badge-green">done</span>
    return <span className="badge badge-red">cancelled</span>
  }
  function pBadge(s: string) {
    if (s === 'paid') return <span className="badge badge-green">paid</span>
    if (s === 'partially paid') return <span className="badge badge-amber">partial</span>
    return <span className="badge badge-gray">unpaid</span>
  }

  return (
    <AppShell>
      <div className="flex justify-between items-start mb-5">
        <div><h1 className="text-xl font-semibold">Bookings</h1><p className="text-sm text-gray-500">All dog care appointments</p></div>
        <Link href="/bookings/new" className="btn btn-primary">+ New Booking</Link>
      </div>

      <div className="flex gap-2 mb-4 items-center">
        <div className="relative flex-1 max-w-xs">
          <input className="input w-full pl-8 text-sm" placeholder="Search by customer or dog name…" value={search} onChange={e => setSearch(e.target.value)} />
          <span className="absolute left-2.5 top-2.5 text-gray-400 text-xs">🔍</span>
        </div>
        {search && <button className="btn text-xs" onClick={() => setSearch('')}>Clear</button>}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5">
        <button onClick={() => switchView('calendar')} className={`px-3 py-1 rounded-md text-sm transition-colors ${view === 'calendar' ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>📅 Calendar</button>
        <button onClick={() => switchView('list')} className={`px-3 py-1 rounded-md text-sm transition-colors ${view === 'list' ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>☰ List</button>
      </div>

      {view === 'calendar' ? (
        <div className="card">
          <BookingCalendar bookings={bookings} onRefresh={load} searchQuery={search} />
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            <select className="input w-auto text-xs" onChange={sf('status')}><option value="">All Statuses</option><option>active</option><option>completed</option><option>cancelled</option></select>
            <select className="input w-auto text-xs" onChange={sf('payType')}><option value="">All Payment</option><option>Rover</option><option>Venmo</option></select>
            <select className="input w-auto text-xs" onChange={sf('payStatus')}><option value="">All Pay Status</option><option>paid</option><option>partially paid</option><option>unpaid</option></select>
            <button className="btn text-xs" onClick={exportCSV}>↓ Export CSV</button>
          </div>

          <div ref={tableRef}>
            {loading ? (
              <div className="card text-center text-gray-400 py-8">Loading…</div>
            ) : sortedMonths.length === 0 ? (
              <div className="card text-center text-gray-400 py-8">No bookings found</div>
            ) : sortedMonths.map(mk => {
              const monthBookings = grouped[mk]
              const [y, m] = mk.split('-').map(Number)
const label = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
              const monthReceived = monthBookings.filter(b => b.status !== 'cancelled' && b.payment_status === 'paid').reduce((s, b) => s + b.amount_received, 0)
              const monthProjected = monthBookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + b.amount_received, 0)

              return (
                <div key={mk} className="mb-4">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h2 className="font-semibold text-sm text-gray-700">{label}</h2>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>Received: <strong className="text-emerald-600">${monthReceived.toFixed(2)}</strong></span>
                      <span>Projected: <strong>${monthProjected.toFixed(2)}</strong></span>
                      <span>{monthBookings.length} booking{monthBookings.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="card p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead><tr>
                          <th className="th">Customer</th><th className="th">Dogs</th><th className="th">Arrival</th>
                          <th className="th">Departure</th><th className="th">Dog-Days</th><th className="th">Rate</th>
                          <th className="th">Revenue</th><th className="th">Received</th><th className="th">Type</th>
                          <th className="th">Pay</th><th className="th">Status</th><th className="th"></th>
                        </tr></thead>
                        <tbody>
                          {monthBookings.map(b => (
                            <tr key={b.id} className="hover:bg-gray-50">
                              <td className="td font-medium">{b.customer_name}</td>
                              <td className="td text-gray-600">{b.dog_names} <span className="text-gray-400 text-xs">({b.number_of_dogs})</span></td>
                              <td className="td whitespace-nowrap">{formatDate(b.arrival_date)}</td>
                              <td className="td whitespace-nowrap">{formatDate(b.departure_date)}</td>
                              <td className="td font-semibold">{b.dog_days}</td>
                              <td className="td">${b.rate_per_dog_day}/day</td>
                              <td className="td font-semibold">{formatCurrency(b.total_revenue)}</td>
                              <td className={`td ${b.status !== 'cancelled' && b.amount_received < b.total_revenue ? 'text-red-500' : ''}`}>{formatCurrency(b.amount_received)}</td>
                              <td className="td"><span className={`badge ${b.payment_type === 'Rover' ? 'badge-teal' : 'badge-amber'}`}>{b.payment_type}</span></td>
                              <td className="td">{pBadge(b.payment_status)}</td>
                              <td className="td">{sBadge(b.status)}</td>
                              <td className="td">
                                <div className="flex gap-1">
                                  <button className="btn text-xs py-1 px-2" onClick={() => handleEdit(b.id)}>Edit</button>
                                  {b.status !== 'cancelled' && (
                                    <button className="btn btn-danger text-xs py-1 px-2" onClick={() => setCancelId(b.id)}>✕</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {cancelId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="card w-96">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Cancel Booking</h2>
              <button onClick={() => setCancelId(null)} className="btn py-1 px-2">✕</button>
            </div>
            <div className="mb-4">
              <label className="label">Cancellation reason (optional)</label>
              <textarea className="input" rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Dog got sick…" />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-danger" onClick={confirmCancel}>Cancel This Booking</button>
              <button className="btn" onClick={() => setCancelId(null)}>Keep Active</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>}>
      <BookingsContent />
    </Suspense>
  )
}