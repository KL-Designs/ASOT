import type { SandboxHandler } from './sandbox'

/** What a step waits for before the tutorial moves on. */
export type StepAdvance =
    /** The member presses Next. The default. */
    | { type: 'next' }
    /** The member clicks the step's target (or `selector`, if given). */
    | { type: 'click'; selector?: string }
    /** An element appears, e.g. a dialog opening. */
    | { type: 'visible'; selector: string }
    /** The member makes a (sandboxed) change matching this method and path. */
    | { type: 'write'; method?: string; path: RegExp; test?: (body: any) => boolean }

export interface TutorialContext {
    /** The page the tutorial was started from, e.g. '/dashboard/j3'. */
    startedFrom: string
    userId?: string
}

export interface TutorialStep {
    title: string
    /** One or more short paragraphs. */
    body: string | string[]
    /** CSS selector of the element to point at. Omitted: a centred card. */
    target?: string
    /** Make sure the member is on this page first. Query params listed here must match; others are ignored. */
    path?: string | ((ctx: TutorialContext) => string)
    advance?: StepAdvance
    /** Shown under the body while waiting for the member to act. */
    hint?: string
    /**
     * Skip this step when this selector is not on the page once the target has
     * appeared. For controls only some members get (e.g. leads), so a member
     * without them is not left waiting on something they cannot click.
     */
    requires?: string
}

export interface Tutorial {
    id: string
    title: string
    /** One line for menus and the help wiki. */
    summary: string
    /** Where it lives, e.g. 'J1 Recruitment'. */
    area: string
    /** Path prefixes whose Tutorial button lists this tutorial. */
    pages: string[]
    /** Where the tutorial begins. A function can pick based on where it was started. */
    startPath: string | ((ctx: TutorialContext) => string)
    /**
     * The sandbox handlers for one run. A function so each run starts from fresh
     * practice state; the handlers close over that state.
     */
    sandbox?: (ctx: TutorialContext) => SandboxHandler[]
    steps: TutorialStep[]
}

/** The part of a tutorial safe to list anywhere (help wiki, menus) without loading its steps. */
export type TutorialSummary = Pick<Tutorial, 'id' | 'title' | 'summary' | 'area' | 'pages'>
