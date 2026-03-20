import { connection } from 'next/server'

import Avatar from '@/components/member/avatar'
import client from '@/lib/discord'



export default async function Card({ milpac }: { milpac?: Milpac }) {

	if (!milpac) return null

	await connection()
	const member = await client.fetchMember(milpac._id).catch(e => console.error(e))
	if (!member) return null

	const accent = member.hexAccentColor || '#db001d'
	const name = member.guild.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || member.globalName || 'Unknown'

	return (
		<div style={{
			width: 180,
			flexShrink: 0,
			background: 'rgb(13,13,13)',
			border: '1px solid rgba(219,0,29,0.15)',
			borderTop: `2px solid ${accent}`,
			display: 'flex',
			flexDirection: 'column',
			overflow: 'hidden',
		}}>
			{/* Avatar block */}
			<div style={{
				padding: '22px 16px 16px',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 14,
				background: 'rgba(219,0,29,0.02)',
			}}>
				<div style={{
					position: 'relative',
					width: 76,
					height: 76,
					borderRadius: '50%',
					padding: 2,
					background: `linear-gradient(135deg, ${accent}99, rgba(237,237,237,0.08))`,
					flexShrink: 0,
				}}>
					<div style={{
						position: 'relative',
						width: '100%',
						height: '100%',
						borderRadius: '50%',
						overflow: 'hidden',
						background: 'rgb(13,13,13)',
					}}>
						<Avatar user={member} />
					</div>
				</div>

				<p style={{
					margin: 0,
					fontSize: '0.8rem',
					fontWeight: 700,
					letterSpacing: '0.1em',
					textTransform: 'uppercase',
					textAlign: 'center',
					color: 'rgba(237,237,237,0.92)',
					lineHeight: 1.3,
				}}>
					{name}
				</p>
			</div>

			{/* Divider */}
			<div style={{ height: 1, background: 'rgba(219,0,29,0.12)', flexShrink: 0 }} />

			{/* Title block */}
			<div style={{ padding: '10px 16px', textAlign: 'center' }}>
				<p style={{
					margin: 0,
					fontSize: '0.6rem',
					fontWeight: 600,
					letterSpacing: '0.18em',
					textTransform: 'uppercase',
					color: 'rgba(237,237,237,0.38)',
				}}>
					{milpac.title}
				</p>
			</div>
		</div>
	)
}
