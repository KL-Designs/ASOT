import { DEPT_CODES } from '@/lib/discord/dept-codes'

export type DeptLinkDepartment = typeof DEPT_CODES[number]

export function isDeptLinkDepartment(value: unknown): value is DeptLinkDepartment {
    return typeof value === 'string' && (DEPT_CODES as readonly string[]).includes(value)
}

export function manageKey(dept: DeptLinkDepartment): string {
    return `deptLinks.manage${dept.toUpperCase()}`
}

export function viewRestrictedKey(dept: DeptLinkDepartment): string {
    return `deptLinks.viewRestricted${dept.toUpperCase()}`
}

export function leadKey(dept: DeptLinkDepartment): string {
    return `departmentLeads.${dept}`
}
