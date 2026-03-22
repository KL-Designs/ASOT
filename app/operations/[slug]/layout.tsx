import { Metadata } from "next"


// type SlugParams = { slug: string }

// export async function generateMetadata({ params }: { params: SlugParams }): Promise<Metadata> {
// 	const slug = params.slug
// 	return {
// 		title: `${slug} | Australian Special Operations Taskforce`,
// 		description: `Read about ${slug}`,
// 	}
// }



export default function Page({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<div className="h-full">
			{children}
		</div>
	)
}