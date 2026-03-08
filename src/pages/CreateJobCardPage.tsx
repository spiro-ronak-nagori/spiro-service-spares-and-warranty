import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { normalizeRegNo } from '@/lib/normalize-reg-no';
import { uploadJcImage } from '@/lib/upload-jc-image';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  Car, 
  User, 
  Phone, 
  Gauge,
  Battery,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Vehicle, ServiceCategory } from '@/types';
import { toast } from 'sonner';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { OdometerPhotoCapture } from '@/components/job-card/OdometerPhotoCapture';
import { SocPhotoCapture } from '@/components/job-card/SocPhotoCapture';
import { PlateScanner } from '@/components/job-card/PlateScanner';
import { ValidationResult } from '@/hooks/useOdometerValidation';
import { SocValidationResult } from '@/hooks/useSocValidation';
import { useSystemSetting } from '@/hooks/useSystemSetting';
import { ContactForUpdatesSelector, ContactData } from '@/components/job-card/ContactForUpdatesSelector';
import { useCountries } from '@/hooks/useCountries';
import { useVehicleModels } from '@/hooks/useVehicleModels';

const VEHICLE_COLORS = ['Blue', 'Red', 'Yellow', 'Green', 'Black'] as const;

// Vehicle registration number format validation per country
const VEHICLE_REG_PATTERNS: Record<string, { regex: RegExp; format: string; example: string }> = {
  kenya:  { regex: /^K[A-Z]{3}\d{3}[A-Z]$/, format: 'KXXX000X', example: 'KABC123D' },
  uganda: { regex: /^U[A-Z]{2}\d{3}[A-Z]{1,2}$/, format: 'UXX000X or UXX000XX', example: 'UAB123C or UAB123CD' },
  rwanda: { regex: /^R[A-Z]{2}\d{3}[A-Z]$/, format: 'RXX000X', example: 'RAB123C' },
};

/** Returns validation error message or null if valid / no validation needed */
function validateRegNo(regNo: string, workshopCountry: string | null | undefined): string | null {
  if (!workshopCountry) return null;
  const pattern = VEHICLE_REG_PATTERNS[workshopCountry.toLowerCase()];
  if (!pattern) return null; // No validation for unsupported countries
  const cleaned = regNo.replace(/\s/g, '').toUpperCase();
  if (!cleaned) return null;
  if (!pattern.regex.test(cleaned)) {
    return `Invalid format. Expected ${pattern.format} (e.g. ${pattern.example})`;
  }
  return null;
}

type CreateStep = 'vehicle' | 'odometer' | 'services' | 'confirm';

const STEPS: { key: CreateStep; label: string }[] = [
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'odometer', label: 'Odometer' },
  { key: 'services', label: 'Services' },
  { key: 'confirm', label: 'Confirm' },
];

