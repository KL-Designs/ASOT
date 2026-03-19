import { Metadata } from "next"
import Link from 'next/link'

import { Button } from '@mui/material'
import { OpenInNew } from '@mui/icons-material'

import Container from "@/components/container"


import Banner from '@/public/images/home/3DMA_Final2.png'



export const metadata: Metadata = {
	title: "ORBAT | Australian Special Operations Taskforce"
}



export default function Page() {
	return (
		<Container
			title="OUR ORBAT"
			subtitle="Our order of battle (ORBAT) is based around the current Australian Defense Force (ADF) structure with some custom changes that suit our style of game play and desires."
			background={Banner}
			sx={{ bannerHeight: 'md', maxWidth: 'max-w-[1400px]', padding: '2rem', gap: 'gap-5' }}
		>

			<div className="flex justify-center">
				<Link href='https://docs.google.com/spreadsheets/d/1rkzQSPimBYV3UDp-CFHUfQo59yww_xbj9UTPGWBzSL0/edit?usp=sharing' target="_blank">
					<Button variant="outlined" color="primary" size="large" endIcon={<OpenInNew />}>Open Full ORBAT</Button>
				</Link>
			</div>

			<div style={{
				border: '1px solid rgba(219,0,29,0.2)',
				borderTop: '2px solid var(--red)',
				background: 'rgba(219,0,29,0.02)',
				overflow: 'hidden',
			}}>
				<div style={{ zoom: 0.72, scrollbarWidth: 'none', overflow: 'auto' }}>
					<iframe
						style={{ display: 'block', width: 1900, height: 1450, border: 'none', pointerEvents: 'none', userSelect: 'none' }}
						src="https://docs.google.com/spreadsheets/d/e/2PACX-1vSblfrp4eHK6O0P73vF1vTxwEp_QkqTh52UEXPPiGSlwv6ba39UltnhAvqahEz1-hhfxC80qMsMxuJL/pubhtml?gid=275180000&single=true&widget=true&headers=false"
					/>
				</div>
			</div>

		</Container>
	)
}
