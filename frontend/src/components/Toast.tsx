import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, radius, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";

type Kind = "success" | "error" | "info";
const Ctx = createContext<{ show: (msg: string, kind?: Kind) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: Kind } | null>(null);
  const timer = useRef<any>(null);
  const show = useCallback((msg: string, kind: Kind = "info") => {
    setToast({ msg, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? <ToastView {...toast} /> : null}
    </Ctx.Provider>
  );
}

function ToastView({ msg, kind }: { msg: string; kind: Kind }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const color = kind === "success" ? colors.success : kind === "error" ? colors.error : colors.brandPrimary;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 12 }]} testID="toast">
      <View style={styles.toast}>
        <Icon name={kind === "success" ? "checkmark-circle" : kind === "error" ? "alert-circle" : "information-circle"} size={18} color={color} />
        <Text style={styles.text}>{msg}</Text>
      </View>
    </View>
  );
}

export function useToast() {
  return useContext(Ctx);
}

const useStyles = makeStyles((c) => ({
  wrap: { position: "absolute", left: 20, right: 20, alignItems: "center" },
  toast: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceInverse, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, maxWidth: "100%" },
  text: { color: c.onSurfaceInverse, fontSize: 14, fontWeight: "600", flexShrink: 1 },
}));
