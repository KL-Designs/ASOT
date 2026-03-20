import type { Metadata, Viewport } from "next"
import { Montserrat, IBM_Plex_Sans } from "next/font/google"
import "@/styles/globals.css"
import { headers } from "next/headers"


import { ThemeProvider } from "@mui/material"
import UnitTheme from '@/themes/unit'
import Navbar from './navbar'
import Footer from "./footer"
import CustomCursor from '@/components/cursor'


const montserrat = Montserrat({ subsets: ["latin"] })
const plex = IBM_Plex_Sans({ weight: "500", subsets: ["latin"] })

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
		description: "Australia's premiere ARMA 3 milsim community. Recruiting now! 17+ unless vouched for by a current member. Any experience level is welcome!",
		keywords: ["arma", "arma 3", "australian", "special", "operations", "taskforce", "asot", "milsim"],
		twitter: {
			images: `${base}meta_banner.png`
		},
		openGraph: {
			images: `${base}meta_banner.png`
		}
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

						<div style={{ zIndex: 1 }}>
							<Navbar />
						</div>

						<div style={{ zIndex: 0 }} className="flex-grow">
							{children}
						</div>

						<div style={{ zIndex: 1 }}>
							<Footer />
						</div>

					</div>
				</ThemeProvider>
			</body>
		</html>
	)
}
