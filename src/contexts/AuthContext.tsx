import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserProfile, Workshop } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  workshop: Workshop | null;
  isLoading: boolean;
  signIn: (phone: string, otp: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  sendOtp: (phone: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setWorkshop(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        setIsLoading(false);
        return;
      }

      // Type cast to handle enum
      const typedProfile: UserProfile = {
        ...profileData,
        role: profileData.role as UserProfile['role'],
        status: (profileData as any).status as UserProfile['status'] || 'ACTIVE',
        email: (profileData as any).email || null,
        phone: (profileData as any).phone || null,
        country: (profileData as any).country || null,
      };

      // Check if user is removed
      if (typedProfile.status === 'REMOVED') {
        await supabase.auth.signOut();
        setProfile(null);
        setWorkshop(null);
        setIsLoading(false);
        return;
      }

      setProfile(typedProfile);

      // Fetch workshop if user has one
      if (typedProfile.workshop_id) {
        const { data: workshopData, error: workshopError } = await supabase
          .from('workshops')
          .select('*')
          .eq('id', typedProfile.workshop_id)
          .single();

        if (!workshopError && workshopData) {
          const typedWorkshop: Workshop = {
            ...workshopData,
            type: workshopData.type as Workshop['type'],
            grade: workshopData.grade as Workshop['grade'],
          };
          setWorkshop(typedWorkshop);
        } else {
          // Workshop ID on profile points to non-existent workshop — treat as null
          console.warn(
            `Workshop ${typedProfile.workshop_id} not found for profile ${typedProfile.id}. ` +
            'This may indicate a data inconsistency.'
          );
          setWorkshop(null);
        }
      } else {
        // Explicitly clear workshop for users without one (super_admin, country_admin)
        setWorkshop(null);
      }
    } catch (error) {
      console.error('Error in fetchProfile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendOtp = async (phone: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
      });
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (phone: string, otp: string) => {
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms',
      });
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setWorkshop(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        workshop,
        isLoading,
        signIn,
        signOut,
        sendOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
