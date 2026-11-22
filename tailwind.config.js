/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "Segoe UI", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      colors: {
        ink: "#3f3a46",
        muted: "#7c7484",
        cream: "#fbf8f2",
        parchment: "#f6f0e7",
        powder: "#dce8f5",
        sage: "#dfe9dc",
        peach: "#f6e1d3",
        lavender: "#e7e0f3",
        rose: "#f3dfe2",
        clay: "#c88f78",
        moss: "#718a70",
        slateblue: "#7b8fa8",
      },
      boxShadow: {
        soft: "0 10px 40px -18px rgba(71, 59, 82, 0.24)",
        lift: "0 18px 50px -22px rgba(71, 59, 82, 0.35)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};
