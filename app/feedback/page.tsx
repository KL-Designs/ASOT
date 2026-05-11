import { redirect } from 'next/navigation'

export default function FeedbackRedirect() {
    redirect('/community/tickets')
}
