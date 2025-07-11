import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Define types for Supabase responses
interface RoleData {
  role_name: string;
}

type User = {
  id: string;
  email: string;
  roles: string[];
  organization_id?: string;
};

type AuthContextType = {
  user: User | null;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Function to assign a role to a user directly if RPC function is not available
  const assignRoleDirectly = async (userId: string, roleName: string = 'employee') => {
    try {
      // First check if the role exists
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('role_name', roleName)
        .single();

      if (roleError) {
        console.error('Error finding role:', roleError);
        return;
      }

      // Then assign the role to the user
      const { error: assignError } = await supabase
        .from('user_role_assignments')
        .insert([{ user_id: userId, role_id: roleData.id }]);

      if (assignError) {
        console.error('Error assigning role:', assignError);
      }
    } catch (error) {
      console.error('Error in assignRoleDirectly:', error);
    }
  };

  const fetchUserRoles = async (userId: string) => {
    console.log('Fetching roles for user:', userId);

    try {
      // Get the session for logging purposes only
      const { data: { session } } = await supabase.auth.getSession();

      if (session && session.user && session.user.email) {
        console.log('Fetching roles from Supabase for user:', session.user.email);
      }

      // First try to get roles directly from the user_roles view or table
      console.log('Fetching roles for user ID:', userId);

      // Try different queries to find the user's roles
      // Query 1: Try user_role_assignments table with join
      let { data, error } = await supabase
        .from('user_role_assignments')
        .select(`
          roles:role_id (
            role_name
          )
        `)
        .eq('user_id', userId);

      // If the first query fails, try a direct query to a roles table
      let directRoleNames: string[] = [];

      if (error || !data || data.length === 0) {
        console.log('First query failed or returned no data, trying direct roles query');
        const { data: directData, error: directError } = await supabase
          .from('roles')
          .select('role_name')
          .eq('user_id', userId);

        if (!directError && directData && directData.length > 0) {
          // Extract role names directly
          directRoleNames = directData.map(item => item.role_name).filter(Boolean);
          console.log('Direct roles query found roles:', directRoleNames);

          if (directRoleNames.length > 0) {
            // Ensure user has only one role based on hierarchy (HR > Assessor > Employee)
            let primaryRole = 'employee';
            if (directRoleNames.includes('hr')) {
              primaryRole = 'hr';
            } else if (directRoleNames.includes('assessor')) {
              primaryRole = 'assessor';
            } else if (directRoleNames.length > 0) {
              primaryRole = directRoleNames[0];
            }

            console.log('Primary role from direct query:', primaryRole);
            return [primaryRole];
          }
        }
      }

      // If both fail, try a user_roles view if it exists
      if (error || !data || data.length === 0) {
        console.log('Second query failed or returned no data, trying user_roles view');
        // Try both user_roles and user_role_view
        let viewData = null;
        let viewError = null;

        // First try user_roles
        try {
          const result = await supabase
            .from('user_roles')
            .select('role_name')
            .eq('user_id', userId);

          viewData = result.data;
          viewError = result.error;

          if (viewError) {
            console.log('Error querying user_roles, trying user_role_view instead');

            // If that fails, try user_role_view
            const viewResult = await supabase
              .from('user_role_view')
              .select('role_name')
              .eq('user_id', userId);

            viewData = viewResult.data;
            viewError = viewResult.error;
          }
        } catch (e) {
          console.error('Error querying roles views:', e);

          // Try user_role_view as a fallback
          try {
            const viewResult = await supabase
              .from('user_role_view')
              .select('role_name')
              .eq('user_id', userId);

            viewData = viewResult.data;
            viewError = viewResult.error;
          } catch (viewError) {
            console.error('Error querying user_role_view:', viewError);
          }
        }

        if (!viewError && viewData && viewData.length > 0) {
          // Extract role names directly
          const viewRoleNames = viewData.map(item => item.role_name).filter(Boolean);
          console.log('User roles view found roles:', viewRoleNames);

          if (viewRoleNames.length > 0) {
            // Ensure user has only one role based on hierarchy (HR > Assessor > Employee)
            let primaryRole = 'employee';
            if (viewRoleNames.includes('hr')) {
              primaryRole = 'hr';
            } else if (viewRoleNames.includes('assessor')) {
              primaryRole = 'assessor';
            } else if (viewRoleNames.length > 0) {
              primaryRole = viewRoleNames[0];
            }

            console.log('Primary role from view:', primaryRole);
            return [primaryRole];
          }
        }
      }

      if (error) {
        console.error('Error fetching user roles:', error);
        return ['employee']; // Return default role on error
      }

      // If user has no roles assigned, assign the default 'employee' role
      if (!data || data.length === 0) {
        console.log('No roles found for user, using default employee role');

        // Try to get roles from a different table first
        try {
          // Try to get roles from the user_roles table or view
          let directRoles = null;
          let directError = null;

          // First try user_roles
          try {
            const result = await supabase
              .from('user_roles')
              .select('role_name')
              .eq('user_id', userId);

            directRoles = result.data;
            directError = result.error;

            if (directError) {
              console.log('Error querying user_roles, trying user_role_view instead');

              // If that fails, try user_role_view
              const viewResult = await supabase
                .from('user_role_view')
                .select('role_name')
                .eq('user_id', userId);

              directRoles = viewResult.data;
              directError = viewResult.error;
            }
          } catch (e) {
            console.error('Error querying roles views:', e);

            // Try user_role_view as a fallback
            try {
              const viewResult = await supabase
                .from('user_role_view')
                .select('role_name')
                .eq('user_id', userId);

              directRoles = viewResult.data;
              directError = viewResult.error;
            } catch (viewError) {
              console.error('Error querying user_role_view:', viewError);
            }
          }

          if (!directError && directRoles && directRoles.length > 0) {
            // Extract role names
            const roleNames = directRoles.map(item => item.role_name).filter(Boolean);
            console.log('Found roles in user_roles table:', roleNames);

            if (roleNames.length > 0) {
              // Ensure user has only one role based on hierarchy (HR > Assessor > Employee)
              let primaryRole = 'employee';
              if (roleNames.includes('hr')) {
                primaryRole = 'hr';
              } else if (roleNames.includes('assessor')) {
                primaryRole = 'assessor';
              } else if (roleNames.length > 0) {
                primaryRole = roleNames[0];
              }

              console.log('Primary role from user_roles table:', primaryRole);
              return [primaryRole];
            }
          }
        } catch (e) {
          console.error('Error fetching roles from user_roles table:', e);
        }

        // If still no roles, try the roles table
        try {
          const { data: rolesData, error: rolesError } = await supabase
            .from('roles')
            .select('*')
            .eq('user_id', userId);

          if (!rolesError && rolesData && rolesData.length > 0) {
            console.log('Found roles in roles table:', rolesData);
            const roleNames = rolesData.map(item => item.role_name || item.name).filter(Boolean);

            if (roleNames.length > 0) {
              // Ensure user has only one role based on hierarchy (HR > Assessor > Employee)
              let primaryRole = 'employee';
              if (roleNames.includes('hr')) {
                primaryRole = 'hr';
              } else if (roleNames.includes('assessor')) {
                primaryRole = 'assessor';
              } else if (roleNames.length > 0) {
                primaryRole = roleNames[0];
              }

              console.log('Primary role from roles table:', primaryRole);
              return [primaryRole];
            }
          }
        } catch (e) {
          console.error('Error fetching roles from roles table:', e);
        }

        // Assign the default role in the background, but don't wait for it
        assignRoleDirectly(userId, 'employee').catch(error => {
          console.error('Error assigning default role:', error);
        });

        // Return the default role immediately
        return ['employee'];
      }

      // Extract role names from the joined query result with improved error handling
      try {
        // Improved role extraction
        const roleNames: string[] = [];

        // Check if data exists and has items
        if (data && data.length > 0) {
          console.log('Processing role data:', JSON.stringify(data));

          for (const item of data) {
            // Use type assertion to handle different data structures
            const anyItem = item as any;

            // Handle different data structures that might come from Supabase
            if (anyItem.roles && typeof anyItem.roles === 'object' && 'role_name' in anyItem.roles) {
              // Standard structure from user_role_assignments join
              const roleObj = anyItem.roles as RoleData;
              roleNames.push(roleObj.role_name);
            } else if (anyItem.role_name) {
              // Direct role_name field from roles table or user_roles view
              roleNames.push(anyItem.role_name);
            } else if (typeof anyItem.roles === 'string') {
              // Handle case where roles might be a string
              roleNames.push(anyItem.roles);
            }
          }
        }

        console.log('Extracted roles before processing:', roleNames);

        // Ensure user has only one role based on hierarchy (HR > Assessor > Employee)
        let primaryRole = 'employee';
        if (roleNames.includes('hr')) {
          primaryRole = 'hr';
        } else if (roleNames.includes('assessor')) {
          primaryRole = 'assessor';
        } else if (roleNames.length > 0) {
          primaryRole = roleNames[0];
        }

        console.log('Final primary role:', primaryRole);

        // Return only the primary role in an array
        return [primaryRole];
      } catch (error) {
        console.error('Error processing roles:', error);
        return ['employee']; // Return default role on any error
      }
    } catch (error) {
      console.error('Unexpected error in fetchUserRoles:', error);
      return ['employee']; // Return default role on any error
    }
  };

  useEffect(() => {
    // Check for existing session - improved version with error handling and role persistence
    const checkSession = async () => {
      try {
        // First, check if we have cached user roles in localStorage
        const cachedUserData = localStorage.getItem('hrmoffice_user_data');
        let cachedRoles: string[] = [];

        if (cachedUserData) {
          try {
            const parsedData = JSON.parse(cachedUserData);
            if (parsedData && parsedData.roles && Array.isArray(parsedData.roles)) {
              cachedRoles = parsedData.roles;
              console.log('Found cached roles:', cachedRoles);
            }
          } catch (e) {
            console.error('Error parsing cached user data:', e);
          }
        }

        // Get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Error getting session:', sessionError);
          // Clear any invalid session data
          try {
            await supabase.auth.signOut().catch(e => {
              console.log('Non-critical error signing out after session error:', e);
            });
          } catch (signOutError) {
            console.log('Error during signOut after session error:', signOutError);
            // Continue even if this fails
          }
          localStorage.removeItem('hrmoffice_user_data');
          setUser(null);
          return;
        }

        if (session) {
          console.log('Found existing session for user:', session.user.email);

          // Set user immediately with cached roles or default role to speed up UI rendering
          const initialRoles = cachedRoles.length > 0 ? cachedRoles : ['employee'];

          setUser({
            id: session.user.id,
            email: session.user.email!,
            roles: initialRoles,
            organization_id: session.user.user_metadata?.organization_id
          });

          // Then fetch actual roles in the background
          fetchUserRoles(session.user.id).then(roles => {
            console.log('Fetched roles for existing session:', roles);

            // Cache the roles in localStorage for persistence
            localStorage.setItem('hrmoffice_user_data', JSON.stringify({
              id: session.user.id,
              email: session.user.email,
              roles: roles,
              organization_id: session.user.user_metadata?.organization_id
            }));

            setUser(prevUser => {
              if (prevUser) {
                return { ...prevUser, roles, organization_id: session.user.user_metadata?.organization_id };
              }
              return null;
            });
          }).catch(error => {
            console.error('Error fetching roles during session check:', error);
          });
        } else {
          console.log('No active session found');
          localStorage.removeItem('hrmoffice_user_data');
          setUser(null);
        }
      } catch (error) {
        console.error('Error checking session:', error);
        // On any error, clear the session to be safe
        try {
          await supabase.auth.signOut().catch(e => {
            console.log('Non-critical error signing out after session check error:', e);
          });
        } catch (signOutError) {
          console.error('Error signing out after session check error:', signOutError);
        }
        localStorage.removeItem('hrmoffice_user_data');
        setUser(null);
      }
    };

    checkSession();

    // Listen for auth changes - improved version with error handling and role persistence
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        localStorage.removeItem('hrmoffice_user_data');
        setUser(null);
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed successfully');
        // No need to update user state on token refresh
        return;
      }

      if (session) {
        // First, check if we have cached user roles in localStorage
        const cachedUserData = localStorage.getItem('hrmoffice_user_data');
        let cachedRoles: string[] = [];

        if (cachedUserData) {
          try {
            const parsedData = JSON.parse(cachedUserData);
            if (parsedData && parsedData.roles && Array.isArray(parsedData.roles)) {
              cachedRoles = parsedData.roles;
              console.log('Found cached roles during auth change:', cachedRoles);
            }
          } catch (e) {
            console.error('Error parsing cached user data during auth change:', e);
          }
        }

        // Set user immediately with cached roles or default role to speed up UI rendering
        const initialRoles = cachedRoles.length > 0 ? cachedRoles : ['employee'];

        setUser({
          id: session.user.id,
          email: session.user.email!,
          roles: initialRoles,
          organization_id: session.user.user_metadata?.organization_id
        });

        // Then fetch actual roles in the background
        fetchUserRoles(session.user.id).then(roles => {
          console.log('Fetched roles after auth change:', roles);

          // Cache the roles in localStorage for persistence
          localStorage.setItem('hrmoffice_user_data', JSON.stringify({
            id: session.user.id,
            email: session.user.email,
            roles: roles,
            organization_id: session.user.user_metadata?.organization_id
          }));

          setUser(prevUser => {
            if (prevUser) {
              return { ...prevUser, roles, organization_id: session.user.user_metadata?.organization_id };
            }
            return null;
          });
        }).catch(error => {
          console.error('Error fetching roles during auth change:', error);
        });
      } else {
        // If we get here with no session, there might be an issue
        console.warn('Auth state changed but no session available for event:', event);
        localStorage.removeItem('hrmoffice_user_data');
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      console.log('Signing in user:', email);

      // Clear any stored tokens and user data from localStorage first
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('hrmoffice_user_data');

      try {
        // First, try to clear any existing session to prevent token conflicts
        // But handle the case where there might not be an active session
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          console.log('Active session found, signing out before sign-in');
          await supabase.auth.signOut().catch(e => {
            console.log('Non-critical error signing out before sign-in:', e);
            // Continue even if this fails
          });
        } else {
          console.log('No active session found before sign-in');
        }
      } catch (sessionError) {
        console.log('Error checking session before sign-in:', sessionError);
        // Continue even if this fails
      }

      // Then sign in with the new credentials
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Sign-in error:', error.message);
        throw error;
      }

      // If we have a session, pre-fetch the roles to speed up the process
      if (data && data.session && data.user) {
        console.log('Sign-in successful, session established');
        console.log('Session expires at:', new Date(data.session.expires_at! * 1000).toLocaleString());

        // Store the session in localStorage for persistence
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at
        }));

        // This will run in parallel with the auth state change handler
        fetchUserRoles(data.user.id).then(roles => {
          console.log('Pre-fetched roles:', roles);

          // Cache the roles in localStorage for persistence
          localStorage.setItem('hrmoffice_user_data', JSON.stringify({
            id: data.user.id,
            email: data.user.email,
            roles: roles,
            organization_id: data.user.user_metadata?.organization_id
          }));

          // The auth state change handler will set the user with these roles
        }).catch(err => {
          console.error('Error pre-fetching roles:', err);
        });
      } else {
        console.warn('Sign-in successful but no session data returned');
      }

      return data;
    } catch (error) {
      console.error('Unexpected error during sign-in:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      // Validate email and password
      if (!email || !email.includes('@')) {
        throw new Error('Invalid email address');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      console.log('Starting sign-up process for:', email);

      // Get the correct redirect URL based on environment
      const redirectUrl = window.location.hostname === 'localhost'
        ? `${window.location.origin}/auth/welcome-page`
        : 'https://hrmoffice.vercel.app/auth/welcome-page';

      // Sign up with email confirmation
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            redirectTo: redirectUrl
          }
        }
      });

      if (error) {
        console.error('Auth sign-up error details:', {
          message: error.message,
          status: error.status,
          name: error.name
        });
        throw error;
      }

      if (!data.user) {
        console.error('No user data returned after sign-up');
        throw new Error('No user data returned after sign-up');
      }

      console.log('Sign-up successful:', {
        userId: data.user.id,
        email: data.user.email
      });

    } catch (error) {
      console.error('Unexpected error during sign-up:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  };

  const signOut = async () => {
    try {
      console.log('Signing out user');

      // Clear any stored tokens and user data from localStorage first
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('hrmoffice_user_data');

      try {
        // Check if there's an active session first
        const { data: { session } } = await supabase.auth.getSession();

        // Only try to sign out if there's an active session
        if (session) {
          console.log('Active session found, signing out from Supabase');
          const { error } = await supabase.auth.signOut();

          if (error) {
            console.log('Non-critical error during sign out:', error);
            // Don't throw the error, just log it
          }
        } else {
          console.log('No active session found, skipping Supabase signOut call');
        }
      } catch (sessionError) {
        // If we can't get the session, just log the error and continue
        console.log('Error checking session during sign out:', sessionError);
        // Don't throw this error, we'll still clear the user state
      }

      // Always clear user state regardless of any errors
      setUser(null);
      console.log('User signed out successfully');
    } catch (error) {
      console.error('Unexpected error during sign out:', error);
      // Still clear the user state even if there was an error
      setUser(null);
      // Don't rethrow the error, just log it
    }
  };

  const signInWithGoogle = async () => {
    try {
      console.log('Starting Google OAuth sign-in');

      // Clear any stored tokens and user data from localStorage first
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('hrmoffice_user_data');

      try {
        // First, try to clear any existing session to prevent token conflicts
        // But handle the case where there might not be an active session
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          console.log('Active session found, signing out before Google sign-in');
          await supabase.auth.signOut().catch(e => {
            console.log('Non-critical error signing out before Google sign-in:', e);
            // Continue even if this fails
          });
        } else {
          console.log('No active session found before Google sign-in');
        }
      } catch (sessionError) {
        console.log('Error checking session before Google sign-in:', sessionError);
        // Continue even if this fails
      }

      // Get the correct redirect URL based on environment
      const redirectUrl = window.location.hostname === 'localhost'
        ? `${window.location.origin}/auth/callback`
        : 'https://hrmoffice.vercel.app/auth/callback';

      console.log('Using redirect URL:', redirectUrl);

      // Start the OAuth flow
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) {
        console.error('Error starting Google OAuth flow:', error);
        throw error;
      }

      console.log('Google OAuth flow started successfully');
    } catch (error) {
      console.error('Unexpected error during Google sign-in:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      console.log('Sending password reset email to:', email);

      // Get the correct redirect URL based on environment
      const redirectUrl = window.location.hostname === 'localhost'
        ? `${window.location.origin}/auth/reset-password`
        : 'https://hrmoffice.vercel.app/auth/reset-password';

      console.log('Using redirect URL for password reset:', redirectUrl);

      // Send the password reset email
      // Note: Supabase's resetPasswordForEmail has a default token expiration of 24 hours
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      });

      if (error) {
        console.error('Error sending password reset email:', error);
        throw error;
      }

      console.log('Password reset email sent successfully');
      console.log('Note: The reset link will expire in 24 hours');
    } catch (error) {
      console.error('Unexpected error during password reset:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signUp, signOut, signInWithGoogle, resetPassword }}>
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