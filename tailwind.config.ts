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
        bg: "#FFFFFF",
        surface: "#F7F7F7",
        border: "#E5E5E5",
        text: "#111111",
        muted: "#666666",
        primary: "#1A56DB",
        accent: "#3B82F6",
        success: "#22C55E",
        ink: "#0B1020",
        tape: "#FFD400",
        paper: "#EEF2FB",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "Barlow Condensed", "Arial Narrow", "sans-serif"],
        body: ["var(--font-body)", "Barlow", "system-ui", "sans-serif"],
        data: ["var(--font-data)", "ui-monospace", "monospace"],
      },
      keyframes: {
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        scan: { "0%": { transform: "translateY(-10%)", opacity: "0" }, "10%": { opacity: "1" }, "90%": { opacity: "1" }, "100%": { transform: "translateY(110%)", opacity: "0" } },
      },
      animation: {
        marquee: "marquee 38s linear infinite",
        scan: "scan 3.6s cubic-bezier(0.4,0,0.2,1) 1.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
