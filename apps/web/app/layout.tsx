import type { Metadata, Viewport } from "next"
import { Montserrat } from "next/font/google"
import "@/styles/globals.css"
import { headers } from "next/headers"


import { ThemeProvider } from "@mui/material"
import UnitTheme from '@/themes/unit'
import Navbar from './navbar'
import Footer from "./footer"
import CustomCursor from '@/components/cursor'


const montserrat = Montserrat({ subsets: ["latin"] })

export const viewport: Viewport = {
	themeColor: "#9d000c",
	width: 'device-width',
	initialScale: 1,
}

export async function generateMetadata(): Promise<Metadata> {
	const hdrs = await headers()
	const host = hdrs.get('host') ?? 'localhost:3000'
	const proto = hdrs.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
	const base = new URL(`${proto}://${host}`)

	return {
		metadataBase: base,
		title: "Australian Special Operations Taskforce",
		description: "Home of the Australian Special Operations Taskforce — Australia's premier ARMA 3 milsim unit. Tactical gameplay, real military structure, and a welcoming community.",
		keywords: ["arma", "arma 3", "australian", "special", "operations", "taskforce", "asot", "milsim"],
	}
}



export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className="h-full">
			<head>
				<link rel="apple-touch-icon" href="/banner.jpg" />
			</head>

			<body className={`${montserrat.className}  antialiased h-full`}>
				<CustomCursor />
				<ThemeProvider theme={UnitTheme}>
					<div className="h-full flex flex-col">

						<div id="site-navbar" style={{ zIndex: 1 }}>
							<Navbar />
						</div>

						<div style={{ zIndex: 0 }} className="flex-grow">
							{children}
						</div>

						<div id="site-footer" style={{ zIndex: 1 }}>
							<Footer />
						</div>

					</div>
				</ThemeProvider>
			</body>
		</html>
	)
}
