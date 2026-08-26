import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii, spacing, type } from "../theme/tokens";

// India-only v1 (ADR 0003) — Indian mobile numbers are 10 digits starting with 6-9.
export const NATIONAL_NUMBER_PATTERN = /^[6-9]\d{9}$/;

// Shared by every screen that collects a +91 national number to look up an
// existing Pool Pay account by phone (InviteByPhoneScreen, AddMemberScreen).
export function PhoneNumberField({
  value,
  onChangeValue,
  hint = "They must already have a Pool Pay account.",
}: {
  value: string;
  onChangeValue: (value: string) => void;
  hint?: string | null;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Phone number</Text>
      <View style={styles.phoneRow}>
        <Text style={styles.phonePrefix}>+91</Text>
        <View style={styles.phoneDivider} />
        <TextInput
          style={styles.phoneInput}
          placeholder="98765 43210"
          placeholderTextColor={colors.ink400}
          keyboardType="number-pad"
          maxLength={10}
          value={value}
          onChangeText={(text) => onChangeValue(text.replace(/\D/g, ""))}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: colors.fieldFill,
    borderRadius: radii.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  fieldLabel: {
    ...type.label,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },
  phonePrefix: {
    fontSize: 15,
    fontFamily: type.bodyBold.fontFamily,
    color: colors.ink400,
  },
  phoneDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.lineStrong,
    marginHorizontal: spacing.s2,
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: type.bodyBold.fontFamily,
    color: colors.ink900,
    padding: 0,
  },
  hint: {
    ...type.caption,
    marginTop: spacing.s2,
  },
});
