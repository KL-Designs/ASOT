import { Metadata } from "next"

import Container from '@/components/container'

import Banner from '@/public/images/home/adf_peaking3.png'


export const metadata: Metadata = {
	title: "Gallery | Australian Special Operations Taskforce",
}


export default function Page({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<Container title='GALLERY' background={Banner} sx={{ bannerHeight: 'xsm', maxWidth: '100%', padding: '0px' }}>
			<div className='py-5 px-4 md:px-10 w-full'>

				{children}

			</div>
		</Container>
	)
}