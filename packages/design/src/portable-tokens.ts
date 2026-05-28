export const appaloftPortableDesignTokens = {
  color: {
    accent: "#f2f7ff",
    accentForeground: "#2857c8",
    background: "#ffffff",
    border: "#d9e2f2",
    card: "#ffffff",
    foreground: "#1b2738",
    muted: "#fbfdff",
    mutedForeground: "#64748d",
    primary: "#4e84ff",
    primaryForeground: "#ffffff",
    secondary: "#f8fbff",
    secondaryForeground: "#273951",
  },
  fontFamily: {
    mono: [
      "IBM Plex Mono",
      "SFMono-Regular",
      "SF Mono",
      "Menlo",
      "Monaco",
      "Consolas",
      "Liberation Mono",
      "monospace",
    ],
    sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
    serif: ["Fraunces", "ui-serif", "Georgia", "serif"],
  },
  radius: {
    sm: "4px",
    md: "6px",
    lg: "8px",
  },
  shadow: {
    sm: "0 1px 2px 0 hsl(214 48% 19% / 6%), 0 1px 1px -1px hsl(214 48% 19% / 6%)",
  },
} as const;
