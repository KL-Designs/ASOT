export { }

declare global {

    interface IntelPackageCommsEntry {
        callsign: string
        srPrim?: string
        srAlt?: string
        lrPrim?: string
        lrAlt?: string
    }

    interface IntelPackageCommsGroup {
        id: string
        groupName: string
        color?: string
        entries: IntelPackageCommsEntry[]
    }

    interface IntelPackageHvt {
        id: string
        name?: string
        role?: string
        location?: string
        imagePath?: string
        priority?: 'low' | 'medium' | 'high'
    }

    interface IntelPackageCallsign {
        callsign: string
        element: string
        commander: string
        pax: string
    }

    interface IntelPackageTask {
        label: string
        text: string
    }

    interface IntelPackageSupply {
        category: string
        status: 'critical' | 'low' | 'adequate' | 'full'
    }

    interface IntelPackageParty {
        q1Label?: string; q1?: string
        q2Label?: string; q2?: string
        q3Label?: string; q3?: string
        q4Label?: string; q4?: string
        image1Path?: string
        image2Path?: string
    }

    interface IntelPackage {
        _id?: import('mongodb').ObjectId
        operationId: string

        cover?: {
            operationName?: string
            operationDate?: string
            subTitle?: string
        }

        areaOfOps?: {
            situation?: string
            mapImagePath?: string
        }

        terrain?: {
            imagePath?: string
            keyTerrain?: string
            observation?: string
            coverConcealment?: string
        }

        enemyOverview?: {
            composition?: string
            disposition?: string
            strength?: string
            capabilities?: string
            image1Path?: string
            image2Path?: string
        }

        highValueTargets?: IntelPackageHvt[]

        bluforForces?: {
            hqDisposition?: string
            callsigns?: IntelPackageCallsign[]
            additionalCallsigns?: string
        }

        independentForces?: IntelPackageParty
        civilians?: IntelPackageParty
        otherParties?: IntelPackageParty

        mission?: {
            statement?: string
            who?: string
            what?: string
            when?: string
            where?: string
            why?: string
        }

        execution?: {
            tasks?: IntelPackageTask[]
            imagePath?: string
        }

        adminLogistics?: {
            supplySummary?: string
            assets?: string
            supplyStatus?: IntelPackageSupply[]
        }

        roeOfof?: {
            weaponsState?: 'free' | 'tight' | 'hold'
            customSummary?: string
            customRules?: { id: string; heading?: string; text: string }[]
            standardRulesOverrides?: {
                free?: { heading: string; text: string }[]
                tight?: { heading: string; text: string }[]
                hold?: { heading: string; text: string }[]
            }
        }

        commandSignals?: {
            orderOfSeniority?: string
            primaryAlternateComms?: string
            command?: string
            commsCardMode?: 'image' | 'custom'
            commsCardPath?: string
            commsCard?: {
                groups?: IntelPackageCommsGroup[]
                supportFrequencies?: string
                convoyFrequencies?: string
            }
            fobImagePath?: string
        }

        closing?: {
            pocName?: string
            pocCallsign?: string
        }

        updatedAt: Date
        updatedById: string
        updatedByName: string
    }
}
