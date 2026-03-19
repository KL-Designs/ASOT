'use client'

import { useEffect, useState } from 'react'

interface ScoreEntry {
	userId: string
	displayName: string
	score: number
	collectScore: number
	total: number
}

export default function MinigameScoreboard({
	visible,
	currentUserId,
	refreshKey,
	lastScore,
}: {
	visible: boolean
	currentUserId?: string
	refreshKey: number
	lastScore?: { score: number; collectScore: number }
}) {
	const [scores, setScores] = useState<ScoreEntry[]>([])

	useEffect(() => {
		if (!visible) return
		fetch('/api/minigame/score')
			.then(r => r.json())
			.then(setScores)
			.catch(() => {})
	}, [visible, refreshKey])

	const myRank = currentUserId ? scores.findIndex(s => s.userId === currentUserId) + 1 : null

	return (
		<div style={{
			position: 'absolute',
			inset: 0,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			zIndex: 10,
			opacity: visible ? 1 : 0,
			pointerEvents: visible ? 'none' : 'none',
			transition: 'opacity 0.5s ease',
		}}>
			<div style={{
				width: 'min(480px, 90%)',
				background: 'rgba(8,8,8,0.92)',
				border: '1px solid rgba(219,0,29,0.25)',
				borderTop: '2px solid rgba(219,0,29,0.7)',
				backdropFilter: 'blur(8px)',
				padding: '28px 32px 24px',
			}}>

				{/* Header */}
				<div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
					<div style={{ width: 3, height: 20, background: 'var(--red)', flexShrink: 0 }} />
					<span style={styles.heading}>Leaderboard</span>
				</div>

				{/* Last run score */}
				{lastScore && (
					<div style={{
						display: 'flex',
						gap: 20,
						marginBottom: 20,
						padding: '10px 14px',
						background: 'rgba(219,0,29,0.06)',
						borderLeft: '2px solid rgba(219,0,29,0.4)',
					}}>
						<div style={styles.statBlock}>
							<span style={styles.statLabel}>Dodged</span>
							<span style={styles.statValue}>{lastScore.score}</span>
						</div>
						<div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
						<div style={styles.statBlock}>
							<span style={styles.statLabel}>Gems</span>
							<span style={{ ...styles.statValue, color: 'rgba(255,210,0,0.85)' }}>◆ {lastScore.collectScore}</span>
						</div>
						<div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
						<div style={styles.statBlock}>
							<span style={styles.statLabel}>Total</span>
							<span style={styles.statValue}>{lastScore.score + lastScore.collectScore}</span>
						</div>
						{myRank && myRank > 0 && (
							<>
								<div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
								<div style={styles.statBlock}>
									<span style={styles.statLabel}>Rank</span>
									<span style={{ ...styles.statValue, color: myRank === 1 ? 'rgba(255,210,0,0.9)' : undefined }}>
										#{myRank}
									</span>
								</div>
							</>
						)}
					</div>
				)}

				{/* Column headers */}
				<div style={styles.row}>
					<span style={{ ...styles.colLabel, width: 24 }}>#</span>
					<span style={{ ...styles.colLabel, flex: 1 }}>Player</span>
					<span style={{ ...styles.colLabel, width: 52, textAlign: 'right' }}>Dodged</span>
					<span style={{ ...styles.colLabel, width: 40, textAlign: 'right', color: 'rgba(255,210,0,0.45)' }}>◆</span>
					<span style={{ ...styles.colLabel, width: 44, textAlign: 'right' }}>Total</span>
				</div>

				<div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 0 4px' }} />

				{/* Rows */}
				{scores.length === 0 && (
					<div style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(237,237,237,0.2)', padding: '10px 0' }}>
						No scores yet — be the first!
					</div>
				)}
				{scores.map((entry, i) => {
					const isMe = entry.userId === currentUserId
					const isFirst = i === 0
					return (
						<div key={entry.userId} style={{
							...styles.row,
							padding: '5px 6px',
							marginBottom: 2,
							background: isMe ? 'rgba(219,0,29,0.1)' : 'transparent',
							borderLeft: isMe ? '2px solid rgba(219,0,29,0.6)' : '2px solid transparent',
						}}>
							<span style={{ ...styles.cell, width: 24, color: isFirst ? 'rgba(255,210,0,0.85)' : 'rgba(237,237,237,0.3)', fontWeight: 700 }}>
								{i + 1}
							</span>
							<span style={{ ...styles.cell, flex: 1, color: isMe ? 'rgba(237,237,237,0.95)' : 'rgba(237,237,237,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
								{entry.displayName}
							</span>
							<span style={{ ...styles.cell, width: 52, textAlign: 'right', color: 'rgba(237,237,237,0.5)' }}>
								{entry.score}
							</span>
							<span style={{ ...styles.cell, width: 40, textAlign: 'right', color: 'rgba(255,210,0,0.7)' }}>
								{entry.collectScore}
							</span>
							<span style={{ ...styles.cell, width: 44, textAlign: 'right', color: isMe ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.55)', fontWeight: isMe ? 700 : 400 }}>
								{entry.total}
							</span>
						</div>
					)
				})}

				{/* Footer */}
				<div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					{!currentUserId && (
						<span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(237,237,237,0.25)', letterSpacing: '0.05em' }}>
							Log in to save your score
						</span>
					)}
					<span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(237,237,237,0.3)', letterSpacing: '0.12em', marginLeft: 'auto' }}>
						SPACE TO RESTART
					</span>
				</div>
			</div>
		</div>
	)
}

const styles = {
	heading: {
		fontFamily: 'monospace',
		fontSize: 13,
		fontWeight: 700,
		letterSpacing: '0.2em',
		color: 'rgba(237,237,237,0.85)',
		textTransform: 'uppercase',
	} as React.CSSProperties,

	statBlock: {
		display: 'flex',
		flexDirection: 'column',
		gap: 2,
	} as React.CSSProperties,

	statLabel: {
		fontFamily: 'monospace',
		fontSize: 9,
		fontWeight: 600,
		letterSpacing: '0.14em',
		color: 'rgba(237,237,237,0.3)',
		textTransform: 'uppercase',
	} as React.CSSProperties,

	statValue: {
		fontFamily: 'monospace',
		fontSize: 18,
		fontWeight: 700,
		color: 'rgba(237,237,237,0.9)',
	} as React.CSSProperties,

	row: {
		display: 'flex',
		alignItems: 'center',
		gap: 8,
	} as React.CSSProperties,

	colLabel: {
		fontFamily: 'monospace',
		fontSize: 9,
		fontWeight: 600,
		letterSpacing: '0.12em',
		color: 'rgba(237,237,237,0.25)',
		textTransform: 'uppercase',
	} as React.CSSProperties,

	cell: {
		fontFamily: 'monospace',
		fontSize: 12,
		fontWeight: 500,
	} as React.CSSProperties,
}
