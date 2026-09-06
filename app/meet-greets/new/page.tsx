import { Suspense } from 'react'
import MeetGreetForm from '@/components/MeetGreetForm'

export default function NewMeetGreetPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>}>
      <MeetGreetForm />
    </Suspense>
  )
}
