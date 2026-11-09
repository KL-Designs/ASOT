import type { Tutorial, TutorialSummary } from './types'
import { j1ApplicationsTutorial } from './tutorials/j1-applications'
import { deptTicketsTutorial } from './tutorials/dept-tickets'

/**
 * Every guided tutorial. To add one: write it under ./tutorials, list it here,
 * put `data-tour` attributes on the elements its steps point at, and add a
 * <TutorialButton /> to the page if it is not already there. See README.md.
 */
export const TUTORIAL_DEFINITIONS: Tutorial[] = [
    j1ApplicationsTutorial,
    deptTicketsTutorial,
]

/** Safe to list anywhere (the help wiki links to these by id). */
export const TUTORIALS: TutorialSummary[] = TUTORIAL_DEFINITIONS.map(({ id, title, summary, area, pages }) => ({ id, title, summary, area, pages }))

export function getTutorial(id: string) {
    return TUTORIAL_DEFINITIONS.find(t => t.id === id)
}

/** Tutorials whose button should show on this path. */
export function tutorialsForPath(pathname: string) {
    return TUTORIAL_DEFINITIONS.filter(t => t.pages.some(p => pathname === p || pathname.startsWith(p + '/')))
}

/** The window event the help wiki fires to start one. */
export const TUTORIAL_START_EVENT = 'asot:tutorial-start'
