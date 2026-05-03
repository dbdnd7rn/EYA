export type NewAppRole = "customer" | "vendor" | "driver" | "admin";
export type SalesChannel = "market" | "food";
export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled";
export type DeliveryMode = "pickup" | "doorstep";
export type DeliveryStatus = "searching" | "assigned" | "picked_up" | "arriving" | "delivered" | "failed" | "cancelled";

export type NewAppProfile = {
  id: string;
  display_name: string | null;
  phone: string | null;
  role: NewAppRole;
  campus: string | null;
  area: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  supports_market: boolean;
  supports_food: boolean;
  campus: string | null;
  area: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CatalogItemRow = {
  id: string;
  vendor_id: string;
  channel: SalesChannel;
  name: string;
  description: string | null;
  price_mwk: number;
  stock_qty: number | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type OrderRow = {
  id: string;
  customer_id: string;
  vendor_id: string;
  channel: SalesChannel;
  status: OrderStatus;
  delivery_mode: DeliveryMode;
  pickup_notes: string | null;
  dropoff_notes: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  subtotal_mwk: number;
  delivery_fee_mwk: number;
  service_fee_mwk: number;
  total_mwk: number;
  payment_status: string;
  created_at: string;
  updated_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  item_id: string;
  item_name_snapshot: string;
  quantity: number;
  unit_price_mwk: number;
  line_total_mwk: number;
  created_at: string;
};

export type DeliveryRow = {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: DeliveryStatus;
  eta_minutes: number | null;
  current_latitude: number | null;
  current_longitude: number | null;
  proof_photo_url: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorConversationRow = {
  id: string;
  vendor_id: string;
  customer_id: string;
  channel: SalesChannel;
  catalog_item_id: string | null;
  subject: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

export type VendorMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  sender_role: "customer" | "vendor" | "admin";
  receiver_role: "customer" | "vendor" | "admin";
  content: string | null;
  message_type: "text" | "image";
  image_url: string | null;
  created_at: string;
};

export type VendorCreateInput = {
  name: string;
  description?: string | null;
  supports_market?: boolean;
  supports_food?: boolean;
  campus?: string | null;
  area?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type VendorUpdateInput = Partial<Omit<VendorCreateInput, "name">> & {
  name?: string;
  is_active?: boolean;
};

export type CatalogItemCreateInput = {
  vendor_id: string;
  channel: SalesChannel;
  name: string;
  description?: string | null;
  price_mwk: number;
  stock_qty?: number | null;
  image_url?: string | null;
};

export type CatalogItemUpdateInput = Partial<Omit<CatalogItemCreateInput, "vendor_id" | "channel" | "name" | "price_mwk">> & {
  name?: string;
  price_mwk?: number;
  is_active?: boolean;
};

export type CreateOrderLineInput = {
  item_id: string;
  quantity: number;
  food_customization?: {
    selection_map?: Record<string, string[]>;
    summary?: string;
  } | null;
};

export type CreateOrderInput = {
  customer_id: string;
  vendor_id: string;
  channel: SalesChannel;
  delivery_mode: DeliveryMode;
  lines: CreateOrderLineInput[];
  delivery_fee_mwk?: number;
  service_fee_mwk?: number;
  pickup_notes?: string | null;
  dropoff_notes?: string | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  dropoff_latitude?: number | null;
  dropoff_longitude?: number | null;
};

export type OrderWithItems = {
  order: OrderRow;
  items: OrderItemRow[];
  delivery: DeliveryRow | null;
};
