import { supabase } from '@/integrations/supabase/client';

export type SmsTrigger =
  | 'OTP_INWARDING'
  | 'INWARDED'
  | 'READY'
  | 'OTP_DELIVERY'
  | 'DELIVERED'
  | 'REOPENED';

interface SendSmsParams {
  jobCardId: string;
  trigger: SmsTrigger;
  otp?: string;
}

/**
 * Send SMS via the send-sms edge function.
 * Never throws — SMS failures must not block core workflows.
 * Returns the response data if available (e.g. auto_completed flag).
 */
export async function sendSms({ jobCardId, trigger, otp }: SendSmsParams): Promise<{ auto_completed?: boolean } | null> {
  try {
    const { data } = await supabase.functions.invoke('send-sms', {
      body: {
        job_card_id: jobCardId,
        trigger,
        otp: otp ?? undefined,
      },
    });
    return data ?? null;
  } catch (err) {
    console.error(`[SMS] Failed to send ${trigger} for job ${jobCardId}:`, err);
    return null;
  }
}
