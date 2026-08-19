import type { Metadata, Viewport } from "next"
import { Montserrat, Barlow_Condensed, Oswald, JetBrains_Mono, Inter } from "next/font/google"
import "@/styles/globals.css"
import { headers } from "next/headers"


import { ThemeProvider } from "@mui/material"
import UnitTheme from '@/themes/unit'
import Navbar from './navbar'
import Footer from "./footer"
import CustomCursor from '@/components/cursor'


const montserrat = Montserrat({ subsets: ["latin"] })

/*
 * The Command Strip type set, exposed as CSS variables rather than applied as
 * classes: `styles/globals.css` wraps each in a `--font-*` alias with its
 * fallback stack, and components reference only those. Declared site-wide (not
 * scoped to the navbar) so other surfaces can adopt the display/mono faces.
 * Montserrat stays the default body font on <body>.
 */
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow-condensed" })
const oswald = Oswald({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-oswald" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-jetbrains-mono" })
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter" })

const fontVariables = [barlowCondensed, oswald, jetbrainsMono, inter].map(f => f.variable).join(' ')

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
		<html lang="en" className={`h-full ${fontVariables}`}>
			<head>
				<link rel="apple-touch-icon" href="/banner.jpg" />
			</head>

			<body className={`${montserrat.className}  antialiased h-full`}>
				<CustomCursor />
				<ThemeProvider theme={UnitTheme}>
					<div className="h-full flex flex-col">

						{/* Above the footer, not level with it. Both were zIndex 1, so DOM
						    order decided and the footer won — which trapped the navbar's
						    scroll-to-top button (fixed, z-index 50) inside a stacking
						    context the footer painted over. A sticky bar should sit above
						    the whole page regardless. */}
						<div id="site-navbar" style={{ zIndex: 20 }}>
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
