import React, { useEffect, useRef } from "react";
import { syncMutationOutbox } from "@/lib/mutationOutbox";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";

export function MutationOutboxSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const wasOnlineRef = useRef<boolean>(isOnline);
  const syncingRef = useRef(false);
  const hasAttemptedInitialSyncRef = useRef(false);

  useEffect(() => {
    const justCameOnline = !wasOnlineRef.current && isOnline;
    wasOnlineRef.current = isOnline;
    const shouldRunInitialOnlineSync = isOnline && !hasAttemptedInitialSyncRef.current;
    if (isOnline) hasAttemptedInitialSyncRef.current = true;

    if (!user?.id || !isOnline || syncingRef.current) return;
    if (!justCameOnline && !shouldRunInitialOnlineSync) return;

    syncingRef.current = true;

    void (async () => {
      try {
        await syncMutationOutbox(user.id);
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [isOnline, user?.id]);

  return <>{children}</>;
}

export default MutationOutboxSyncProvider;
