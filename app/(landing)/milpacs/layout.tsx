import { Metadata } from "next"

export const metadata: Metadata = {
	title: "MILPACS | Australian Special Operations Taskforce",
}

export default function MilpacsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return <>{children}</>
}
