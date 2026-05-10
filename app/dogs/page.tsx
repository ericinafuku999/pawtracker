'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Dog {
  id: string
  dog_name: string
  owner_name: string
  owner_phone: string
  number_of_dogs: number
  default_rate: number
  photo_url: string | null
  notes: string | null
}

export default function DogsPage() {
  const [dogs, setDogs] = useState<Dog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('dogs').select('*').eq('user_id', user.id).order('dog_name')
    setDogs(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = dogs.filter(d =>
    d.dog_name.toLowerCase().includes(search.toLowerCase()) ||
    d.owner_name.toLowerCase().includes(search.toLowerCase())
  )

  async function deleteDog(id: string) {
    if (!confirm('Delete this dog profile?')) return
    await supabase.from('dogs').delete().eq('id', id)
    load()
  }

  return (
    <AppShell>
      <div className="flex justify-between items-start mb-5">
        <div><h1 className="text-xl font-semibold">Dog Profiles</h1><p className="text-sm text-gray-500">All dogs and their owners</p></div>
        <Link href="/dogs/new" className="btn btn-primary text-xs md:text-sm">+ Add Dog</Link>
      </div>

      <div className="relative max-w-xs mb-5">
        <input className="input w-full pl-8 text-sm" placeholder="Search by dog or owner name…" value={search} onChange={e => setSearch(e.target.value)} />
        <span className="absolute left-2.5 top-2.5 text-gray-400 text-xs">🔍</span>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🐾</div>
          <div className="font-medium text-gray-600 mb-1">No dog profiles yet</div>
          <div className="text-sm text-gray-400 mb-4">Add your first dog to enable quick booking</div>
          <Link href="/dogs/new" className="btn btn-primary">+ Add Dog</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filtered.map(d => (
            <div key={d.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-emerald-50 flex-shrink-0 flex items-center justify-center border border-emerald-100">
                  {d.photo_url ? (
                    <img src={d.photo_url} alt={d.dog_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">🐾</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base truncate">{d.dog_name}</div>
                  <div className="text-sm text-gray-500 truncate">👤 {d.owner_name}</div>
                  {d.owner_phone && <div className="text-xs text-gray-400 mt-0.5">📞 {d.owner_phone}</div>}
                  <div className="flex gap-2 mt-1 text-xs text-gray-400">
                    <span>{d.number_of_dogs} dog{d.number_of_dogs !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>${d.default_rate}/day</span>
                  </div>
                </div>
              </div>
              {d.notes && (
                <div className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-2 line-clamp-2">{d.notes}</div>
              )}
              <div className="flex gap-2 mt-3">
                <button className="btn text-xs flex-1 justify-center py-2" onClick={() => router.push(`/dogs/${d.id}`)}>Edit</button>
                <Link href={`/bookings/new?dogId=${d.id}`} className="btn btn-primary text-xs flex-1 justify-center py-2">+ Book</Link>
                <button className="btn btn-danger text-xs py-2 px-3" onClick={() => deleteDog(d.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}