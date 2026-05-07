import Image, { StaticImageData } from 'next/image'

export function CallsignCard({ title, images, children }: { title: string, images: StaticImageData[], children: React.ReactNode }) {
	return (
		<div
			className='flex flex-col h-full'
			style={{
				border: '1px solid rgba(255,255,255,0.07)',
				borderTop: '2px solid var(--red)',
				background: 'rgba(255,255,255,0.02)',
			}}
		>
			<div className='relative w-full h-[220px] overflow-hidden flex'>
				{images.map((img, i) => (
					<div key={i} className='relative flex-1 h-full'>
						<Image src={img} alt={title} fill className='object-cover' />
					</div>
				))}
				<div className='absolute inset-0' style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.3) 50%, transparent 100%)' }} />
				<div className='absolute bottom-0 left-0 p-4'>
					<span style={{ fontWeight: 700, letterSpacing: '0.12em', fontSize: '1rem', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
						{title.toUpperCase()}
					</span>
					<div style={{ height: 2, width: 32, background: 'var(--red)', marginTop: 4 }} />
				</div>
			</div>

			<div className='flex flex-col gap-2 p-5'>
				{children}
			</div>
		</div>
	)
}
