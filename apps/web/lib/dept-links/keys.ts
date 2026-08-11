import { DEPT_CODES } from '@/lib/discord/dept-codes'

export type DeptLinkDepartment = typeof DEPT_CODES[number]

export function isDeptLinkDepartment(value: unknown): value is DeptLinkDepartment {
    return typeof value === 'string' && (DEPT_CODES as readonly string[]).includes(value)
}

export const DEPT_LINKS_MANAGE_KEY = 'deptLinks.manage'

export function leadKey(dept: DeptLinkDepartment): string {
    return `departmentLeads.${dept}`
}
