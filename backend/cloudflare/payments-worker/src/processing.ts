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
  if ((intent.method === "card" || intent.method === "hosted_checkout") && !intent.checkout_url?.trim()) return false;
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

  // PayChangu may include provider fees in the customer-facing amount. VAC
  // therefore treats the app-authoritative intent amount as the minimum
  // acceptable verified amount in that currency's integer minor units.
  if (verification.amountMinor < intent.expected_amount_minor) {
    throw new PaymentVerificationMismatchError(
      "PayChangu verification amount is below the payment intent amount.",
    );
  }

  const stored = await recordVerifiedPaymentState(env, intent, {
    status: verification.status,
    paidAmountMinor: verification.amountMinor,
    providerReference: verification.providerReference,
    providerPayload: verification.providerPayload,
  });

  return { intent: stored, verification };
}
