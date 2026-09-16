import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View, type ColorValue, type TextInputProps, type ViewStyle } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { makeStyles, radius, spacing, useTheme, type ThemeColors } from "@/src/theme";
import type { PillTone } from "@/src/format";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 20, color }: { name: IconName | string; size?: number; color?: string | ColorValue }) {
  const { colors } = useTheme();
  return <Ionicons name={name as IconName} size={size} color={(color ?? colors.onSurface) as string} />;
}

// ---------------------------------------------------------------- Button
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  testID,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName | string;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
  small?: boolean;
}) {
  const styles = useBtn();
  const { colors } = useTheme();
  const bg: Record<Variant, string> = {
    primary: colors.brandPrimary,
    secondary: colors.surfaceTertiary,
    ghost: "transparent",
    danger: colors.error,
    success: colors.success,
    outline: colors.surfaceSecondary,
  };
  const fg: Record<Variant, string> = {
    primary: colors.onBrandPrimary,
    secondary: colors.onSurface,
    ghost: colors.brandPrimary,
    danger: colors.onError,
    success: colors.onBrandPrimary,
    outline: colors.onSurface,
  };
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: bg[variant], opacity: pressed ? 0.85 : disabled ? 0.5 : 1 },
        variant === "outline" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg[variant]} /> : null}
          <Text style={[styles.label, small && styles.smallLabel, { color: fg[variant] }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}
const useBtn = makeStyles(() => ({
  base: { height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 20 },
  small: { height: 40, paddingHorizontal: 14, borderRadius: radius.sm },
  label: { fontSize: 16, fontWeight: "700" },
  smallLabel: { fontSize: 14 },
}));

// ---------------------------------------------------------------- Pill
export function Pill({ text, tone = "neutral", testID }: { text: string; tone?: PillTone; testID?: string }) {
  const { colors } = useTheme();
  const map: Record<PillTone, [string, string]> = {
    error: [colors.errorTint, colors.error],
    warning: [colors.warningTint, colors.warning],
    success: [colors.successTint, colors.success],
    neutral: [colors.surfaceTertiary, colors.muted],
    brand: [colors.brandTertiary, colors.onBrandTertiary],
    purple: [colors.purpleTint, colors.purple],
  };
  const [bg, fg] = map[tone];
  return (
    <View testID={testID} style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, height: 26, justifyContent: "center", flexShrink: 0 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- IconBox (category / row icon)
export function IconBox({ name, tone = "brand", size = 40, letter }: { name?: IconName | string; tone?: PillTone; size?: number; letter?: string }) {
  const { colors } = useTheme();
  const map: Record<PillTone, [string, string]> = {
    error: [colors.errorTint, colors.error],
    warning: [colors.warningTint, colors.warning],
    success: [colors.successTint, colors.success],
    neutral: [colors.surfaceTertiary, colors.muted],
    brand: [colors.brandTertiary, colors.onBrandTertiary],
    purple: [colors.purpleTint, colors.purple],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {letter ? <Text style={{ color: fg, fontSize: size * 0.45, fontWeight: "800" }}>{letter}</Text> : <Icon name={name!} size={size * 0.5} color={fg} />}
    </View>
  );
}

// ---------------------------------------------------------------- Card
export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  const styles = useCard();
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}
const useCard = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg },
}));

// ---------------------------------------------------------------- Header
export function ScreenHeader({ title, right, onBack, testID }: { title?: string; right?: React.ReactNode; onBack?: () => void; testID?: string }) {
  const styles = useHeader();
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={styles.row} testID={testID}>
      <Pressable testID="header-back-button" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/(tabs)")))} style={styles.back} hitSlop={8}>
        <Icon name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}
const useHeader = makeStyles((c) => ({
  row: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: c.onSurface },
  right: { minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
}));

// ---------------------------------------------------------------- Section title
export function SectionTitle({ title, count, action, onAction }: { title: string; count?: number; action?: string; onAction?: () => void }) {
  const styles = useSection();
  return (
    <View style={styles.row}>
      <Text style={styles.title}>
        {title}
        {count !== undefined ? <Text style={styles.count}> ({count})</Text> : null}
      </Text>
      {action ? (
        <Pressable onPress={onAction} testID={`section-action-${title.toLowerCase().replace(/\s/g, "-")}`}>
          <Text style={styles.action}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const useSection = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  count: { color: c.muted, fontWeight: "600" },
  action: { color: c.brandPrimary, fontWeight: "600", fontSize: 14 },
}));

// ---------------------------------------------------------------- Field
export function Field({ label, hint, style, testID, ...props }: TextInputProps & { label?: string; hint?: string; style?: ViewStyle; testID?: string }) {
  const styles = useField();
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        style={[styles.input, props.multiline && styles.multiline]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}
const useField = makeStyles((c) => ({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary },
  input: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    paddingHorizontal: 14,
    fontSize: 15,
    color: c.onSurface,
  },
  multiline: { height: 96, paddingTop: 12, textAlignVertical: "top" },
  hint: { fontSize: 12, color: c.muted },
}));

