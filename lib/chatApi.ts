import { supabase } from "./supabase";
import type { EnquiryRow, ListingMini, MessageRow, ProfileMini, Role } from "./types";

export async function getMyRole(userId: string): Promise<Role> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return ((data?.role as Role) ?? "student") as Role;
}

export async function getEnquiry(enquiryId: string): Promise<EnquiryRow> {
  const { data, error } = await supabase
    .from("enquiries")
    .select("id, student_id, landlord_id, listing_id, message, status, created_at")
    .eq("id", enquiryId)
    .single();

  if (error) throw error;
  return data as EnquiryRow;
}

export async function getListingMini(listingId: string): Promise<ListingMini | null> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, title, area, city, campus, image_urls")
    .eq("id", listingId)
    .maybeSingle();

  if (error) throw error;
  return (data as any) ?? null;
}

export async function getProfileMini(userId: string): Promise<ProfileMini | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, surname, email, phone, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as any) ?? null;
}

// ✅ list enquiries (student side)
export async function listStudentEnquiries(studentId: string) {
  const { data, error } = await supabase
    .from("enquiries")
    .select("id, student_id, landlord_id, listing_id, message, status, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as EnquiryRow[];
  const listingIds = Array.from(new Set(rows.map((e) => e.listing_id)));

  const listings = new Map<string, ListingMini>();
  if (listingIds.length) {
    const { data: lst, error: lstErr } = await supabase
      .from("listings")
      .select("id, title, area, city, campus, image_urls")
      .in("id", listingIds);

    if (lstErr) throw lstErr;
    (lst ?? []).forEach((l: any) => listings.set(l.id, l as ListingMini));
  }

  return rows.map((e) => ({ enquiry: e, listing: listings.get(e.listing_id) ?? null }));
}

// ✅ list enquiries (landlord side)
export async function listLandlordEnquiries(landlordId: string) {
  const { data, error } = await supabase
    .from("enquiries")
    .select("id, student_id, landlord_id, listing_id, message, status, created_at")
    .eq("landlord_id", landlordId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as EnquiryRow[];
  const listingIds = Array.from(new Set(rows.map((e) => e.listing_id)));
  const studentIds = Array.from(new Set(rows.map((e) => e.student_id)));

  const listings = new Map<string, ListingMini>();
  if (listingIds.length) {
    const { data: lst, error: lstErr } = await supabase
      .from("listings")
      .select("id, title, area, city, campus, image_urls")
      .in("id", listingIds);

    if (lstErr) throw lstErr;
    (lst ?? []).forEach((l: any) => listings.set(l.id, l as ListingMini));
  }

  const students = new Map<string, ProfileMini>();
  if (studentIds.length) {
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, first_name, surname, email, phone, role")
      .in("id", studentIds);

    if (profErr) throw profErr;
    (prof ?? []).forEach((p: any) => students.set(p.id, p as ProfileMini));
  }

  return rows.map((e) => ({
    enquiry: e,
    listing: listings.get(e.listing_id) ?? null,
    student: students.get(e.student_id) ?? null,
  }));
}

// ✅ messages
export async function listMessages(enquiryId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, enquiry_id, sender_id, sender_role, message, created_at")
    .eq("enquiry_id", enquiryId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

export async function sendMessage(enquiryId: string, senderId: string, senderRole: Role, message: string) {
  const clean = message.trim();
  if (!clean) return;

  const { error } = await supabase.from("messages").insert({
    enquiry_id: enquiryId,
    sender_id: senderId,
    sender_role: senderRole,
    message: clean,
  });

  if (error) throw error;

  // optional: mark enquiry as open once someone talks
  await supabase.from("enquiries").update({ status: "open" }).eq("id", enquiryId);
}