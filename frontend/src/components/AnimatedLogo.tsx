import React, { useEffect } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useTheme } from "@/src/theme";

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Brand motion: the open loop draws itself, then the amber dot pops in and keeps a gentle pulse. */
export function AnimatedLogoMark({ size = 72 }: { size?: number }) {
  const { colors } = useTheme();
  const stroke = size * 0.17;
  const r = size / 2 - stroke;
  const c = size / 2;
  const start = polar(c, c, r, 78);
  const end = polar(c, c, r, 12);
  const d = `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`;
  const dot = polar(c, c, r * 1.02, 45);
  const length = 2 * Math.PI * r * (294 / 360) + stroke;

  const progress = useSharedValue(0);
  const dotScale = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    dotScale.value = withDelay(
      1000,
      withSequence(
        withTiming(1.25, { duration: 260, easing: Easing.out(Easing.back(2)) }),
        withTiming(1, { duration: 180 }),
        withRepeat(withSequence(withTiming(1.18, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1, false),
      ),
    );
  }, [progress, dotScale]);

  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));
  const dotProps = useAnimatedProps(() => ({ r: stroke * 0.72 * dotScale.value }));

  return (
    <View style={{ width: size, height: size }} testID="animated-logo">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <APath d={d} stroke={colors.brandPrimary} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${length} ${length}`} animatedProps={pathProps} />
        <ACircle cx={dot.x} cy={dot.y} fill={colors.warning} animatedProps={dotProps} />
      </Svg>
    </View>
  );
}
