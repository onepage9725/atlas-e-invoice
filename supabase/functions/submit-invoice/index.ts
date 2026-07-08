import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getLhdnAccessToken } from "../_shared/authService.ts";
import { mapToUBL21 } from "../_shared/ublMapper.ts";
import { LHDN_API_URL } from "../_shared/lhdnConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function submitWithRetry(payload: any, token: string, retries = 3, delay = 1000): Promise<any> {
  const url = `${LHDN_API_URL}/api/v1.0/documents/submissions`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return await response.json();
    }

    if (response.status === 400) {
      const errorData = await response.json();
      throw new Error(`Schema Validation Error (400): ${JSON.stringify(errorData)}`);
    }

    if (response.status === 429) {
      if (attempt === retries) {
        throw new Error("Too Many Requests (429) - Exhausted retries.");
      }
      // Exponential backoff
      await new Promise(res => setTimeout(res, delay * attempt));
      continue;
    }

    throw new Error(`Unexpected error ${response.status}: ${await response.text()}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { invoiceData } = await req.json();
    
    // 1. Transform to UBL 2.1
    const ublPayload = mapToUBL21(invoiceData);
    
    // LHDN requires a wrapping document array
    const submissionPayload = {
       "documents": [
          {
             "format": "JSON",
             "document": ublPayload
          }
       ]
    };

    // 2. Authenticate
    const token = await getLhdnAccessToken();
    
    // 3. Submit
    const result = await submitWithRetry(submissionPayload, token);
    
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
