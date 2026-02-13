import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0B1220",
        surface: "#0F1B2D",
        border: "#1E2A3B",
        text: "#E6EEF8",
        muted: "#A8B3C4",
        primary: "#123A6F",
        accent: "#2DD4BF",
      },
    },
  },
  plugins: [],
};

export default config;
