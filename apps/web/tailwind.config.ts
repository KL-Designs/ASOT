import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },

      height: {
        'banner-xsm': '10vh',
        'banner-xsm-md': '20vh',
        'banner-sm': '20vh',
        'banner-sm-md': '40vh',
        'banner-md': '40vh',
        'banner-md-md': '60vh',
        'banner-lg': '60vh',
        'banner-lg-md': '80vh',
      },

      maxWidth: {
        'sm': '800px',
        'md': '1200px',
        'lg': '1500px',
        'xl': '1800px',
      }
    },
  },
  plugins: [],
  important: true,
};
export default config;
