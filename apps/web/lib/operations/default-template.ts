/**
 * What a brand-new mission starts with.
 *
 * J2 leads can mark one saved template as the default. A new mission then
 * opens with that template's sections and pages instead of empty, so every
 * mission maker starts from the layout the department has settled on rather
 * than from whichever old mission they last duplicated.
 *
 * Pure, so the one decision here that is easy to get wrong — the two system
 * pages — is tested rather than trusted.
 */

type TemplateContent = Pick<OperationTemplate, 'sections' | 'pages' | 'extraPageSections'>

export type NewMissionContent = {
    sections?: OperationSection[]
    pages: OperationPage[]
    extraPageSections?: Record<string, OperationSection[]>
}

/**
 * The content for a new mission.
 *
 * Every mission has a Zeus Notes page and an OCAP page: the editor and the
 * orders themes both look for them by `pageType`. A template saved from an old
 * mission, or from one where somebody deleted either page, may not carry them,
 * so they are added back here when missing rather than left for a mission
 * maker to discover weeks later that their mission has nowhere to link a
 * recording.
 *
 * `newId` is passed in rather than imported so this file stays free of the
 * mongodb driver, and so a test can supply predictable ids.
 */
export function newMissionContent(template: TemplateContent | null | undefined, newId: () => string): NewMissionContent {
    const pages: OperationPage[] = [...(template?.pages ?? [])]

    if (!pages.some(p => p.pageType === 'zeus')) {
        pages.push({ id: newId(), title: 'Zeus Notes', isMain: false, pageType: 'zeus', pageColor: '' })
    }
    if (!pages.some(p => p.pageType === 'ocap')) {
        pages.push({ id: newId(), title: 'OCAP', isMain: false, pageType: 'ocap', pageColor: '#10b981' })
    }

    return {
        ...(template?.sections?.length ? { sections: template.sections } : {}),
        pages,
        ...(template?.extraPageSections ? { extraPageSections: template.extraPageSections } : {}),
    }
}
