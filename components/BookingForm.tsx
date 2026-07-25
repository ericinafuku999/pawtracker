'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { calcDogDays, splitRevenueByMonth } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import { useRouter, useSearchParams } from 'next/navigation'
import { Booking } from '@/lib/types'

interface DogProfile {
  id: string
  dog_name: string
  owner_name: string
  number_of_dogs: number
  default_rate: number
  photo_url: string | null
}

export default function BookingForm({ bookingId }: { bookingId?: string }) {
  const isEdit = !!bookingId
  const [form, setForm] = useState({
    customer_name: '', dog_names: '', number_of_dogs: '1', rate_per_dog_day: '50',
    arrival_date: '', arrival_time: '', departure_date: '', departure_time: '', dog_days_override: '',
    payment_type: 'Rover', payment_status: 'unpaid', amount_received: '0',
    tip_amount: '0',
    status: 'active', cancellation_reason: '', notes: ''
  })
  const [calc, setCalc] = useState<{ days: number; dogDays: number; revenue: number; splits: any[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dogSearch, setDogSearch] = useState('')
  const [dogResults, setDogResults] = useState<DogProfile[]>([])
  const [allDogs, setAllDogs] = useState<DogProfile[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedDog, setSelectedDog] = useState<DogProfile | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const originalTimes = useRef<{ arrival_time: string | null; departure_time: string | null }>({ arrival_time: null, departure_time: null })
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('dogs').select('*').eq('user_id', user.id).order('dog_name').then(({ data }) => {
        setAllDogs(data || [])
      })
    })
  }, [])

  useEffect(() => {
    const dogId = searchParams?.get('dogId')
    if (dogId && allDogs.length > 0) {
      const dog = allDogs.find(d => d.id === dogId)
      if (dog) selectDog(dog)
    }
  }, [searchParams, allDogs])

  useEffect(() => {
    if (!dogSearch.trim()) { setDogResults([]); setShowDropdown(false); return }
    const q = dogSearch.toLowerCase()
    const results = allDogs.filter(d =>
      d.dog_name.toLowerCase().includes(q) ||
      d.owner_name.toLowerCase().includes(q)
    )
    setDogResults(results)
    setShowDropdown(true)
  }, [dogSearch, allDogs])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectDog(dog: DogProfile) {
    setSelectedDog(dog)
    setDogSearch('')
    setShowDropdown(false)
    setForm(f => ({
      ...f,
      customer_name: dog.owner_name,
      dog_names: dog.dog_name,
      number_of_dogs: String(dog.number_of_dogs),
      rate_per_dog_day: String(dog.default_rate),
    }))
  }

  function clearDog() {
    setSelectedDog(null)
    setDogSearch('')
  }

  useEffect(() => {
    if (bookingId) {
      supabase.from('bookings').select('*').eq('id', bookingId).single().then(({ data }) => {
        if (data) {
          const b = data as Booking
          originalTimes.current = { arrival_time: b.arrival_time, departure_time: b.departure_time }
          setForm({
            customer_name: b.customer_name, dog_names: b.dog_names,
            number_of_dogs: String(b.number_of_dogs), rate_per_dog_day: String(b.rate_per_dog_day),
            arrival_date: b.arrival_date, arrival_time: b.arrival_time || '',
            departure_date: b.departure_date, departure_time: b.departure_time || '',
            dog_days_override: b.dog_days_override ? String(b.dog_days_override) : '',
            payment_type: b.payment_type, payment_status: b.payment_status,
            amount_received: String(b.amount_received), tip_amount: String(b.tip_amount || 0),
            status: b.status, cancellation_reason: b.cancellation_reason || '', notes: b.notes || ''
          })
        }
      })
    }
  }, [bookingId])

  useEffect(() => {
    const { arrival_date, departure_date, number_of_dogs, rate_per_dog_day, dog_days_override } = form
    if (!arrival_date || !departure_date) { setCalc(null); return }
    const n = parseInt(number_of_dogs) || 1
    const rate = parseFloat(rate_per_dog_day) || 0
    const ov = parseInt(dog_days_override) || 0
    const { days, dogDays } = calcDogDays(arrival_date, departure_date, n)
    const dd = ov || dogDays
    const splits = splitRevenueByMonth(arrival_date, departure_date, n, rate, ov || undefined)
    setCalc({ days, dogDays: dd, revenue: dd * rate, splits })
  }, [form.arrival_date, form.departure_date, form.number_of_dogs, form.rate_per_dog_day, form.dog_days_override])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  function goBack() {
    router.back()
  }

  async function save(addAnother = false) {
    if (!form.customer_name || !form.arrival_date || !form.departure_date) { alert('Fill required fields'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const n = parseInt(form.number_of_dogs) || 1
    const rate = parseFloat(form.rate_per_dog_day) || 0
    const ov = parseInt(form.dog_days_override) || null
    const { days, dogDays } = calcDogDays(form.arrival_date, form.departure_date, n)
    const dd = ov || dogDays
    const ma = splitRevenueByMonth(form.arrival_date, form.departure_date, n, rate, ov || undefined)
    const newArrivalTime = form.arrival_time || null
    const newDepartureTime = form.departure_time || null
    // If a time actually changed, clear its "reminder sent" flag so the new
    // time gets its own 15-min-before text instead of staying silenced.
    const arrivalTimeChanged = isEdit && newArrivalTime !== originalTimes.current.arrival_time
    const departureTimeChanged = isEdit && newDepartureTime !== originalTimes.current.departure_time
    const payload = {
      user_id: user.id,
      customer_name: form.customer_name,
      dog_names: form.dog_names,
      number_of_dogs: n,
      arrival_date: form.arrival_date,
      arrival_time: newArrivalTime,
      ...(arrivalTimeChanged ? { arrival_reminder_sent: false } : {}),
      departure_date: form.departure_date,
      departure_time: newDepartureTime,
      ...(departureTimeChanged ? { departure_reminder_sent: false } : {}),
      number_of_days: days,
      dog_days: dd,
      dog_days_override: ov,
      rate_per_dog_day: rate,
      total_revenue: dd * rate,
      payment_type: form.payment_type as any,
      payment_status: form.payment_status as any,
      amount_received: parseFloat(form.amount_received) || 0,
      tip_amount: parseFloat(form.tip_amount) || 0,
      status: form.status as any,
      cancellation_reason: form.cancellation_reason || null,
      notes: form.notes || null,
      month_allocations: ma,
      updated_at: new Date().toISOString(),
    }
    const { error } = isEdit
      ? await supabase.from('bookings').update(payload).eq('id', bookingId)
      : await supabase.from('bookings').insert({ ...payload, created_at: new Date().toISOString() })
    setSaving(false)
    if (error) {
      alert(`Couldn't save booking: ${error.message}\n\nIf this mentions "arrival_time" or "departure_time", the database migration for those columns hasn't been run yet in Supabase.`)
      return
    }
    if (addAnother) {
      // Reset form for another booking
      setForm({
        customer_name: '', dog_names: '', number_of_dogs: '1', rate_per_dog_day: '50',
        arrival_date: '', arrival_time: '', departure_date: '', departure_time: '', dog_days_override: '',
        payment_type: 'Rover', payment_status: 'unpaid', amount_received: '0',
        tip_amount: '0',
        status: 'active', cancellation_reason: '', notes: ''
      })
      setSelectedDog(null)
      setDogSearch('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      goBack()
    }
  }

  async function deleteBooking() {
    if (!confirm('Delete this booking?')) return
    await supabase.from('bookings').delete().eq('id', bookingId)
    goBack()
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">{isEdit ? 'Edit Booking' : 'New Booking'}</h1>
        <p className="text-sm text-gray-500">Schedule a dog care appointment</p>
      </div>

      {saved && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 font-medium">
          ✓ Booking saved! Fill in the form below to add another.
        </div>
      )}

      <div className="card max-w-2xl">
        {/* Dog search type-ahead */}
        {!isEdit && (
          <div className="mb-5 pb-5 border-b border-gray-100">
            <label className="label">Quick fill from dog profile</label>
            {selectedDog ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white flex items-center justify-center flex-shrink-0">
                  {selectedDog.photo_url
                    ? <img src={selectedDog.photo_url} alt={selectedDog.dog_name} className="w-full h-full object-cover" />
                    : <span className="text-2xl">🐾</span>
                  }
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-emerald-800">{selectedDog.dog_name}</div>
                  <div className="text-xs text-emerald-600">👤 {selectedDog.owner_name} · {selectedDog.number_of_dogs} dog{selectedDog.number_of_dogs !== 1 ? 's' : ''} · ${selectedDog.default_rate}/day</div>
                </div>
                <button className="btn text-xs py-2 px-3" onClick={clearDog}>Change</button>
              </div>
            ) : (
              <div className="relative" ref={searchRef}>
                <input
                  className="input pl-8 text-base sm:text-sm py-3 sm:py-2"
                  placeholder="Type a dog name to search profiles…"
                  value={dogSearch}
                  onChange={e => setDogSearch(e.target.value)}
                  onFocus={() => dogSearch && setShowDropdown(true)}
                />
                <span className="absolute left-2.5 top-3 sm:top-2.5 text-gray-400 text-xs">🔍</span>
                {showDropdown && dogResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1 max-h-64 overflow-y-auto">
                    {dogResults.map(d => (
                      <div key={d.id}
                        className="flex items-center gap-3 px-3 py-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 last:border-0"
                        onMouseDown={() => selectDog(d)}>
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                          {d.photo_url
                            ? <img src={d.photo_url} alt={d.dog_name} className="w-full h-full object-cover" />
                            : <span className="text-lg">🐾</span>
                          }
                        </div>
                        <div>
                          <div className="font-medium text-sm">{d.dog_name}</div>
                          <div className="text-xs text-gray-400">👤 {d.owner_name} · {d.number_of_dogs} dog{d.number_of_dogs !== 1 ? 's' : ''} · ${d.default_rate}/day</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showDropdown && dogResults.length === 0 && dogSearch.trim() && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1 px-3 py-3 text-sm text-gray-400">
                    No profiles found — fill in manually below or <a href="/dogs/new" className="text-emerald-600">add a new dog profile</a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div><label className="label">Customer Name *</label><input className="input text-base sm:text-sm" value={form.customer_name} onChange={set('customer_name')} placeholder="e.g. Smith" /></div>
          <div><label className="label">Dog Name(s)</label><input className="input text-base sm:text-sm" value={form.dog_names} onChange={set('dog_names')} placeholder="e.g. Max, Bella" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div><label className="label"># of Dogs *</label><input className="input text-base sm:text-sm" type="number" min="1" value={form.number_of_dogs} onChange={set('number_of_dogs')} /></div>
          <div><label className="label">Rate / Dog-Day ($) *</label><input className="input text-base sm:text-sm" type="number" value={form.rate_per_dog_day} onChange={set('rate_per_dog_day')} /></div>
          <div><label className="label">Override Dog-Days</label><input className="input text-base sm:text-sm" type="number" placeholder="Auto" value={form.dog_days_override} onChange={set('dog_days_override')} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Arrival Date *</label>
            <div className="flex gap-2">
              <input className="input text-base sm:text-sm flex-1" type="date" value={form.arrival_date} onChange={set('arrival_date')} />
              <input className="input text-base sm:text-sm w-28" type="time" value={form.arrival_time} onChange={set('arrival_time')} title="Arrival time (optional)" />
            </div>
          </div>
          <div>
            <label className="label">Departure Date *</label>
            <div className="flex gap-2">
              <input className="input text-base sm:text-sm flex-1" type="date" value={form.departure_date} onChange={set('departure_date')} />
              <input className="input text-base sm:text-sm w-28" type="time" value={form.departure_time} onChange={set('departure_time')} title="Departure time (optional)" />
            </div>
          </div>
        </div>

        {calc && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 mb-4 text-sm">
            <div className="flex gap-4 flex-wrap mb-1">
              <span>Days: <strong>{calc.days}</strong></span>
              <span>Dog-Days: <strong>{calc.dogDays}</strong></span>
              <span>Revenue: <strong>${calc.revenue.toLocaleString()}</strong></span>
            </div>
            {calc.splits.length > 1 && (
              <div className="text-xs text-emerald-700 mt-1">
                Split: {calc.splits.map(s => `${s.monthKey}: ${s.dogDays} dog-days = $${s.revenue}`).join(' | ')}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div><label className="label">Payment Type</label>
            <select className="input text-base sm:text-sm" value={form.payment_type} onChange={set('payment_type')}>
              <option>Rover</option><option>Venmo</option>
            </select>
          </div>
          <div><label className="label">Pay Status</label>
            <select className="input text-base sm:text-sm" value={form.payment_status} onChange={set('payment_status')}>
              <option>unpaid</option><option>partially paid</option><option>paid</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Expected Amount ($)</label>
            <input className="input text-base sm:text-sm" type="number" value={form.amount_received} onChange={set('amount_received')} />
            <div className="text-xs text-gray-400 mt-1">What you expect to receive after Rover's cut etc.</div>
          </div>
          <div>
            <label className="label">Tip ($)</label>
            <input className="input text-base sm:text-sm" type="number" value={form.tip_amount} onChange={set('tip_amount')} placeholder="0" />
            <div className="text-xs text-gray-400 mt-1">Added on top of expected amount.</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div><label className="label">Booking Status</label>
            <select className="input text-base sm:text-sm" value={form.status} onChange={set('status')}>
              <option>active</option><option>completed</option><option>cancelled</option>
            </select>
          </div>
          <div><label className="label">Cancellation Reason</label><input className="input text-base sm:text-sm" value={form.cancellation_reason} onChange={set('cancellation_reason')} placeholder="Optional" /></div>
        </div>
        <div className="mb-5"><label className="label">Notes</label><textarea className="input text-base sm:text-sm" rows={2} value={form.notes} onChange={set('notes')} placeholder="Any special notes…" /></div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn btn-primary justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={() => save(false)} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Booking' : 'Save Booking'}
          </button>
          {!isEdit && (
            <button className="btn justify-center py-3 sm:py-1.5 text-base sm:text-sm bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" onClick={() => save(true)} disabled={saving}>
              {saving ? 'Saving…' : '+ Save & Add Another'}
            </button>
          )}
          <button className="btn justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={goBack}>Cancel</button>
          {isEdit && <button className="btn btn-danger justify-center py-3 sm:py-1.5 text-base sm:text-sm sm:ml-auto" onClick={deleteBooking}>Delete</button>}
        </div>
      </div>
    </AppShell>
  )
}