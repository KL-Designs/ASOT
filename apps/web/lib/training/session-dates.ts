// 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat

export function nextWeekday(from: Date, targetDay: number): Date {
    const d = new Date(from)
    d.setHours(0, 0, 0, 0)
    const diff = ((targetDay - d.getDay()) + 7) % 7
    d.setDate(d.getDate() + (diff === 0 ? 7 : diff))
    return d
}

export function calculateSessionDates(session1Date: Date | string): Date[] {
    const s1 = new Date(session1Date)
    s1.setHours(0, 0, 0, 0)
    const s2 = nextWeekday(s1, 6) // next Sat
    const s3 = nextWeekday(s2, 3) // next Wed
    const s4 = nextWeekday(s3, 6) // next Sat
    const s5 = nextWeekday(s4, 3) // next Wed (catch-up)
    const s6 = nextWeekday(s5, 6) // next Sat (catch-up)
    return [s1, s2, s3, s4, s5, s6]
}

export const SESSION_DEFS = [
    { sessionNumber: 1, weekNumber: 1, title: 'Session 1 — Week 1',        catchUp: false },
    { sessionNumber: 2, weekNumber: 1, title: 'Session 2 — Week 1',        catchUp: false },
    { sessionNumber: 3, weekNumber: 2, title: 'Session 3 — Week 2',        catchUp: false },
    { sessionNumber: 4, weekNumber: 2, title: 'Session 4 — Week 2',        catchUp: false },
    { sessionNumber: 5, weekNumber: 3, title: 'Session 5 — Week 3 Catch-up', catchUp: true },
    { sessionNumber: 6, weekNumber: 3, title: 'Session 6 — Week 3 Catch-up', catchUp: true },
]
