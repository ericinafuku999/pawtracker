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

interface PendingItem {
  booking: Booking
  payStatus: string
  bookingStatus: string
  amountReceived: string
  extended: boolean
  newDepartureDate: string
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
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [showPending, setShowPending] = useState(false)
  const [savingPending, setSavingPending] = useState(false)
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const pending = (bks || []).filter(b => {
      if (b.status === 'cancelled') return false
      const dep = parseLocalDate(b.departure_date)
      if (dep >= today) return false
      return b.status === 'active' || b.payment_status !== 'paid'
    })
    if (pending.length > 0) {
      setPendingItems(pending.map(b => ({
        booking: b,
        payStatus: b.payment_status,
        bookingStatus: b.status === 'active' ? 'completed' : b.status,
        amountReceived: String(b.amount_received),
        extended: false,
        newDepartureDate: b.departure_date,
      })))
      setShowPending(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function savePending() {
    setSavingPending(true)
    for (const item of pendingItems) {
      const update: any = {
        payment_status: item.payStatus,
        status: item.bookingStatus,
        amount_received: parseFloat(item.amountReceived) || item.booking.amount_received,
        updated_at: new Date().toISOString(),
      }
      if (item.extended && item.newDepartureDate !== item.booking.departure_date) {
        update.departure_date = item.newDepartureDate
        update.status = 'active'
      }
      await supabase.from('bookings').update(update).eq('id', item.booking.id)
    }
    setSavingPending(false)
    setShowPending(false)
    load()
  }

  async function markOnePaid(bookingId: string) {
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking) return
    await supabase.from('bookings').update({
      payment_status: 'paid',
      amount_received: booking.total_revenue,
      updated_at: new Date().toISOString(),
    }).eq('id', bookingId)
    setPendingItems(prev => prev.filter(i => i.booking.id !== bookingId))
    load()
  }

  function updateItem(id: string, field: string, value: string | boolean) {
    setPendingItems(prev => prev.map(item =>
      item.booking.id === id ? { ...item, [field]: value } : item
    ))
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  const arrivingToday = bookings.filter(b => b.status !== 'cancelled' && b.arrival_date === todayStr)
  const arrivingTomorrow = bookings.filter(b => b.status !== 'cancelled' && b.arrival_date === tomorrowStr)
  const departingToday = bookings.filter(b => b.status !== 'cancelled' && b.departure_date === todayStr)
  const departingTomorrow = bookings.filter(b => b.status !== 'cancelled' && b.departure_date === tomorrowStr)
  const currentlyHere = bookings.filter(b => {
    if (b.status === 'cancelled') return false
    const arr = parseLocalDate(b.arrival_date)
    const dep = parseLocalDate(b.departure_date)
    return arr <= today && dep > today
  })

  const persistentUnpaid = bookings.filter(b => {
    if (b.status === 'cancelled') return false
    if (b.payment_status === 'paid') return false
    const dep = parseLocalDate(b.departure_date)
    const t = new Date(); t.setHours(0,0,0,0)
    return dep < t
  })
  const totalOwed = persistentUnpaid.reduce((s, b) => s + (b.total_revenue - b.amount_received), 0)

  function getProfile(booking: Booking): DogProfile | null {
    if ((booking.customer_name || '').toLowerCase() !== 'imported' && (booking.customer_name || '').trim() !== '') {
      const exact = dogProfiles.find(d =>
        d.dog_name.toLowerCase() === (booking.dog_names || '').toLowerCase() &&
        d.owner_name.toLowerCase() === (booking.customer_name || '').toLowerCase()
      )
      if (exact) return exact
    }
    return dogProfiles.find(d =>
      d.dog_name.toLowerCase() === (booking.dog_names || '').toLowerCase()
    ) || null
  }

  // Compact dog card for the today widget
  function DogCard({ booking, showDates = false }: { booking: Booking; showDates?: boolean }) {
    const profile = getProfile(booking)
    function handleTileClick() { router.push(`/bookings/${booking.id}`) }
    function handlePhotoClick(e: React.MouseEvent) {
      e.stopPropagation()
      if (profile) router.push(`/dogs/${profile.id}`)
      else router.push(`/dogs/new?dogName=${encodeURIComponent(booking.dog_names)}&customerName=${encodeURIComponent(booking.customer_name)}&numDogs=${booking.number_of_dogs}&rate=${booking.rate_per_dog_day}`)
    }
    return (
      <div onClick={handleTileClick} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all cursor-pointer group">
        <div onClick={handlePhotoClick} className="w-9 h-9 rounded-lg overflow-hidden bg-emerald-50 flex-shrink-0 flex items-center justify-center border border-emerald-100 relative group/photo">
          {profile?.photo_url
            ? <img src={profile.photo_url} alt={booking.dog_names} className="w-full h-full object-cover" />
            : <span className="text-base">🐾</span>
          }
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
            <span className="text-white text-xs font-bold">{profile ? '👤' : '+'}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs truncate">{booking.dog_names}</div>
          <div className="text-xs text-gray-400 truncate">{booking.customer_name}</div>
          {showDates && <div className="text-xs text-gray-300">→ {formatDate(booking.departure_date)}</div>}
        </div>
        <span className={`badge text-xs flex-shrink-0 ${booking.payment_type === 'Rover' ? 'badge-teal' : 'badge-amber'}`}>{booking.payment_type}</span>
      </div>
    )
  }

  // Widget card component for clean reuse
  function TodayCard({
    icon, title, color, badgeColor, count, children, emptyText, emptyColor
  }: {
    icon: string
    title: string
    color: string
    badgeColor: string
    count: number
    children: React.ReactNode
    emptyText: string
    emptyColor: string
  }) {
    return (
      <div className={`rounded-xl border p-3 ${color}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">{icon}</span>
          <div className={`font-semibold text-xs uppercase tracking-wide`}>{title}</div>
          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{count}</span>
        </div>
        {count === 0
          ? <div className={`text-xs text-center py-2 ${emptyColor}`}>{emptyText}</div>
          : <div className="space-y-1.5">{children}</div>
        }
      </div>
    )
  }

  const showTodayWidget = arrivingToday.length > 0 || arrivingTomorrow.length > 0 ||
    departingToday.length > 0 || departingTomorrow.length > 0 || currentlyHere.length > 0

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
      {/* Single combined pending popup */}
      {showPending && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-semibold text-base">🐾 Needs Your Attention</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {pendingItems.length} booking{pendingItems.length !== 1 ? 's' : ''} need updating —
                  mark completed, update payment, or extend stay
                </p>
              </div>
              <button onClick={() => setShowPending(false)} className="text-gray-400 hover:text-gray-600 text-lg px-1">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 -mx-1 px-1">
              {pendingItems.map(item => {
                const needsStatus = item.booking.status === 'active'
                const needsPayment = item.booking.payment_status !== 'paid'
                return (
                  <div key={item.booking.id} className={`border rounded-xl p-4 mb-3 ${needsStatus ? 'bg-gray-50 border-gray-100' : 'bg-amber-50 border-amber-100'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      {(() => {
                        const profile = getProfile(item.booking)
                        return (
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-white flex-shrink-0 flex items-center justify-center border border-gray-100">
                            {profile?.photo_url
                              ? <img src={profile.photo_url} alt={item.booking.dog_names} className="w-full h-full object-cover" />
                              : <span className="text-lg">🐾</span>
                            }
                          </div>
                        )
                      })()}
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{item.booking.dog_names}</div>
                        <div className="text-xs text-gray-500">
                          👤 {item.booking.customer_name} · departed {formatDate(item.booking.departure_date)} · {formatCurrency(item.booking.total_revenue)}
                        </div>
                        <div className="flex gap-1 mt-1">
                          {needsStatus && <span className="badge bg-blue-100 text-blue-700 text-xs">Needs checkout</span>}
                          {needsPayment && <span className="badge bg-amber-100 text-amber-700 text-xs">Unpaid</span>}
                        </div>
                      </div>
                      {needsPayment && (
                        <button onClick={() => markOnePaid(item.booking.id)}
                          className="btn text-xs py-1.5 px-3 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 whitespace-nowrap flex-shrink-0">
                          ✓ Mark Paid
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {needsPayment && (
                        <>
                          <div>
                            <label className="label">Pay Status</label>
                            <select className="input text-xs" value={item.payStatus} onChange={e => updateItem(item.booking.id, 'payStatus', e.target.value)}>
                              <option value="unpaid">Unpaid</option>
                              <option value="partially paid">Partial</option>
                              <option value="paid">Paid ✓</option>
                            </select>
                          </div>
                          <div>
                            <label className="label">Amount Received</label>
                            <input className="input text-xs" type="number" value={item.amountReceived} onChange={e => updateItem(item.booking.id, 'amountReceived', e.target.value)} />
                          </div>
                        </>
                      )}
                      {needsStatus && (
                        <>
                          <div>
                            <label className="label">Booking Status</label>
                            <select className="input text-xs" value={item.bookingStatus} onChange={e => updateItem(item.booking.id, 'bookingStatus', e.target.value)}>
                              <option value="completed">Completed</option>
                              <option value="active">Still Active</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>
                          <div>
                            <label className="label">Extended?</label>
                            <select className="input text-xs" value={item.extended ? 'yes' : 'no'} onChange={e => updateItem(item.booking.id, 'extended', e.target.value === 'yes')}>
                              <option value="no">No</option>
                              <option value="yes">Yes — new date</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                    {item.extended && (
                      <div className="mt-3">
                        <label className="label">New Departure Date</label>
                        <input className="input text-xs w-48" type="date" value={item.newDepartureDate} onChange={e => updateItem(item.booking.id, 'newDepartureDate', e.target.value)} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
              <button className="btn btn-primary flex-1 justify-center py-2.5" onClick={savePending} disabled={savingPending}>
                {savingPending ? 'Saving…' : `Save All Updates`}
              </button>
              <button className="btn flex-1 justify-center py-2.5" onClick={() => setShowPending(false)}>
                Remind Me Later
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-500">Cash flow and performance overview</p>
      </div>

      {/* Persistent unpaid banner */}
      {persistentUnpaid.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <div>
                <div className="font-semibold text-sm text-amber-800">{persistentUnpaid.length} Unpaid Booking{persistentUnpaid.length !== 1 ? 's' : ''}</div>
                <div className="text-xs text-amber-600">{formatCurrency(totalOwed)} outstanding</div>
              </div>
            </div>
            <button onClick={() => setShowPending(true)} className="btn text-xs bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200">
              Update All
            </button>
          </div>
          <div className="space-y-1.5">
            {persistentUnpaid.slice(0, 3).map(b => (
              <div key={b.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-sm">{b.dog_names}</span>
                  <span className="text-xs text-gray-400 ml-2 hidden sm:inline">· {b.customer_name} · {formatDate(b.departure_date)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-amber-700 font-medium">{formatCurrency(b.total_revenue - b.amount_received)} owed</span>
                  <button onClick={() => markOnePaid(b.id)} className="btn text-xs py-1 px-2 bg-emerald-50 text-emerald-700 border-emerald-200">✓ Paid</button>
                </div>
              </div>
            ))}
            {persistentUnpaid.length > 3 && (
              <div className="text-xs text-amber-600 text-center pt-1">
                +{persistentUnpaid.length - 3} more · <button className="underline" onClick={() => setShowPending(true)}>View all</button>
              </div>
            )}
          </div>
        </div>
      )}

     {/* TODAY WIDGET */}
      {showTodayWidget && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
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
          <div className="card border-teal-200 bg-teal-50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🌅</span>
              <div className="font-semibold text-sm text-teal-800">Arriving Tomorrow</div>
              <span className="badge bg-teal-200 text-teal-800 ml-auto">{arrivingTomorrow.length}</span>
            </div>
            {arrivingTomorrow.length === 0
              ? <div className="text-xs text-teal-600 text-center py-2">None tomorrow</div>
              : <div className="space-y-2">{arrivingTomorrow.map(b => <DogCard key={b.id} booking={b} />)}</div>
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
          <div className="card border-orange-200 bg-orange-50">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🌇</span>
              <div className="font-semibold text-sm text-orange-800">Departing Tomorrow</div>
              <span className="badge bg-orange-200 text-orange-800 ml-auto">{departingTomorrow.length}</span>
            </div>
            {departingTomorrow.length === 0
              ? <div className="text-xs text-orange-400 text-center py-2">None tomorrow</div>
              : <div className="space-y-2">{departingTomorrow.map(b => <DogCard key={b.id} booking={b} />)}</div>
            }
          </div>
          <div className="card border-blue-200 bg-blue-50 md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏠</span>
              <div className="font-semibold text-sm text-blue-800">Currently Here</div>
              <span className="badge bg-blue-200 text-blue-800 ml-auto">{currentlyHere.length}</span>
            </div>
            {currentlyHere.length === 0
              ? <div className="text-xs text-blue-500 text-center py-2">No guests right now</div>
              : <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{currentlyHere.map(b => <DogCard key={b.id} booking={b} showDates />)}</div>
            }
          </div>
        </div>
      )}

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
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