import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	typedRoutes: true,
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
			{
				source: '/login',
				destination: `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_BASEURL! + process.env.DISCORD_REDIRECT_URI!)}&scope=${process.env.DISCORD_SCOPE!.split(' ').join('+')}`,
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
