import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

interface Slide {
  headline: string;
  body: string;
  illustration: (width: number) => React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    headline: "Split costs, the easy way",
    body: "Pool money with friends for trips, events, or shared living.",
    illustration: (width) => (
      <View style={styles.illustration}>
        <View style={[styles.avatarCircle, { backgroundColor: colors.flax300, left: width * 0.18 }]} />
        <View style={[styles.avatarCircle, { backgroundColor: colors.pumpkin100, left: width * 0.42 }]} />
        <View style={[styles.avatarCircle, { backgroundColor: colors.ink100, left: width * 0.66 }]} />
        <View style={styles.qrCard}>
          <View style={styles.qrGlyph} />
        </View>
      </View>
    ),
  },
  {
    headline: "Deposit your share in seconds",
    body: "Scan a QR code to pay into the Pool via UPI. No card or bank details required.",
    illustration: () => (
      <View style={styles.illustration}>
        <View style={styles.phoneCard}>
          <View style={styles.qrGlyphLarge} />
        </View>
        <View style={styles.checkBadge}>
          <Text style={styles.checkGlyph}>{"✓"}</Text>
        </View>
      </View>
    ),
  },
  {
    headline: "Full transparency, always",
    body: "Every deposit and spend is visible to the group. Leftover balances are automatically refunded when a Pool closes.",
    illustration: (width) => (
      <View style={styles.illustration}>
        <View style={styles.receiptCard}>
          <View style={styles.receiptLine} />
          <View style={[styles.receiptLine, { width: "60%" }]} />
          <View style={[styles.receiptLine, { width: "80%" }]} />
        </View>
        <View style={[styles.avatarCircle, { backgroundColor: colors.green100, left: width * 0.2, top: 40 }]} />
        <View style={[styles.avatarCircle, { backgroundColor: colors.flax100, left: width * 0.62, top: 40 }]} />
      </View>
    ),
  },
];

// First-run marketing pitch (CONTEXT.md's "Onboarding") shown once per
// install, before the person ever signs up. Uses a paging ScrollView rather
// than a carousel library — the app has no such dependency yet and this is
// the only place that would need one.
export function WelcomeCarouselScreen({ onGetStarted }: { onGetStarted: () => void }) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  }

  return (
    <Screen backgroundColor={colors.cream}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={styles.scroll}
      >
        {SLIDES.map((slide, index) => (
          <View key={index} style={[styles.slide, { width }]}>
            {slide.illustration(width)}
            <Text style={styles.headline}>{slide.headline}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, index) => (
          <View key={index} style={[styles.dot, index === activeIndex && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.button} onPress={onGetStarted}>
          <Text style={styles.buttonText}>Get Started</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  slide: {
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s7,
    alignItems: "center",
  },
  illustration: {
    width: "100%",
    height: 260,
    marginBottom: spacing.s7,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCircle: {
    position: "absolute",
    top: 70,
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  qrCard: {
    width: 120,
    height: 120,
    borderRadius: radii.lg,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  qrGlyph: {
    width: 64,
    height: 64,
    borderRadius: radii.sm,
    backgroundColor: colors.ink900,
  },
  phoneCard: {
    width: 160,
    height: 220,
    borderRadius: radii.xl,
    backgroundColor: colors.ink900,
    alignItems: "center",
    justifyContent: "center",
  },
  qrGlyphLarge: {
    width: 96,
    height: 96,
    borderRadius: radii.sm,
    backgroundColor: colors.cream,
  },
  checkBadge: {
    position: "absolute",
    bottom: 30,
    right: "22%",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.pumpkin500,
    alignItems: "center",
    justifyContent: "center",
  },
  checkGlyph: {
    ...type.bodyBold,
    fontSize: 22,
    color: colors.paper,
  },
  receiptCard: {
    width: 180,
    borderRadius: radii.lg,
    backgroundColor: colors.paper,
    padding: spacing.s4,
    gap: spacing.s2,
  },
  receiptLine: {
    height: 8,
    width: "100%",
    borderRadius: radii.sm,
    backgroundColor: colors.ink100,
  },
  headline: {
    ...type.hero,
    color: colors.ink900,
    textAlign: "center",
  },
  body: {
    ...type.body,
    color: colors.ink600,
    textAlign: "center",
    marginTop: spacing.s3,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.s2,
    marginTop: spacing.s5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink200,
  },
  dotActive: {
    backgroundColor: colors.ink900,
  },
  footer: {
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s5,
  },
  button: {
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
});
