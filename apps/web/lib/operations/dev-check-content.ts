/**
 * What each development gate actually asks for.
 *
 * Lifted out of PreProductionPanel, where it was a module constant only the
 * completion modal could reach — so the only way to read a gate's requirements
 * was to open the dialog that signs it off. The ribbon's pre-production
 * inspector lists them inline, which is what this move is for.
 *
 * Unit policy, so it stays in apps/web rather than the shared root `lib/` —
 * see lib/README.md on what does and does not belong there.
 */
export const DEV_CHECK_CONTENT: Record<'campaign' | 'single', Record<string, string[]>> = {
    campaign: {
        w16: [
            'Mission concept/idea submitted to J2',
            'Initial discussion completed with team leads',
        ],
        w12: [
            'Confirmed mission development has started',
            'Initial planning document created',
            'First mission scenario and orders started',
            'J2 lead briefed on mission concept',
        ],
        w10: [
            'Core framework and fundamentals established',
            'First mission scenario and orders complete',
            'Second and third missions started',
        ],
        w8: [
            'Second and third missions complete',
            'All subsequent missions started',
            'All mission orders finalised',
        ],
        w6: [
            'Final checks and revisions completed',
            'Bug fixing pass completed',
            'Server loadout and mission tested',
            'Weekly Monday reminder sent (if any items incomplete)',
        ],
        w4: [
            'Final development check completed',
            'Arsenal and loadout updates confirmed',
        ],
    },
    single: {
        w12: ['Mission concept/idea submitted to J2'],
        w10: [
            'Confirmed mission development has started',
            'Mission scenario and orders started',
            'J2 lead briefed on mission concept',
        ],
        w8: [
            'Mission scenario and orders complete',
            'Replacement mission arranged if not complete',
        ],
        w6: [
            'Final checks and bug fixing completed',
            'Server mission tested',
            'Weekly Monday reminder sent (if any items incomplete)',
        ],
        w4: [
            'Final development check completed',
            'Arsenal and loadout updates confirmed',
        ],
    },
}

export function devCheckItems(isCampaignOp: boolean, checkId: string): string[] {
    return DEV_CHECK_CONTENT[isCampaignOp ? 'campaign' : 'single'][checkId] ?? []
}
