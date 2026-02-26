import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function StudentEnquiryChatAlias() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    if (!id) return;
    router.replace({ pathname: "/(student)/chat/[enquiryId]", params: { enquiryId: id } });
  }, [id, router]);

  return null;
}
