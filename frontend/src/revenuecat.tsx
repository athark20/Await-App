import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setPlanHeader } from "@/src/api";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro"; // from setup: entitlement_lookup_key
export const rcEnabled = Platform.OS !== "web" || __DEV__; // web preview uses the Test Store
export const rcSimulated = Platform.OS === "web" || __DEV__;

let configured = false;

function getRevenueCatApiKey() {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat public API keys not found — run the Setup section first");
  }
  if (Platform.OS === "web" || __DEV__) return REVENUECAT_TEST_API_KEY;
  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

export function initializeRevenueCat() {
  if (!rcEnabled || configured) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: getRevenueCatApiKey() });
  configured = true;
}

export function isRevenueCatConfigured() {
  return configured;
}

function useSubscriptionContext(userId: string | null) {
  const queryClient = useQueryClient();
  const enabled = rcEnabled && configured;
  const rcIdentityRef = useRef<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: () => Purchases.getCustomerInfo(),
    enabled,
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    enabled,
    staleTime: 300 * 1000,
  });

  useEffect(() => {
    if (!enabled) return;
    const listener = (info: CustomerInfo) => queryClient.setQueryData(["revenuecat", "customer-info"], info);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient, enabled]);

  // Identity — COMPULSORY: bind RevenueCat to the stable backend user id on every auth path.
  useEffect(() => {
    if (!enabled) return;
    (async () => {
      try {
        if (userId && rcIdentityRef.current !== userId) {
          let { customerInfo } = await Purchases.logIn(userId);
          if (customerInfo.originalAppUserId.startsWith("$RCAnonymousID:") && Platform.OS === "web") {
            // Browser Mode (purchases-js) cannot switch identity via logIn — re-configure with the user id.
            Purchases.configure({ apiKey: getRevenueCatApiKey(), appUserID: userId });
            await new Promise((r) => setTimeout(r, 400));
            customerInfo = await Purchases.getCustomerInfo();
            const appUserId = await Purchases.getAppUserID().catch(() => customerInfo.originalAppUserId);
            if (!appUserId.startsWith("$RCAnonymousID:")) customerInfo = { ...customerInfo, originalAppUserId: appUserId };
          }
          rcIdentityRef.current = userId;
          queryClient.setQueryData(["revenuecat", "customer-info"], customerInfo);
          queryClient.invalidateQueries({ queryKey: ["revenuecat", "offerings"] });
          setIdentityError(customerInfo.originalAppUserId.startsWith("$RCAnonymousID:") ? "Could not bind purchases to your account" : null);
          console.log("[RevenueCat] identity bound:", customerInfo.originalAppUserId);
        } else if (!userId && rcIdentityRef.current) {
          await Purchases.logOut();
          rcIdentityRef.current = null;
          queryClient.invalidateQueries({ queryKey: ["revenuecat"] });
        }
      } catch (e) {
        setIdentityError(String(e));
      }
    })();
  }, [userId, enabled, queryClient]);

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      const id = await Purchases.getAppUserID().catch(async () => (await Purchases.getCustomerInfo()).originalAppUserId);
      if (id.startsWith("$RCAnonymousID:")) throw new Error("identity_not_ready");
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      queryClient.setQueryData(["revenuecat", "customer-info"], customerInfo);
      return customerInfo;
    },
  });

  const restoreMutation = useMutation({ mutationFn: () => Purchases.restorePurchases() });

  const isSubscribed = customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
  const originalAppUserId = customerInfoQuery.data?.originalAppUserId;
  const identityReady = !!originalAppUserId && !originalAppUserId.startsWith("$RCAnonymousID:");

  // The backend honors the client-verified entitlement for plan limits (SDK is the source of truth).
  useEffect(() => {
    setPlanHeader(isSubscribed ? "PRO" : "FREE");
    queryClient.invalidateQueries({ queryKey: ["awaits"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [isSubscribed, queryClient]);

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    identityReady,
    identityError,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    offeringsError: offeringsQuery.error as Error | null,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children, userId }: { children: React.ReactNode; userId: string | null }) {
  const value = useSubscriptionContext(userId);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}
