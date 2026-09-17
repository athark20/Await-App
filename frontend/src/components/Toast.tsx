import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, radius, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";

type Kind = "success" | "error" | "info";
type ToastAction = { label: string; onPress: () => void };
type ToastOpts = { action?: ToastAction; duration?: number };
type ToastState = { msg: string; kind: Kind; action?: ToastAction };

const Ctx = createContext<{ show: (msg: string, kind?: Kind, opts?: ToastOpts) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<any>(null);
  const show = useCallback((msg: string, kind: Kind = "info", opts?: ToastOpts) => {
    setToast({ msg, kind, action: opts?.action });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), opts?.duration ?? (opts?.action ? 5000 : 2600));
  }, []);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? <ToastView {...toast} onDismiss={dismiss} /> : null}
    </Ctx.Provider>
  );
}

function ToastView({ msg, kind, action, onDismiss }: ToastState & { onDismiss: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const color = kind === "success" ? colors.success : kind === "error" ? colors.error : colors.brandPrimary;
  return (
    <View pointerEvents={action ? "box-none" : "none"} style={[styles.wrap, { top: insets.top + 12 }]} testID="toast">
      <View style={styles.toast}>
        <Icon name={kind === "success" ? "checkmark-circle" : kind === "error" ? "alert-circle" : "information-circle"} size={18} color={color} />
        <Text style={styles.text}>{msg}</Text>
        {action ? (
          <Pressable
            testID="toast-action"
            hitSlop={8}
            onPress={() => { onDismiss(); action.onPress(); }}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function useToast() {
  return useContext(Ctx);
}

const useStyles = makeStyles((c) => ({
  wrap: { position: "absolute", left: 20, right: 20, alignItems: "center" },
  toast: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceInverse, borderRadius: radius.md, paddingLeft: 14, paddingRight: 8, paddingVertical: 12, maxWidth: "100%" },
  text: { color: c.onSurfaceInverse, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  action: { marginLeft: 2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: c.brandPrimary },
  actionText: { color: c.onBrandPrimary, fontSize: 13, fontWeight: "800" },
}));
