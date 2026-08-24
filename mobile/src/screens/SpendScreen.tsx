import { useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { recordSpend, SpendsApiError, type RecordSpendResult } from "../api/spendsClient";
import { parseUpiPaymentQr } from "../lib/upiQr";
import { paiseToRupeeLabel, rupeesToPaise } from "../lib/money";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

export function SpendScreen({
  session,
  pool,
  onDone,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"scan" | "form">("scan");
  const [merchantRef, setMerchantRef] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [scannedPayeeName, setScannedPayeeName] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordSpendResult | null>(null);
  // Guards against onBarcodeScanned firing repeatedly for the same code
  // while the camera keeps decoding the same frame.
  const alreadyScanned = useRef(false);

  useEffect(() => {
    if (step === "scan" && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [step, permission, requestPermission]);

  function handleBarcodeScanned(scan: BarcodeScanningResult) {
    if (alreadyScanned.current) {
      return;
    }
    const parsed = parseUpiPaymentQr(scan.data);
    if (!parsed) {
      setScanNotice("That doesn't look like a UPI QR code — try again, or enter it manually.");
      return;
    }
    alreadyScanned.current = true;
    setScanNotice(null);
    setMerchantRef(parsed.vpa);
    setScannedPayeeName(parsed.payeeName);
    if (parsed.amountRupees) {
      setAmountRupees(parsed.amountRupees);
    }
    setStep("form");
  }

  function startScanning() {
    alreadyScanned.current = false;
    setScanNotice(null);
    setStep("scan");
  }

  async function confirmSpend() {
    setError(null);
    setLoading(true);
    try {
      const res = await recordSpend(session.token, pool.id, merchantRef, rupeesToPaise(amountRupees));
      setResult(res);
    } catch (err) {
      setError(err instanceof SpendsApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.checkRing}>
          <Text style={styles.checkGlyph}>✓</Text>
        </View>
        <Text style={styles.successAmount}>
          {paiseToRupeeLabel(result.spend.amountPaise)} paid
        </Text>
        <Text style={styles.successSubtitle}>to {result.spend.merchantRef}</Text>

        <View style={styles.kvCard}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Fee</Text>
            <Text style={styles.kvValue}>{paiseToRupeeLabel(result.spend.feePaise)}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>New Pool balance</Text>
            <Text style={styles.kvValue}>{paiseToRupeeLabel(result.poolBalancePaise)}</Text>
          </View>
        </View>

        <Pressable style={styles.doneButton} onPress={onDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  if (step === "scan") {
    const permissionBlocked = permission !== null && !permission.granted && !permission.canAskAgain;

    return (
      <Screen backgroundColor={colors.ink900} edges={["top"]}>
        <View style={styles.scanContainer}>
          <Pressable onPress={onCancel} style={styles.darkBack} hitSlop={8}>
            <Text style={styles.darkBackGlyph}>{"‹"}</Text>
          </Pressable>

          <Text style={styles.scanTitle}>Scan merchant's UPI QR</Text>
          <Text style={styles.scanSubtitle}>from {pool.name}</Text>

          <View style={styles.viewfinder}>
            {permission?.granted ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={handleBarcodeScanned}
              />
            ) : (
              <ActivityIndicator color={colors.cream} />
            )}
            <View style={styles.viewfinderFrame} pointerEvents="none" />
          </View>

          {scanNotice ? <Text style={styles.scanNotice}>{scanNotice}</Text> : null}
          {permissionBlocked ? (
            <Text style={styles.scanNotice}>
              Camera access is off for Pool Pay — enable it in Settings, or enter the UPI ID manually.
            </Text>
          ) : null}

          <Pressable onPress={() => setStep("form")} style={styles.manualLink}>
            <Text style={styles.manualLinkText}>Enter manually instead</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={styles.back}>{"‹"}</Text>
        </Pressable>
        <View style={{ width: 24 }} />
      </View>
      <Text style={styles.title}>Pay a merchant</Text>
      <Text style={styles.subtitle}>from {pool.name}</Text>

      {scannedPayeeName ? (
        <Text style={styles.scannedCaption}>Scanned: {scannedPayeeName}</Text>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Merchant UPI reference</Text>
        <TextInput
          style={styles.fieldValueSmall}
          placeholder="merchant@upi"
          placeholderTextColor={colors.ink400}
          autoCapitalize="none"
          value={merchantRef}
          onChangeText={(text) => {
            setMerchantRef(text);
            setScannedPayeeName(null);
          }}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Amount (₹)</Text>
        <TextInput
          style={styles.fieldValue}
          placeholder="2500"
          placeholderTextColor={colors.ink400}
          keyboardType="decimal-pad"
          value={amountRupees}
          onChangeText={setAmountRupees}
        />
      </View>

      <Pressable onPress={startScanning} style={styles.scanAgainLink}>
        <Text style={styles.scanAgainLinkText}>Scan a QR code instead</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={styles.primaryButton}
        onPress={confirmSpend}
        disabled={loading || !amountRupees || !merchantRef.trim()}
      >
        {loading ? (
          <ActivityIndicator color={colors.paper} />
        ) : (
          <Text style={styles.primaryButtonText}>Pay ₹{amountRupees || "0"}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: spacing.s6,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.s5,
  },
  back: {
    fontSize: 24,
    color: colors.ink900,
  },
  title: {
    ...type.title,
    color: colors.ink900,
  },
  subtitle: {
    ...type.caption,
    marginBottom: spacing.s5,
  },
  scannedCaption: {
    ...type.caption,
    color: colors.green600,
    marginBottom: spacing.s3,
  },
  field: {
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    padding: spacing.s3,
    marginBottom: spacing.s4,
  },
  fieldLabel: {
    ...type.label,
  },
  fieldValue: {
    fontSize: 24,
    fontFamily: type.title.fontFamily,
    color: colors.ink900,
    marginTop: 5,
    padding: 0,
  },
  fieldValueSmall: {
    ...type.bodyBold,
    fontSize: 15,
    color: colors.ink900,
    marginTop: 5,
    padding: 0,
  },
  scanAgainLink: {
    alignSelf: "center",
    marginBottom: spacing.s2,
  },
  scanAgainLinkText: {
    ...type.caption,
    color: colors.ink600,
    textDecorationLine: "underline",
  },
  primaryButton: {
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s4,
  },
  primaryButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s2,
  },

  scanContainer: {
    flex: 1,
    backgroundColor: colors.ink900,
    alignItems: "center",
    padding: spacing.s6,
  },
  darkBack: {
    alignSelf: "flex-start",
  },
  darkBackGlyph: {
    fontSize: 24,
    color: colors.cream,
  },
  scanTitle: {
    ...type.title,
    color: colors.cream,
    marginTop: spacing.s4,
    textAlign: "center",
  },
  scanSubtitle: {
    ...type.caption,
    color: colors.ink200,
    marginTop: spacing.s1,
  },
  viewfinder: {
    width: 260,
    height: 260,
    marginTop: spacing.s7,
    borderRadius: radii.lg,
    backgroundColor: colors.ink600,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  viewfinderFrame: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.lg,
    borderWidth: 3,
    borderColor: colors.flax500,
  },
  scanNotice: {
    ...type.caption,
    color: colors.cream,
    textAlign: "center",
    marginTop: spacing.s5,
    paddingHorizontal: spacing.s4,
  },
  manualLink: {
    marginTop: spacing.s6,
  },
  manualLinkText: {
    ...type.bodyBold,
    color: colors.cream,
    textDecorationLine: "underline",
  },

  successContainer: {
    flex: 1,
    backgroundColor: colors.flax300,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.s6,
  },
  checkRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.green600,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s6,
  },
  checkGlyph: {
    fontSize: 34,
    color: colors.paper,
  },
  successAmount: {
    ...type.hero,
    color: colors.ink900,
    textAlign: "center",
  },
  successSubtitle: {
    ...type.body,
    color: colors.ink600,
    marginTop: spacing.s2,
    textAlign: "center",
  },
  kvCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    padding: spacing.s4,
    marginTop: spacing.s6,
    width: "100%",
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.s2,
  },
  kvKey: {
    ...type.body,
    color: colors.ink600,
  },
  kvValue: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  doneButton: {
    height: 48,
    backgroundColor: colors.ink900,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s6,
    marginTop: spacing.s6,
  },
  doneButtonText: {
    ...type.bodyBold,
    color: colors.cream,
  },
});
