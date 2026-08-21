import type { NextConfig } from "next"
import path from 'path'

const nextConfig: NextConfig = {
	typedRoutes: true,
	poweredByHeader: false,

	// apps/web isn't an npm workspace member (apps/bot is), but the monorepo root still has
	// its own package-lock.json for that workspace — pin the root explicitly so Next doesn't
	// have to guess between the two lockfiles it finds walking up from here.
	outputFileTracingRoot: __dirname,

	// @napi-rs/canvas ships a native .node binary that webpack cannot bundle.
	// Marking it external keeps it as a require() at runtime on the server.
	serverExternalPackages: ['@napi-rs/canvas', 'unzipper', 'archiver', 'ts3-nodejs-library', 'undici'],

	webpack(config) {
		// require.resolve (not a hardcoded path) so this still finds the single yjs instance
		// after npm workspaces hoists it to the monorepo root node_modules/.
		config.resolve.alias['yjs'] = path.dirname(require.resolve('yjs/package.json'))
		return config
	},
	images: {
		qualities: [100, 75, 50, 25],
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'cdn.discordapp.com',
				pathname: '/avatars/**/**',
			},

			{
				protocol: 'https',
				hostname: 'cdn.discordapp.com',
				pathname: '/banners/**/**',
			},

			{
				protocol: 'https',
				hostname: 'cdn.discordapp.com',
				pathname: '/embed/avatars/**',
			},

			{
				protocol: 'https',
				hostname: '*.asotmilsim.com',
				pathname: '/api/gallery/fetch/**',
			},

			{
				protocol: 'https',
				hostname: '*.asotmilsim.com',
				pathname: '/api/gallery/featured/**',
			},

			{
				protocol: 'https',
				hostname: 'asotmilsim.com',
				pathname: '/api/gallery/fetch/**',
			},

			{
				protocol: 'https',
				hostname: 'asotmilsim.com',
				pathname: '/api/gallery/featured/**',
			},

			{
				protocol: "http",
				hostname: "localhost",
				port: "3000",
				pathname: "/api/gallery/fetch/**",
			},

			{
				protocol: "http",
				hostname: "localhost",
				port: "3000",
				pathname: "/api/gallery/featured/**",
			},

			{
				protocol: "http",
				hostname: "192.168.0.125",
				port: "3000",
				pathname: "/api/gallery/fetch/**",
			},

			{
				protocol: "http",
				hostname: "192.168.0.125",
				port: "3000",
				pathname: "/api/gallery/featured/**",
			},


			{
				protocol: 'https',
				hostname: '*.asotmilsim.com',
				pathname: '/api/uploads/**',
			},

			{
				protocol: 'https',
				hostname: 'asotmilsim.com',
				pathname: '/api/uploads/**',
			},

			{
				protocol: "http",
				hostname: "localhost",
				port: "3000",
				pathname: "/api/uploads/**",
			},

			{
				protocol: "http",
				hostname: "192.168.0.125",
				port: "3000",
				pathname: "/api/uploads/**",
			},

		]
	},

	async headers() {
		return [
			{
				source: '/(.*)',
				headers: [
					{ key: 'X-Frame-Options', value: 'DENY' },
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
					{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
					{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
				],
			},
		]
	},

	async rewrites() {
		return [
			{
				source: '/map-assets/:path*',
				destination: '/api/maps/assets/:path*',
			},
		]
	},

	async redirects() {
		return [
			{
				source: '/dashboard/gallery',
				destination: '/dashboard/j5',
				permanent: true,
			},
			{
				source: '/community/tickets',
				destination: '/tickets',
				permanent: true,
			},
			{
				source: '/community/tickets/:path*',
				destination: '/tickets/:path*',
				permanent: true,
			},
			// The rest of /community followed tickets up to the top level:
			// /community/orbat is /orbat, and so on for bios, hof, kits, quiz
			// and retired. One catch-all rather than six entries, because the
			// mapping is the same for every one of them and a seventh page
			// moved later shouldn't need a seventh rule. `:path*` matches zero
			// or more segments, so the bare /community lands on `/` too — it
			// never had a page of its own to keep.
			//
			// A redirect and not middleware: this repo's middleware matcher is
			// kept deliberately narrow (see the docstring in middleware.ts —
			// broad matchers run on the internal _rsc requests a client-side
			// navigation makes and break some of them), and the two
			// /community/tickets rules above already set the precedent.
			{
				source: '/community/:path*',
				destination: '/:path*',
				permanent: true,
			},
			{
				source: '/feedback',
				destination: '/tickets',
				permanent: true,
			},
			{
				source: '/feedback/:path*',
				destination: '/tickets/:path*',
				permanent: true,
			},
			{
				source: '/ts',
				destination: `ts3server://ts.asotmilsim.com`,
				permanent: false,
			},
			// {
			// 	source: '/dashboard',
			// 	destination: '/dashboard/account',
			// 	permanent: true,
			// },
			// {
			// 	source: '/dashboard/unit',
			// 	destination: '/dashboard/unit/ranks',
			// 	permanent: true,
			// },


			{
				source: '/:path*',
				has: [
					{
						type: 'host',
						value: 'www.asotmilsim.net',
					}
				],
				destination: `${process.env.NEXT_PUBLIC_BASEURL}/:path*`,
				permanent: true,
			},
			{
				source: '/:path*',
				has: [
					{
						type: 'host',
						value: 'asotmilsim.net',
					}
				],
				destination: `${process.env.NEXT_PUBLIC_BASEURL}/:path*`,
				permanent: true,
			},
			{
				source: '/:path*',
				has: [
					{
						type: 'host',
						value: 'asotmilsim.com',
					}
				],
				destination: `${process.env.NEXT_PUBLIC_BASEURL}/:path*`,
				permanent: true,
			},

			{
				source: '/:path*',
				has: [
					{
						type: 'header',
						key: 'x-forwarded-proto',
						value: 'http',
					}
				],
				destination: `${process.env.NEXT_PUBLIC_BASEURL}/:path*`,
				permanent: true,
			},
		];
	}
}

export default nextConfig
