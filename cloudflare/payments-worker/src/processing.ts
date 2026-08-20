import type { PaymentIntentRecord, PaymentsEnv } from "./ledger";
import {
  findPaymentIntentByMerchantReference,
  recordVerifiedPaymentState,
} from "./verification-ledger";
import {
  verifyPayChanguTransaction,
  type PayChanguVerificationResult,
} from "./paychangu-verification";

export class PaymentIntentNotFoundError extends Error {
  constructor() {
    super("No payment intent matches the supplied transaction reference.");
    this.name = "PaymentIntentNotFoundError";
  }
}

export class PaymentVerificationMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentVerificationMismatchError";
  }
}

export type ProcessedPaymentVerification = {
  intent: PaymentIntentRecord;
  verification: PayChanguVerificationResult;
};

function hasPersistedProviderSession(intent: PaymentIntentRecord): boolean {
  if (!intent.provider_reference?.trim()) return false;
  if (intent.method === "card" && !intent.checkout_url?.trim()) return false;
  return true;
}

export async function verifyAndRecordPayChanguPayment(
  env: PaymentsEnv,
  txRef: string,
): Promise<ProcessedPaymentVerification> {
  const normalizedTxRef = txRef.trim();
  if (!normalizedTxRef) throw new Error("Payment reference is required.");

  const intent = await findPaymentIntentByMerchantReference(env, normalizedTxRef);
  if (!intent) throw new PaymentIntentNotFoundError();

  // Never fulfil a provider-side transaction that VAC did not successfully
  // persist as the payment intent's provider session. This protects against
  // late webhooks for provider calls that failed before VAC could safely bind
  // the provider session to the app payment/order.
  if (!hasPersistedProviderSession(intent)) {
    throw new PaymentVerificationMismatchError(
      "The payment provider session was not recorded for this payment intent.",
    );
  }

  const verification = await verifyPayChanguTransaction(env, intent);

  if (verification.txRef !== intent.merchant_reference) {
    throw new PaymentVerificationMismatchError(
      "PayChangu verification returned a different transaction reference.",
    );
  }

  if (verification.currency !== intent.currency) {
    throw new PaymentVerificationMismatchError(
      "PayChangu verification currency does not match the payment intent.",
    );
  }

  // PayChangu can add provider fees to the customer-facing amount. EYA's
  // authoritative order value is the minimum acceptable paid amount; any
  // underpayment remains a hard verification failure.
  if (verification.amountMwk < intent.expected_amount_mwk) {
    throw new PaymentVerificationMismatchError(
      "PayChangu verification amount is below the payment intent amount.",
    );
  }

  const stored = await recordVerifiedPaymentState(env, intent, {
    status: verification.status,
    paidAmountMwk: verification.amountMwk,
    providerReference: verification.providerReference,
    providerPayload: verification.providerPayload,
  });

  return { intent: stored, verification };
}
