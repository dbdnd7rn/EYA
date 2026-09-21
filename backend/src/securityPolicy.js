export function isPaymentVerifyPath(pathname) {
  return typeof pathname === "string" && pathname.startsWith("/api/paychangu/verify/");
}

export function isLegacyStaticTicketAdmissionPath(pathname) {
  return pathname === "/api/admin/tickets/check-in";
}

export function isPrivilegedPath(pathname) {
  if (typeof pathname !== "string") return false;
  return (
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/deliveries/") ||
    pathname.startsWith("/api/orders/") ||
    pathname.startsWith("/api/ticket-finance/") ||
    pathname.startsWith("/api/tickets/orders") ||
    pathname === "/api/tickets/my" ||
    pathname === "/api/paychangu/initiate" ||
    pathname === "/api/paychangu/reconcile" ||
    isPaymentVerifyPath(pathname) ||
    pathname === "/api/checkout/cash"
  );
}

export function isSuspendedWalletPath(pathname) {
  if (typeof pathname !== "string") return false;
  return (
    pathname === "/api/wallet" ||
    pathname.startsWith("/api/wallet/") ||
    pathname === "/api/checkout/wallet"
  );
}
