'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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
	const [showAll, setShowAll] = useState(false)
	const [allScores, setAllScores] = useState<ScoreEntry[]>([])
	const [loadingAll, setLoadingAll] = useState(false)

	useEffect(() => {
		if (!visible) return
		fetch('/api/minigame/score')
			.then(r => r.json())
			.then(setScores)
			.catch(() => {})
	}, [visible, refreshKey])

	useEffect(() => {
		if (!visible) setShowAll(false)
	}, [visible])

	function openFullLeaderboard() {
		setShowAll(true)
		setLoadingAll(true)
		fetch('/api/minigame/score?all=true')
			.then(r => r.json())
			.then(data => { setAllScores(data); setLoadingAll(false) })
			.catch(() => setLoadingAll(false))
	}

	const myRank = currentUserId ? scores.findIndex(s => s.userId === currentUserId) + 1 : null
	const myFullRank = currentUserId ? allScores.findIndex(s => s.userId === currentUserId) + 1 : null

	return (
		<>
			<div style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 10,
				opacity: visible ? 1 : 0,
				pointerEvents: visible ? 'auto' : 'none',
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
						<button
							onClick={openFullLeaderboard}
							style={{
								background: 'none',
								border: 'none',
								cursor: 'pointer',
								fontFamily: 'monospace',
								fontSize: 10,
								letterSpacing: '0.12em',
								textTransform: 'uppercase',
								color: 'rgba(219,0,29,0.65)',
								padding: 0,
							}}
						>
							Full Leaderboard →
						</button>
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

			{/* Full Leaderboard Modal */}
			{showAll && typeof document !== 'undefined' && createPortal(
				<div style={{
					position: 'fixed',
					inset: 0,
					zIndex: 9999,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: 'rgba(0,0,0,0.75)',
					backdropFilter: 'blur(6px)',
					padding: '24px 16px',
				}}
					onClick={e => { if (e.target === e.currentTarget) setShowAll(false) }}
				>
					<div style={{
						width: 'min(560px, 100%)',
						maxHeight: '80vh',
						display: 'flex',
						flexDirection: 'column',
						background: 'rgba(8,8,8,0.97)',
						border: '1px solid rgba(219,0,29,0.25)',
						borderTop: '2px solid rgba(219,0,29,0.7)',
					}}>
						{/* Modal header */}
						<div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
								<div style={{ width: 3, height: 20, background: 'var(--red)', flexShrink: 0 }} />
								<span style={styles.heading}>Full Leaderboard</span>
								{!loadingAll && (
									<span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(237,237,237,0.25)', letterSpacing: '0.1em' }}>
										{allScores.length} entries
									</span>
								)}
							</div>
							<button
								onClick={() => setShowAll(false)}
								style={{
									background: 'none',
									border: '1px solid rgba(255,255,255,0.1)',
									cursor: 'pointer',
									color: 'rgba(237,237,237,0.5)',
									fontFamily: 'monospace',
									fontSize: 12,
									padding: '4px 10px',
									letterSpacing: '0.1em',
								}}
							>
								✕ CLOSE
							</button>
						</div>

						{/* Column headers */}
						<div style={{ padding: '10px 24px 6px', flexShrink: 0 }}>
							<div style={styles.row}>
								<span style={{ ...styles.colLabel, width: 28 }}>#</span>
								<span style={{ ...styles.colLabel, flex: 1 }}>Player</span>
								<span style={{ ...styles.colLabel, width: 52, textAlign: 'right' }}>Dodged</span>
								<span style={{ ...styles.colLabel, width: 40, textAlign: 'right', color: 'rgba(255,210,0,0.45)' }}>◆</span>
								<span style={{ ...styles.colLabel, width: 52, textAlign: 'right' }}>Total</span>
							</div>
							<div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginTop: 6 }} />
						</div>

						{/* Scrollable rows */}
						<div style={{ overflowY: 'auto', flex: 1, padding: '4px 24px 20px' }}>
							{loadingAll ? (
								<div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(237,237,237,0.2)', padding: '20px 0', textAlign: 'center', letterSpacing: '0.1em' }}>
									LOADING...
								</div>
							) : allScores.length === 0 ? (
								<div style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(237,237,237,0.2)', padding: '10px 0' }}>
									No scores yet.
								</div>
							) : (
								allScores.map((entry, i) => {
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
											<span style={{ ...styles.cell, width: 28, color: isFirst ? 'rgba(255,210,0,0.85)' : 'rgba(237,237,237,0.3)', fontWeight: 700 }}>
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
											<span style={{ ...styles.cell, width: 52, textAlign: 'right', color: isMe ? 'rgba(237,237,237,0.9)' : 'rgba(237,237,237,0.55)', fontWeight: isMe ? 700 : 400 }}>
												{entry.total}
											</span>
										</div>
									)
								})
							)}
						</div>

						{/* Modal footer */}
						{myFullRank && myFullRank > 0 && !loadingAll && (
							<div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
								<span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.25)', textTransform: 'uppercase' }}>
									Your rank:
								</span>
								<span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: myFullRank === 1 ? 'rgba(255,210,0,0.9)' : 'rgba(219,0,29,0.8)' }}>
									#{myFullRank}
								</span>
								<span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.08em', color: 'rgba(237,237,237,0.2)' }}>
									of {allScores.length}
								</span>
							</div>
						)}
					</div>
				</div>,
				document.body
			)}
		</>
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
