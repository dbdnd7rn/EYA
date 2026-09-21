import { createCipheriv, createHmac, randomBytes } from "node:crypto";

const METHODS = new Set(["airtel_money", "mpamba", "bank"]);

function requiredText(value, label, maxLength = 160) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > maxLength) throw new Error(`${label} is too long.`);
  return text;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `265${digits.slice(1)}` : digits;
  if (!/^265\d{9}$/.test(normalized)) throw new Error("Enter a valid Malawi mobile-money number.");
  return normalized;
}

function normalizeBankAccount(value) {
  const normalized = String(value || "").replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{6,34}$/.test(normalized)) throw new Error("Enter a valid bank account number.");
  return normalized;
}

function maskIdentifier(value) {
  const suffix = value.slice(-4);
  return `${"•".repeat(Math.max(4, Math.min(8, value.length - 4)))}${suffix}`;
}

export function parsePayoutDestinationInput(body) {
  const organizationId = requiredText(body?.organization_id, "Organization", 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    throw new Error("Organization is invalid.");
  }
  const method = requiredText(body?.method, "Payout method", 32).toLowerCase();
  if (!METHODS.has(method)) throw new Error("Unsupported payout method.");
  const beneficiaryName = requiredText(body?.beneficiary_name, "Beneficiary name", 120);
  const bankOrNetwork = method === "bank"
    ? requiredText(body?.bank_name || body?.bank_or_network, "Bank name", 100)
    : method === "airtel_money" ? "Airtel Money" : "TNM Mpamba";
  const identifier = method === "bank"
    ? normalizeBankAccount(body?.account_number)
    : normalizePhone(body?.phone_number);

  return {
    organizationId,
    method,
    beneficiaryName,
    bankOrNetwork,
    identifier,
    maskedDestination: maskIdentifier(identifier),
  };
}

export function encryptPayoutDestination(input, keyBase64, keyVersion) {
  const key = Buffer.from(requiredText(keyBase64, "Payout encryption key", 256), "base64");
  if (key.length !== 32) throw new Error("Payout encryption key must decode to exactly 32 bytes.");
  const version = requiredText(keyVersion, "Payout encryption key version", 64);
  const iv = randomBytes(12);
  const aad = Buffer.from(`${input.organizationId}:${input.method}:${version}`, "utf8");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({
      beneficiary_name: input.beneficiaryName,
      bank_or_network: input.bankOrNetwork,
      identifier: input.identifier,
    }), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const fingerprint = createHmac("sha256", key)
    .update(`eya-payout-destination:v1\0${input.organizationId}\0${input.method}\0${input.identifier}`)
    .digest("hex");

  return {
    fingerprint,
    keyVersion: version,
    ciphertext: JSON.stringify({
      alg: "A256GCM",
      key_version: version,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
    }),
  };
}
