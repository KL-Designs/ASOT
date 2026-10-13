import { AWARD_TO_CITATION } from '@asot/lib'

/**
 * The unit's awards and citations, as written up by LTCOL Thomas in the "ASOT
 * Citations and Awards" document. This file is that document's content turned
 * into data; the wording is his and should be changed there first.
 *
 * Two sections of the document are deliberately absent: the nomination process
 * and creating new awards. Both are forms in the ticket system now, and the
 * page links to those instead of describing a process by hand that the form
 * already walks a member through.
 *
 * `art` ties an entry to its artwork. A ribbon is looked up through
 * `AWARD_TO_CITATION` — the same table the milpac renderer draws from — by the
 * award's label in `lib/military/awards.ts`, so the page cannot show a ribbon
 * the uniform would not. A medallion names its file directly. Awards with no
 * artwork yet (most of the skill medallions) simply have none.
 */

export type AwardArt =
    | { kind: 'ribbon'; code: string }
    | { kind: 'medallion'; file: string }

export interface AwardEntry {
    name: string
    eligibility: string
    /** A sentence or two before the list, when the document has one. */
    intro?: string
    /** The "awarded for" points. A single entry is rendered as a sentence. */
    criteria: string[]
    art?: AwardArt
}

export interface AwardCategory {
    id: string
    title: string
    kicker: string
    blurb: string
    awards: AwardEntry[]
}

const ANY = 'Any ASOT full-time or reservist member.'
const PTE_P = 'Any ASOT full-time or reservist member with the rank of PTE(P)+.'

const ribbon = (label: string): AwardArt | undefined => {
    const code = AWARD_TO_CITATION[label]
    return code ? { kind: 'ribbon', code } : undefined
}
const medallion = (file: string): AwardArt => ({ kind: 'medallion', file })

const SOLDIERS_CRITERIA = [
    'General positive behaviour and attitude within the community.',
    'Setting and upholding ASOT standards and expectations.',
    'Assisting others and/or time dedicated to trainings.',
    'Dedication to unit admin, media, trainings or other department responsibilities.',
]

const GALLANTRY_CRITERIA = [
    'Acting above the rank and/or position held by the member.',
    'How the member handled multiple or a significantly difficult situation/s in combat.',
    'Decisions the member made that enabled treatment and recovery of patients, continuation of a vital task and/or prevented others becoming KIA, MIA, injured or otherwise remaining in severe danger.',
    'Conducted themselves with a high level of skill and knowledge above their expected skill level which benefited the situation significantly.',
]

const LEADERSHIP_CRITERIA = [
    'The member shows initiative, quick decision making, professionalism and tactical knowledge outside of their worn rank.',
]

