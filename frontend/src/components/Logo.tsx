import React from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { View, Text } from "react-native";
import { makeStyles, useTheme } from "@/src/theme";

// Final Await brand: open electric-blue loop + small amber dot.
export function LogoMark({ size = 64 }: { size?: number }) {
  const { colors } = useTheme();
  const s = size;
  const stroke = s * 0.13;
  const r = s / 2 - stroke;
  const c = s / 2;
  // Arc from ~40° to ~320° leaving an opening at the top-right
  const start = polar(c, c, r, 300);
  const end = polar(c, c, r, 40);
  const d = `M ${start.x} ${start.y} A ${r} ${r} 0 1 0 ${end.x} ${end.y}`;
  const dot = polar(c, c, r, 350);
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Path d={d} stroke={colors.brandPrimary} strokeWidth={stroke} strokeLinecap="round" fill="none" />
      <Circle cx={dot.x} cy={dot.y} r={stroke * 0.62} fill={colors.warning} />
    </Svg>
  );
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function LogoLockup({ size = 72, tagline }: { size?: number; tagline?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.wrap} testID="await-logo">
      <View style={styles.badge}>
        <LogoMark size={size * 0.62} />
      </View>
      <Text style={styles.name}>Await</Text>
      {tagline ? <Text style={styles.tag}>{tagline}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", gap: 10 },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 32, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  tag: { fontSize: 15, color: c.muted, textAlign: "center" },
}));
