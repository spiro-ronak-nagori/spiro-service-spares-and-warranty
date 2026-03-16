import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, Phone, RefreshCw, AlertTriangle, Pencil } from 'lucide-react';
import { JobCard } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSystemSetting } from '@/hooks/useSystemSetting';
import { maskPhone, ContactData, parseE164Phone, PHONE_COUNTRIES } from './ContactForUpdatesSelector';
import { EditContactDialog } from './EditContactDialog';
import { useAuth } from '@/contexts/AuthContext';

interface OtpVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCard: JobCard;
  purpose: 'inwarding' | 'delivery';
  onVerified: () => void;
  country?: string | null;
}

export function OtpVerificationDialog({
  open,
  onOpenChange,
  jobCard,
  purpose,
  onVerified,
  country,
}: OtpVerificationDialogProps) {
  const { profile } = useAuth();
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [testModeOtp, setTestModeOtp] = useState<string | null>(null);
  const [showEditContact, setShowEditContact] = useState(false);

  const { value: altPhoneEnabled } = useSystemSetting('ENABLE_ALTERNATE_PHONE_NUMBER', false, country);

  // Determine the active contact phone
  const jcAny = jobCard as any;
  const contactType: 'OWNER' | 'RIDER' = jcAny.contact_for_updates || 'OWNER';
  const isRider = contactType === 'RIDER' && jcAny.rider_phone;
  const activePhone = isRider ? jcAny.rider_phone : jobCard.vehicle?.owner_phone;
  const activeName = isRider ? jcAny.rider_name : jobCard.vehicle?.owner_name;
  const isLocked = !!jcAny.rider_phone_locked;

  // Only show edit for inwarding purpose, when feature enabled, and not locked
  const canEdit = altPhoneEnabled && purpose === 'inwarding' && !isLocked && !otpSent;

  const handleSendOtp = async () => {
    if (!activePhone) {
      toast.error('No contact phone number available');
      return;
    }

    setIsSending(true);
    setTestModeOtp(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-otp', {
        body: { job_card_id: jobCard.id, purpose },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate OTP');

      setOtpSent(true);
      const hint = maskPhone(activePhone);

      if (data.test_mode && data.otp) {
        setTestModeOtp(data.otp);
        toast.success(`Test Mode — OTP generated for ${hint}`);
      } else {
        toast.success(`OTP sent to ${hint}`);
      }

      setCooldown(30);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error('OTP send error:', err);
      toast.error(err.message || 'Failed to send OTP');
    } finally {
      setIsSending(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) {
      toast.error('Please enter the complete 6-digit OTP');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { job_card_id: jobCard.id, purpose, code: otp },
      });

      if (error) throw error;

      if (data?.verified) {
        toast.success('OTP verified successfully');
        onVerified();
        handleClose();
      } else {
        toast.error(data?.error || 'Invalid OTP');
        setOtp('');
      }
    } catch (err: any) {
      console.error('OTP verify error:', err);
      toast.error(err.message || 'Verification failed');
      setOtp('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setOtp('');
    setOtpSent(false);
    setTestModeOtp(null);
    onOpenChange(false);
  };

  const handleEditConfirm = async (data: ContactData, changeReason: string) => {
    try {
      // Reconstruct E.164 phone format if rider is selected
      let e164Phone: string | null = null;
      if (data.contact_for_updates === 'RIDER' && data.rider_phone && data.rider_phone_country) {
        const countryInfo = PHONE_COUNTRIES.find((c) => c.name === data.rider_phone_country);
        if (countryInfo) {
          e164Phone = countryInfo.code + data.rider_phone;
        }
      }

      const updatePayload: any = {
        contact_for_updates: data.contact_for_updates,
        rider_name: data.contact_for_updates === 'RIDER' ? data.rider_name : null,
        rider_phone: data.contact_for_updates === 'RIDER' ? e164Phone : null,
        rider_reason: data.contact_for_updates === 'RIDER' ? data.rider_reason : null,
        rider_reason_notes: data.contact_for_updates === 'RIDER' && data.rider_reason === 'OTHER' ? data.rider_reason_notes : null,
      };
      if (changeReason) {
        updatePayload.rider_phone_change_reason = changeReason;
      }
      const { error } = await supabase
        .from('job_cards')
        .update(updatePayload)
        .eq('id', jobCard.id);
      if (error) throw error;

      // Audit log
      if (profile) {
        const phone = data.contact_for_updates === 'RIDER' ? data.rider_phone : jobCard.vehicle?.owner_phone;
        await supabase.from('rider_contact_audit' as any).insert({
          job_card_id: jobCard.id,
          actor_user_id: profile.id,
          action: 'CONTACT_CHANGED_AT_OTP',
          contact_for_updates: data.contact_for_updates,
          phone_last4: phone ? phone.slice(-4) : null,
          rider_reason: data.rider_reason || null,
          rider_phone_change_reason: changeReason || null,
        });
      }

      // Update local job card state
      Object.assign(jcAny, updatePayload);
      toast.success('Contact updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update contact');
    }
  };

  const title = purpose === 'inwarding'
    ? 'Inwarding Verification'
    : 'Delivery Verification';

  const description = purpose === 'inwarding'
    ? 'Send OTP to confirm vehicle handover to workshop'
    : 'Send OTP to confirm vehicle delivery';

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Contact display */}
            <div className="flex items-center justify-between gap-3 p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    OTP will be sent to ({isRider ? 'Rider' : 'Owner'})
                  </p>
                  <p className="font-medium">
                    {activeName || 'Unknown'} — {maskPhone(activePhone)}
                  </p>
                </div>
              </div>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEditContact(true)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              )}
            </div>

            {/* Test mode OTP display */}
            {testModeOtp && (
              <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-950/30 dark:border-yellow-800">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Test Mode</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">
                    SMS not sent. Use this OTP:
                  </p>
                  <p className="text-2xl font-mono font-bold tracking-widest mt-1 text-yellow-900 dark:text-yellow-100">
                    {testModeOtp}
                  </p>
                </div>
              </div>
            )}

            {!otpSent ? (
              <Button
                className="w-full h-12"
                onClick={handleSendOtp}
                disabled={isSending || !activePhone}
              >
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send OTP'
                )}
              </Button>
            ) : (
              <>
                <div className="space-y-3">
                  <p className="text-sm text-center text-muted-foreground">
                    Enter the 6-digit OTP {testModeOtp ? 'shown above' : 'sent to contact'}
                  </p>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
                        <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>

                <Button
                  className="w-full h-12"
                  onClick={handleVerify}
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify OTP'
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={cooldown > 0 || isSending}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit contact dialog — only for inwarding before OTP sent */}
      {altPhoneEnabled && (
        <EditContactDialog
          open={showEditContact}
          onOpenChange={setShowEditContact}
          ownerPhone={jobCard.vehicle?.owner_phone}
          ownerName={jobCard.vehicle?.owner_name}
          workshopCountry={(jobCard.workshop as any)?.country}
           currentContact={{
             contact_for_updates: contactType,
             rider_name: jcAny.rider_name || '',
             rider_phone: parseE164Phone(jcAny.rider_phone || '').localNumber,
             rider_phone_country: parseE164Phone(jcAny.rider_phone || '').countryCode,
             rider_reason: jcAny.rider_reason || '',
             rider_reason_notes: jcAny.rider_reason_notes || '',
           }}
          onConfirm={handleEditConfirm}
        />
      )}
    </>
  );
}
