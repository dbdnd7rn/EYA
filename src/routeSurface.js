export const REQUIRED_CANONICAL_ROUTES = Object.freeze([
  ["GET", "/health"],
  ["GET", "/api/tickets/events"],
  ["GET", "/api/tickets/orders/:orderId"],
  ["GET", "/api/tickets/my"],
  ["POST", "/api/ticket-finance/payout-destinations"],
  ["POST", "/api/checkout/cash"],
  ["GET", "/api/orders/:orderId/handoff"],
  ["POST", "/api/orders/:orderId/handoff/verify"],
  ["GET", "/api/deliveries/unassigned"],
  ["POST", "/api/deliveries/:orderId/assign"],
  ["POST", "/api/deliveries/:orderId/unassign"],
  ["POST", "/api/deliveries/:orderId/status"],
  ["GET", "/api/admin/payments"],
  ["GET", "/api/admin/orders"],
  ["GET", "/api/admin/orders/:orderId"],
  ["POST", "/api/admin/orders/:orderId/status"],
  ["POST", "/api/admin/orders/:orderId/assign-driver"],
  ["GET", "/api/admin/support-tickets"],
  ["POST", "/api/admin/support-tickets/:id/respond"],
  ["GET", "/api/admin/vendors"],
  ["POST", "/api/admin/vendors"],
  ["POST", "/api/admin/vendors/:vendorId"],
  ["DELETE", "/api/admin/vendors/:vendorId"],
  ["GET", "/api/admin/catalog-items"],
  ["POST", "/api/admin/catalog-items"],
  ["POST", "/api/admin/catalog-items/:itemId"],
  ["DELETE", "/api/admin/catalog-items/:itemId"],
  ["GET", "/api/admin/housing-listings"],
  ["POST", "/api/admin/housing-listings"],
  ["POST", "/api/admin/housing-listings/:listingId"],
  ["DELETE", "/api/admin/housing-listings/:listingId"],
  ["GET", "/api/admin/users"],
  ["POST", "/api/admin/users/invite"],
  ["POST", "/api/admin/users/:userId"],
  ["DELETE", "/api/admin/users/:userId"],
  ["POST", "/api/admin/broadcast"],
  ["POST", "/api/paychangu/initiate"],
  ["GET", "/api/paychangu/verify/:txRef"],
  ["POST", "/api/paychangu/reconcile"],
  ["POST", "/api/paychangu/webhook"],
  ["GET", "/pay/success"],
  ["GET", "/pay/cancel"],
]);

// These paths intentionally exist only as terminal 410 guards. They never expose
// the historical business authority behind the route name.
export const TERMINAL_GUARD_ROUTES = Object.freeze([
  ["ALL", "/api/wallet"],
  ["ALL", "/api/wallet/*splat"],
  ["ALL", "/api/checkout/wallet"],
  ["POST", "/api/admin/tickets/check-in"],
]);

// These competing authorities must not be registered at all by canonical-v2.
export const OMITTED_CANONICAL_ROUTES = Object.freeze([
  ["POST", "/api/tickets/orders"],
  ["POST", "/api/tickets/orders/:orderId/verify"],
]);

export function routeKey(method, path) {
  return `${String(method || "").toUpperCase()} ${path}`;
}
