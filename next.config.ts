import type { NextConfig } from "next"
import path from 'path'

const nextConfig: NextConfig = {
	typedRoutes: true,

	webpack(config) {
		config.resolve.alias['yjs'] = path.resolve('./node_modules/yjs')
		return config
	},
	images: {
		qualities: [100, 75],
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
				hostname: 'www.asotmilsim.com',
				pathname: '/api/gallery/fetch/**',
			},

			{
				protocol: 'https',
				hostname: 'www.asotmilsim.com',
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
				protocol: 'https',
				hostname: 'www.asotmilsim.com',
				pathname: '/api/uploads/**',
			},

			{
				protocol: "http",
				hostname: "localhost",
				port: "3000",
				pathname: "/api/uploads/**",
			},

		]
	},

	async redirects() {
		return [
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