export const AWARD_CATEGORIES: AwardCategory[] = [
    {
        id: 'service',
        title: 'Period of Service Citations',
        kicker: 'Time served',
        blurb: 'Recognition of continuous service within the unit.',
        awards: [
            { name: '1 Year Service Citation', eligibility: ANY, criteria: ['1 year of continuous service within ASOT.'], art: ribbon('1 Year Service Citation') },
            { name: '2 Year Service Citation', eligibility: ANY, criteria: ['2 years of continuous service within ASOT.'], art: ribbon('2 Year Service Citation') },
            { name: '3 Year Service Citation', eligibility: ANY, criteria: ['3 years of continuous service within ASOT.'], art: ribbon('3 Year Service Citation') },
            { name: 'Long Term Service Citation (4 Years+)', eligibility: ANY, criteria: ['More than 4 years of continuous service within ASOT.'], art: ribbon('4 Year+ Service Citation') },
        ],
    },
    {
        id: 'non-operational',
        title: 'Non-operational Awards',
        kicker: 'Outside the mission',
        blurb: 'For the work that keeps the unit running between operations.',
        awards: [
            {
                name: 'Broken Lance Award', eligibility: ANY, art: ribbon('Broken Lance Award'),
                intro: 'Dedication and performance relating to;',
                criteria: ['Administration.', 'Trainings.', 'Group development and growth.'],
            },
            {
                name: 'Diplomat Award', eligibility: ANY, art: ribbon('Diplomat Award'),
                intro: 'Dedication and performance relating to;',
                criteria: ['Recruitment of new applicants.', 'Promotion of the group.'],
            },
            {
                name: 'Instructor Award', eligibility: ANY, art: ribbon('Instructor Award'),
                intro: 'Dedication and performance relating to;',
                criteria: ['Training of new recruits and ASOT members.', 'Furthering personal knowledge through own training and study.', 'Working on training and certification documents.'],
            },
            {
                name: 'Public Relations Award', eligibility: ANY, art: ribbon('Public Relations Award'),
                intro: 'Dedication and performance relating to;',
                criteria: ['Promotion of ASOT.', 'Media creating and distribution.', 'Social media promotion.', 'Organisation of intercommunity events.'],
            },
            {
                name: 'Group Development Award', eligibility: ANY, art: ribbon('Group Development Award'),
                intro: 'Dedication and performance relating to;',
                criteria: ['Group development.', 'Document and/or training development.', 'Encouraging and assisting new members.', 'Assisting in training and recruitment.'],
            },
            {
                name: 'Architect Award', eligibility: ANY, art: ribbon('Architect Award'),
                intro: 'Dedication and performance relating to;',
                criteria: ['Mission making.', 'Mission brief creation.', 'Zeusing of missions.', 'Assisting other members with mission creation, zeusing or general editing knowledge.'],
            },
            {
                name: 'Watchman Award', eligibility: ANY, art: ribbon('Watchman Award'),
                criteria: [
                    'Demonstrated an act/s whilst displaying ASOT’s values and standards to a high level.',
                    'Displayed a high level of positive personal attributes including but not limited to; selflessness, kindness, sacrifice, generosity, compassion, sympathy and understanding.',
                ],
            },
            {
                name: 'Atlas Award', eligibility: 'Any ASOT full-time or reservist Zeus member.', art: ribbon('Atlas Award'),
                intro: 'Dedication and performance relating to;',
                criteria: [
                    'Zeusing missions to an excellent standard and continuously providing an enjoyable experience.',
                    'Has shown high levels of enthusiasm and dedication, even at the expense of their enjoyment.',
                ],
            },
            {
                name: 'Bronze Soldiers Medallion', eligibility: ANY, art: medallion('Bronze1'),
                intro: 'The ASOT Soldiers Medallions are a way for recognition to be awarded to any ASOT member who may not meet the exact criteria for any other award or citation. Although it has a wide criteria, it mainly relates to;',
                criteria: SOLDIERS_CRITERIA,
            },
            {
                name: 'Silver Soldiers Medallion', eligibility: ANY, art: medallion('Silver1'),
                intro: 'The second tier in the ASOT Soldiers Medallion achievement. It is awarded to members if they have already received a bronze soldiers medallion. Although it has a wide criteria, it mainly relates to;',
                criteria: SOLDIERS_CRITERIA,
            },
            {
                name: 'Gold Soldiers Medallion', eligibility: ANY, art: medallion('Gold1'),
                intro: 'The third and last tier in the ASOT Soldiers Medallion achievement. It is awarded to members if they have already received a silver soldiers medallion. If a member is deemed suitable to receive a 4th soldiers medallion, then they will receive a second one starting at bronze again. Although it has a wide criteria, it mainly relates to;',
                criteria: SOLDIERS_CRITERIA,
            },
            {
                name: 'ASOT Beyond Award', eligibility: ANY, art: ribbon('ASOT Beyond Award'),
                intro: 'Dedication and performance relating to;',
                criteria: [
                    'Displaying ASOT’s values and standards continuously and above the expected levels.',
                    'Has shown high levels of enthusiasm and dedication at all times.',
                    'This is the highest non operational citation that can be awarded and is reserved for acknowledging multiple examples of the traits listed.',
                ],
            },
            {
                name: 'Founding Member', eligibility: ANY, art: ribbon('Founding Member'),
                criteria: [
                    'Played a crucial role in the development and opening of the community.',
                    'Was part of the original planning team during the initial start of ASOT.',
                ],
            },
        ],
    },
    {
        id: 'operational',
        title: 'Operational Awards',
        kicker: 'In the field',
        blurb: 'For professionalism and dedication within operations, above what is expected of a member’s rank or position.',
        awards: [
            {
                name: 'Gallantry Award', eligibility: ANY, art: ribbon('Gallantry Award'),
                intro: 'Recognises a member for a single significant act of professionalism and dedication within operations at a standard above what is expected of their rank or position. This can be measured in many ways including but not limited to;',
                criteria: GALLANTRY_CRITERIA,
            },
            {
                name: 'Star of Courage', eligibility: ANY, art: ribbon('Star of Courage'),
                intro: 'Recognises a member for multiple significant acts of professionalism and dedication within operations at a standard above what is expected of their rank or position. This can be measured in many ways including but not limited to;',
                criteria: GALLANTRY_CRITERIA,
            },
            {
                name: 'ASOT Cross of Valour', eligibility: ANY, art: ribbon('ASOT Cross of Valour'),
                intro: 'Recognises a member for continual and maintained significant acts of professionalism and dedication within operations at a standard above what is expected of their rank or position. This can be measured in many ways including but not limited to;',
                criteria: GALLANTRY_CRITERIA,
            },
        ],
    },
    {
        id: 'leadership',
        title: 'Leadership Awards',
        kicker: 'Leading others',
        blurb: 'For members who demonstrate ASOT’s leadership values and standards.',
        awards: [
            {
                name: 'Protagonist Award', eligibility: ANY, art: ribbon('Protagonist Award'),
                intro: 'Members in non-leadership roles who demonstrate ASOT’s leadership values and standards.',
                criteria: LEADERSHIP_CRITERIA,
            },
            {
                name: 'Junior Leadership Award', eligibility: 'Any ASOT full-time or reservist member with the rank of LCPL who holds a 3IC or 2IC role.', art: ribbon('Junior Leadership Award'),
                intro: 'Members in a junior leadership role who demonstrate ASOT’s leadership values and standards.',
                criteria: LEADERSHIP_CRITERIA,
            },
            {
                name: 'Senior Leadership Award', eligibility: 'Any ASOT full-time or reservist member with the rank of CPL or above.', art: ribbon('Senior Leadership Award'),
                intro: 'Members in a senior leadership role who demonstrate ASOT’s leadership values and standards.',
                criteria: LEADERSHIP_CRITERIA,
            },
        ],
    },
    {
        id: 'skill',
        title: 'Member Skill Awards',
        kicker: 'Mastery of a trade',
        blurb: 'For members who have mastered a specialist skill set and helped others learn it.',
        awards: [
            {
                name: 'IDF/DSFW Medallion', eligibility: PTE_P,
                criteria: [
                    'Shows clear understanding and demonstrates a high level of competence with both DSFW and IDF.',
                    'Displays great enthusiasm in training.',
                    'Is well mannered during medical incidents and avoids arrogant or egotistical behaviour.',
                    // ^ "medical" is the source document's wording for this award.
                    'Has made a significant contribution to the development of ASOT as a whole in the field of IDF and DSFW.',
                ],
            },
            {
                name: 'Aviation Medallion', eligibility: PTE_P, art: ribbon('Rotary Aviation Medal'),
                criteria: ['Achieving a score of above 332/349 on the Hotel assessment. Members can resit serials of the assessment to gain the required score. The reassessment must be supervised by a trainer.'],
            },
            {
                name: 'Medical Medallion', eligibility: ANY, art: ribbon('Medical Medallion'),
                criteria: [
                    'Shows clear understanding and demonstrates a high level of competence with the medical system.',
                    'Displays great enthusiasm in training and regularly engages in informal education of the medical system for new and existing members.',
                    'Is well mannered during medical incidents and avoids arrogant or egotistical behaviour.',
                    'Has made a significant contribution to the development of the medical system.',
                ],
            },
            {
                name: 'Infantry Medallion', eligibility: PTE_P,
                criteria: [
                    'Shows clear understanding and demonstrates a high level of competence of the Infantry skill set.',
                    'Displays great enthusiasm in training and actively assists in the instruction of new and existing members.',
                    'Has made a significant contribution to the development of the Infantry SOPs.',
                    'Is well mannered during Infantry operations and taskings whilst avoiding arrogant or egotistical behaviour.',
                ],
            },
            {
                name: 'Armoured Crewman Medallion', eligibility: PTE_P,
                criteria: [
                    'Shows clear understanding and demonstrates a high level of competence when operating armoured vehicles.',
                    'Displays great enthusiasm in training and actively assists in the instruction of new and existing members.',
                    'Has made a significant contribution to the development of the Armoured SOPs.',
                    'Is well mannered during Armoured operations and taskings whilst avoiding arrogant or egotistical behaviour.',
                ],
            },
            {
                name: 'Combat Engineer Medallion', eligibility: ANY,
                criteria: [
                    'Shows clear understanding and demonstrates a high level of competence with the Engineer systems.',
                    'Displays great enthusiasm and dedication in training and regularly engages in informal education of the Engineer systems for new and existing members.',
                    'Is well mannered during building, demolition and RRR taskings whilst avoiding arrogant or egotistical behaviour.',
                    'Has made a significant contribution to the development of the Engineer systems.',
                ],
            },
        ],
    },
]

/**
 * The campaign medallion and its clasps, drawn as a ladder rather than as
 * seventeen near-identical cards: one rule, a number that goes up by five.
 *
 * Sixteen clasps, which is how many the milpac has ribbons for. The source
 * document lists a seventeenth at the same 85 campaigns as the sixteenth —
 * a slip in the document rather than a real tier, so it is left out here until
 * it is corrected there.
 */
const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth']

export const CAMPAIGN_LADDER: { name: string; campaigns: number; code?: string }[] = [
    { name: 'Campaign Medallion', campaigns: 5, code: AWARD_TO_CITATION['Campaign Medallion'] },
    ...ORDINALS.map((ordinal, i) => ({
        name: `${ordinal} Clasp`,
        campaigns: (i + 2) * 5,
        code: AWARD_TO_CITATION[`Campaign Medallion, ${ordinal} Clasp`],
    })),
]

export const REVOCATION_REASONS = [
    'The member has shown poor performance, standards or values relating to the group or their award.',
    'The member is receiving the revocation as a form of discipline.',
    'A nomination for revocation has been accepted.',
    'The member is being dishonourably discharged from ASOT.',
]
