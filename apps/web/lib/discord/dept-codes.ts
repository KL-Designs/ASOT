// Plain department-code list — deliberately dependency-free (no Db/Mongo
// imports) so client components can safely import it. Server code that also
// needs Discord role-name mappings per department should use DEPT_ROLES in
// dept-roles.ts instead (never import that file from a 'use client' module —
// it pulls in the full mongodb driver via Db, which breaks client bundling).
export const DEPT_CODES = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'] as const
