import Container from '@/components/container'
import ThomoFire from '@/public/thomo/fire.png'


export default function Page() {
	return (
		<Container title='Enter Lieutenant General Thomas' kicker='Easter egg' background={ThomoFire} sx={{ maxWidth: 'max-w-xl', bannerHeight: 'lg' }}>

			<div className='grid grid-cols-2 md:grid-cols-4 gap-5'>
				{[
					'tred.png',
					'tred-uwu.png',
					'meme.gif',
					'gifPerms.gif',
					'mci.gif',
					'mci2.gif',
					'meme_1.gif',
					'meme_2.gif',
					'meme_3.gif',
					'meme_4.gif',
					'meme_5.gif',
					'meme_6.gif',
					'meme_7.gif',
					'meme_8.gif',
					'meme_9.gif',
					'meme_10.gif',
					'meme.gif',
					'simpsons.gif',
					'image.png',
				].map((image, i) => (
					<img key={i} src={`/thomo/${image}`} className='m-auto' alt='' />
				))}
			</div>

		</Container>
	)
}