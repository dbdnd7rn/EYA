import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDeliveryStatusTransition,
  isDeliveryEligibleOrder,
  isPaidOrder,
  isPendingCashOrder,
} from "../src/commercePolicy.js";

test("paid orders are delivery eligible", () => {
  const order = { payment_status: "paid" };
  const payment = { provider: "paychangu", status: "paid" };
  assert.equal(isPaidOrder(order, payment), true);
  assert.equal(isDeliveryEligibleOrder(order, payment), true);
});

test("pending cash orders are delivery eligible without being paid", () => {
  const order = { payment_status: "pending" };
  const payment = { provider: "cash", status: "pending" };
  assert.equal(isPendingCashOrder(order, payment), true);
  assert.equal(isDeliveryEligibleOrder(order, payment), true);
  assert.equal(isPaidOrder(order, payment), false);
});

test("arbitrary pending payments are not delivery eligible", () => {
  const order = { payment_status: "pending" };
  const payment = { provider: "paychangu", status: "pending" };
  assert.equal(isDeliveryEligibleOrder(order, payment), false);
});

test("pending cash may progress to arriving but not directly to delivered", () => {
  const order = { payment_status: "pending" };
  const payment = { provider: "cash", status: "pending" };
  assert.equal(assertDeliveryStatusTransition({ order, payment, nextStatus: "arriving" }), "arriving");
  assert.throws(
    () => assertDeliveryStatusTransition({ order, payment, nextStatus: "delivered" }),
    /Verified handoff is required/,
  );
});

test("even a paid order requires verified handoff before delivered", () => {
  const order = { payment_status: "paid" };
  const payment = { provider: "paychangu", status: "paid" };
  assert.throws(
    () => assertDeliveryStatusTransition({ order, payment, nextStatus: "delivered" }),
    /Verified handoff is required/,
  );
  assert.equal(
    assertDeliveryStatusTransition({ order, payment, nextStatus: "delivered", handoffVerified: true }),
    "delivered",
  );
});

test("pending cash cannot be converted to delivered by status route even with a claimed handoff flag", () => {
  const order = { payment_status: "pending" };
  const payment = { provider: "cash", status: "pending" };
  assert.throws(
    () => assertDeliveryStatusTransition({ order, payment, nextStatus: "delivered", handoffVerified: true }),
    /Pending cash payment must be completed by verified handoff/,
  );
});
