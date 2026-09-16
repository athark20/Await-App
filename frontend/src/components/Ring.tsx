import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/src/theme";

/** Circular progress ring (0–1) with a centred percentage label. */
export function Ring({ value, size = 68, stroke = 6, color, label, testID }: { value: number; size?: number; stroke?: number; color?: string; label?: string; testID?: string }) {
  const { colors } = useTheme();
  const v = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fg = color ?? colors.brandPrimary;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} testID={testID}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceTertiary} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={fg}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={{ fontSize: size * 0.24, fontWeight: "800", color: colors.onSurface }}>{label ?? `${Math.round(v * 100)}%`}</Text>
    </View>
  );
}
