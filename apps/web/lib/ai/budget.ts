import Db from '@/lib/mongo'

export interface BudgetCheckResult {
    allowed: boolean
    reason?: string
    estimatedCostUsd: number
    remainingUsd?: number
}

export interface BudgetCheckContext {
    userId: string
    userName: string
    departmentId?: string
    roles?: string[]
    feature: AiFeature
    estimatedCostUsd: number
}

function monthStart(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
}

async function getMonthlyUsage(filter: Record<string, unknown>): Promise<{ costUsd: number; images: number; tokens: number }> {
    const result = await Db.aiUsage.aggregate<{ costUsd: number; images: number; tokens: number }>([
        { $match: { ...filter, status: 'success', createdAt: { $gte: monthStart() } } },
        {
            $group: {
                _id: null,
                costUsd: { $sum: '$actualCostUsd' },
                images:  { $sum: '$imageCount' },
                tokens:  { $sum: { $add: [{ $ifNull: ['$inputTokens', 0] }, { $ifNull: ['$outputTokens', 0] }] } },
            },
        },
    ]).next()

    return result ?? { costUsd: 0, images: 0, tokens: 0 }
}

async function checkOneBudget(
    budget: AiBudgetConfig,
    usage: { costUsd: number; images: number; tokens: number },
    estimatedCostUsd: number
): Promise<{ exceeded: boolean; reason?: string; remainingUsd?: number }> {
    if (!budget.enabled) return { exceeded: false }

    if (budget.monthlyLimitUsd !== undefined) {
        const projected = usage.costUsd + estimatedCostUsd
        if (projected > budget.monthlyLimitUsd) {
            const remaining = Math.max(0, budget.monthlyLimitUsd - usage.costUsd)
            const scopeLabel = budget.scopeLabel
            return {
                exceeded: true,
                reason: `Monthly budget exceeded for ${scopeLabel} ($${usage.costUsd.toFixed(4)} used of $${budget.monthlyLimitUsd.toFixed(2)})`,
                remainingUsd: remaining,
            }
        }
    }

    return { exceeded: false, remainingUsd: budget.monthlyLimitUsd !== undefined ? budget.monthlyLimitUsd - usage.costUsd : undefined }
}

export async function checkBudget(ctx: BudgetCheckContext): Promise<BudgetCheckResult> {
    const { userId, departmentId, roles = [], feature, estimatedCostUsd } = ctx

    // Load all relevant budget configs in one query
    const scopeKeys = [
        { scopeType: 'site', scopeKey: 'site' },
        ...(departmentId ? [{ scopeType: 'department', scopeKey: departmentId }] : []),
        ...roles.map(r => ({ scopeType: 'role', scopeKey: r })),
        { scopeType: 'member', scopeKey: userId },
        { scopeType: 'feature', scopeKey: feature },
    ]

    const budgets = await Db.aiBudgets.find({
        $or: scopeKeys as any,
        enabled: true,
    }).toArray()

    if (budgets.length === 0) return { allowed: true, estimatedCostUsd }

    // Check each budget scope. A hard-stop on any scope blocks the request.
    const checks: Array<{ budget: AiBudgetConfig; filter: Record<string, unknown> }> = []

    for (const budget of budgets) {
        let filter: Record<string, unknown> = { status: 'success' }
        switch (budget.scopeType) {
            case 'site':       filter = {}; break
            case 'department': filter = { departmentId: budget.scopeKey }; break
            case 'role':       filter = { roles: budget.scopeKey }; break
            case 'member':     filter = { userId: budget.scopeKey }; break
            case 'feature':    filter = { feature: budget.scopeKey }; break
        }
        checks.push({ budget, filter })
    }

    const usages = await Promise.all(checks.map(c => getMonthlyUsage(c.filter)))

    for (let i = 0; i < checks.length; i++) {
        const { budget } = checks[i]
        const usage = usages[i]
        const result = await checkOneBudget(budget, usage, estimatedCostUsd)
        if (result.exceeded && budget.hardStop) {
            return {
                allowed: false,
                reason: result.reason,
                estimatedCostUsd,
                remainingUsd: result.remainingUsd,
            }
        }
    }

    return { allowed: true, estimatedCostUsd }
}

export async function getMemberCreditSummary(userId: string, roles: string[] = []): Promise<AiCreditSummary> {
    // Find the most restrictive applicable budget for this member
    const memberBudget = await Db.aiBudgets.findOne({
        scopeType: 'member',
        scopeKey: userId,
        enabled: true,
    })

    const siteBudget = await Db.aiBudgets.findOne({
        scopeType: 'site',
        scopeKey: 'site',
        enabled: true,
    })

    // Member-level budget takes priority for display; fall back to site
    const displayBudget = memberBudget ?? siteBudget ?? null

    const usage = await getMonthlyUsage({ userId })

    const limitUsd = displayBudget?.monthlyLimitUsd ?? null
    const imageLimit = displayBudget?.imageMonthlyLimit ?? null
    const tokenLimit = displayBudget?.textTokenMonthlyLimit ?? null

    const thresholds = displayBudget?.warningThresholds ?? [0.75, 0.90, 1.0]
    const usedFraction = limitUsd ? usage.costUsd / limitUsd : 0

    let warningLevel: AiCreditSummary['warningLevel'] = 'ok'
    let warningThresholdReached: number | null = null

    for (const threshold of [...thresholds].sort((a, b) => a - b)) {
        if (usedFraction >= threshold) {
            warningThresholdReached = threshold
            if (threshold >= 1.0) {
                warningLevel = 'exceeded'
            } else if (threshold >= 0.9) {
                warningLevel = 'critical'
            } else {
                warningLevel = 'warning'
            }
        }
    }

    return {
        monthlyLimitUsd: limitUsd,
        usedUsd: usage.costUsd,
        remainingUsd: limitUsd !== null ? Math.max(0, limitUsd - usage.costUsd) : null,
        imageMonthlyLimit: imageLimit,
        imagesUsedThisMonth: usage.images,
        textTokenMonthlyLimit: tokenLimit,
        textTokensUsedThisMonth: usage.tokens,
        warningLevel,
        warningThresholdReached,
    }
}

export async function recordUsage(record: Omit<AiUsageRecord, '_id'>): Promise<void> {
    try {
        await Db.aiUsage.insertOne(record as AiUsageRecord)
    } catch (err) {
        console.error('[ai/budget] Failed to record usage:', err)
    }
}
