export interface EscalationGroup {
    label: string
    roles: string[]
    firstThreshold: number
    firstRecipientRoles: string[]
    secondThreshold: number
    secondRecipientRoles: string[]
}

export interface TaskLimitPolicy {
    type: 'task_limit_policy'
    groups: EscalationGroup[]
    updatedById: string
    updatedByName: string
    updatedAt: Date
}

export interface LockoutGroup {
    label: string
    roles: string[]
    enabled: boolean
}

export interface TaskLockoutPolicy {
    type: 'task_lockout_policy'
    groups: LockoutGroup[]
    updatedById: string
    updatedByName: string
    updatedAt: Date
}

export const DEFAULT_LOCKOUT_GROUPS: LockoutGroup[] = [
    { label: 'Section Members',  roles: ['ASOT Member'],                                         enabled: false },
    { label: 'Section Staff',    roles: ['All Staff'],                                            enabled: true  },
    { label: 'PHQ / HQ Staff',   roles: ['HQ Staff'],                                             enabled: true  },
    { label: 'J1',               roles: ['J1-Staff', 'J1-Recruiting'],                            enabled: true  },
    { label: 'J2',               roles: ['J2-Mission Making', 'J2-Team Lead'],                    enabled: true  },
    { label: 'J3',               roles: ['J3-Training', 'J3-Team Lead'],                          enabled: true  },
    { label: 'J4',               roles: ['J4-Administration'],                                    enabled: true  },
    { label: 'J5',               roles: ['J5-Media'],                                             enabled: true  },
    { label: 'J6',               roles: ['J6-Game Master', 'J6-Department Lead'],                 enabled: true  },
    { label: 'J7',               roles: ['J7 Community Development', 'J7 Staff'],                 enabled: true  },
]
