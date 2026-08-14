import "dotenv/config";
import { createSign } from "crypto";
import { connect } from "http2";

const APNS_KEY_ID = process.env.APNS_KEY_ID ?? "";
const APNS_TEAM_ID = process.env.APNS_TEAM_ID ?? "";
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? "";
function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  // Remove wrapping quotes if any
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  // Replace literal \n with real newline
  key = key.replace(/\\n/g, "\n");
  
  // Extract base64 content
  const cleaned = key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  // Re-wrap in standard PEM format
  const wrapped = cleaned.match(/.{1,64}/g)?.join("\n") ?? cleaned;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

const rawKey = process.env.APNS_PRIVATE_KEY ?? "";
const APNS_PRIVATE_KEY = normalizePrivateKey(rawKey);
const IS_PRODUCTION = process.env.APNS_PRODUCTION === "true";
const APNS_HOST = IS_PRODUCTION
  ? "api.push.apple.com"
  : "api.sandbox.push.apple.com";

console.log("=== APNs Config Check ===");
console.log("APNS_KEY_ID:", APNS_KEY_ID || "(missing)");
console.log("APNS_TEAM_ID:", APNS_TEAM_ID || "(missing)");
console.log("APNS_BUNDLE_ID:", APNS_BUNDLE_ID || "(missing)");
console.log("APNS_PRIVATE_KEY present:", !!APNS_PRIVATE_KEY);
console.log("APNS_HOST:", APNS_HOST);

if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY || !APNS_BUNDLE_ID) {
  console.error("Missing required APNs configuration in .env");
  process.exit(1);
}

// Test JWT Generation
try {
  const iat = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iss: APNS_TEAM_ID, iat }),
  ).toString("base64url");

  const sign = createSign("SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(APNS_PRIVATE_KEY, "base64url");

  const jwt = `${header}.${payload}.${signature}`;
  console.log("✅ JWT generated successfully. Length:", jwt.length);

  // Test HTTP/2 connection to Apple APNs server
  console.log(`Connecting to https://${APNS_HOST}...`);
  const client = connect(`https://${APNS_HOST}`);

  client.on("error", (err) => {
    console.error("❌ HTTP/2 Connection Error:", err);
    client.destroy();
  });

  client.on("connect", () => {
    console.log("✅ Connected to APNs server via HTTP/2 successfully!");
    client.close();
  });
} catch (err) {
  console.error("❌ Failed:", err);
}
