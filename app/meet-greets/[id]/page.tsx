'use client'
import { Suspense } from 'react'
import MeetGreetForm from '@/components/MeetGreetForm'

export default function EditMeetGreetPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>}>
      <MeetGreetForm meetGreetId={params.id} />
    </Suspense>
  )
}
