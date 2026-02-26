export type Role = "student" | "landlord" | "admin";

export type ListingMini = {
  id: string;
  title: string;
  area: string | null;
  city: string | null;
  campus: string | null;
  image_urls: string[] | null;
};

export type EnquiryRow = {
  id: string;
  student_id: string;
  landlord_id: string;
  listing_id: string;
  message: string | null;
  status: "new" | "open" | "closed" | string;
  created_at: string | null;
};

export type ProfileMini = {
  id: string;
  first_name: string | null;
  surname: string | null;
  email: string | null;
  phone: string | null;
  role: Role | null;
};

export type MessageRow = {
  id: string;
  enquiry_id: string;
  sender_id: string;
  sender_role: Role;
  message: string;
  created_at: string | null;
};

export function fullName(p?: ProfileMini | null) {
  const a = (p?.first_name ?? "").trim();
  const b = (p?.surname ?? "").trim();
  const name = `${a} ${b}`.trim();
  return name || "User";
}

export function formatWhen(ts?: string | null) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}