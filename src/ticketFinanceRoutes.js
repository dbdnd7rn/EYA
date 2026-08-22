import { requireAuthenticatedUser, statusFromError } from "./auth.js";
import { config } from "./config.js";
import { encryptPayoutDestination, parsePayoutDestinationInput } from "./payoutDestinations.js";
import { supabaseNewApp } from "./supabase.js";

function sendError(res, status, message) {
  return res.status(status).json({ status: "error", error: message, message });
}

export function registerTicketFinanceRoutes(app) {
  app.post("/api/ticket-finance/payout-destinations", async (req, res) => {
    try {
      const { user } = await requireAuthenticatedUser(req);
      if (!config.payoutDestinationEncryptionKey) {
        return sendError(res, 503, "Payout destination intake is not configured.");
      }

      const input = parsePayoutDestinationInput(req.body);
      const encrypted = encryptPayoutDestination(
        input,
        config.payoutDestinationEncryptionKey,
        config.payoutDestinationEncryptionKeyVersion,
      );

      const { data, error } = await supabaseNewApp.rpc("register_ticket_organization_payout_destination", {
        p_organization_id: input.organizationId,
        p_actor_id: user.id,
        p_method: input.method,
        p_beneficiary_name: input.beneficiaryName,
        p_bank_or_network: input.bankOrNetwork,
        p_masked_destination: input.maskedDestination,
        p_destination_fingerprint: encrypted.fingerprint,
        p_details_ciphertext: encrypted.ciphertext,
        p_encryption_key_version: encrypted.keyVersion,
      });

      if (error) {
        const duplicate = String(error.message || "").toLowerCase().includes("duplicate key");
        return sendError(
          res,
          duplicate ? 409 : 403,
          duplicate ? "This payout destination is already registered." : error.message,
        );
      }

      return res.status(201).json({ status: "success", destination: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not register payout destination.";
      return sendError(res, statusFromError(error, 400), message);
    }
  });
}
