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
  const [form, setForm] = useState({
    dog_name: '',
    owner_name: '',
    arrival_date: '',
    arrival_time: '',
    departure_date: '',
    departure_time: '',
    expected_amount: '45',
    payment_type: 'Rover',
  })
  const [allDogs, setAllDogs] = useState<DogProfile[]>([])
  const [suggestions, setSuggestions] = useState<DogProfile[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedDog, setSelectedDog] = useState<DogProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const today = new Date()
    const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    setForm(f => ({ ...f, arrival_date: str, departure_date: str }))

    async function loadDogs() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data } = await supabase.from('dogs').select('*').eq('user_id', session.user.id).order('dog_name')
      setAllDogs(data || [])
    }
    loadDogs()
  }, [])

  function handleDogNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setForm(f => ({ ...f, dog_name: val }))
    setSelectedDog(null)
    if (!val.trim()) { setSuggestions([]); setShowSuggestions(false); return }
    const q = val.toLowerCase()
    const matches = allDogs.filter(d =>
      d.dog_name.toLowerCase().includes(q) ||
      d.owner_name.toLowerCase().includes(q)
    )
    setSuggestions(matches)
    setShowSuggestions(matches.length > 0)
  }

  function selectDog(dog: DogProfile) {
    setSelectedDog(dog)
    setForm(f => ({
      ...f,
      dog_name: dog.dog_name,
      owner_name: dog.owner_name,
      expected_amount: String(dog.default_rate),
    }))
    setSuggestions([])
    setShowSuggestions(false)
  }

  function clearDog() {
    setSelectedDog(null)
    setForm(f => ({ ...f, dog_name: '', owner_name: '', expected_amount: '45' }))
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const calc = form.arrival_date && form.departure_date
    ? (() => {
        const numDogs = selectedDog ? selectedDog.number_of_dogs : 1
        const { days, dogDays } = calcDogDays(form.arrival_date, form.departure_date, numDogs)
        const revenue = dogDays * (parseFloat(form.expected_amount) || 0)
        return { days, dogDays, revenue, numDogs }
      })()
    : null

  async function save(addAnother = false) {
    if (!form.dog_name || !form.arrival_date || !form.departure_date) {
      alert('Dog name and dates are required')
      return
    }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const rate = parseFloat(form.expected_amount) || 45
    const numDogs = selectedDog ? selectedDog.number_of_dogs : 1
    const { days, dogDays } = calcDogDays(form.arrival_date, form.departure_date, numDogs)
    const totalExpected = dogDays * rate
    const ma = splitRevenueByMonth(form.arrival_date, form.departure_date, numDogs, rate)

    await supabase.from('bookings').insert({
      user_id: session.user.id,
      customer_name: form.owner_name || 'Imported',
      dog_names: form.dog_name,
      number_of_dogs: numDogs,
      arrival_date: form.arrival_date,
      arrival_time: form.arrival_time || null,
      departure_date: form.departure_date,
      departure_time: form.departure_time || null,
      number_of_days: days,
      dog_days: dogDays,
      dog_days_override: null,
      rate_per_dog_day: rate,
      total_revenue: totalExpected,
      payment_type: form.payment_type,
      payment_status: 'unpaid',
      amount_received: totalExpected,
      status: 'active',
      month_allocations: ma,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    setSaving(false)

    if (addAnother) {
      const today = new Date()
      const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      setForm(f => ({ ...f, dog_name: '', owner_name: '', arrival_date: str, arrival_time: '', departure_date: str, departure_time: '', expected_amount: '45' }))
      setSelectedDog(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      router.push('/bookings')
    }
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="btn py-1.5 px-2 text-xs">← Back</button>
        <div>
          <h1 className="text-xl font-semibold">⚡ Quick Add Booking</h1>
          <p className="text-xs text-gray-400">Just the essentials</p>
        </div>
      </div>

      {saved && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-medium">
          ✓ Booking saved! Ready for another.
        </div>
      )}

      <div className="card max-w-lg">

        {/* Dog name with profile search */}
        <div className="mb-4">
          <label className="label text-sm">Dog Name *</label>
          {selectedDog ? (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white flex-shrink-0 flex items-center justify-center border border-emerald-100">
                {selectedDog.photo_url
                  ? <img src={selectedDog.photo_url} alt={selectedDog.dog_name} className="w-full h-full object-cover" />
                  : <span className="text-lg">🐾</span>
                }
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm text-emerald-800">{selectedDog.dog_name}</div>
                <div className="text-xs text-emerald-600">👤 {selectedDog.owner_name} · {selectedDog.number_of_dogs} dog{selectedDog.number_of_dogs !== 1 ? 's' : ''} · ${selectedDog.default_rate}/day</div>
              </div>
              <button className="btn text-xs py-1.5 px-3" onClick={clearDog}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <input
                className="input text-base py-3"
                value={form.dog_name}
                onChange={handleDogNameChange}
                placeholder="Type to search profiles or enter new name…"
                autoFocus
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 mt-1 max-h-56 overflow-y-auto">
                  {suggestions.map(d => (
                    <button key={d.id} type="button"
                      onClick={() => selectDog(d)}
                      className="w-full flex items-center gap-3 px-3 py-3 hover:bg-emerald-50 border-b border-gray-50 last:border-0 text-left transition-colors">
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                        {d.photo_url
                          ? <img src={d.photo_url} alt={d.dog_name} className="w-full h-full object-cover" />
                          : <span className="text-sm">🐾</span>
                        }
                      </div>
                      <div>
                        <div className="font-medium text-sm">{d.dog_name}</div>
                        <div className="text-xs text-gray-400">👤 {d.owner_name} · {d.number_of_dogs} dog{d.number_of_dogs !== 1 ? 's' : ''} · ${d.default_rate}/day</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Owner name */}
        <div className="mb-4">
          <label className="label text-sm">Owner Name <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            className="input text-base py-3"
            value={form.owner_name}
            onChange={set('owner_name')}
            placeholder="e.g. Shae"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label text-sm">Arrival</label>
            <input className="input text-base py-3" type="date" value={form.arrival_date} onChange={set('arrival_date')} />
          </div>
          <div>
            <label className="label text-sm">Departure</label>
            <input className="input text-base py-3" type="date" value={form.departure_date} onChange={set('departure_date')} />
          </div>
        </div>

        {/* Times (optional) */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label text-sm">Arrival Time <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input text-base py-3" type="time" value={form.arrival_time} onChange={set('arrival_time')} />
          </div>
          <div>
            <label className="label text-sm">Departure Time <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input text-base py-3" type="time" value={form.departure_time} onChange={set('departure_time')} />
          </div>
        </div>

        {/* Expected Amount */}
        <div className="mb-4">
          <label className="label text-sm">Expected Amount ($/day)</label>
          <input className="input text-base py-3" type="number" value={form.expected_amount} onChange={set('expected_amount')} />
        </div>

        {/* Payment type */}
        <div className="mb-5">
          <label className="label text-sm">Payment Type</label>
          <div className="grid grid-cols-2 gap-3">
            {['Rover', 'Venmo'].map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, payment_type: t }))}
                className={`py-3 rounded-xl border-2 font-semibold text-base transition-all ${
                  form.payment_type === t
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Revenue preview */}
        {calc && calc.revenue > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-5 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xl font-bold text-emerald-700">{calc.days}</div>
              <div className="text-xs text-gray-500">Days</div>
            </div>
            <div>
              <div className="text-xl font-bold text-emerald-700">{calc.dogDays}</div>
              <div className="text-xs text-gray-500">Dog-Days</div>
            </div>
            <div>
              <div className="text-xl font-bold text-emerald-700">${calc.revenue}</div>
              <div className="text-xs text-gray-500">Expected</div>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            className="btn btn-primary w-full justify-center py-4 text-base font-semibold"
            onClick={() => save(false)}
            disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Booking'}
          </button>
          <button
            className="btn w-full justify-center py-4 text-base bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            onClick={() => save(true)}
            disabled={saving}>
            {saving ? 'Saving…' : '+ Save & Add Another'}
          </button>
          <button
            className="btn w-full justify-center py-3 text-sm text-gray-500"
            onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </div>
    </AppShell>
  )
}