import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getLhdnAccessToken } from "../_shared/authService.ts";
import { LHDN_API_URL } from "../_shared/lhdnConfig.ts";
import { qrcode } from "https://deno.land/x/qrcode@v2.0.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function pollForStatus(uuid: string, token: string): Promise<any> {
  const url = `${LHDN_API_URL}/api/v1.0/documents/${uuid}/details`;
  for (let i = 0; i < 15; i++) {
    const res = await fetch(url, {
       headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (res.ok) {
       const data = await res.json();
       if (data.status === "Valid" || data.status === "Invalid") {
          return data;
       }
    }
    // wait 3 seconds
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error("Polling timeout - LHDN is taking longer than usual to process this document. Please try fetching the status later.");
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { documentUuid, recordId } = await req.json();

    const token = await getLhdnAccessToken();
    const documentDetails = await pollForStatus(documentUuid, token);

    const uuid = documentDetails.uuid;
    const longId = documentDetails.longId;
    let base64Image = null;
    if (uuid && longId && documentDetails.status === "Valid") {
      const validationUrl = `https://myinvois.hasil.gov.my/${uuid}/share/${longId}`;
      base64Image = await qrcode(validationUrl);
    }

    // Save back to Supabase e_invoices table
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error } = await supabaseClient
      .from('e_invoices')
      .update({ 
         qr_code: base64Image,
         lhdn_uuid: documentUuid,
         lhdn_status: documentDetails.status
      })
      .eq('id', recordId);

    if (error) throw error;

    if (documentDetails.status !== "Valid") {
        let errorDetails = "";
        if (documentDetails.validationResults?.validationSteps) {
            const errors = documentDetails.validationResults.validationSteps
                .filter((s: any) => s.status === "Invalid" && s.error)
                .map((s: any) => s.error.error || s.error.message || s.error.code || JSON.stringify(s.error))
                .join(", ");
            if (errors) {
                errorDetails = ` - Reasons: ${errors}`;
            }
        }
        throw new Error(`Document status is ${documentDetails.status}${errorDetails}`);
    }

    return new Response(JSON.stringify({ success: true, status: documentDetails.status, qr_code: base64Image }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});