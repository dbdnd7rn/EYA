import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function LandlordEnquiryChatAlias() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    if (!id) return;
    router.replace({ pathname: "/(landlord)/chat/[enquiryId]", params: { enquiryId: id } });
  }, [id, router]);

  return null;
}
