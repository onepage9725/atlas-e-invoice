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
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, {
       headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (res.ok) {
       const data = await res.json();
       if (data.status === "Valid" || data.status === "Invalid") {
          return data;
       }
    }
    // wait 2 seconds
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("Polling timeout - document not processed yet.");
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { documentUuid, recordId } = await req.json();

    const token = await getLhdnAccessToken();
    const documentDetails = await pollForStatus(documentUuid, token);

    if (documentDetails.status !== "Valid") {
        throw new Error(`Document status is ${documentDetails.status}`);
    }

    const validationUrl = documentDetails.validationUrl; 
    const base64Image = await qrcode(validationUrl);

    // Save back to Supabase e_invoices table
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error } = await supabaseClient
      .from('e_invoices')
      .update({ qr_code: base64Image })
      .eq('id', recordId);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, status: documentDetails.status, qr_code: base64Image }), {
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
