'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { calcDogDays, splitRevenueByMonth } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

interface DogProfile {
  id: string
  dog_name: string
  owner_name: string
  number_of_dogs: number
  default_rate: number
  photo_url: string | null
}

export default function QuickAddPage() {
  const [step, setStep] = useState<'search' | 'dates' | 'payment' | 'done'>('search')
  const [allDogs, setAllDogs] = useState<DogProfile[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDog, setSelectedDog] = useState<DogProfile | null>(null)
  const [arrivalDate, setArrivalDate] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [paymentType, setPaymentType] = useState('Rover')
  const [amountReceived, setAmountReceived] = useState('0')
  const [paymentStatus, setPaymentStatus] = useState('unpaid')
  const [saving, setSaving] = useState(false)
  const [savedBookingId, setSavedBookingId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data } = await supabase.from('dogs').select('*').eq('user_id', session.user.id).order('dog_name')
      setAllDogs(data || [])
    }
    load()
  }, [])

  // Set today as default arrival
  useEffect(() => {
    const today = new Date()
    const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    setArrivalDate(str)
    setDepartureDate(str)
  }, [])

  const filteredDogs = searchQuery.trim()
    ? allDogs.filter(d =>
        d.dog_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.owner_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allDogs

  const calc = arrivalDate && departureDate && selectedDog
    ? (() => {
        const { days, dogDays } = calcDogDays(arrivalDate, departureDate, selectedDog.number_of_dogs)
        return { days, dogDays, revenue: dogDays * selectedDog.default_rate }
      })()
    : null

  async function save(addAnother = false) {
    if (!selectedDog || !arrivalDate || !departureDate) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const { days, dogDays } = calcDogDays(arrivalDate, departureDate, selectedDog.number_of_dogs)
    const rate = selectedDog.default_rate
    const ma = splitRevenueByMonth(arrivalDate, departureDate, selectedDog.number_of_dogs, rate)

    const { data } = await supabase.from('bookings').insert({
      user_id: session.user.id,
      customer_name: selectedDog.owner_name,
      dog_names: selectedDog.dog_name,
      number_of_dogs: selectedDog.number_of_dogs,
      arrival_date: arrivalDate,
      departure_date: departureDate,
      number_of_days: days,
      dog_days: dogDays,
      dog_days_override: null,
      rate_per_dog_day: rate,
      total_revenue: dogDays * rate,
      payment_type: paymentType,
      payment_status: paymentStatus,
      amount_received: parseFloat(amountReceived) || 0,
      status: 'active',
      month_allocations: ma,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()

    setSaving(false)

    if (addAnother) {
      setStep('search')
      setSelectedDog(null)
      setSearchQuery('')
      setArrivalDate(arrivalDate)
      setDepartureDate(departureDate)
      setAmountReceived('0')
      setPaymentStatus('unpaid')
      setSavedBookingId(data?.id || null)
      setStep('done')
      setTimeout(() => {
        setSavedBookingId(null)
        setStep('search')
        setSelectedDog(null)
        setSearchQuery('')
      }, 1500)
    } else {
      router.push('/bookings')
    }
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="btn py-1.5 px-2 text-xs">← Back</button>
        <div>
          <h1 className="text-xl font-semibold">Quick Add Booking</h1>
          <p className="text-xs text-gray-400">Fast booking for your phone</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex gap-2 mb-5">
        {['search', 'dates', 'payment'].map((s, i) => (
          <div key={s} className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            step === s ? 'bg-emerald-500 text-white' :
            ['search', 'dates', 'payment'].indexOf(step) > i ? 'bg-emerald-100 text-emerald-700' :
            'bg-gray-100 text-gray-400'
          }`}>
            {i + 1}. {s === 'search' ? 'Dog' : s === 'dates' ? 'Dates' : 'Payment'}
          </div>
        ))}
      </div>

      {step === 'done' && savedBookingId && (
        <div className="card bg-emerald-50 border-emerald-200 text-center py-8">
          <div className="text-4xl mb-2">✅</div>
          <div className="font-semibold text-emerald-700">Booking saved!</div>
          <div className="text-sm text-emerald-600 mt-1">Adding another…</div>
        </div>
      )}

      {/* Step 1 — Search dog */}
      {step === 'search' && (
        <div className="card">
          <label className="label text-base mb-2">Which dog? 🐾</label>
          <input
            className="input text-base mb-3 py-3"
            placeholder="Type dog or owner name…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredDogs.length === 0 ? (
              <div className="text-center text-gray-400 py-6 text-sm">
                No profiles found. <button className="text-emerald-600" onClick={() => router.push('/dogs/new')}>Add a dog profile →</button>
              </div>
            ) : filteredDogs.map(d => (
              <button key={d.id} onClick={() => { setSelectedDog(d); setStep('dates') }}
                className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-emerald-50 rounded-xl border border-gray-100 hover:border-emerald-200 transition-all text-left">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-white flex-shrink-0 flex items-center justify-center border border-gray-100">
                  {d.photo_url
                    ? <img src={d.photo_url} alt={d.dog_name} className="w-full h-full object-cover" />
                    : <span className="text-2xl">🐾</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base">{d.dog_name}</div>
                  <div className="text-sm text-gray-500">👤 {d.owner_name} · {d.number_of_dogs} dog{d.number_of_dogs !== 1 ? 's' : ''} · ${d.default_rate}/day</div>
                </div>
                <span className="text-emerald-500 text-lg">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Dates */}
      {step === 'dates' && selectedDog && (
        <div className="card">
          {/* Selected dog summary */}
          <div className="flex items-center gap-3 mb-5 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-white flex-shrink-0 flex items-center justify-center border border-emerald-100">
              {selectedDog.photo_url
                ? <img src={selectedDog.photo_url} alt={selectedDog.dog_name} className="w-full h-full object-cover" />
                : <span className="text-2xl">🐾</span>
              }
            </div>
            <div className="flex-1">
              <div className="font-semibold">{selectedDog.dog_name}</div>
              <div className="text-sm text-emerald-700">👤 {selectedDog.owner_name} · ${selectedDog.default_rate}/day</div>
            </div>
            <button onClick={() => { setSelectedDog(null); setStep('search') }} className="btn text-xs py-1 px-2">Change</button>
          </div>

          <div className="grid grid-cols-1 gap-4 mb-4">
            <div>
              <label className="label text-base">Arrival Date</label>
              <input className="input text-base py-3" type="date" value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} />
            </div>
            <div>
              <label className="label text-base">Departure Date</label>
              <input className="input text-base py-3" type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} />
            </div>
          </div>

          {calc && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-2xl font-bold text-emerald-700">{calc.days}</div>
                  <div className="text-xs text-gray-500">Days</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-700">{calc.dogDays}</div>
                  <div className="text-xs text-gray-500">Dog-Days</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-700">${calc.revenue}</div>
                  <div className="text-xs text-gray-500">Revenue</div>
                </div>
              </div>
            </div>
          )}

          <button
            className="btn btn-primary w-full justify-center py-4 text-base"
            onClick={() => setStep('payment')}
            disabled={!arrivalDate || !departureDate}>
            Next: Payment →
          </button>
        </div>
      )}

      {/* Step 3 — Payment */}
      {step === 'payment' && selectedDog && calc && (
        <div className="card">
          <div className="flex items-center gap-3 mb-5 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white flex-shrink-0 flex items-center justify-center border border-emerald-100">
              {selectedDog.photo_url
                ? <img src={selectedDog.photo_url} alt={selectedDog.dog_name} className="w-full h-full object-cover" />
                : <span className="text-lg">🐾</span>
              }
            </div>
            <div className="flex-1 text-sm">
              <span className="font-semibold">{selectedDog.dog_name}</span>
              <span className="text-gray-500 ml-2">{arrivalDate} → {departureDate}</span>
            </div>
            <span className="font-bold text-emerald-700">${calc.revenue}</span>
          </div>

          <div className="mb-4">
            <label className="label text-base">Payment Type</label>
            <div className="grid grid-cols-2 gap-3">
              {['Rover', 'Venmo'].map(t => (
                <button key={t} onClick={() => setPaymentType(t)}
                  className={`py-3 rounded-xl border-2 font-medium text-base transition-all ${
                    paymentType === t ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="label text-base">Pay Status</label>
            <div className="grid grid-cols-3 gap-2">
              {[['unpaid', 'Unpaid'], ['partially paid', 'Partial'], ['paid', 'Paid ✓']].map(([val, label]) => (
                <button key={val} onClick={() => {
                  setPaymentStatus(val)
                  if (val === 'paid') setAmountReceived(String(calc.revenue))
                  if (val === 'unpaid') setAmountReceived('0')
                }}
                  className={`py-3 rounded-xl border-2 font-medium text-sm transition-all ${
                    paymentStatus === val ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="label text-base">Amount Received ($)</label>
            <input className="input text-xl py-3 font-semibold" type="number" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} />
          </div>

          <div className="flex flex-col gap-3">
            <button className="btn btn-primary w-full justify-center py-4 text-base" onClick={() => save(false)} disabled={saving}>
              {saving ? 'Saving…' : '✓ Save Booking'}
            </button>
            <button className="btn w-full justify-center py-4 text-base bg-emerald-50 text-emerald-700 border-emerald-200" onClick={() => save(true)} disabled={saving}>
              {saving ? 'Saving…' : '+ Save & Add Another'}
            </button>
            <button className="btn w-full justify-center py-3 text-sm" onClick={() => setStep('dates')}>
              ← Back to Dates
            </button>
          </div>
        </div>
      )}
    </AppShell>
  )
}