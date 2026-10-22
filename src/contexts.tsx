import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  User as FirebaseUser,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
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
      storeName: org.settings?.storeName ?? org.name ?? 'Stockii Network',
      tagline: org.settings?.tagline ?? 'smart inventory management',
      address: org.settings?.address ?? 'Main Warehouse, Kozhikode, Kerala - 673631',
      phone: org.settings?.phone ?? '+91 98765 43210',
      email: org.settings?.email ?? 'support@stockii.com',
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
  firebaseUser: FirebaseUser | null;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const hasEmailProvider = providerIds.includes('password');
  const isGoogleOnlyUser = providerIds.length > 0 && providerIds.every((providerId) => providerId === 'google.com');

  const processPendingInvitations = async (uid: string, email: string) => {
    if (!email) return;
    try {
      const userEmail = email.trim().toLowerCase();
      console.log('[Auth] Checking pending invitations for:', userEmail, 'uid:', uid);
      const invitesQuery = query(collection(db, 'invitations'), where('email', '==', userEmail));
      const invitesSnap = await getDocs(invitesQuery);
      
      console.log('[Auth] Invitation check result - found invites:', invitesSnap.size);
      
      if (!invitesSnap.empty) {
        const batchPromises = invitesSnap.docs.map(async (inviteDoc) => {
          const inviteData = inviteDoc.data();
          const orgId = inviteData.orgId;
          const role = inviteData.role || 'sales';
          const membershipId = `${uid}_${orgId}`;
          const membershipRef = doc(db, 'memberships', membershipId);

          console.log('[Auth] Processing invite:', inviteDoc.id, 'for orgId:', orgId, 'role:', role);

          await setDoc(membershipRef, {
            id: membershipId,
            orgId,
            userId: uid,
            role,
            joinedAt: Date.now(),
          });
          
          console.log('[Auth] Created membership:', membershipId);
          await deleteDoc(inviteDoc.ref);
          console.log('[Auth] Deleted pending invitation:', inviteDoc.id);
        });
        await Promise.all(batchPromises);
        console.log('[Auth] All pending invitations processed successfully!');
      }
    } catch (error) {
      console.error('[Auth] Error processing pending invitations:', error);
    }
  };

  useEffect(() => {
    return onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      setProviderIds(fUser?.providerData?.map((provider) => provider.providerId) || []);
      try {
        if (fUser) {
          // Sync user profile
          const userRef = doc(db, 'users', fUser.uid);
          const fallbackUser: User = {
            uid: fUser.uid,
            email: fUser.email || '',
            displayName: fUser.displayName || 'User',
            photoURL: fUser.photoURL || null,
            createdAt: Date.now(),
          };

          const userSnap = await getDoc(userRef);
          let activeProfile: User;

          if (!userSnap.exists()) {
            await setDoc(userRef, fallbackUser);
            activeProfile = fallbackUser;
          } else {
            const currentProfile = userSnap.data() as User;
            // If the document has a fallback name like 'User' or is missing the name, but Firebase Auth now has a better name, update it in Firestore!
            const needsUpdate = 
              (!currentProfile.displayName || currentProfile.displayName === 'User') && 
              fUser.displayName && 
              fUser.displayName !== 'User';
              
            if (needsUpdate) {
              const updatedProfile = {
                ...currentProfile,
                displayName: fUser.displayName,
                email: fUser.email || currentProfile.email || '',
              };
              await setDoc(userRef, updatedProfile, { merge: true });
              activeProfile = updatedProfile;
            } else {
              activeProfile = currentProfile;
            }
          }

          // Process pending invitations BEFORE updating the user context state
          if (fUser.email) {
            await processPendingInvitations(fUser.uid, fUser.email);
          }

          // Set user profile only after invitations are guaranteed to be fully processed
          setUser(activeProfile);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Error syncing auth user profile:', error);
        if (fUser) {
          setUser({
            uid: fUser.uid,
            email: fUser.email || '',
            displayName: fUser.displayName || 'User',
            photoURL: fUser.photoURL || null,
            createdAt: Date.now(),
          });
        } else {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const getSignInMethodsForEmailAddress = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return [];
    return fetchSignInMethodsForEmail(auth, normalizedEmail);
  };

  const loginWithEmail = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      // Process pending invitations sequentially
      if (credential.user.email) {
        await processPendingInvitations(credential.user.uid, credential.user.email);
      }
    } catch (error: any) {
      console.error('[Auth] Login failed:', error.code, error.message);
      if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-email'
      ) {
        throw new Error('Sign-in failed. Please check your email and password. If you forgot your password, click "Forgot Password" to reset it.');
      }
      throw error;
    }
  };

  const signupWithEmail = async (name: string, email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

      const displayName = name.trim();
      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }

      // Immediately save user profile to Firestore to prevent race conditions during auth sync
      const userRef = doc(db, 'users', credential.user.uid);
      const userProfile: User = {
        uid: credential.user.uid,
        email: credential.user.email || '',
        displayName: displayName || 'User',
        photoURL: credential.user.photoURL || null,
        createdAt: Date.now(),
      };
      await setDoc(userRef, userProfile);

      // Process pending invitations sequentially BEFORE setting user state
      if (credential.user.email) {
        await processPendingInvitations(credential.user.uid, credential.user.email);
      }

      setUser(userProfile);
    } catch (error: any) {
      console.error('[Auth] Sign-up failed:', error.code, error.message);
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('An account with this email already exists. Please sign in instead.');
      }
      throw error;
    }
  };

  const sendPasswordReset = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Please enter your registered email address.');
    }

    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
    } catch (error: any) {
      console.error('[Auth] Password reset failed:', error.code, error.message);
      if (error.code === 'auth/user-not-found') {
        throw new Error('No account was found for this email address.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Please enter a valid email address.');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many password reset requests. Please wait a few minutes and try again.');
      } else {
        throw new Error(error.message || 'Failed to send password reset email. Please try again.');
      }
    }
  };

  const setPasswordForCurrentUser = async (newPassword: string) => {
    const activeUser = auth.currentUser;
    if (!activeUser || !activeUser.email) {
      throw new Error('No authenticated user found. Please log in again.');
    }

    try {
      if (!hasEmailProvider) {
        // User is Google-only. Link the email and new password credential.
        const credential = EmailAuthProvider.credential(activeUser.email, newPassword);
        await linkWithCredential(activeUser, credential);
        setProviderIds(auth.currentUser?.providerData?.map((provider) => provider.providerId) || []);
        return 'linked';
      } else {
        // User already has a password provider linked. Update the password directly.
        await updatePassword(activeUser, newPassword);
        setProviderIds(auth.currentUser?.providerData?.map((provider) => provider.providerId) || []);
        return 'updated';
      }
    } catch (error: any) {
      console.error('[Auth] Set password failed:', error.code, error.message);
      if (error.code === 'auth/requires-recent-login') {
        throw new Error('For security, please sign out and sign back in, then try setting your password again.');
      }
      if (error.code === 'auth/provider-already-linked') {
        await updatePassword(activeUser, newPassword);
        setProviderIds(auth.currentUser?.providerData?.map((provider) => provider.providerId) || []);
        return 'updated';
      }
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
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

    const q = query(collection(db, 'memberships'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        try {
          const membershipData = snapshot.docs.map(doc => doc.data() as Membership);
          setMemberships(membershipData);

          if (membershipData.length === 0) {
            setOrgs([]);
            setCurrentOrg(null);
            setMembership(null);
            setLoading(false);
            return;
          }

          // Fetch organization details for each membership
          const orgPromises = membershipData.map(m => getDoc(doc(db, 'organizations', m.orgId)));
          const orgSnaps = await Promise.all(orgPromises);
          const userOrgs = orgSnaps
            .filter(snap => snap.exists())
            .map(snap => normalizeOrganization(snap.data() as Organization));

          setOrgs(userOrgs);

          setCurrentOrg((previous) => {
            if (userOrgs.length === 0) return null;
            if (!previous) return userOrgs[0];
            return userOrgs.find((org) => org.id === previous.id) ?? userOrgs[0];
          });

          setLoading(false);
        } catch (error) {
          console.error('Error loading organization memberships:', error);
          setOrgs([]);
          setMemberships([]);
          setCurrentOrg(null);
          setMembership(null);
          setLoading(false);
        }
      },
      (error) => {
        console.error('Membership subscription failed:', error);
        setOrgs([]);
        setMemberships([]);
        setCurrentOrg(null);
        setMembership(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!currentOrg?.id) return;

    const orgRef = doc(db, 'organizations', currentOrg.id);
    return onSnapshot(orgRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const org = normalizeOrganization(snapshot.data() as Organization);
      setCurrentOrg(org);
      setOrgs((previous) => previous.map((entry) => (entry.id === org.id ? org : entry)));
    });
  }, [currentOrg?.id]);

  // Sync membership when currentOrg or memberships change
  useEffect(() => {
    if (currentOrg && memberships.length > 0) {
      const currentMem = memberships.find(m => m.orgId === currentOrg.id);
      setMembership(currentMem || null);
    } else {
      setMembership(null);
    }
  }, [currentOrg, memberships]);

  const createOrganization = async (name: string) => {
    if (!user) return;
    if (currentOrg || orgs.length > 0 || memberships.length > 0) {
      throw new Error('This account already belongs to an organization.');
    }

    const orgRef = doc(collection(db, 'organizations'));
    const orgId = orgRef.id;
    
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
        }
      }
    };

    const newMembership: Membership = {
      id: `${user.uid}_${orgId}`,
      orgId,
      userId: user.uid,
      role: 'owner',
      joinedAt: Date.now(),
    };

    // Create default location
    const locationRef = doc(collection(db, `organizations/${orgId}/locations`));
    const defaultLocation = {
      id: locationRef.id,
      orgId,
      name: 'Main Warehouse',
      type: 'warehouse',
      isDefault: true,
    };

    await Promise.all([
      setDoc(orgRef, newOrg),
      setDoc(doc(db, 'memberships', newMembership.id), newMembership),
      setDoc(locationRef, defaultLocation),
    ]);

    setCurrentOrg(newOrg);
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
    const org = orgs.find(o => o.id === orgId);
    if (org) {
      setCurrentOrg(org);
    } else {
      // Fallback: fetch if not in list
      const orgRef = doc(db, 'organizations', orgId);
      const orgSnap = await getDoc(orgRef);
      if (orgSnap.exists()) {
        setCurrentOrg(normalizeOrganization(orgSnap.data() as Organization));
      }
    }
  };

  return (
    <TenancyContext.Provider value={{ currentOrg, membership, orgs, switchOrg, createOrganization, updateCurrentOrgSettings, loading: loading || authLoading }}>
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
