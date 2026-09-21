import type { D1PreparedStatementLike, PaymentsEnv } from "./ledger";
import { verifyAndRecordPayChanguPayment } from "./processing";

type D1PreparedStatementWithAll = D1PreparedStatementLike & {
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};

type PendingReferenceRow = {
  merchant_reference: string;
};

export type PendingVerificationSummary = {
  selected: number;
  paid: number;
  pending: number;
  terminal: number;
  errors: number;
};

async function listDuePendingReferences(
  env: PaymentsEnv,
  limit: number,
): Promise<string[]> {
  const normalizedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  const minimumAgeCutoff = new Date(Date.now() - 20_000).toISOString();
  const maximumAgeCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const statement = env.PAYMENTS_DB.prepare(
    `select merchant_reference
     from payment_intents
     where status = 'pending'
       and provider_reference is not null
       and updated_at <= ?1
       and created_at >= ?2
     order by updated_at asc
     limit ?3`,
  );

  const boundStatement = statement.bind(
    minimumAgeCutoff,
    maximumAgeCutoff,
    normalizedLimit,
  ) as D1PreparedStatementWithAll;

  const result = await boundStatement.all<PendingReferenceRow>();
  const rows: PendingReferenceRow[] = result.results ?? [];

  return rows
    .map((row: PendingReferenceRow) => String(row.merchant_reference || "").trim())
    .filter(Boolean);
}

export async function verifyDuePendingPayments(
  env: PaymentsEnv,
  limit = 10,
): Promise<PendingVerificationSummary> {
  const references = await listDuePendingReferences(env, limit);
  const summary: PendingVerificationSummary = {
    selected: references.length,
    paid: 0,
    pending: 0,
    terminal: 0,
    errors: 0,
  };

  for (const reference of references) {
    try {
      const result = await verifyAndRecordPayChanguPayment(env, reference);
      if (result.intent.status === "paid") {
        summary.paid += 1;
      } else if (result.intent.status === "pending") {
        summary.pending += 1;
      } else {
        summary.terminal += 1;
      }
    } catch (error) {
      summary.errors += 1;
      console.error("[vac-payments] pending verification failed", {
        reference,
        message: error instanceof Error ? error.message : "Unknown verification error.",
      });
    }
  }

  return summary;
}
