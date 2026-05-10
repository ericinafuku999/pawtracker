'use client'
import { Suspense } from 'react'
import DogFormContent from '@/components/DogForm'

export default function EditDogPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>}>
      <DogFormContent dogId={params.id} />
    </Suspense>
  )
}