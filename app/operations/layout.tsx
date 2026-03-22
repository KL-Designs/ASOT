import { Metadata } from "next"

export const metadata: Metadata = {
	title: "Operations | Australian Special Operations Taskforce",
}



export default function Page({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<div className="h-full">
			{children}
		</div>
	)
}