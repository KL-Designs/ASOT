import { Metadata } from "next"



// export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
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