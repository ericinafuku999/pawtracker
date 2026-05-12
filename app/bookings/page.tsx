'use client'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { Booking } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import BookingCalendar from '@/components/BookingCalendar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface DogProfile {
  id: string
  dog_name: string
  owner_name: string
  photo_url: string | null
}

function BookingsContent() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [dogProfiles, setDogProfiles] = useState<DogProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'calendar'>('calendar')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: '', payType: '', payStatus: '' })
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulk, setShowBulk] = useState(false)
  const [bulkPayStatus, setBulkPayStatus] = useState('')
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [tipBookingId, setTipBookingId] = useState<string | null>(null)
  const [tipAmount, setTipAmount] = useState('')
  const [tipSaving, setTipSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: bks }, { data: dogs }] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user.id).order('departure_date', { ascending: false }),
      supabase.from('dogs').select('id, dog_name, owner_name, photo_url').eq('user_id', user.id),
    ])
    setBookings(bks || [])
    setDogProfiles(dogs || [])
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

  async function markPaid(b: Booking) {
    await supabase.from('bookings').update({
      payment_status: 'paid',
      amount_received: b.total_revenue,
      updated_at: new Date().toISOString()
    }).eq('id', b.id)
    load()
  }

  function openTip(id: string) {
    setTipBookingId(prev => prev === id ? null : id)
    setTipAmount('')
  }

  async function saveTip(booking: Booking, markFullyPaid: boolean) {
    const tip = parseFloat(tipAmount) || 0
    if (tip <= 0) { setTipBookingId(null); return }
    setTipSaving(true)
    const newAmountReceived = booking.amount_received + tip
    const newTipAmount = (booking.tip_amount || 0) + tip
    const newPayStatus = markFullyPaid ? 'paid'
      : newAmountReceived >= booking.total_revenue ? 'paid'
      : newAmountReceived > 0 ? 'partially paid'
      : booking.payment_status
    await supabase.from('bookings').update({
      amount_received: newAmountReceived,
      tip_amount: newTipAmount,
      payment_status: newPayStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', booking.id)
    setTipBookingId(null)
    setTipAmount('')
    setTipSaving(false)
    load()
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

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id))
      const next = new Set(prev)
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  async function applyBulkUpdate() {
    if (!bulkPayStatus && !bulkStatus) return
    setBulkUpdating(true)
    const updates: any = { updated_at: new Date().toISOString() }
    if (bulkPayStatus) updates.payment_status = bulkPayStatus
    if (bulkStatus) updates.status = bulkStatus
    if (bulkPayStatus === 'paid') {
      for (const id of selectedIds) {
        const booking = bookings.find(b => b.id === id)
        if (booking) {
          await supabase.from('bookings').update({ ...updates, amount_received: booking.total_revenue }).eq('id', id)
        }
      }
    } else {
      for (const id of selectedIds) {
        await supabase.from('bookings').update(updates).eq('id', id)
      }
    }
    setBulkUpdating(false)
    setSelectedIds(new Set())
    setShowBulk(false)
    setBulkPayStatus('')
    setBulkStatus('')
    load()
  }

  async function confirmCancel() {
    if (!cancelId) return
    await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: cancelReason, updated_at: new Date().toISOString() }).eq('id', cancelId)
    setCancelId(null); setCancelReason(''); load()
  }

  function exportCSV() {
    const rows = filtered.map(b => [b.customer_name, b.dog_names, b.number_of_dogs, b.arrival_date, b.departure_date, b.number_of_days, b.dog_days, b.rate_per_dog_day, b.total_revenue, b.payment_type, b.payment_status, b.amount_received, b.tip_amount || 0, b.status, b.cancellation_reason || '', b.notes || ''].join(','))
    const csv = ['Customer,Dogs,NumDogs,Arrival,Departure,Days,DogDays,Rate,Revenue,PayType,PayStatus,Received,Tip,Status,CancelReason,Notes', ...rows].join('\n')
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
        <Link href="/bookings/new" className="btn btn-primary text-xs md:text-sm">+ New</Link>
      </div>

      <div className="flex gap-2 mb-4 items-center">
        <div className="relative flex-1 max-w-xs">
          <input className="input w-full pl-8 text-sm" placeholder="Search by dog or owner…" value={search} onChange={e => setSearch(e.target.value)} />
          <span className="absolute left-2.5 top-2.5 text-gray-400 text-xs">🔍</span>
        </div>
        {search && <button className="btn text-xs" onClick={() => setSearch('')}>Clear</button>}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5">
        <button onClick={() => switchView('calendar')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'calendar' ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>📅 Calendar</button>
        <button onClick={() => switchView('list')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'list' ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>☰ List</button>
      </div>

      {view === 'calendar' ? (
        <div className="card">
          <BookingCalendar bookings={bookings} onRefresh={load} searchQuery={search} dogProfiles={dogProfiles} />
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            <select className="input w-auto text-xs" onChange={sf('status')}><option value="">All Statuses</option><option>active</option><option>completed</option><option>cancelled</option></select>
            <select className="input w-auto text-xs" onChange={sf('payType')}><option value="">All Payment</option><option>Rover</option><option>Venmo</option></select>
            <select className="input w-auto text-xs" onChange={sf('payStatus')}><option value="">All Pay Status</option><option>paid</option><option>partially paid</option><option>unpaid</option></select>
            <button className="btn text-xs" onClick={exportCSV}>↓ CSV</button>
            {selectedIds.size > 0 && (
              <button className="btn text-xs bg-emerald-50 text-emerald-700 border-emerald-200" onClick={() => setShowBulk(true)}>
                ✏️ Bulk Update ({selectedIds.size})
              </button>
            )}
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
              const monthIds = monthBookings.map(b => b.id)
              const allMonthSelected = monthIds.every(id => selectedIds.has(id))

              return (
                <div key={mk} className="mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="w-4 h-4 accent-emerald-500"
                        checked={allMonthSelected && monthIds.length > 0}
                        onChange={() => toggleSelectAll(monthIds)} />
                      <h2 className="font-semibold text-sm text-gray-700">{label}</h2>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Received: <strong className="text-emerald-600">${monthReceived.toFixed(2)}</strong></span>
                      <span>Projected: <strong>${monthProjected.toFixed(2)}</strong></span>
                      <span>{monthBookings.length} bookings</span>
                    </div>
                  </div>
                  <div className="card p-0 overflow-hidden">
                    {/* Mobile */}
                    <div className="md:hidden divide-y divide-gray-50">
                      {monthBookings.map(b => (
                        <div key={b.id} className={`p-3 ${selectedIds.has(b.id) ? 'bg-emerald-50' : ''}`}>
                          <div className="flex items-start gap-2">
                            <input type="checkbox" className="w-4 h-4 accent-emerald-500 mt-1 flex-shrink-0"
                              checked={selectedIds.has(b.id)} onChange={() => toggleSelect(b.id)} />
                            <div className="flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-medium text-sm">{b.dog_names || b.customer_name}</div>
                                  <div className="text-xs text-gray-500">{b.customer_name}</div>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                  {sBadge(b.status)}
                                  {pBadge(b.payment_status)}
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-xs text-gray-400 mt-1 mb-2">
                                <span>{formatDate(b.arrival_date)} → {formatDate(b.departure_date)}</span>
                                <span className="font-semibold text-gray-700">
                                  ${b.amount_received.toFixed(2)}
                                  {b.tip_amount && b.tip_amount > 0
                                    ? <span className="text-emerald-600"> +${b.tip_amount.toFixed(2)} tip</span>
                                    : null}
                                </span>
                              </div>
                              {tipBookingId === b.id && (
                                <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 mb-2">
                                  <div className="text-xs font-medium text-violet-700 mb-2">Add tip for {b.dog_names}</div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-sm text-gray-400">$</span>
                                    <input className="input text-sm py-1.5 w-24" type="number" placeholder="0.00"
                                      value={tipAmount} onChange={e => setTipAmount(e.target.value)} autoFocus />
                                    <button onClick={() => { setTipBookingId(null); setTipAmount('') }} className="btn text-xs py-1.5 px-2">✕</button>
                                  </div>
                                  {tipAmount && parseFloat(tipAmount) > 0 && (
                                    <div className="text-xs text-gray-500 mb-2">
                                      New total: ${(b.amount_received + parseFloat(tipAmount)).toFixed(2)} of ${b.total_revenue.toFixed(2)}
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <button onClick={() => saveTip(b, true)} disabled={tipSaving || !tipAmount || parseFloat(tipAmount) <= 0}
                                      className="btn btn-primary text-xs py-1.5 flex-1 justify-center">
                                      {tipSaving ? 'Saving…' : '✓ Paid + tip'}
                                    </button>
                                    <button onClick={() => saveTip(b, false)} disabled={tipSaving || !tipAmount || parseFloat(tipAmount) <= 0}
                                      className="btn text-xs py-1.5 flex-1 justify-center">
                                      {tipSaving ? 'Saving…' : 'Tip only'}
                                    </button>
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button className="btn text-xs py-1.5 flex-1 justify-center" onClick={() => handleEdit(b.id)}>Edit</button>
                                {b.payment_status !== 'paid' && b.status !== 'cancelled' && (
                                  <button className="btn text-xs py-1.5 flex-1 justify-center bg-emerald-50 text-emerald-700 border-emerald-200" onClick={() => markPaid(b)}>✓ Paid</button>
                                )}
                                <button className="btn text-xs py-1.5 flex-1 justify-center bg-violet-50 text-violet-700 border-violet-200" onClick={() => openTip(b.id)}>🎁 Tip</button>
                                {b.status !== 'cancelled' && (
                                  <button className="btn btn-danger text-xs py-1.5 px-3 justify-center" onClick={() => setCancelId(b.id)}>✕</button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="th w-8"></th>
                            <th className="th">Customer</th>
                            <th className="th">Dogs</th>
                            <th className="th">Arrival</th>
                            <th className="th">Departure</th>
                            <th className="th">Dog-Days</th>
                            <th className="th">Rate</th>
                            <th className="th">Revenue</th>
                            <th className="th">Received</th>
                            <th className="th">Tip</th>
                            <th className="th">Type</th>
                            <th className="th">Pay</th>
                            <th className="th">Status</th>
                            <th className="th"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthBookings.map(b => (
                            <>
                              <tr key={b.id}
                                className={`cursor-pointer select-none ${selectedIds.has(b.id) ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                                onDoubleClick={() => handleEdit(b.id)}>
                                <td className="td">
                                  <input type="checkbox" className="w-4 h-4 accent-emerald-500"
                                    checked={selectedIds.has(b.id)}
                                    onChange={() => toggleSelect(b.id)}
                                    onClick={e => e.stopPropagation()} />
                                </td>
                                <td className="td font-medium">{b.customer_name}</td>
                                <td className="td text-gray-600">{b.dog_names} <span className="text-gray-400 text-xs">({b.number_of_dogs})</span></td>
                                <td className="td whitespace-nowrap">{formatDate(b.arrival_date)}</td>
                                <td className="td whitespace-nowrap">{formatDate(b.departure_date)}</td>
                                <td className="td font-semibold">{b.dog_days}</td>
                                <td className="td">${b.rate_per_dog_day}/day</td>
                                <td className="td font-semibold">{formatCurrency(b.total_revenue)}</td>
                                <td className={`td ${b.status !== 'cancelled' && b.amount_received < b.total_revenue ? 'text-red-500' : ''}`}>
                                  {formatCurrency(b.amount_received)}
                                </td>
                                <td className="td">
                                  {b.tip_amount && b.tip_amount > 0
                                    ? <span className="badge bg-emerald-100 text-emerald-700 text-xs">🎁 {formatCurrency(b.tip_amount)}</span>
                                    : <span className="text-gray-300 text-xs">—</span>
                                  }
                                </td>
                                <td className="td"><span className={`badge ${b.payment_type === 'Rover' ? 'badge-teal' : 'badge-amber'}`}>{b.payment_type}</span></td>
                                <td className="td">{pBadge(b.payment_status)}</td>
                                <td className="td">{sBadge(b.status)}</td>
                                <td className="td">
                                  <div className="flex gap-1">
                                    <button className="btn text-xs py-1 px-2" onClick={e => { e.stopPropagation(); handleEdit(b.id) }}>Edit</button>
                                    {b.payment_status !== 'paid' && b.status !== 'cancelled' && (
                                      <button className="btn text-xs py-1 px-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" onClick={e => { e.stopPropagation(); markPaid(b) }}>✓ Paid</button>
                                    )}
                                    <button className="btn text-xs py-1 px-2 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100" onClick={e => { e.stopPropagation(); openTip(b.id) }}>🎁 Tip</button>
                                    {b.status !== 'cancelled' && (
                                      <button className="btn btn-danger text-xs py-1 px-2" onClick={e => { e.stopPropagation(); setCancelId(b.id) }}>✕</button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {tipBookingId === b.id && (
                                <tr key={`tip-${b.id}`}>
                                  <td colSpan={14} className="px-4 py-3 bg-violet-50 border-t border-violet-100">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <span className="text-xs font-medium text-violet-700">Add tip for {b.dog_names}:</span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-sm text-gray-400">$</span>
                                        <input className="input text-sm py-1 w-24" type="number" placeholder="0.00"
                                          value={tipAmount} onChange={e => setTipAmount(e.target.value)} autoFocus />
                                      </div>
                                      {tipAmount && parseFloat(tipAmount) > 0 && (
                                        <span className="text-xs text-gray-500">
                                          New total: {formatCurrency(b.amount_received + parseFloat(tipAmount))} of {formatCurrency(b.total_revenue)}
                                        </span>
                                      )}
                                      <button onClick={() => saveTip(b, true)} disabled={tipSaving || !tipAmount || parseFloat(tipAmount) <= 0}
                                        className="btn btn-primary text-xs py-1.5 px-3">
                                        {tipSaving ? 'Saving…' : '✓ Save tip — mark fully paid'}
                                      </button>
                                      <button onClick={() => saveTip(b, false)} disabled={tipSaving || !tipAmount || parseFloat(tipAmount) <= 0}
                                        className="btn text-xs py-1.5 px-3">
                                        {tipSaving ? 'Saving…' : 'Save tip only'}
                                      </button>
                                      <button onClick={() => { setTipBookingId(null); setTipAmount('') }}
                                        className="btn text-xs py-1.5 px-2">Cancel</button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
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

      {/* Bulk update modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Bulk Update {selectedIds.size} Booking{selectedIds.size !== 1 ? 's' : ''}</h2>
              <button onClick={() => setShowBulk(false)} className="btn py-1 px-2">✕</button>
            </div>
            <div className="mb-4">
              <label className="label">Update Payment Status</label>
              <select className="input" value={bulkPayStatus} onChange={e => setBulkPayStatus(e.target.value)}>
                <option value="">— No change —</option>
                <option value="paid">Mark as Paid</option>
                <option value="partially paid">Mark as Partially Paid</option>
                <option value="unpaid">Mark as Unpaid</option>
              </select>
            </div>
            <div className="mb-5">
              <label className="label">Update Booking Status</label>
              <select className="input" value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
                <option value="">— No change —</option>
                <option value="active">Mark as Active</option>
                <option value="completed">Mark as Completed</option>
                <option value="cancelled">Mark as Cancelled</option>
              </select>
            </div>
            {bulkPayStatus === 'paid' && (
              <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs text-emerald-700">
                ✓ Amount received will be set to full revenue for each booking
              </div>
            )}
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1 justify-center" onClick={applyBulkUpdate} disabled={bulkUpdating || (!bulkPayStatus && !bulkStatus)}>
                {bulkUpdating ? 'Updating…' : 'Apply Update'}
              </button>
              <button className="btn flex-1 justify-center" onClick={() => setShowBulk(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Cancel Booking</h2>
              <button onClick={() => setCancelId(null)} className="btn py-1 px-2">✕</button>
            </div>
            <div className="mb-4">
              <label className="label">Cancellation reason (optional)</label>
              <textarea className="input" rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Dog got sick…" />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-danger flex-1 justify-center" onClick={confirmCancel}>Cancel Booking</button>
              <button className="btn flex-1 justify-center" onClick={() => setCancelId(null)}>Keep Active</button>
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