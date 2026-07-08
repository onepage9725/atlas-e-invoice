import { LHDN_IDENTITY_URL, getLhdnCredentials } from "./lhdnConfig.ts";

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

export async function getLhdnAccessToken(): Promise<string> {
  const now = Date.now();
  // 5 minute buffer (300,000 ms)
  if (cachedToken && (tokenExpiresAt - now > 300000)) {
    return cachedToken;
  }

  const { clientId, clientSecret1 } = getLhdnCredentials();
  
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret1);
  params.append("grant_type", "client_credentials");
  params.append("scope", "InvoicingAPI");

  const response = await fetch(LHDN_IDENTITY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to authenticate with LHDN API: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in * 1000);

  return cachedToken!;
}
