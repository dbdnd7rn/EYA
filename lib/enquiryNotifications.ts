import { createInAppNotification } from "@/lib/appNotifications";

type NotifyEnquiryParticipantInput = {
  recipientId?: string | null;
  recipientRole: "student" | "landlord";
  enquiryId: string;
  listingId?: string | null;
  listingTitle?: string | null;
  title: string;
  message: string;
  priority?: "normal" | "important";
  extraData?: Record<string, unknown>;
};

export function previewEnquiryText(text: string | null | undefined, fallback = "You received a new message.") {
  const clean = String(text ?? "").trim();
  if (!clean) return fallback;
  if (clean.length <= 140) return clean;
  return `${clean.slice(0, 137).trimEnd()}...`;
}

export async function notifyEnquiryParticipant(input: NotifyEnquiryParticipantInput) {
  const recipientId = input.recipientId?.trim();
  const title = input.title.trim();
  const message = previewEnquiryText(input.message);

  if (!recipientId || !title) return;

  try {
    await createInAppNotification({
      userId: recipientId,
      title,
      message,
      type: "enquiry_message",
      priority: input.priority ?? "important",
      data: {
        role: input.recipientRole,
        enquiryId: input.enquiryId,
        listingId: input.listingId ?? null,
        listingTitle: input.listingTitle ?? null,
        ...(input.extraData ?? {}),
      },
    });
  } catch {
    // Enquiry messaging should still succeed if notifications fail.
  }
}
