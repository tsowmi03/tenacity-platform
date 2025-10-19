module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/modules/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      transformOrigin: {
        center: "center",
      },
      perspective: {
        "1000": "1000px",
      },
      rotate: {
        "y-180": "180deg",
      },
      animation: {
        expand: "expand 0.6s ease-out",
        close: "close 0.6s ease-in",
        scale: "scale 1s infinite",
        slideInRight: "slideInRight 0.5s ease-out forwards",
      },
      keyframes: {
        expand: {
          "0%": { opacity: 0, transform: "scale(0.95)" },
          "100%": { opacity: 1, transform: "scale(1)" },
        },
        close: {
          "0%": { opacity: 1, transform: "scale(1)" },
          "100%": { opacity: 0, transform: "scale(0.95)" },
        },
        scale: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.1)" },
        },
        slideInRight: {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
      transitionProperty: {
        width: "width",
        spacing: "margin, padding",
      },
      maxWidth: {
        "8xl": "100rem",
      },
      screens: {
        "2xsmall": "320px",
        xsmall: "512px",
        small: "1024px",
        medium: "1280px",
        large: "1440px",
        xlarge: "1680px",
        "2xlarge": "1920px",
      },
      fontFamily: {
        montserrat: ["Montserrat", "sans-serif"],
      },
      colors: {
        primary: {
          DEFAULT: "#1C71AF", // Bright Blue
          dark: "#145a8a", // Royal Blue
          light: "#5aa5e3", // Sky Blue
          lighter: "#d6ebf7", // Very Light Blue for light backgrounds
        },
        navy: {
          DEFAULT: "#1B3F71", // Navy Blue
          dark: "#112d4f", // Deep Navy
          light: "#4d6999", // Light Navy
        },
        accent: {
          coral: "#ff6f61", // Coral
          yellow: "#ffc107", // Golden Yellow
          mint: "#6edfa8", // Mint Green
          lavender: "#b19cd9", // Lavender
        },
        neutral: {
          light: "#f5f5f5", // Soft Gray
          DEFAULT: "#9ea5b2", // Cool Gray
          dark: "#333333", // Charcoal
        },
      },
      boxShadow: {
        custom:
          "0 10px 28px rgba(0, 0, 0, 0.25), 0 -10px 28px rgba(0, 0, 0, 0.22)",
      },
    },
  },
  plugins: [],
};
