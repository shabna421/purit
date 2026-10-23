import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { generateId } from './services/dbUtils';
import { User, Membership, Organization, OrganizationSettings } from './types';
import { orgService } from './services/orgService';

function normalizeOrganization(org: Organization): Organization {
  return {
    ...org,
    settings: {
      currency: 'INR',
      taxEnabled: false,
      taxRate: 0,
      lastGstInvoiceNumber: '',
      multiLocationEnabled: false,
      enableBarcode: false,
      barcodeFormat: 'code128',
      tableDisplayMode: 'table',
      storeName: org.settings?.storeName ?? org.name ?? 'Purit Network',
      tagline: org.settings?.tagline ?? 'smart inventory management',
      address: org.settings?.address ?? 'Main Warehouse, Kozhikode, Kerala - 673631',
      phone: org.settings?.phone ?? '+91 98765 43210',
      email: org.settings?.email ?? 'support@purit.com',
      gstin: org.settings?.gstin ?? '32ABCDE1234F1Z5',
      ...org.settings,
      modules: {
        purchases: true,
        sales: true,
        inventory: true,
        finance: true,
        expenseTracker: true,
        returns: true,
        damages: true,
        customerCredit: true,
        supplierCredit: true,
        pdfInvoices: true,
        truckInventory: false,
        staffManagement: false,
        advancedReports: false,
        alerts: false,
        ...org.settings?.modules,
      },
    },
  };
}

