export const LHDN_API_URL = "https://api.myinvois.hasil.gov.my";
export const LHDN_IDENTITY_URL = "https://identity.myinvois.hasil.gov.my/connect/token";

export const getLhdnCredentials = () => {
  return {
    clientId: Deno.env.get("LHDN_CLIENT_ID") ?? "",
    clientSecret1: Deno.env.get("LHDN_CLIENT_SECRET_1") ?? "",
    clientSecret2: Deno.env.get("LHDN_CLIENT_SECRET_2") ?? "",
  };
};