// ---------------------------------------------------------------- List row (settings)
export function ListRow({
  icon,
  tone = "brand",
  title,
  subtitle,
  value,
  onPress,
  toggle,
  onToggle,
  testID,
  danger,
  last,
}: {
  icon?: IconName | string;
  tone?: PillTone;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  testID?: string;
  danger?: boolean;
  last?: boolean;
}) {
  const styles = useRow();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress ?? (onToggle ? () => onToggle(!toggle) : undefined)} style={({ pressed }) => [styles.row, !last && styles.divider, pressed && onPress && { opacity: 0.7 }]}>
      {icon ? <IconBox name={icon} tone={danger ? "error" : tone} size={36} /> : null}
      <View style={styles.body}>
        <Text style={[styles.title, danger && { color: colors.error }]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {onToggle ? (
        <Switch value={!!toggle} onValueChange={onToggle} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor={colors.surfaceSecondary} />
      ) : onPress ? (
        <Icon name="chevron-forward" size={18} color={colors.muted} />
      ) : null}
    </Pressable>
  );
}
const useRow = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: spacing.lg, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  subtitle: { fontSize: 12.5, color: c.muted, marginTop: 2 },
  value: { fontSize: 13, color: c.muted },
}));

export function Group({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const styles = useGroup();
  return <View style={[styles.group, style]}>{children}</View>;
}
const useGroup = makeStyles((c) => ({
  group: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
}));

// ---------------------------------------------------------------- Chips (36pt chips, 56pt row)
export function Chips<T extends string>({ options, value, onChange, testID }: { options: { key: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  const styles = useChips();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} contentContainerStyle={styles.content} testID={testID}>
      {options.map((o) => {
        const sel = o.key === value;
        return (
          <Pressable key={o.key} testID={`${testID ?? "chip"}-${o.key.toLowerCase().replace(/_/g, "-")}`} onPress={() => onChange(o.key)} style={[styles.chip, sel && styles.chipSel]}>
            <Text style={[styles.chipText, sel && styles.chipTextSel]}>
              {o.label}
              {o.count !== undefined ? ` ${o.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
const useChips = makeStyles((c) => ({
  row: { height: 56, flexGrow: 0 },
  content: { gap: 8, paddingHorizontal: spacing.xl, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, justifyContent: "center", flexShrink: 0 },
  chipSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontSize: 13.5, fontWeight: "600", color: c.onSurfaceTertiary },
  chipTextSel: { color: c.onBrandPrimary },
}));

// ---------------------------------------------------------------- State selector
export function StateSelector({ value, onChange, includeDone = true, testID = "state-selector" }: { value: string; onChange: (s: "MY_TURN" | "THEIR_TURN" | "DONE") => void; includeDone?: boolean; testID?: string }) {
  const styles = useStateSel();
  const opts: ["MY_TURN" | "THEIR_TURN" | "DONE", string][] = [["MY_TURN", "My Turn"], ["THEIR_TURN", "Their Turn"]];
  if (includeDone) opts.push(["DONE", "Done"]);
  return (
    <View style={styles.row} testID={testID}>
      {opts.map(([k, label]) => {
        const sel = value === k;
        return (
          <Pressable key={k} testID={`${testID}-${k.toLowerCase().replace("_", "-")}`} onPress={() => onChange(k)} style={[styles.opt, sel && styles.optSel]}>
            <Text style={[styles.optText, sel && styles.optTextSel]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const useStateSel = makeStyles((c) => ({
  row: { flexDirection: "row", gap: 8 },
  opt: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  optSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  optText: { fontSize: 14, fontWeight: "600", color: c.onSurfaceTertiary },
  optTextSel: { color: c.onBrandPrimary },
}));

// ---------------------------------------------------------------- Empty state
export function EmptyState({ icon, tone = "brand", title, subtitle, cta, onCta, testID }: { icon: IconName | string; tone?: PillTone; title: string; subtitle?: string; cta?: string; onCta?: () => void; testID?: string }) {
  const styles = useEmpty();
  return (
    <View style={styles.wrap} testID={testID}>
      <IconBox name={icon} tone={tone} size={88} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {cta ? <Button title={cta} onPress={onCta} testID={`${testID ?? "empty"}-cta`} style={{ alignSelf: "stretch", marginTop: 8 }} /> : null}
    </View>
  );
}
const useEmpty = makeStyles((c) => ({
  wrap: { alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: spacing.xl },
  title: { fontSize: 20, fontWeight: "800", color: c.onSurface, marginTop: 8, textAlign: "center" },
  subtitle: { fontSize: 14.5, color: c.muted, textAlign: "center", lineHeight: 21 },
}));

// ---------------------------------------------------------------- Info banner
export function Banner({ icon, text, tone = "brand", testID }: { icon: IconName | string; text: string; tone?: PillTone; testID?: string }) {
  const { colors } = useTheme();
  const map: Record<PillTone, [string, string]> = {
    error: [colors.errorTint, colors.error],
    warning: [colors.warningTint, colors.warning],
    success: [colors.successTint, colors.success],
    neutral: [colors.surfaceTertiary, colors.muted],
    brand: [colors.brandTertiary, colors.onBrandTertiary],
    purple: [colors.purpleTint, colors.purple],
  };
  const [bg, fg] = map[tone];
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: bg, borderRadius: radius.md, padding: 12 }}>
      <Icon name={icon} size={18} color={fg} />
      <Text style={{ flex: 1, color: colors.onSurface, fontSize: 13.5, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

export function useToneColors(): Record<PillTone, [string, string]> {
  const { colors } = useTheme();
  return toneMap(colors);
}
export function toneMap(colors: ThemeColors): Record<PillTone, [string, string]> {
  return {
    error: [colors.errorTint, colors.error],
    warning: [colors.warningTint, colors.warning],
    success: [colors.successTint, colors.success],
    neutral: [colors.surfaceTertiary, colors.muted],
    brand: [colors.brandTertiary, colors.onBrandTertiary],
    purple: [colors.purpleTint, colors.purple],
  };
}
