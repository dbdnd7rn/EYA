import NetInfo from "@react-native-community/netinfo";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type NetworkCtx = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  isOnline: boolean;
};

const Ctx = createContext<NetworkCtx | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    void NetInfo.fetch().then((state) => {
      if (!mounted) return;
      setIsConnected(Boolean(state.isConnected));
      setIsInternetReachable(state.isInternetReachable);
    });

    const sub = NetInfo.addEventListener((state) => {
      setIsConnected(Boolean(state.isConnected));
      setIsInternetReachable(state.isInternetReachable);
    });

    return () => {
      mounted = false;
      sub();
    };
  }, []);

  const value = useMemo<NetworkCtx>(
    () => ({
      isConnected,
      isInternetReachable,
      isOnline: isConnected && isInternetReachable !== false,
    }),
    [isConnected, isInternetReachable],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNetwork() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useNetwork must be used within NetworkProvider");
  return value;
}

