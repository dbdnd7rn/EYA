import test from "node:test";
import assert from "node:assert/strict";
import {
  isLegacyStaticTicketAdmissionPath,
  isPaymentVerifyPath,
  isPrivilegedPath,
  isSuspendedWalletPath,
} from "../src/securityPolicy.js";

test("wallet surface stays suspended", () => {
  assert.equal(isSuspendedWalletPath("/api/wallet"), true);
  assert.equal(isSuspendedWalletPath("/api/wallet/me"), true);
  assert.equal(isSuspendedWalletPath("/api/wallet/checkout"), true);
  assert.equal(isSuspendedWalletPath("/api/checkout/wallet"), true);
  assert.equal(isSuspendedWalletPath("/api/checkout/cash"), false);
});

test("legacy permanent-code ticket check-in stays blocked", () => {
  assert.equal(isLegacyStaticTicketAdmissionPath("/api/admin/tickets/check-in"), true);
  assert.equal(isLegacyStaticTicketAdmissionPath("/api/admin/tickets/live-check-in"), false);
});

test("private ticket and finance routes require a verified session", () => {
  assert.equal(isPrivilegedPath("/api/tickets/orders"), true);
  assert.equal(isPrivilegedPath("/api/tickets/orders/order-1"), true);
  assert.equal(isPrivilegedPath("/api/tickets/my"), true);
  assert.equal(isPrivilegedPath("/api/ticket-finance/payout-destinations"), true);
  assert.equal(isPrivilegedPath("/api/tickets/events"), false);
});

test("payment and delivery authority paths are privileged", () => {
  assert.equal(isPrivilegedPath("/api/paychangu/initiate"), true);
  assert.equal(isPrivilegedPath("/api/paychangu/reconcile"), true);
  assert.equal(isPrivilegedPath("/api/paychangu/verify/abc"), true);
  assert.equal(isPrivilegedPath("/api/checkout/cash"), true);
  assert.equal(isPrivilegedPath("/api/deliveries/order-1/status"), true);
  assert.equal(isPrivilegedPath("/api/orders/order-1/handoff"), true);
});

test("payment verification path detection is narrow", () => {
  assert.equal(isPaymentVerifyPath("/api/paychangu/verify/abc"), true);
  assert.equal(isPaymentVerifyPath("/api/paychangu/webhook"), false);
});
