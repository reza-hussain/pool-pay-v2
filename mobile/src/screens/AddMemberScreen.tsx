import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Contact } from "expo-contacts";
import type { Pool } from "../api/poolsClient";
import type { StoredSession } from "../api/session";
import { InvitationsApiError, sendEqualSplitInvitation } from "../api/invitationsClient";
import { NATIONAL_NUMBER_PATTERN, PhoneNumberField } from "../components/PhoneNumberField";
import { Screen } from "../components/Screen";
import { colors, radii, spacing, type } from "../theme/tokens";

// The Organizer's direct phone/contact add on an Equal Split Pool (ticket
// #87, part of #83): picking a specific phone number or contact sends that
// person an Equal Split Invitation with no assigned amount — the Organizer
// choosing them is the approval, but they still must explicitly accept (see
// InvitationScreen) before becoming a Member. Deliberately two actions only
// — no "New contact" option, since Pool Pay isn't a contacts manager.
export function AddMemberScreen({
  session,
  pool,
  onSent,
  onShare,
  onCancel,
}: {
  session: StoredSession;
  pool: Pool;
  onSent: () => void;
  onShare: () => void;
  onCancel: () => void;
}) {
  const [nationalNumber, setNationalNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [pickingContact, setPickingContact] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = NATIONAL_NUMBER_PATTERN.test(nationalNumber);

  async function addByNationalNumber(number: string) {
    setError(null);
    try {
      await sendEqualSplitInvitation(session.token, pool.id, `+91${number}`);
      onSent();
    } catch (err) {
      setError(err instanceof InvitationsApiError ? err.message : "Something went wrong");
    }
  }

  async function submitPhoneField() {
    if (!canSend) return;
    setLoading(true);
    try {
      await addByNationalNumber(nationalNumber);
    } finally {
      setLoading(false);
    }
  }

  async function pickFromContacts() {
    setError(null);
    setPickingContact(true);
    try {
      // SDK 57 rewrote expo-contacts around a class-based Contact API (see
      // mobile/AGENTS.md) — presentPicker() opens the system contact picker,
      // which runs outside the app's own permission sandbox.
      const contact = await Contact.presentPicker();
      if (!contact) return; // user cancelled the picker

      const phones = await contact.getPhones();
      const match = phones.find((phone) => {
        const digits = (phone.number ?? "").replace(/\D/g, "");
        return NATIONAL_NUMBER_PATTERN.test(digits.slice(-10));
      });
      if (!match) {
        setError("That contact doesn't have a valid Indian mobile number.");
        return;
      }
      const digits = (match.number ?? "").replace(/\D/g, "").slice(-10);
      await addByNationalNumber(digits);
    } catch {
      setError("Couldn't access contacts — check Pool Pay's contacts permission in Settings.");
    } finally {
      setPickingContact(false);
    }
  }

  return (
    <Screen backgroundColor={colors.cream}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={styles.back}>{"‹"}</Text>
          </Pressable>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.title}>Add a Member to {pool.name}</Text>
        <Text style={styles.subtitle}>
          They still need to accept before they're a Member — but there's nothing else for you to approve.
        </Text>

        <PhoneNumberField value={nationalNumber} onChangeValue={setNationalNumber} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={styles.primaryButton}
          onPress={submitPhoneField}
          disabled={loading || pickingContact || !canSend}
        >
          {loading ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.primaryButtonText}>Add by Phone Number</Text>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={styles.outlineButton}
          onPress={pickFromContacts}
          disabled={loading || pickingContact}
        >
          {pickingContact ? (
            <ActivityIndicator color={colors.ink900} />
          ) : (
            <Text style={styles.outlineButtonText}>Choose from Contacts</Text>
          )}
        </Pressable>

        <Pressable style={[styles.outlineButton, styles.shareRow]} onPress={onShare}>
          <Text style={styles.outlineButtonText}>Share QR or Link</Text>
        </Pressable>
      </View>
    </Screen>
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
    marginBottom: spacing.s2,
  },
  subtitle: {
    ...type.caption,
    marginBottom: spacing.s5,
  },
  primaryButton: {
    height: 48,
    backgroundColor: colors.pumpkin500,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s2,
  },
  primaryButtonText: {
    ...type.bodyBold,
    color: colors.paper,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.s5,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dividerText: {
    ...type.caption,
    marginHorizontal: spacing.s3,
  },
  outlineButton: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: {
    ...type.bodyBold,
    color: colors.ink900,
  },
  shareRow: {
    marginTop: spacing.s3,
  },
  error: {
    ...type.body,
    color: colors.danger600,
    marginTop: spacing.s2,
    marginBottom: spacing.s2,
  },
});
