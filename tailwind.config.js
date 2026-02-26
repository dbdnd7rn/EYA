/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./ui/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0A1B3F",
        pink: "#FF0F64",
        ink: "#111827",
        muted: "#6B7280",
        bg: "#F6F7FB",
        line: "#E1E4EF",
      },
      borderRadius: { xl: "24px", "2xl": "32px" },
    },
  },
  plugins: [],
};
