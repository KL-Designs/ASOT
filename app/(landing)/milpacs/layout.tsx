import { Metadata } from "next"

import Container from '@/components/container'

import Banner from '@/public/images/home/Droneteam7.png'


export const metadata: Metadata = {
	title: "MILPACS | Australian Special Operations Taskforce",
}



export default function Page({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<Container title="MILPACS" subtitle="Military Personnel Accounting Centre" background={Banner} sx={{ bannerHeight: 'sm', maxWidth: 'max-w-lg' }}>

			{children}

		</Container>
	)
}