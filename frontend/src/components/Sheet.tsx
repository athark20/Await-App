import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Button, Icon, IconBox } from "@/src/components/ui";
import type { PillTone } from "@/src/format";

export interface SheetOption {
  key: string;
  label: string;
  subtitle?: string;
  icon?: string;
}

export function Sheet({
  visible,
  onClose,
  icon,
  tone = "brand",
  title,
  subtitle,
  options,
  onSelect,
  primary,
  secondary,
  children,
  testID = "sheet",
}: {
  visible: boolean;
  onClose: () => void;
  icon?: string;
  tone?: PillTone;
  title: string;
  subtitle?: string;
  options?: SheetOption[];
  onSelect?: (key: string) => void;
  primary?: { title: string; onPress: () => void; variant?: "primary" | "danger" | "success"; loading?: boolean };
  secondary?: { title: string; onPress: () => void };
  children?: React.ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} testID={`${testID}-backdrop`} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID={testID}>
        <View style={styles.handle} />
        {icon ? (
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <IconBox name={icon} tone={tone} size={64} />
          </View>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
        {options?.length ? (
          <View style={styles.options}>
            {options.map((o, i) => (
              <Pressable key={o.key} testID={`${testID}-option-${o.key}`} onPress={() => onSelect?.(o.key)} style={[styles.option, i < options.length - 1 && styles.optionDivider]}>
                {o.icon ? <Icon name={o.icon} size={18} color={colors.brandPrimary} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{o.label}</Text>
                  {o.subtitle ? <Text style={styles.optionSub}>{o.subtitle}</Text> : null}
                </View>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {primary ? <Button title={primary.title} onPress={primary.onPress} variant={primary.variant ?? "primary"} loading={primary.loading} testID={`${testID}-primary`} style={{ marginTop: spacing.lg }} /> : null}
        {secondary ? <Button title={secondary.title} onPress={secondary.onPress} variant="outline" testID={`${testID}-secondary`} style={{ marginTop: spacing.sm }} /> : null}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: {
    backgroundColor: c.surfaceSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: c.border,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong },
  title: { fontSize: 20, fontWeight: "800", color: c.onSurface, textAlign: "center", marginTop: 14 },
  subtitle: { fontSize: 14, color: c.muted, textAlign: "center", marginTop: 6, lineHeight: 20 },
  options: { marginTop: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden", backgroundColor: c.surface },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.lg, minHeight: 52 },
  optionDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  optionLabel: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  optionSub: { fontSize: 12.5, color: c.muted, marginTop: 2 },
}));
