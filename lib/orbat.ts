import Db from '@/lib/mongo'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat-constants'


export interface Member { role: string; name: string; rankAbbr?: string; username?: string }
export interface RawSection { title: string; members: Member[] }

export interface ORBATData {
	companyHQ: {
		senior: Member
		subTitle: string
		members: Member[]
	}
	platoon11: RawSection[]
	platoon12: RawSection[]
	support: RawSection[]
	activeReservists: string[]
	inactiveReservists: string[]
	gamemasters: Member[]
}

export interface OrbatEntry {
	role: string
	section: string
}


export async function fetchORBAT(): Promise<ORBATData> {
	const [positions, users] = await Promise.all([
		Db.orbatPositions.find({}).sort({ sectionOrder: 1, positionOrder: 1 }).toArray(),
		Db.users.find({}).toArray(),
	])

	interface UserInfo { name: string; rankAbbr?: string; username?: string }
	const userById = new Map<string, UserInfo>()
	for (const u of users) {
		const strippedNick = u.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
		const nickParts = (strippedNick || '').split(' ')
		const parsedName = nickParts.length > 1 ? nickParts.slice(1).join(' ') : (strippedNick || u.globalName || u.username || '')
		const name = u.name || parsedName || u.globalName || u.username || ''
		const rankAbbr = u.milpac?.currentRank || (nickParts.length > 1 ? nickParts[0] : undefined) || undefined
		userById.set(u._id, { name, rankAbbr, username: u.username })
	}

	const getMember = (userId: string | null, role: string): Member => {
		if (!userId) return { role, name: '' }
		const info = userById.get(userId)
		if (!info) return { role, name: '' }
		return { role, name: info.name, rankAbbr: info.rankAbbr, username: info.username }
	}

	const data: ORBATData = {
		companyHQ: { senior: { role: 'Commanding Officer', name: '' }, subTitle: '', members: [] },
		platoon11: [],
		platoon12: [],
		support: [],
		activeReservists: [],
		inactiveReservists: [],
		gamemasters: [],
	}

	// Group by category, preserving sort order
	const byCategory = new Map<string, OrbatPosition[]>()
	for (const pos of positions) {
		const list = byCategory.get(pos.category) ?? []
		list.push(pos)
		byCategory.set(pos.category, list)
	}

	// Company HQ
	for (const pos of byCategory.get('companyHQ') ?? []) {
		const member = getMember(pos.userId, pos.role)
		if (pos.isSenior) {
			data.companyHQ.senior = member
			if (pos.subTitle) data.companyHQ.subTitle = pos.subTitle
		} else {
			data.companyHQ.members.push(member)
		}
	}

	// Platoons + Support — build RawSection[] grouped by sectionTitle
	for (const [cat, key] of [['platoon11', 'platoon11'], ['platoon12', 'platoon12'], ['support', 'support']] as const) {
		const arr = data[key] as RawSection[]
		const sectionMap = new Map<string, RawSection>()
		for (const pos of byCategory.get(cat) ?? []) {
			if (!sectionMap.has(pos.sectionTitle)) {
				const section: RawSection = { title: pos.sectionTitle, members: [] }
				sectionMap.set(pos.sectionTitle, section)
				arr.push(section)
			}
			sectionMap.get(pos.sectionTitle)!.members.push(getMember(pos.userId, pos.role))
		}
	}

	// Reservists
	for (const pos of byCategory.get('activeReservist') ?? []) {
		const info = pos.userId ? userById.get(pos.userId) : null
		data.activeReservists.push(info?.name ?? '')
	}
	for (const pos of byCategory.get('inactiveReservist') ?? []) {
		const info = pos.userId ? userById.get(pos.userId) : null
		data.inactiveReservists.push(info?.name ?? '')
	}

	// Gamemasters
	for (const pos of byCategory.get('gamemaster') ?? []) {
		data.gamemasters.push(getMember(pos.userId, pos.role))
	}

	return data
}


// Direct lookup by Discord ID — O(1), no fuzzy matching needed.
export async function getOrbatEntryByUserId(userId: string): Promise<OrbatEntry | null> {
	const pos = await Db.orbatPositions.findOne({ userId })
	if (!pos) return null

	const section =
		pos.category === 'companyHQ' ? 'India Company HQ' :
		RESERVIST_CATEGORY_IDS.includes(pos.category) ? 'Company Reservists' :
		pos.category === 'gamemaster' ? 'Gamemasters' :
		pos.sectionTitle

	return { role: pos.role, section }
}


// Bulk lookup by Discord IDs — single query for the members page.
export async function getOrbatEntriesForUsers(
	userIds: string[]
): Promise<Record<string, OrbatEntry | null>> {
	if (userIds.length === 0) return {}

	const positions = await Db.orbatPositions
		.find({ userId: { $in: userIds } })
		.toArray()

	const result: Record<string, OrbatEntry | null> = {}
	for (const id of userIds) result[id] = null

	for (const pos of positions) {
		if (!pos.userId) continue
		const section =
			pos.category === 'companyHQ' ? 'India Company HQ' :
			RESERVIST_CATEGORY_IDS.includes(pos.category) ? 'Company Reservists' :
			pos.category === 'gamemaster' ? 'Gamemasters' :
			pos.sectionTitle
		result[pos.userId] = { role: pos.role, section }
	}

	return result
}