interface AuthContextType {
  user: User | null;
  firebaseUser: any | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (name: string, email: string, password: string) => Promise<void>;
  getSignInMethodsForEmailAddress: (email: string) => Promise<string[]>;
  sendPasswordReset: (email: string) => Promise<void>;
  setPasswordForCurrentUser: (newPassword: string) => Promise<'linked' | 'updated'>;
  isGoogleOnlyUser: boolean;
  hasEmailProvider: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const DEFAULT_USER: User = {
  uid: 'kQBuT1NiVfNgwJAXi1Y3FYuLPGo1',
  email: 'taharakerala@gmail.com',
  displayName: 'tahara',
  photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocKcDYW3bIVwdbWSQK_b_xZHI6DR62DnTJo9Rel1vwtz6aqq0TM=s96-c',
  createdAt: 1776493623475,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<any | null>({
    uid: DEFAULT_USER.uid,
    id: DEFAULT_USER.uid,
    email: DEFAULT_USER.email,
  });
  const [user, setUser] = useState<User | null>(DEFAULT_USER);
  const [loading, setLoading] = useState(false);
  const [providerIds, setProviderIds] = useState<string[]>(['password']);
  const hasEmailProvider = true;
  const isGoogleOnlyUser = false;

  useEffect(() => {
    // Ensure default user exists in users table
    const initDefaultUser = async () => {
      try {
        await supabase
          .from('users')
          .upsert({
            uid: DEFAULT_USER.uid,
            email: DEFAULT_USER.email,
            displayName: DEFAULT_USER.displayName,
            photoURL: null,
            createdAt: DEFAULT_USER.createdAt,
          });
      } catch (err) {
        console.error('Error verifying default user:', err);
      } finally {
        setUser(DEFAULT_USER);
        setLoading(false);
      }
    };
    void initDefaultUser();
  }, []);

  const login = async () => {};
  const getSignInMethodsForEmailAddress = async () => ['password'];
  const loginWithEmail = async () => {};
  const signupWithEmail = async () => {};
  const sendPasswordReset = async () => {};
  const setPasswordForCurrentUser = async () => 'updated' as const;
  const logout = async () => {
    setUser(DEFAULT_USER);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        login,
        loginWithEmail,
        signupWithEmail,
        getSignInMethodsForEmailAddress,
        sendPasswordReset,
        setPasswordForCurrentUser,
        isGoogleOnlyUser,
        hasEmailProvider,
        logout,
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

interface TenancyContextType {
  currentOrg: Organization | null;
  membership: Membership | null;
  orgs: Organization[];
  switchOrg: (orgId: string) => void;
  createOrganization: (name: string) => Promise<void>;
  updateCurrentOrgSettings: (settings: Partial<OrganizationSettings>) => Promise<void>;
  loading: boolean;
}

const TenancyContext = createContext<TenancyContextType | undefined>(undefined);

export function TenancyProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembershipsAndOrgs = useCallback(async (userId: string) => {
    try {
      const { data: membershipData, error: memErr } = await supabase
        .from('memberships')
        .select('*')
        .eq('userId', userId);

      if (memErr) throw memErr;

      let membershipsList = (membershipData || []) as Membership[];

      if (membershipsList.length === 0) {
        // Fallback: auto-attach to existing organization as owner
        const { data: allOrgs } = await supabase.from('organizations').select('*').limit(1);
        if (allOrgs && allOrgs.length > 0) {
          const firstOrg = normalizeOrganization(allOrgs[0] as Organization);
          const autoMembership: Membership = {
            id: `${userId}_${firstOrg.id}`,
            orgId: firstOrg.id,
            userId,
            role: 'owner',
            joinedAt: Date.now(),
          };
          await supabase.from('memberships').upsert(autoMembership);
          membershipsList = [autoMembership];
          setMemberships(membershipsList);
          setOrgs([firstOrg]);
          setCurrentOrg(firstOrg);
          setMembership(autoMembership);
          setLoading(false);
          return;
        }
      }

      setMemberships(membershipsList);

      // Query organizations
      const { data: orgData, error: orgErr } = await supabase
        .from('organizations')
        .select('*');

      if (orgErr) throw orgErr;

      const userOrgs = (orgData || []).map((o: any) => normalizeOrganization(o as Organization));
      setOrgs(userOrgs);

      const savedOrgId = typeof window !== 'undefined' ? localStorage.getItem('purit_current_org_id') : null;
      const taharaOrg = userOrgs.find((org) => org.id === 'dOMMfLykbkZ29fqsRYzD');

      setCurrentOrg((previous) => {
        if (userOrgs.length === 0) return null;
        if (savedOrgId) {
          const matched = userOrgs.find((org) => org.id === savedOrgId);
          if (matched) return matched;
        }
        if (taharaOrg) return taharaOrg;
        if (!previous) return userOrgs[0];
        return userOrgs.find((org) => org.id === previous.id) ?? userOrgs[0];
      });
    } catch (error) {
      console.error('Error loading organization memberships:', error);
      setOrgs([]);
      setMemberships([]);
      setCurrentOrg(null);
      setMembership(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setMemberships([]);
      setCurrentOrg(null);
      setMembership(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchMembershipsAndOrgs(user.uid);

    const channel = supabase
      .channel(`user_memberships_${user.uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memberships', filter: `userId=eq.${user.uid}` },
        () => {
          fetchMembershipsAndOrgs(user.uid);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchMembershipsAndOrgs]);

  useEffect(() => {
    if (!currentOrg?.id) return;

    const orgId = currentOrg.id;
    const channel = supabase
      .channel(`current_org_${orgId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'organizations', filter: `id=eq.${orgId}` },
        (payload) => {
          if (payload.new) {
            const org = normalizeOrganization(payload.new as Organization);
            setCurrentOrg(org);
            setOrgs((previous) => previous.map((entry) => (entry.id === org.id ? org : entry)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrg?.id]);

  useEffect(() => {
    if (currentOrg) {
      const currentMem = memberships.find((m) => m.orgId === currentOrg.id) || {
        id: `${user?.uid || DEFAULT_USER.uid}_${currentOrg.id}`,
        orgId: currentOrg.id,
        userId: user?.uid || DEFAULT_USER.uid,
        role: 'owner',
        joinedAt: Date.now(),
      };
      setMembership(currentMem);
    } else {
      setMembership(null);
    }
  }, [currentOrg, memberships, user]);

  const createOrganization = async (name: string) => {
    if (!user) return;
    if (currentOrg || orgs.length > 0 || memberships.length > 0) {
      throw new Error('This account already belongs to an organization.');
    }

    const orgId = generateId();
    const newOrg: Organization = {
      id: orgId,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      ownerId: user.uid,
      createdAt: Date.now(),
      settings: {
        currency: 'INR',
        taxEnabled: false,
        taxRate: 0,
        multiLocationEnabled: false,
        enableBarcode: false,
        barcodeFormat: 'code128',
        tableDisplayMode: 'table',
        modules: {
          purchases: true,
          sales: true,
          inventory: true,
          finance: true,
          expenseTracker: true,
          returns: true,
          damages: true,
          customerCredit: true,
          supplierCredit: true,
          pdfInvoices: true,
          truckInventory: false,
          staffManagement: false,
          advancedReports: false,
          alerts: false,
        },
      },
    };

    const newMembership: Membership = {
      id: `${user.uid}_${orgId}`,
      orgId,
      userId: user.uid,
      role: 'owner',
      joinedAt: Date.now(),
    };

    const defaultLocation = {
      id: generateId(),
      orgId,
      name: 'Main Warehouse',
      type: 'warehouse',
      isDefault: true,
    };

    await Promise.all([
      supabase.from('organizations').insert(newOrg),
      supabase.from('memberships').insert(newMembership),
      supabase.from('locations').insert(defaultLocation),
    ]);

    setCurrentOrg(newOrg);
    setOrgs([newOrg]);
    setMemberships([newMembership]);
  };

  const updateCurrentOrgSettings = async (settingsPatch: Partial<OrganizationSettings>) => {
    if (!currentOrg) return;

    const mergedOrg = normalizeOrganization({
      ...currentOrg,
      settings: {
        ...currentOrg.settings,
        ...settingsPatch,
        modules: {
          ...currentOrg.settings.modules,
          ...(settingsPatch.modules || {}),
        },
      },
    });

    setCurrentOrg(mergedOrg);
    setOrgs((previous) => previous.map((entry) => (entry.id === mergedOrg.id ? mergedOrg : entry)));

    try {
      await orgService.updateSettings(currentOrg.id, settingsPatch);
    } catch (error) {
      setCurrentOrg(currentOrg);
      setOrgs((previous) => previous.map((entry) => (entry.id === currentOrg.id ? currentOrg : entry)));
      throw error;
    }
  };

  const switchOrg = async (orgId: string) => {
    try {
      localStorage.setItem('purit_current_org_id', orgId);
    } catch (_) {}
    const org = orgs.find((o) => o.id === orgId);
    if (org) {
      setCurrentOrg(org);
    } else {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle();

      if (orgData) {
        setCurrentOrg(normalizeOrganization(orgData as Organization));
      }
    }
  };

  return (
    <TenancyContext.Provider
      value={{
        currentOrg,
        membership,
        orgs,
        switchOrg,
        createOrganization,
        updateCurrentOrgSettings,
        loading: loading || authLoading,
      }}
    >
      {children}
    </TenancyContext.Provider>
  );
}

export function useTenancy() {
  const context = useContext(TenancyContext);
  if (context === undefined) {
    throw new Error('useTenancy must be used within a TenancyProvider');
  }
  return context;
}
