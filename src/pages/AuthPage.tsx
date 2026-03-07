import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Lock, Eye, EyeOff, CheckCircle2, Shield } from 'lucide-react';
import spiroLogo from '@/assets/spiro-logo.png';
import { toast } from 'sonner';

type AuthMode = 'login' | 'activate';

interface InviteInfo {
  full_name: string;
  role: string;
  workshop_name: string | null;
  needs_email: boolean;
}

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Activate account state
  const [activateStep, setActivateStep] = useState<'identifier' | 'password' | 'done'>('identifier');
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [activatePassword, setActivatePassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activationEmail, setActivationEmail] = useState('');
  const [showActivatePassword, setShowActivatePassword] = useState(false);

  // Redirect if already logged in
  if (user) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
    navigate(from, { replace: true });
    return null;
  }

  const isEmail = (value: string) => value.includes('@');

  const normalizePhone = (value: string): string => {
    // If it starts with +, keep as is (already E.164)
    const trimmed = value.trim();
    if (trimmed.startsWith('+')) return trimmed;
    // If it starts with 0, assume local — but we can't determine country
    // User should enter with country code
    return trimmed;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!identifier || !password) {
      toast.error('Please enter your email or phone and password');
      return;
    }

    setIsLoading(true);

    try {
      if (isEmail(identifier)) {
        // Direct email login
        const { error } = await supabase.auth.signInWithPassword({
          email: identifier.toLowerCase().trim(),
          password,
        });

        if (error) {
          toast.error(error.message || 'Failed to sign in');
          setIsLoading(false);
          return;
        }
      } else {
        // Phone login: resolve phone -> email via profiles table
        const normalizedPhone = normalizePhone(identifier);

        // Use edge function to look up email by phone (avoids RLS issues)
        const { data, error: fnError } = await supabase.functions.invoke('check-invite', {
          body: { phone: normalizedPhone, dedupe_only: false },
        });

        // We need a different approach — query profiles directly won't work
        // because user isn't authenticated yet. Use a lightweight edge function.
        // For now, let's look up via the resolve-phone-login function
        const { data: resolveData, error: resolveError } = await supabase.functions.invoke('resolve-phone-login', {
          body: { phone: normalizedPhone },
        });

        if (resolveError || !resolveData?.email) {
          toast.error(resolveData?.error || 'No account found for this phone number');
          setIsLoading(false);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: resolveData.email,
          password,
        });

        if (error) {
          toast.error(error.message || 'Failed to sign in');
          setIsLoading(false);
          return;
        }
      }

      toast.success('Logged in successfully');
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (error: any) {
      toast.error('Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!identifier.trim()) {
      toast.error('Please enter your email or phone');
      return;
    }

    setIsLoading(true);

    try {
      const body: Record<string, string> = {};
      if (isEmail(identifier)) {
        body.email = identifier.toLowerCase().trim();
      } else {
        body.phone = normalizePhone(identifier);
      }

      const { data, error } = await supabase.functions.invoke('check-invite', {
        body,
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        setIsLoading(false);
        return;
      }

      if (!data?.found) {
        toast.error('You are not invited. Please contact your Admin.');
        setIsLoading(false);
        return;
      }

      setInviteInfo({
        full_name: data.full_name,
        role: data.role,
        workshop_name: data.workshop_name,
        needs_email: data.needs_email || false,
      });
      setActivateStep('password');
    } catch (error: any) {
      console.error('Error checking invite:', error);
      toast.error('Failed to check invite. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activatePassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (activatePassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    // If user provided an optional email, validate it
    if (activationEmail.trim() && !isEmail(activationEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      const body: Record<string, string> = {
        password: activatePassword,
      };

      if (isEmail(identifier)) {
        body.email = identifier.toLowerCase().trim();
      } else {
        body.phone = normalizePhone(identifier);
      }

      if (activationEmail.trim()) {
        body.activation_email = activationEmail.toLowerCase().trim();
      }

      const { data, error } = await supabase.functions.invoke('accept-invite', {
        body,
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        setIsLoading(false);
        return;
      }

      setActivateStep('done');
      toast.success('Account activated! You can now sign in.');
    } catch (error: any) {
      console.error('Error activating account:', error);
      toast.error('Failed to activate account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchToLogin = () => {
    setMode('login');
    setActivateStep('identifier');
    setInviteInfo(null);
    setActivatePassword('');
    setConfirmPassword('');
    setActivationEmail('');
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'country_admin': return 'Country Admin';
      case 'workshop_admin': return 'Admin';
      case 'warranty_admin': return 'Warranty Admin';
      case 'system_admin': return 'System Admin';
      default: return 'Technician';
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo/Branding */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <img src={spiroLogo} alt="Spiro" className="h-16 w-16 object-contain" />
          <h1 className="text-2xl font-bold text-foreground">Aftersales Platform</h1>
        </div>

        <Card>
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Welcome</CardTitle>
            <CardDescription className="text-center">
              Sign in or activate your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => {
              setMode(v as AuthMode);
              setActivateStep('identifier');
              setInviteInfo(null);
            }}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="activate">New User</TabsTrigger>
              </TabsList>

              {/* Sign In Tab */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-identifier">Email or Phone</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-identifier"
                        type="text"
                        placeholder="you@example.com or +254..."
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        className="pl-10 h-12"
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Password</Label>
                      <button
                        type="button"
                        onClick={() => toast.info('Password reset is handled by your administrator')}
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 h-12"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-medium" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* Activate Account Tab */}
              <TabsContent value="activate">
                {activateStep === 'identifier' && (
                  <form onSubmit={handleCheckInvite} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Enter the email or phone your admin used to invite you.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="activate-identifier">Email or Phone</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="activate-identifier"
                          type="text"
                          placeholder="you@example.com or +254..."
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          className="pl-10 h-12"
                          autoComplete="username"
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-12 text-base font-medium" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        'Check Invite'
                      )}
                    </Button>
                  </form>
                )}

                {activateStep === 'password' && inviteInfo && (
                  <form onSubmit={handleActivateAccount} className="space-y-4">
                    {/* Invite info card */}
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2">
                      <p className="text-sm font-medium">Welcome, {inviteInfo.full_name}!</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">
                          <Shield className="h-3 w-3 mr-1" />
                          {getRoleLabel(inviteInfo.role)}
                        </Badge>
                        {inviteInfo.workshop_name && (
                          <Badge variant="outline">{inviteInfo.workshop_name}</Badge>
                        )}
                      </div>
                    </div>

                    {inviteInfo.needs_email && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          You can optionally add an email for your account. If left blank, you'll log in with your phone number.
                        </p>
                        <Label htmlFor="activation-email">Email (optional)</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="activation-email"
                            type="email"
                            placeholder="you@example.com"
                            value={activationEmail}
                            onChange={(e) => setActivationEmail(e.target.value)}
                            className="pl-10 h-12"
                            autoComplete="email"
                          />
                        </div>
                      </div>
                    )}

                    <p className="text-sm text-muted-foreground">
                      Set a password to activate your account.
                    </p>

                    <div className="space-y-2">
                      <Label htmlFor="activate-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="activate-password"
                          type={showActivatePassword ? 'text' : 'password'}
                          placeholder="Min. 6 characters"
                          value={activatePassword}
                          onChange={(e) => setActivatePassword(e.target.value)}
                          className="pl-10 pr-10 h-12"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowActivatePassword(!showActivatePassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showActivatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="confirm-password"
                          type={showActivatePassword ? 'text' : 'password'}
                          placeholder="Confirm password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pl-10 h-12"
                          autoComplete="new-password"
                        />
                      </div>
                      {confirmPassword && activatePassword !== confirmPassword && (
                        <p className="text-xs text-destructive">Passwords do not match</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-medium"
                      disabled={isLoading || !activatePassword || activatePassword !== confirmPassword}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Activating...
                        </>
                      ) : (
                        'Activate Account'
                      )}
                    </Button>
                  </form>
                )}

                {activateStep === 'done' && (
                  <div className="text-center space-y-4 py-4">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
                    <div>
                      <h3 className="font-semibold text-lg">Account Activated!</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your account is ready. Sign in to get started.
                      </p>
                    </div>
                    <Button className="w-full h-12" onClick={handleSwitchToLogin}>
                      Go to Sign In
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground px-4">
          Users can only join via invite from their Workshop Admin or Super Admin.
        </p>
      </div>
    </div>
  );
}
