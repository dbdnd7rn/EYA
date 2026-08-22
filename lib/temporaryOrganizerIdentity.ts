import type { User } from "@supabase/supabase-js";

export const TEMPORARY_ORGANIZER_ACCOUNT_TYPE = "temporary_organizer";

export function isTemporaryOrganizerUser(user: User | null | undefined) {
  return user?.app_metadata?.eya_account_type === TEMPORARY_ORGANIZER_ACCOUNT_TYPE;
}
