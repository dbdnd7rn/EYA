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

export async function verifyAndRecordPayChanguPayment(
  env: PaymentsEnv,
  txRef: string,
): Promise<ProcessedPaymentVerification> {
  const normalizedTxRef = txRef.trim();
  if (!normalizedTxRef) throw new Error("tx_ref is required.");

  const intent = await findPaymentIntentByMerchantReference(env, normalizedTxRef);
  if (!intent) throw new PaymentIntentNotFoundError();

  const verification = await verifyPayChanguTransaction(env, normalizedTxRef);

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

  if (verification.amountMwk !== intent.expected_amount_mwk) {
    throw new PaymentVerificationMismatchError(
      "PayChangu verification amount does not exactly match the payment intent.",
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
