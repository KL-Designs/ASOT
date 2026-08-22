// export const metadata: Metadata = {
// 	title: "Australian Special Operations Taskforce",
// }



export default function Page({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<div className="h-full">
			{children}
		</div>
	)
}