import { Metadata } from 'next'

import Container from '@/components/container'
import Banner from '@/public/images/home/SPEAR_OVERCAST_Final.png'


export const metadata: Metadata = {
	title: 'Hall of Fame | Australian Special Operations Taskforce',
}


export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<Container
			title='HALL OF FAME'
			kicker='Honours'
			subtitle='Recognising the members who have shown exceptional dedication, leadership, and service to ASOT.'
			background={Banner}
			sx={{ bannerHeight: 'sm', maxWidth: 'max-w-6xl', padding: '0px' }}
		>
			<div className='py-8 px-4 md:px-10 w-full'>
				{children}
			</div>
		</Container>
	)
}
