'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { useRouter, useSearchParams } from 'next/navigation'

interface DogFormData {
  dog_name: string
  owner_name: string
  owner_phone: string
  number_of_dogs: string
  default_rate: string
  notes: string
}

interface BookingSuggestion {
  dog_names: string
  customer_name: string
  number_of_dogs: number
  rate_per_dog_day: number
}

export default function DogFormContent({ dogId }: { dogId?: string }) {
  const isEdit = !!dogId
  const [form, setForm] = useState<DogFormData>({
    dog_name: '', owner_name: '', owner_phone: '',
    number_of_dogs: '1', default_rate: '50', notes: ''
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [allBookings, setAllBookings] = useState<BookingSuggestion[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFromSearch, setSelectedFromSearch] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Pre-fill from URL params (when coming from calendar click)
  useEffect(() => {
    if (!isEdit) {
      const dogName = searchParams?.get('dogName')
      const customerName = searchParams?.get('customerName')
      const numDogs = searchParams?.get('numDogs')
      const rate = searchParams?.get('rate')
      if (dogName) {
        setForm(f => ({
          ...f,
          dog_name: dogName || '',
          owner_name: customerName && customerName.toLowerCase() !== 'imported' ? customerName : '',
          number_of_dogs: numDogs || '1',
          default_rate: rate || '50',
        }))
        setSelectedFromSearch(true)
      }
    }
  }, [searchParams, isEdit])

  useEffect(() => {
    async function loadBookings() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data } = await supabase
        .from('bookings')
        .select('dog_names, customer_name, number_of_dogs, rate_per_dog_day')
        .eq('user_id', session.user.id)
        .neq('status', 'cancelled')
      if (!data) return
      const seen = new Set<string>()
      const unique = data.filter(b => {
        const key = `${(b.dog_names || '').trim()}|||${(b.customer_name || '').trim()}`
        if (!(b.dog_names || '').trim()) return false
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).sort((a, b) => {
        const aImp = (a.customer_name || '').toLowerCase() === 'imported'
        const bImp = (b.customer_name || '').toLowerCase() === 'imported'
        if (aImp && !bImp) return 1
        if (!aImp && bImp) return -1
        return (a.dog_names || '').localeCompare(b.dog_names || '')
      })
      setAllBookings(unique)
    }
    loadBookings()
  }, [])

  useEffect(() => {
    if (dogId) {
      supabase.from('dogs').select('*').eq('id', dogId).single().then(({ data }) => {
        if (data) {
          setForm({
            dog_name: data.dog_name || '',
            owner_name: data.owner_name || '',
            owner_phone: data.owner_phone || '',
            number_of_dogs: String(data.number_of_dogs || 1),
            default_rate: String(data.default_rate || 50),
            notes: data.notes || ''
          })
          setExistingPhoto(data.photo_url || null)
        }
      })
    }
  }, [dogId])

  const suggestions = searchQuery.trim().length > 0
    ? allBookings.filter(b =>
        (b.dog_names || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  function selectSuggestion(b: BookingSuggestion) {
    setForm(f => ({
      ...f,
      dog_name: b.dog_names,
      owner_name: (b.customer_name || '').toLowerCase() !== 'imported' ? b.customer_name : f.owner_name,
      number_of_dogs: String(b.number_of_dogs),
      default_rate: String(b.rate_per_dog_day),
    }))
    setSearchQuery('')
    setSelectedFromSearch(true)
  }

  const set = (k: keyof DogFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function save() {
    if (!form.dog_name) { alert('Dog name is required'); return }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    let photoUrl = existingPhoto

    if (photo) {
      const ext = photo.name.split('.').pop()
      const path = `${session.user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('dog-photos').upload(path, photo)
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('dog-photos').getPublicUrl(path)
        photoUrl = publicUrl
      }
    }

    const payload = {
      user_id: session.user.id,
      dog_name: form.dog_name,
      owner_name: form.owner_name,
      owner_phone: form.owner_phone,
      number_of_dogs: parseInt(form.number_of_dogs) || 1,
      default_rate: parseFloat(form.default_rate) || 50,
      notes: form.notes || null,
      photo_url: photoUrl,
      updated_at: new Date().toISOString()
    }

    if (isEdit) {
      await supabase.from('dogs').update(payload).eq('id', dogId)
    } else {
      await supabase.from('dogs').insert({ ...payload, created_at: new Date().toISOString() })
    }

    setSaving(false)
    router.push('/dogs')
  }

  async function deleteDog() {
    if (!confirm('Delete this dog profile?')) return
    await supabase.from('dogs').delete().eq('id', dogId)
    router.push('/dogs')
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">{isEdit ? 'Edit Dog Profile' : 'New Dog Profile'}</h1>
        <p className="text-sm text-gray-500">
          {isEdit ? 'Update this dog profile' : 'Search your existing bookings to pre-fill this form'}
        </p>
      </div>

      <div className="card max-w-lg">
        {/* Photo upload */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-5">
          <div className="w-28 h-28 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-emerald-50 flex items-center justify-center border-2 border-dashed border-emerald-200 flex-shrink-0">
            {photoPreview || existingPhoto ? (
              <img src={photoPreview || existingPhoto!} alt="Dog" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl sm:text-3xl">🐾</span>
            )}
          </div>
          <div className="text-center sm:text-left">
            <label className="btn btn-primary cursor-pointer py-3 px-5 sm:py-1.5 sm:px-3 text-base sm:text-xs">
              📷 {photoPreview || existingPhoto ? 'Change Photo' : 'Upload Photo'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </label>
            <div className="text-xs text-gray-400 mt-1">Tap to use camera or choose from library</div>
          </div>
        </div>

        {/* Pre-filled banner */}
        {selectedFromSearch && !searchQuery && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 font-medium">
            ✓ Pre-filled from booking — review and edit below, then upload a photo
          </div>
        )}

        {/* Search section - only when creating new */}
        {!isEdit && (
          <div className="mb-5 pb-5 border-b border-gray-100">
            <label className="label">Search existing bookings</label>
            <input
              className="input text-base sm:text-sm mb-2"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedFromSearch(false) }}
              placeholder={`Search ${allBookings.length} bookings by dog or owner name…`}
            />
            {searchQuery.trim().length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {suggestions.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-400 bg-white">
                    No matches for "{searchQuery}"
                  </div>
                ) : suggestions.map((b, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectSuggestion(b)}
                    className="w-full flex items-center justify-between px-3 py-3 bg-white hover:bg-emerald-50 border-b border-gray-50 last:border-0 text-left transition-colors">
                    <div>
                      <div className="font-medium text-sm">{b.dog_names}</div>
                      <div className="text-xs text-gray-400">
                        👤 {(b.customer_name || '').toLowerCase() === 'imported' ? '⚠️ No owner name saved' : b.customer_name}
                        · {b.number_of_dogs} dog{b.number_of_dogs !== 1 ? 's' : ''}
                        · ${b.rate_per_dog_day}/day
                      </div>
                    </div>
                    <span className="text-xs text-emerald-600 font-semibold ml-2 whitespace-nowrap">Use →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Form fields */}
        <div className="mb-4">
          <label className="label">Dog Name(s) *</label>
          <input className="input text-base sm:text-sm" value={form.dog_name} onChange={set('dog_name')} placeholder="e.g. Charlie or Mable & Piper" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Number of Dogs</label>
            <input className="input text-base sm:text-sm" type="number" min="1" value={form.number_of_dogs} onChange={set('number_of_dogs')} />
          </div>
          <div>
            <label className="label">Default Rate ($/day)</label>
            <input className="input text-base sm:text-sm" type="number" value={form.default_rate} onChange={set('default_rate')} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Owner Name</label>
            <input className="input text-base sm:text-sm" value={form.owner_name} onChange={set('owner_name')} placeholder="e.g. Smith" />
          </div>
          <div>
            <label className="label">Owner Phone</label>
            <input className="input text-base sm:text-sm" type="tel" value={form.owner_phone} onChange={set('owner_phone')} placeholder="e.g. 617-555-1234" />
          </div>
        </div>

        <div className="mb-5">
          <label className="label">Notes</label>
          <textarea className="input text-base sm:text-sm" rows={3} value={form.notes} onChange={set('notes')} placeholder="e.g. Anxious around other dogs, needs extra attention…" />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn btn-primary justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
          <button className="btn justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={() => router.push('/dogs')}>
            Cancel
          </button>
          {isEdit && (
            <button className="btn btn-danger justify-center py-3 sm:py-1.5 text-base sm:text-sm sm:ml-auto" onClick={deleteDog}>
              Delete
            </button>
          )}
        </div>
      </div>
    </AppShell>
  )
}