export default function CreateJobCardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, workshop: authWorkshop } = useAuth();

  // Elevated admins pass the workshop via location state
  const selectedWorkshop = (location.state as any)?.selectedWorkshop ?? null;
  const workshop = selectedWorkshop || authWorkshop;

  const isElevatedAdmin = profile?.role === 'super_admin' || profile?.role === 'system_admin' || profile?.role === 'country_admin';
  const { value: ocrEnabled } = useSystemSetting('ENABLE_IMAGE_OCR', true);
  const { value: altPhoneEnabled } = useSystemSetting('ENABLE_ALTERNATE_PHONE_NUMBER', false);
  const { countries: dbCountries, getCallingCode } = useCountries();
  const { modelNames: vehicleModels, isLoading: modelsLoading, error: modelsError } = useVehicleModels();

  // Redirect elevated admins who landed here without selecting a workshop
  useEffect(() => {
    if (isElevatedAdmin && !selectedWorkshop && !authWorkshop) {
      navigate('/', { replace: true });
    }
  }, [isElevatedAdmin, selectedWorkshop, authWorkshop]);
  
  const [currentStep, setCurrentStep] = useState<CreateStep>('vehicle');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);

  // Form data
  const [regNo, setRegNo] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isNewVehicle, setIsNewVehicle] = useState(false);
  const [vehicleSearched, setVehicleSearched] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [unknownModelWarning, setUnknownModelWarning] = useState(false);
  const [selectedColor, setSelectedColor] = useState('');
  const [unknownColorWarning, setUnknownColorWarning] = useState(false);
  
  // New vehicle form
  const [newVehicle, setNewVehicle] = useState({
    owner_name: '',
  });
  const [phoneCountry, setPhoneCountry] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  
  const [odometer, setOdometer] = useState('');
  const [odometerPhoto, setOdometerPhoto] = useState<File | null>(null);
  const [odometerValidation, setOdometerValidation] = useState<ValidationResult | null>(null);
  const [odometerMismatchConfirmed, setOdometerMismatchConfirmed] = useState(false);
  const [odometerMismatchReason, setOdometerMismatchReason] = useState<string | undefined>();
  const [lastServiceOdo, setLastServiceOdo] = useState<number>(0);
  const [showOdoLowerConfirm, setShowOdoLowerConfirm] = useState(false);
  const [odoLowerConfirmed, setOdoLowerConfirmed] = useState(false);

  // SOC data
  const [soc, setSoc] = useState('');
  const [socPhoto, setSocPhoto] = useState<File | null>(null);
  const [socValidation, setSocValidation] = useState<SocValidationResult | null>(null);
  const [socMismatchConfirmed, setSocMismatchConfirmed] = useState(false);
  const [socMismatchReason, setSocMismatchReason] = useState<string | undefined>();
  const [socMismatchComment, setSocMismatchComment] = useState<string | undefined>();
  const [socAutoFilled, setSocAutoFilled] = useState(false);
  
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedL1, setSelectedL1] = useState<Set<string>>(new Set());
  const [selectedL2, setSelectedL2] = useState<Set<string>>(new Set());

  // Alternate contact data
  const [contactData, setContactData] = useState<ContactData>({
    contact_for_updates: 'OWNER',
    rider_name: '',
    rider_phone: '',
    rider_phone_country: '',
    rider_reason: '',
    rider_reason_notes: '',
  });

  // Fetch service categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // Pre-select phone country from workshop country
  useEffect(() => {
    if (workshop?.country && dbCountries.length > 0) {
      const match = dbCountries.find(c => c.name.toLowerCase() === workshop.country?.toLowerCase());
      if (match && !phoneCountry) {
        setPhoneCountry(match.name);
      }
    }
  }, [workshop, dbCountries]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // Compute reg number validation error for inline display
  const regNoError = regNo.trim() ? validateRegNo(regNo, workshop?.country) : null;

  const searchVehicle = async (overrideRegNo?: string) => {
    const searchRegNo = overrideRegNo || regNo;
    if (!searchRegNo.trim()) {
      toast.error('Please enter a vehicle registration number');
      return;
    }

    // Block search if format is invalid for the workshop country
    const formatError = validateRegNo(searchRegNo, workshop?.country);
    if (formatError) {
      toast.error(formatError);
      return;
    }

    setIsLoading(true);
    setVehicleSearched(true);

    try {
      // Check if vehicle exists using canonical indexed lookup
      const canonicalRegNo = normalizeRegNo(searchRegNo);
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select('id, reg_no, model, color, owner_name, owner_phone, last_service_odo, purchase_date, last_service_date, created_at, updated_at')
        .eq('reg_no_canonical', canonicalRegNo)
        .limit(1)
        .maybeSingle();

      if (vehicleError) {
        throw vehicleError;
      }

      if (vehicleData) {
        // Check for active job cards
        const { data: activeJc, error: jcError } = await supabase
          .from('job_cards')
          .select('id, jc_number, status')
          .eq('vehicle_id', vehicleData.id)
          .not('status', 'in', '("DELIVERED","CLOSED","COMPLETED")')
          .limit(1);

        if (jcError) throw jcError;

        if (activeJc && activeJc.length > 0) {
          toast.error(`Vehicle has an active job card: ${activeJc[0].jc_number}`);
          setIsLoading(false);
          return;
        }

        // Fetch the latest JC odometer for this vehicle
        const { data: latestJc } = await supabase
          .from('job_cards')
          .select('odometer')
          .eq('vehicle_id', vehicleData.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const latestOdo = latestJc?.odometer ?? vehicleData.last_service_odo ?? 0;
        setLastServiceOdo(latestOdo);

        setVehicle(vehicleData);
        setIsNewVehicle(false);
        // Pre-select model if it matches the allowed list
        if (vehicleData.model && vehicleModels.includes(vehicleData.model)) {
          setSelectedModel(vehicleData.model);
          setUnknownModelWarning(false);
        } else {
          setSelectedModel('');
          setUnknownModelWarning(!!vehicleData.model);
        }
        // Pre-select color if it matches the allowed list
        if (vehicleData.color && (VEHICLE_COLORS as readonly string[]).includes(vehicleData.color)) {
          setSelectedColor(vehicleData.color);
          setUnknownColorWarning(false);
        } else {
          setSelectedColor('');
          setUnknownColorWarning(!!vehicleData.color);
        }
      } else {
        setVehicle(null);
        setIsNewVehicle(true);
      }
    } catch (error) {
      console.error('Error searching vehicle:', error);
      toast.error('Failed to search vehicle');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocValidation = (
    file: File | null,
    result: SocValidationResult | null,
    mismatchConfirmed: boolean,
    mismatchReason?: string,
    mismatchComment?: string
  ) => {
    setSocPhoto(file);
    setSocValidation(result);
    setSocMismatchConfirmed(mismatchConfirmed);
    setSocMismatchReason(mismatchReason);
    setSocMismatchComment(mismatchComment);
  };

  // Check if SOC step is valid
  const isSocStepValid = (): boolean => {
    if (soc === '' || parseInt(soc) < 0 || parseInt(soc) > 100) return false;
    if (!socPhoto) return false;
    if (!socValidation) return false;
    if (!socValidation.quality?.passed) return false;
    if (socValidation.error) return false;
    
    // OCR checks only when OCR is enabled
    if (ocrEnabled) {
      if (!socValidation.ocr?.dashboardDetected) return false;
      if (socValidation.mismatch?.hasMismatch && !socMismatchConfirmed) return false;
    }
    return true;
  };

  const handleOdometerValidation = (
    file: File | null,
    result: ValidationResult | null,
    mismatchConfirmed: boolean,
    mismatchReason?: string
  ) => {
    setOdometerPhoto(file);
    setOdometerValidation(result);
    setOdometerMismatchConfirmed(mismatchConfirmed);
    setOdometerMismatchReason(mismatchReason);

    // If odometer photo was cleared (retake), also clear auto-filled SOC
    if (!file && socAutoFilled) {
      setSocAutoFilled(false);
      setSoc('');
      setSocPhoto(null);
      setSocValidation(null);
    }

    // Auto-fill SOC if the odometer image also contains a SOC reading
    if (
      result?.ocr?.socDetected &&
      result.ocr.socReading !== null &&
      result.ocr.socConfidence >= 50 &&
      file &&
      !socPhoto // Only auto-fill if SOC photo hasn't been manually set
    ) {
      const detectedSoc = result.ocr.socReading;
      setSoc(String(detectedSoc));

      // Create a synthetic SocValidationResult so the SOC step passes validation
      const syntheticSocResult: SocValidationResult = {
        quality: { passed: true },
        ocr: {
          socReading: detectedSoc,
          confidence: result.ocr.socConfidence,
          dashboardDetected: true,
        },
        mismatch: null, // No mismatch since we're using the detected value directly
        isValidating: false,
        error: null,
      };
      setSocPhoto(file); // Reuse the same image
      setSocValidation(syntheticSocResult);
      setSocMismatchConfirmed(false);
      setSocMismatchReason(undefined);
      setSocMismatchComment(undefined);
      setSocAutoFilled(true);
    }
  };

  // Check if odometer step can proceed
  const isOdometerStepValid = (): boolean => {
    // Must have valid odometer value
    if (!odometer || parseInt(odometer) <= 0) return false;
    
    // Must have photo
    if (!odometerPhoto) return false;
    
    // Must have validation result
    if (!odometerValidation) return false;
    
    // Quality must pass
    if (!odometerValidation.quality?.passed) return false;
    if (odometerValidation.error) return false;
    
    // OCR checks only when OCR is enabled
    if (ocrEnabled) {
      if (!odometerValidation.ocr?.clusterDetected) return false;
      // If there's a mismatch, must be confirmed
      if (odometerValidation.mismatch?.hasMismatch && !odometerMismatchConfirmed) return false;
    }
    
    return true;
  };

  const validateStep = (): boolean => {
    switch (currentStep) {
      case 'vehicle':
        if (modelsError) {
          toast.error('Unable to load vehicle models. Please refresh and try again.');
          return false;
        }
        if (!vehicleSearched) {
          toast.error('Please search for a vehicle first');
          return false;
        }
        if (!selectedModel) {
          toast.error('Please select a vehicle model');
          return false;
        }
        if (!selectedColor) {
          toast.error('Please select a vehicle colour');
          return false;
        }
        if (isNewVehicle) {
          if (!newVehicle.owner_name) {
            toast.error('Please enter customer name');
            return false;
          }
          if (!phoneCountry) {
            toast.error('Please select a country');
            return false;
          }
          if (phoneNumber.length !== 9) {
            toast.error('Phone number must be exactly 9 digits');
            return false;
          }
        }
        // Validate rider fields when alternate phone is enabled and rider selected
        if (altPhoneEnabled && contactData.contact_for_updates === 'RIDER') {
          if (!contactData.rider_name.trim()) {
            toast.error('Please enter rider name');
            return false;
          }
          if (contactData.rider_phone.length !== 9) {
            toast.error('Rider phone must be exactly 9 digits');
            return false;
          }
          if (!contactData.rider_reason) {
            toast.error('Please select a reason for rider');
            return false;
          }
        }
        return true;
        
      case 'odometer':
        if (!odometer || parseInt(odometer) <= 0) {
          toast.error('Please enter a valid odometer reading');
          return false;
        }
        if (lastServiceOdo > 0 && parseInt(odometer) < lastServiceOdo && !odoLowerConfirmed) {
          setShowOdoLowerConfirm(true);
          return false;
        }
        if (!isOdometerStepValid()) {
          toast.error('Please capture and validate the odometer photo');
          return false;
        }
        // SOC validation
        if (soc === '' || isNaN(parseInt(soc)) || parseInt(soc) < 0 || parseInt(soc) > 100) {
          toast.error('Please enter a valid SOC value (0-100)');
          return false;
        }
        if (!isSocStepValid()) {
          toast.error('Please capture and validate the dashboard photo for SOC');
          return false;
        }
        return true;
        
      case 'services':
        if (selectedL1.size === 0) {
          toast.error('Please select at least one service category');
          return false;
        }
        return true;
        
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (!validateStep()) return;
    
    const currentIndex = STEPS.findIndex(s => s.key === currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].key);
    }
  };

  const prevStep = () => {
    const currentIndex = STEPS.findIndex(s => s.key === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].key);
    }
  };

  const saveAsDraft = async () => {
    if (!profile || !workshop) {
      toast.error('No workshop assigned');
      return;
    }

    if (!validateStep()) return;

    setIsSaving(true);

    try {
      let vehicleId = vehicle?.id;

      // Create new vehicle if needed
      if (isNewVehicle) {
        const { data: newVehicleData, error: vehicleError } = await supabase
          .from('vehicles')
          .upsert({
            reg_no: regNo.toUpperCase().trim(),
            model: selectedModel,
            color: selectedColor,
            owner_name: newVehicle.owner_name,
            owner_phone: phoneNumber ? (getCallingCode(phoneCountry) || '') + phoneNumber : null,
          }, { onConflict: 'reg_no' })
          .select()
          .single();

        if (vehicleError) throw vehicleError;
        vehicleId = newVehicleData.id;
      }

      if (!vehicleId) {
        throw new Error('Vehicle ID not available');
      }

      // Generate JC number and create job card (with retry for race conditions)
      let jobCard: any = null;
      let jcNumber: string = '';
      
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: generatedJc, error: jcNumError } = await supabase.rpc('generate_jc_number');
        if (jcNumError) throw jcNumError;
        jcNumber = generatedJc;

        // Determine SOC anomaly (jump > 40% from last known SOC is flagged)
        const socValue = soc !== '' ? parseInt(soc) : null;
        const detectedSoc = socValidation?.ocr?.socReading ?? null;
        const detectedConfidence = socValidation?.ocr?.confidence ?? null;

        const { data: jcData, error: jcError } = await supabase
          .from('job_cards')
          .insert({
            jc_number: jcNumber,
            workshop_id: workshop.id,
            vehicle_id: vehicleId,
            created_by: profile.id,
            odometer: parseInt(odometer) || 0,
            incoming_soc: socValue,
            service_categories: Array.from(selectedL1),
            issue_categories: Array.from(selectedL2),
            status: 'DRAFT',
            soc_detected_value: detectedSoc,
            soc_detection_confidence: detectedConfidence,
            soc_override_reason: socMismatchConfirmed ? socMismatchReason : null,
            soc_override_comment: socMismatchConfirmed ? socMismatchComment : null,
            soc_anomaly_flag: false,
            // Rider / alternate contact fields
            contact_for_updates: altPhoneEnabled ? contactData.contact_for_updates : 'OWNER',
            rider_name: altPhoneEnabled && contactData.contact_for_updates === 'RIDER' ? contactData.rider_name : null,
            rider_phone: altPhoneEnabled && contactData.contact_for_updates === 'RIDER' ? contactData.rider_phone : null,
            rider_reason: altPhoneEnabled && contactData.contact_for_updates === 'RIDER' ? contactData.rider_reason : null,
            rider_reason_notes: altPhoneEnabled && contactData.contact_for_updates === 'RIDER' && contactData.rider_reason === 'OTHER' ? contactData.rider_reason_notes : null,
          } as any)
          .select()
          .single();

        if (jcError) {
          // Retry on duplicate JC number (race condition)
          if (jcError.code === '23505' && jcError.message?.includes('jc_number') && attempt < 2) {
            console.warn(`JC number collision (${jcNumber}), retrying...`);
            continue;
          }
          throw jcError;
        }

        jobCard = jcData;
        break;
      }

      if (!jobCard) throw new Error('Failed to generate unique job card number');

      // Upload images to storage and save URLs
      const imageUpdates: Record<string, string> = {};
      try {
        if (odometerPhoto) {
          const odoUrl = await uploadJcImage(odometerPhoto, jobCard.id, 'odo');
          imageUpdates.odometer_photo_url = odoUrl;
        }
        if (socPhoto) {
          const socUrl = await uploadJcImage(socPhoto, jobCard.id, 'incoming_soc');
          imageUpdates.soc_photo_url = socUrl;
        }
        if (Object.keys(imageUpdates).length > 0) {
          await supabase
            .from('job_cards')
            .update(imageUpdates as any)
            .eq('id', jobCard.id);
        }
      } catch (imgErr) {
        console.error('Image upload error (non-fatal):', imgErr);
      }

      // Update vehicle's last service odometer
      await supabase
        .from('vehicles')
        .update({
          last_service_odo: parseInt(odometer),
          last_service_date: new Date().toISOString().split('T')[0],
          model: selectedModel,
          color: selectedColor,
        })
        .eq('id', vehicleId);

      // Create initial audit trail
      await supabase
        .from('audit_trail')
        .insert({
          job_card_id: jobCard.id,
          user_id: profile.id,
          to_status: 'DRAFT',
          notes: 'Job card created',
        });

      // Audit rider contact selection
      if (altPhoneEnabled && contactData.contact_for_updates === 'RIDER') {
        await supabase.from('rider_contact_audit' as any).insert({
          job_card_id: jobCard.id,
          actor_user_id: profile.id,
          action: 'CONTACT_SET',
          contact_for_updates: 'RIDER',
          phone_last4: contactData.rider_phone.slice(-4),
          rider_reason: contactData.rider_reason,
        });
      }

      // Server-side SOC anomaly detection: flag if SOC jump > 40% from last known
      const finalSocValue = soc !== '' ? parseInt(soc) : null;
      if (finalSocValue !== null && vehicle?.id) {
        const { data: lastJcWithSoc } = await supabase
          .from('job_cards')
          .select('incoming_soc')
          .eq('vehicle_id', vehicle.id)
          .not('incoming_soc', 'is', null)
          .neq('id', jobCard.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastJcWithSoc?.incoming_soc !== null && lastJcWithSoc?.incoming_soc !== undefined) {
          const socJump = Math.abs(finalSocValue - lastJcWithSoc.incoming_soc);
          if (socJump > 40) {
            await supabase
              .from('job_cards')
              .update({ soc_anomaly_flag: true } as any)
              .eq('id', jobCard.id);
          }
        }
      }

      toast.success(`Job card ${jcNumber} created`);
      navigate(`/job-card/${jobCard.id}`);
    } catch (error: any) {
      console.error('Error creating job card:', error);
      const msg = error?.message || error?.details || 'Failed to create job card';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const l1Categories = categories.filter(c => !c.parent_code);
  const getL2Categories = (parentCode: string) => 
    categories.filter(c => c.parent_code === parentCode);

  const toggleL1 = (code: string) => {
    const newSelected = new Set(selectedL1);
    if (newSelected.has(code)) {
      newSelected.delete(code);
      // Also remove related L2s
      const newL2 = new Set(selectedL2);
      getL2Categories(code).forEach(c => newL2.delete(c.code));
      setSelectedL2(newL2);
    } else {
      newSelected.add(code);
    }
    setSelectedL1(newSelected);
  };

  const toggleL2 = (code: string) => {
    const newSelected = new Set(selectedL2);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedL2(newSelected);
  };

  const stepIndex = STEPS.findIndex(s => s.key === currentStep);

  return (
    <AppLayout>
      <PageHeader 
        title="Create Job Card" 
        showBack 
        backTo="/"
      />
      
      <div className="p-4 space-y-4">
        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-6">
          {STEPS.map((step, i) => (
            <div key={step.key} className="flex items-center">
              <div 
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  i <= stepIndex 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < stepIndex ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div 
                  className={`h-0.5 w-8 sm:w-12 ${
                    i < stepIndex ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Vehicle */}
        {currentStep === 'vehicle' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Car className="h-5 w-5" />
                Vehicle Information
              </CardTitle>
              <CardDescription>
                Enter the vehicle registration number
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {modelsError && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{modelsError}</span>
                </div>
              )}
              <div className="space-y-2">
                <Label>
                  Registration Number <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="e.g., LAG 123 XY"
                      value={regNo}
                      onChange={(e) => {
                        setRegNo(e.target.value.toUpperCase());
                        setVehicleSearched(false);
                        setVehicle(null);
                        setIsNewVehicle(false);
                        setSelectedModel('');
                        setUnknownModelWarning(false);
                        setSelectedColor('');
                        setUnknownColorWarning(false);
                      }}
                      className="h-12 text-base uppercase"
                    />
                  </div>
                  <Button 
                    onClick={searchVehicle}
                    disabled={isLoading || !regNo.trim() || !!regNoError}
                    className="h-12"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {regNoError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {regNoError}
                  </p>
                )}
                {!vehicleSearched && regNo.trim() && !regNoError && (
                  <p className="text-xs text-muted-foreground">
                    Click search to check if vehicle exists
                  </p>
                )}
                {workshop && (
                  <PlateScanner
                    workshopId={workshop.id}
                    ocrEnabled={ocrEnabled}
                    onResult={(regNumber) => {
                      setRegNo(regNumber);
                      setVehicleSearched(false);
                      setVehicle(null);
                      setIsNewVehicle(false);
                      setSelectedModel('');
                      setUnknownModelWarning(false);
                      setSelectedColor('');
                      setUnknownColorWarning(false);
                    }}
                  />
                )}
              </div>

              {vehicleSearched && vehicle && (
                <div className="space-y-4">
                  {/* Vehicle Found Success Card */}
                  <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                    <div className="flex items-center gap-2 text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-medium">Vehicle Found</span>
                    </div>
                    
                    {/* Vehicle Details Card - Read-only */}
                    <div className="bg-background rounded border border-input p-3 space-y-3">
                      {/* Row 1: Owner Name & Owner Phone */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Owner Name</span>
                          <p className="font-medium">{vehicle.owner_name || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Owner Phone</span>
                          <p className="font-medium">{vehicle.owner_phone || 'N/A'}</p>
                        </div>
                      </div>

                      {/* Row 2: Model & Colour */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Model</span>
                          <p className="font-medium">{vehicle.model || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Colour</span>
                          <p className="font-medium">{vehicle.color || 'N/A'}</p>
                        </div>
                      </div>

                      {/* Row 3: Purchase Date & Last Service Date */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Purchase Date</span>
                          <p className="font-medium">
                            {vehicle.purchase_date 
                              ? new Date(vehicle.purchase_date).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Last Service Date</span>
                          <p className="font-medium">
                            {vehicle.last_service_date
                              ? new Date(vehicle.last_service_date).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })
                              : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Row 4: Last Service Odo (full width) */}
                      <div className="text-sm">
                        <span className="text-muted-foreground block text-xs mb-1">Last Service Odo</span>
                        <p className="font-medium">
                          {vehicle.last_service_date && lastServiceOdo > 0 
                            ? lastServiceOdo.toLocaleString() + ' km'
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {unknownModelWarning && (
                      <div className="flex items-center gap-2 text-warning text-xs">
                        <AlertCircle className="h-3 w-3" />
                        <span>Unknown model detected ({vehicle.model}). Please select the closest match.</span>
                      </div>
                    )}
                    {unknownColorWarning && (
                      <div className="flex items-center gap-2 text-warning text-xs">
                        <AlertCircle className="h-3 w-3" />
                        <span>Unknown colour detected ({vehicle.color}). Please select the closest match.</span>
                      </div>
                    )}
                  </div>

                  {/* Contact for OTP & Updates — only if feature enabled and vehicle found */}
                  {altPhoneEnabled && (
                    <ContactForUpdatesSelector
                      ownerPhone={vehicle.owner_phone}
                      ownerName={vehicle.owner_name}
                      workshopCountry={workshop?.country}
                      value={contactData}
                      onChange={setContactData}
                      isNewVehicle={false}
                    />
                  )}
                </div>
              )}

              {vehicleSearched && isNewVehicle && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-warning">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">New Vehicle</span>
                  </div>
                  
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Model <span className="text-destructive">*</span></Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {modelsLoading ? (
                              <SelectItem value="__loading" disabled>Loading…</SelectItem>
                            ) : vehicleModels.map((model) => (
                              <SelectItem key={model} value={model}>{model}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Colour <span className="text-destructive">*</span></Label>
                        <Select value={selectedColor} onValueChange={setSelectedColor}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select colour" />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {VEHICLE_COLORS.map((color) => (
                              <SelectItem key={color} value={color}>{color}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Customer Name <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Full name"
                          value={newVehicle.owner_name}
                          onChange={(e) => setNewVehicle(prev => ({ ...prev, owner_name: e.target.value }))}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Customer Phone <span className="text-destructive">*</span></Label>
                      <div className="grid grid-cols-[140px_1fr] gap-2">
                        <Select value={phoneCountry} onValueChange={(val) => { setPhoneCountry(val); }}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {dbCountries.map((c) => (
                              <SelectItem key={c.name} value={c.name}>{c.name} ({c.calling_code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder={phoneCountry ? 'e.g. 712345678' : 'Select country first'}
                            value={phoneNumber}
                            disabled={!phoneCountry}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                              setPhoneNumber(digits);
                            }}
                            className="pl-10"
                            maxLength={9}
                          />
                        </div>
                      </div>
                      {phoneNumber.length > 0 && phoneNumber.length !== 9 && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Phone number must be exactly 9 digits ({phoneNumber.length}/9)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Contact for OTP & Updates — for new vehicles too */}
                  {altPhoneEnabled && (
                    <ContactForUpdatesSelector
                      ownerPhone={phoneNumber}
                      ownerName={newVehicle.owner_name}
                      workshopCountry={workshop?.country}
                      value={contactData}
                      onChange={setContactData}
                      isNewVehicle={true}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Odometer */}
        {currentStep === 'odometer' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Gauge className="h-5 w-5" />
                Odometer Reading
              </CardTitle>
              <CardDescription>
                Enter current odometer and capture photo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Odometer (km) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  placeholder="e.g., 15000"
                  value={odometer}
                  onChange={(e) => {
                    setOdometer(e.target.value);
                    setOdoLowerConfirmed(false);
                  }}
                  className="h-12 text-lg"
                  inputMode="numeric"
                />
                {lastServiceOdo > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Last service odometer: {lastServiceOdo.toLocaleString()} km
                  </p>
                )}
                {lastServiceOdo > 0 && odometer && parseInt(odometer) < lastServiceOdo && !odoLowerConfirmed && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Reading is lower than last service — justification required
                  </p>
                )}
              </div>

              <OdometerPhotoCapture
                enteredOdometer={parseInt(odometer) || 0}
                onValidationComplete={handleOdometerValidation}
                ocrEnabled={ocrEnabled}
              />

              <Separator className="my-4" />

              {/* SOC Section */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Battery className="h-4 w-4" />
                  Incoming SOC (%) <span className="text-destructive">*</span>
                </Label>

                {socAutoFilled && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-success/10 border border-success/30">
                    <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                    <span className="text-xs text-success font-medium">
                      SOC auto-detected from odometer photo ({soc}%)
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-6 text-xs px-2"
                      onClick={() => {
                        setSocAutoFilled(false);
                        setSoc('');
                        setSocPhoto(null);
                        setSocValidation(null);
                        setSocMismatchConfirmed(false);
                        setSocMismatchReason(undefined);
                        setSocMismatchComment(undefined);
                      }}
                    >
                      Override
                    </Button>
                  </div>
                )}

              <Input
                  type="number"
                  placeholder="e.g., 75"
                  value={soc}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setSoc('');
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num) && num >= 0 && num <= 100 && String(num) === val.replace(/^0+(?=\d)/, '')) {
                        setSoc(String(num));
                      }
                    }
                    // If user manually changes SOC, clear auto-fill state
                    if (socAutoFilled) {
                      setSocAutoFilled(false);
                      setSocPhoto(null);
                      setSocValidation(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (['.', ',', '-', 'e', 'E', '+'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  min={0}
                  max={100}
                  step={1}
                  className="h-12 text-lg"
                  inputMode="numeric"
                  disabled={socAutoFilled}
                />
                <p className="text-xs text-muted-foreground">
                  {socAutoFilled
                    ? 'Value and photo auto-filled from odometer image. Click "Override" to change.'
                    : 'Enter the battery State of Charge as a whole number (0–100)'}
                </p>
                {soc !== '' && (isNaN(parseInt(soc)) || parseInt(soc) < 0 || parseInt(soc) > 100 || soc.includes('.')) && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    SOC must be a whole number between 0 and 100
                  </p>
                )}
              </div>

              {!socAutoFilled && (
                <SocPhotoCapture
                  enteredSoc={soc !== '' ? parseInt(soc) : -1}
                  onValidationComplete={handleSocValidation}
                  ocrEnabled={ocrEnabled}
                />
              )}
            </CardContent>
          </Card>
        )}


        {/* Step 3: Services */}
        {currentStep === 'services' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Service Categories</CardTitle>
              <CardDescription>
                Select service type(s) and specific issues
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {l1Categories.map((cat) => (
                <div key={cat.id} className="space-y-2">
                  <div 
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted cursor-pointer"
                    onClick={() => toggleL1(cat.code)}
                  >
                    <Checkbox
                      checked={selectedL1.has(cat.code)}
                      onCheckedChange={() => toggleL1(cat.code)}
                    />
                    <span className="font-medium">{cat.name}</span>
                  </div>
                  
                  {selectedL1.has(cat.code) && (
                    <div className="ml-6 space-y-1">
                      {getL2Categories(cat.code).map((l2) => (
                        <div 
                          key={l2.id}
                          className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleL2(l2.code)}
                        >
                          <Checkbox
                            checked={selectedL2.has(l2.code)}
                            onCheckedChange={() => toggleL2(l2.code)}
                          />
                          <span className="text-sm">{l2.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Confirm */}
        {currentStep === 'confirm' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Review & Confirm</CardTitle>
                <CardDescription>
                  Please review all details before creating the job card
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Vehicle Section */}
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Vehicle Information</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Registration</span>
                      <p className="font-medium">{regNo}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Model</span>
                      <p className="font-medium">{selectedModel || '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Colour</span>
                      <p className="font-medium">{selectedColor || '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Odometer</span>
                      <p className="font-medium">{parseInt(odometer).toLocaleString()} km</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Incoming SOC</span>
                      <p className="font-medium">{soc}%</p>
                    </div>
                  </div>
                </div>

                {/* Customer Section */}
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Customer Information</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Owner Name</span>
                      <p className="font-medium">
                        {vehicle?.owner_name || newVehicle.owner_name || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Owner Phone</span>
                      <p className="font-medium">
                        {vehicle?.owner_phone || (phoneCountry && phoneNumber ? `${phoneCountry}: ${phoneNumber}` : '—')}
                      </p>
                    </div>
                  </div>

                  {/* Show contact selection in confirm step when feature enabled */}
                  {altPhoneEnabled && contactData.contact_for_updates === 'RIDER' && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">Contact for OTP & Updates: Rider</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Rider Name</span>
                          <p className="font-medium">{contactData.rider_name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Rider Phone</span>
                          <p className="font-medium">******{contactData.rider_phone.slice(-4)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reason</span>
                          <p className="font-medium">{contactData.rider_reason?.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Services */}
                <div>
                  <span className="text-sm text-muted-foreground font-medium">Services Selected</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Array.from(selectedL1).map((code) => {
                      const cat = l1Categories.find(c => c.code === code);
                      return (
                        <span 
                          key={code}
                          className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-1 text-xs font-medium"
                        >
                          {cat?.name || code}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {selectedL2.size > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground font-medium">Specific Issues</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Array.from(selectedL2).map((code) => {
                        const cat = categories.find(c => c.code === code);
                        return (
                          <span 
                            key={code}
                            className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs"
                          >
                            {cat?.name || code}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Photo Validation Status */}
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Photo Validation</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                      <span>Odometer photo captured and validated</span>
                    </div>
                    {odometerValidation?.ocr?.ocrReading != null && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>OCR reading: {odometerValidation.ocr!.ocrReading!.toLocaleString()} km</span>
                        <span>({odometerValidation.ocr!.ocrConfidence}% confidence)</span>
                      </div>
                    )}
                    {odometerMismatchConfirmed && odometerMismatchReason && (
                      <div className="mt-2 p-2 bg-warning/10 rounded text-xs">
                        <p className="font-medium text-warning">Odometer mismatch confirmed:</p>
                        <p className="text-muted-foreground mt-1">{odometerMismatchReason}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                      <span>SOC photo captured and validated</span>
                    </div>
                    {socValidation?.ocr?.socReading != null && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>SOC reading: {socValidation.ocr!.socReading}%</span>
                        <span>({socValidation.ocr!.confidence}% confidence)</span>
                      </div>
                    )}
                    {socMismatchConfirmed && socMismatchReason && (
                      <div className="mt-2 p-2 bg-warning/10 rounded text-xs">
                        <p className="font-medium text-warning">SOC mismatch confirmed:</p>
                        <p className="text-muted-foreground mt-1">Reason: {socMismatchReason}</p>
                        {socMismatchComment && (
                          <p className="text-muted-foreground mt-1">{socMismatchComment}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Confirmation Notice */}
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="py-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Please verify all information is correct. Once created, the job card will be in Draft status until customer verification.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-3 pt-4">
          {stepIndex > 0 && (
            <Button 
              variant="outline" 
              onClick={prevStep}
              className="flex-1 h-12"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          
          {stepIndex < STEPS.length - 1 ? (
            <Button 
              onClick={nextStep}
              disabled={currentStep === 'odometer' && (!isOdometerStepValid() || !isSocStepValid() || odometerValidation?.isValidating || socValidation?.isValidating)}
              className="flex-1 h-12"
            >
              Continue
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button 
              onClick={() => setShowCreateConfirm(true)}
              disabled={isSaving}
              className="flex-1 h-12"
            >
              Create Job Card
            </Button>
          )}
        </div>
      </div>

      <ConfirmationDialog
        open={showCreateConfirm}
        onOpenChange={setShowCreateConfirm}
        title="Create Job Card"
        description={`Create a new job card for ${regNo}? The job card will be saved in Draft status.`}
        confirmLabel="Create"
        isLoading={isSaving}
        onConfirm={() => {
          setShowCreateConfirm(false);
          saveAsDraft();
        }}
      />

      <ConfirmationDialog
        open={showOdoLowerConfirm}
        onOpenChange={setShowOdoLowerConfirm}
        title="Lower Odometer Reading"
        description={`The entered odometer (${parseInt(odometer || '0').toLocaleString()} km) is lower than the last service reading (${lastServiceOdo.toLocaleString()} km). Please provide a justification or go back to edit the value.`}
        confirmLabel="Confirm & Continue"
        cancelLabel="Go Back & Edit"
        variant="destructive"
        requireReason
        reasonLabel="Justification"
        reasonPlaceholder="Explain why the odometer is lower (min 10 characters)..."
        onConfirm={(reason) => {
          setOdoLowerConfirmed(true);
          setShowOdoLowerConfirm(false);
          toast.info('Lower odometer reading accepted with justification');
        }}
      />
    </AppLayout>
  );
}
