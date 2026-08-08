import { Metadata } from "next"

import Container from '@/components/container'

import Banner from '@/public/images/home/Droneteam7.png'


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