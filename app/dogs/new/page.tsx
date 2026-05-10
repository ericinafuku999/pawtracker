'use client'
import { Suspense } from 'react'
import DogFormContent from '@/components/DogForm'

export default function NewDogPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>}>
      <DogFormContent />
    </Suspense>
  )
}