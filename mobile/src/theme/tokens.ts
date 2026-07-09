// Design tokens transcribed from docs/design/poolpay-ui-kit.html + docs/design/README.md.
// Visual values only — screen flows/fields come from the domain model, not the kit's mockups.

export const colors = {
  ink900: "#17140C",
  ink600: "#4A4536",
  ink400: "#948E7A",
  ink200: "#D8D4C6",
  ink100: "#EFECE1",

  pumpkin600: "#CB5622",
  pumpkin500: "#E8692F",
  pumpkin100: "#FAE3D6",

  flax500: "#EFD874",
  flax300: "#F6E7A3",
  flax100: "#FBF3D9",

  green600: "#2C8F52",
  green100: "#E3F3E8",

  danger600: "#B23A2E",
  danger100: "#F9E3DE",

  cream: "#FBF7EC",
  paper: "#FFFFFF",
} as const;

export const spacing = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 32,
  s8: 40,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const fontFamily = {
  regular: "Onest_400Regular",
  medium: "Onest_500Medium",
  semibold: "Onest_600SemiBold",
  bold: "Onest_700Bold",
  extrabold: "Onest_800ExtraBold",
} as const;

export const type = {
  figure: { fontSize: 32, fontFamily: fontFamily.extrabold, letterSpacing: -0.6 },
  balance: { fontSize: 29, fontFamily: fontFamily.extrabold, letterSpacing: -0.55 },
  hero: { fontSize: 25, fontFamily: fontFamily.extrabold, letterSpacing: -0.5 },
  title: { fontSize: 17, fontFamily: fontFamily.extrabold, letterSpacing: -0.17 },
  body: { fontSize: 13, fontFamily: fontFamily.semibold },
  bodyBold: { fontSize: 13, fontFamily: fontFamily.bold },
  caption: { fontSize: 11.5, fontFamily: fontFamily.semibold, color: colors.ink400 },
  label: {
    fontSize: 10.5,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    color: colors.ink400,
  },
} as const;
