import React, { useEffect, useMemo, useState } from 'react';
import { useTenancy, useAuth } from '../contexts';
import { orgService } from '../services/orgService';
import { OrganizationSettings, Role, ROLE_PERMISSIONS, Membership, User } from '../types';
import { Shield, Layout, Save, Check, X, Search, Coins, Users, Lock, UserPlus, Trash2, Key, User as UserIcon, Mail, Building2, Pencil } from 'lucide-react';
import { useNotifications } from '../notifications';
import { AppSelect } from '../components/AppSelect';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';
import { supabase } from '../supabaseClient';
import { generateId } from '../services/dbUtils';
import SuperDeleteConfirmModal from '../components/SuperDeleteConfirmModal';

const CURRENCY_OPTIONS = [
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'SAR', label: 'Saudi Riyal' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
];

const APP_VERSION = '1.04';

const prettify = (value: string) => value.replace(/([A-Z])/g, ' $1').trim();

const getFallbackName = (email?: string, defaultFallback: string = 'Unknown Staff') => {
  if (!email || email === 'No Email') return defaultFallback;
  const username = email.split('@')[0];
  if (!username) return defaultFallback;
  return username.charAt(0).toUpperCase() + username.slice(1);
};

// Extended membership type with profile details
interface MemberWithProfile extends Membership {
  displayName: string;
  email: string;
  photoURL?: string;
}

export default function SettingsPage() {
  const { currentOrg, updateCurrentOrgSettings, membership } = useTenancy();
  const { user: authUser } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [barcodeSaving, setBarcodeSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'general' | 'modules' | 'staff'>('general');

  // Staff State
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [pendingInvites, setPendingInvites] = useState<{ id: string; email: string; role: Role; invitedAt: number }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // States for unified delete confirmations
  const [inviteToDelete, setInviteToDelete] = useState<{ id: string; email: string } | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; userId: string; displayName: string } | null>(null);

  // Store Settings Modal State
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [modalForm, setModalForm] = useState({
    storeName: '',
    tagline: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    lastGstInvoiceNumber: '',
  });

  const handleOpenStoreModal = () => {
    if (settings) {
      setModalForm({
        storeName: settings.storeName || '',
        tagline: settings.tagline || '',
        address: settings.address || '',
        phone: settings.phone || '',
        email: settings.email || '',
        gstin: settings.gstin || '',
        lastGstInvoiceNumber: settings.lastGstInvoiceNumber || '',
      });
      setIsStoreModalOpen(true);
    }
  };

  const handleSaveStoreModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !settings) return;
    const updatedSettings: OrganizationSettings = {
      ...settings,
      storeName: modalForm.storeName.trim(),
      tagline: modalForm.tagline.trim(),
      address: modalForm.address.trim(),
      phone: modalForm.phone.trim(),
      email: modalForm.email.trim(),
      gstin: modalForm.gstin.trim(),
      lastGstInvoiceNumber: modalForm.lastGstInvoiceNumber.trim(),
    };

    setSaving(true);
    try {
      setSettings(updatedSettings);
      await updateCurrentOrgSettings(updatedSettings);
      success('Store & company settings saved successfully');
      setIsStoreModalOpen(false);
    } catch (error) {
      console.error('Error saving store settings:', error);
      notifyError('Failed to save store settings');
    } finally {
      setSaving(false);
    }
  };

  const isOwner = Boolean(authUser && currentOrg && authUser.uid === currentOrg.ownerId);

  const MODULE_LABELS: Record<string, string> = {
    purchases: 'Purchases',
    sales: 'Sales',
    inventory: 'Inventory & Stock',
    finance: 'Finance',
    expenseTracker: 'Expense Tracker',
    returns: 'Returns Management',
    damages: 'Damages Tracking',
    customerCredit: 'Customer Credit',
    supplierCredit: 'Supplier Credit',
    pdfInvoices: 'PDF Invoices',
    truckInventory: 'Truck Inventory',
    staffManagement: 'Staff Management',
    advancedReports: 'Advanced Reports',
    alerts: 'Stock Alerts'
  };

  const [inviteAllowedModules, setInviteAllowedModules] = useState<Record<string, boolean>>({});
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editAllowedModules, setEditAllowedModules] = useState<Record<string, boolean>>({});

  const enabledOrgModules = useMemo(() => {
    if (!currentOrg?.settings?.modules) return [];
    return Object.entries(currentOrg.settings.modules)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key);
  }, [currentOrg]);

  const handleUpdateModules = async (membershipId: string, allowedModules: Record<string, boolean>) => {
    try {
      const { error } = await supabase
        .from('memberships')
        .update({ allowedModules })
        .eq('id', membershipId);

      if (error) throw error;

      success('Staff permissions updated successfully!');
      fetchMembers();
      setEditingMemberId(null);
    } catch (err) {
      console.error('Error updating modules:', err);
      notifyError('Failed to update staff permissions');
    }
  };

  useEffect(() => {
    if (currentOrg) {
      setSettings({
        multiLocationEnabled: false,
        enableBarcode: false,
        barcodeFormat: 'code128',
        tableDisplayMode: 'table',
        ...currentOrg.settings,
      });
    }
  }, [currentOrg]);

  useEffect(() => {
    if (currentOrg && !isOwner) {
      setActiveTab('staff');
    }
  }, [currentOrg, isOwner]);

  // Fetch staff members and pending invitations when staff tab is active
  const fetchMembers = async () => {
    if (!currentOrg) return;
    setLoadingMembers(true);
    try {
      const { data: membershipData, error: memErr } = await supabase
        .from('memberships')
        .select('*')
        .eq('orgId', currentOrg.id);

      if (memErr) throw memErr;
      const membershipList = (membershipData || []) as Membership[];

      const membersWithProfiles = await Promise.all(
        membershipList.map(async (m) => {
          try {
            // 1. If it's the current user, fall back to active authUser profile for maximum reliability
            if (authUser && m.userId === authUser.uid) {
              const email = authUser.email || 'No Email';
              let displayName = authUser.displayName || '';
              if (!displayName || displayName === 'User' || displayName === 'Unknown Staff') {
                displayName = getFallbackName(email, 'Owner');
              }
              return {
                ...m,
                displayName,
                email,
                photoURL: authUser.photoURL,
              };
            }

            // 2. Otherwise query Supabase users collection
            const { data: userData } = await supabase
              .from('users')
              .select('*')
              .eq('uid', m.userId)
              .maybeSingle();

            const profile = userData as User | null;
            const email = profile?.email || 'No Email';
            let displayName = profile?.displayName || '';
            if (!displayName || displayName === 'User' || displayName === 'Unknown Staff') {
              displayName = getFallbackName(email, 'Team Member');
            }

            return {
              ...m,
              displayName,
              email,
              photoURL: profile?.photoURL,
            };
          } catch (err) {
            console.error(`Failed to fetch profile for user ${m.userId}`, err);
            return {
              ...m,
              displayName: 'Unknown Staff',
              email: 'No Email',
            };
          }
        })
      );
      setMembers(membersWithProfiles);

      // Fetch pending invitations
      const { data: invData } = await supabase
        .from('invitations')
        .select('*')
        .eq('orgId', currentOrg.id);

      const invList = (invData || []).map((d: any) => ({
        id: d.id,
        email: d.email as string,
        role: (d.role || 'sales') as Role,
        invitedAt: d.createdAt || Date.now(),
      }));
      setPendingInvites(invList);
    } catch (err) {
      console.error('Error fetching members:', err);
      notifyError('Failed to load team members');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleCancelInvite = async (inviteId: string, _email?: string) => {
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', inviteId);

      if (error) throw error;
      success('Invitation cancelled successfully');
      fetchMembers();
    } catch (err) {
      console.error('Error cancelling invitation:', err);
      notifyError('Failed to cancel invitation');
    }
  };

  useEffect(() => {
    if (activeTab === 'staff' && currentOrg) {
      fetchMembers();
    }
  }, [activeTab, currentOrg]);

  const handleToggle = (module: keyof OrganizationSettings['modules']) => {
    if (!settings) return;
    setSettings({
      ...settings,
      modules: {
        ...settings.modules,
        [module]: !settings.modules[module]
      }
    });
  };

  const saveSettings = async () => {
    if (!currentOrg || !settings) return;
    setSaving(true);
    try {
      await updateCurrentOrgSettings(settings);
      success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      notifyError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateBarcodeSettings = async (nextValues: Pick<OrganizationSettings, 'enableBarcode' | 'barcodeFormat'>) => {
    if (!currentOrg || !settings) return;

    const nextSettings = {
      ...settings,
      ...nextValues,
    };

    setSettings(nextSettings);
    setBarcodeSaving(true);

    try {
      await updateCurrentOrgSettings(nextValues);
      success(nextValues.enableBarcode ? 'Barcode tools enabled' : 'Barcode tools disabled');
    } catch (error) {
      console.error('Error updating barcode settings:', error);
      setSettings(settings);
      notifyError('Failed to update barcode settings');
    } finally {
      setBarcodeSaving(false);
    }
  };

  // Add Staff Member handler
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim()) {
      notifyError("Please enter the employee's name");
      return;
    }
    if (!inviteEmail.trim()) {
      notifyError('Please enter a valid email address');
      return;
    }
    if (!currentOrg) return;

    const targetEmail = inviteEmail.trim().toLowerCase();
    const targetName = inviteName.trim();

    // Check if already a member
    const alreadyMember = members.some(m => m.email.trim().toLowerCase() === targetEmail);
    if (alreadyMember) {
      notifyError('This user is already a member of this organization!');
      return;
    }

    setInviting(true);
    try {
      const { data: userRecords } = await supabase
        .from('users')
        .select('*')
        .eq('email', targetEmail);

      let targetUserId: string;

      if (!userRecords || userRecords.length === 0) {
        targetUserId = generateId();
        await supabase.from('users').insert({
          uid: targetUserId,
          email: targetEmail,
          displayName: targetName,
          photoURL: null,
          createdAt: Date.now(),
        });
      } else {
        targetUserId = userRecords[0].uid;
      }

      const membershipId = `${targetUserId}_${currentOrg.id}`;
      const newMembership: Membership = {
        id: membershipId,
        orgId: currentOrg.id,
        userId: targetUserId,
        role: 'employee',
        joinedAt: Date.now(),
        allowedModules: inviteAllowedModules,
      };

      await supabase.from('memberships').upsert(newMembership);
      success(`Successfully added ${targetName} to your team!`);
      setInviteName('');
      setInviteEmail('');
      setInviteAllowedModules({});
      fetchMembers();
    } catch (err: any) {
      console.error('Error adding staff member:', err);
      notifyError(err?.message || 'Failed to add staff member');
    } finally {
      setInviting(false);
    }
  };

  // Remove staff member handler
  const handleRemoveMember = async (membershipId: string, memberUserId: string) => {
    if (memberUserId === currentOrg?.ownerId) {
      notifyError('Cannot remove the organization owner!');
      return;
    }
    if (memberUserId === authUser?.uid) {
      notifyError('Cannot remove yourself!');
      return;
    }

    try {
      const { error } = await supabase
        .from('memberships')
        .delete()
        .eq('id', membershipId);

      if (error) throw error;
      success('Staff member removed successfully');
      fetchMembers();
    } catch (err) {
      console.error('Error removing member:', err);
      notifyError('Failed to remove staff member');
    }
  };

  const filteredModules = useMemo(() => {
    if (!settings) return [];
    return Object.entries(settings.modules).filter(([key]) =>
      prettify(key).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [settings, searchTerm]);

  if (!settings) return <div className="p-8 text-center">Loading settings...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Settings</h2>
          <p className="text-zinc-500 font-serif italic">Configure workspace defaults, security, and staff memberships.</p>
        </div>
        {activeTab === 'general' && (
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all disabled:opacity-50"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        )}
      </header>

      {/* Tabs Menu */}
      <div className="flex gap-2 rounded-2xl bg-zinc-100 p-1.5 overflow-x-auto shadow-sm border border-zinc-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all ${activeTab === 'general' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
        >
          <Coins className="w-4 h-4" />
          General Defaults
        </button>
        <button
          onClick={() => setActiveTab('modules')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all ${activeTab === 'modules' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
        >
          <Layout className="w-4 h-4" />
          Feature Modules
        </button>
        <button
          onClick={() => setActiveTab('staff')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all ${activeTab === 'staff' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
        >
          <Users className="w-4 h-4" />
          Staff Management
        </button>
      </div>

      {/* Tab Contents */}
      <div className="space-y-8">
        {activeTab === 'general' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Store & Company Settings Card */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl text-orange-600">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 text-lg">Store & Company Settings</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenStoreModal}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200/80 text-sm font-bold rounded-xl transition-all shadow-sm shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-1 space-y-2">
                <h3 className="font-bold text-zinc-900 text-lg">Business Defaults</h3>
                <p className="text-sm text-zinc-500">Choose currency, tax rules, locations and product identifier defaults used across all pages.</p>
              </div>

              <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Default Currency</label>
                  <AppSelect
                    value={settings.currency}
                    onChange={(value) => setSettings({ ...settings, currency: value })}
                    placeholder="Select Currency"
                    searchable
                    options={CURRENCY_OPTIONS.map((currency) => ({
                      value: currency.code,
                      label: `${currency.code} - ${currency.label}`,
                      keywords: currency.label,
                    }))}
                    buttonClassName="py-3"
                  />
                  <p className="mt-2 text-xs text-zinc-500">This becomes the default currency shown throughout the app.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, taxEnabled: !settings.taxEnabled })}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 p-4 text-left cursor-pointer hover:border-zinc-300 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-sm font-bold text-zinc-900">Enable Tax</p>
                      <p className="text-xs text-zinc-500">Use organization-wide tax in sales.</p>
                    </div>
                    <div className={`mt-0.5 h-6 w-10 shrink-0 rounded-full p-1 transition-colors ${settings.taxEnabled ? 'bg-orange-500' : 'bg-zinc-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.taxEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, multiLocationEnabled: !settings.multiLocationEnabled })}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 p-4 text-left cursor-pointer hover:border-zinc-300 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-sm font-bold text-zinc-900">Multiple Locations</p>
                      <p className="text-xs text-zinc-500">Show warehouse and destination selectors across inventory flows.</p>
                    </div>
                    <div className={`mt-0.5 h-6 w-10 shrink-0 rounded-full p-1 transition-colors ${settings.multiLocationEnabled ? 'bg-orange-500' : 'bg-zinc-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.multiLocationEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateBarcodeSettings({
                        enableBarcode: !settings.enableBarcode,
                        barcodeFormat: settings.barcodeFormat || 'code128',
                      })
                    }
                    className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 p-4 text-left cursor-pointer hover:border-zinc-300 transition-colors sm:col-span-2"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-sm font-bold text-zinc-900">Enable Product SKU / Barcode</p>
                      <p className="text-xs text-zinc-500">
                        Auto-generate barcodes for new items, show barcode UI in inventory, and enable scan-and-sell tools in sales.
                        {barcodeSaving ? ' Saving...' : ''}
                      </p>
                    </div>
                    <div className={`mt-0.5 h-6 w-10 shrink-0 rounded-full p-1 transition-colors ${settings.enableBarcode ? 'bg-orange-500' : 'bg-zinc-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.enableBarcode ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>

                  {settings.enableBarcode && (
                    <div className="rounded-2xl border border-zinc-200 p-4 sm:col-span-2">
                      <p className="text-sm font-bold text-zinc-900 mb-2">Barcode Format</p>
                      <div className="flex gap-2 rounded-xl bg-zinc-100 p-1">
                        <button
                          type="button"
                          onClick={() => updateBarcodeSettings({ enableBarcode: settings.enableBarcode, barcodeFormat: 'code128' })}
                          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                            (!settings.barcodeFormat || settings.barcodeFormat === 'code128')
                              ? 'bg-white text-zinc-900 shadow-sm'
                              : 'text-zinc-500'
                          }`}
                        >
                          Code 128
                        </button>
                        <button
                          type="button"
                          onClick={() => updateBarcodeSettings({ enableBarcode: settings.enableBarcode, barcodeFormat: 'qrcode' })}
                          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                            settings.barcodeFormat === 'qrcode'
                              ? 'bg-white text-zinc-900 shadow-sm'
                              : 'text-zinc-500'
                          }`}
                        >
                          QR Code
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">Choose the internal generated barcode format.</p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <label className="block text-sm font-bold text-zinc-900 mb-2">Tax Rate (%)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formatNumericInput(settings.taxRate)}
                      onChange={(e) => setSettings({ ...settings, taxRate: parseNumericInput(e.target.value) ?? 0 })}
                      placeholder="0"
                      disabled={!settings.taxEnabled}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                    />
                    <p className="mt-2 text-xs text-zinc-500">{settings.taxEnabled ? 'Applied to sales calculations.' : 'Enable tax to edit this rate.'}</p>
                  </div>


                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <p className="text-sm font-bold text-zinc-900 mb-2">Data Layout</p>
                    <div className="flex gap-2 rounded-xl bg-zinc-100 p-1">
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, tableDisplayMode: 'table' })}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                          settings.tableDisplayMode === 'table'
                            ? 'bg-white text-zinc-900 shadow-sm'
                            : 'text-zinc-500'
                        }`}
                      >
                        Table
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, tableDisplayMode: 'cards' })}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                          settings.tableDisplayMode === 'cards'
                            ? 'bg-white text-zinc-900 shadow-sm'
                            : 'text-zinc-500'
                        }`}
                      >
                        Cards
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">Choose default view mode across tables.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'modules' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search modules..."
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-1 space-y-2">
                <h3 className="font-bold text-zinc-900 text-lg">Feature Modules</h3>
                <p className="text-sm text-zinc-500">Enable or disable modules to clean up sidebars and fit your workflows.</p>
              </div>

              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredModules.length === 0 ? (
                  <div className="sm:col-span-2 rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">
                    No modules matched your search.
                  </div>
                ) : (
                  filteredModules.map(([key, enabled]) => (
                    <button
                      key={key}
                      onClick={() => handleToggle(key as keyof OrganizationSettings['modules'])}
                      className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
                        enabled
                          ? 'bg-white border-orange-200 shadow-sm'
                          : 'bg-zinc-50 border-zinc-200 opacity-60'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold text-zinc-900 capitalize">{prettify(key)}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">{enabled ? 'Active' : 'Disabled'}</p>
                      </div>
                      <div className={`w-10 h-6 rounded-full p-1 transition-colors ${enabled ? 'bg-orange-500' : 'bg-zinc-300'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {!currentOrg?.settings?.modules?.staffManagement && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 text-sm text-orange-800 flex flex-col gap-2">
                <p className="font-bold">Staff Management Module is Disabled</p>
                <p className="text-xs text-orange-700">Go to the **Feature Modules** tab and enable "Staff Management" to fully utilize multi-user permissions.</p>
                <button
                  onClick={async () => {
                    if (settings) {
                      const updatedModules = { ...settings.modules, staffManagement: true };
                      setSettings({
                        ...settings,
                        modules: updatedModules
                      });
                      try {
                        await updateCurrentOrgSettings({ modules: updatedModules });
                        success('Staff Management module enabled successfully!');
                      } catch (err) {
                        console.error('Failed to enable module:', err);
                        notifyError('Failed to enable Staff Management module');
                      }
                    }
                  }}
                  className="w-fit mt-2 px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold hover:bg-orange-700 transition-colors"
                >
                  Enable Module
                </button>
              </div>
            )}

            {currentOrg?.settings?.modules?.staffManagement && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Invite Staff Section */}
                <div className="md:col-span-1 space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-bold text-zinc-900 text-lg">Add Team Member</h3>
                    <p className="text-sm text-zinc-500">
                      Register new staff directly with their name, email, and a temporary password, or add existing users instantly to your business workspace.
                    </p>
                  </div>

                  {isOwner ? (
                    <form onSubmit={handleAddMember} className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Employee Name</label>
                        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <UserIcon className="h-4 w-4 text-zinc-400" />
                          <input
                            type="text"
                            value={inviteName}
                            onChange={(e) => setInviteName(e.target.value)}
                            placeholder="John Doe"
                            required
                            className="w-full bg-transparent text-sm text-zinc-900 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Employee Email</label>
                        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <Mail className="h-4 w-4 text-zinc-400" />
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="employee@domain.com"
                            required
                            className="w-full bg-transparent text-sm text-zinc-900 outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Module Access Permissions</label>
                        <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto p-1 border border-zinc-100 rounded-xl">
                          {enabledOrgModules.map((modKey) => {
                            const isSelected = inviteAllowedModules[modKey] || false;
                            return (
                              <button
                                key={modKey}
                                type="button"
                                onClick={() => setInviteAllowedModules(prev => ({ ...prev, [modKey]: !prev[modKey] }))}
                                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                                  isSelected
                                    ? 'bg-orange-50 border-orange-500 text-orange-950 shadow-sm'
                                    : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300'
                                }`}
                              >
                                <span className="text-xs font-bold">{MODULE_LABELS[modKey] || prettify(modKey)}</span>
                                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                                  isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-300 bg-white'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })}
                          {enabledOrgModules.length === 0 && (
                            <div className="text-center text-xs text-zinc-400 py-4">
                              No modules are enabled for this organization.
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={inviting}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all disabled:opacity-50"
                      >
                        <UserPlus className="w-4 h-4" />
                        {inviting ? 'Registering Staff...' : 'Create Account & Add'}
                      </button>
                    </form>
                  ) : (
                    <div className="bg-zinc-100 border border-zinc-200 rounded-2xl p-4 text-sm text-zinc-500 text-center">
                      Only the organization owner can invite and manage staff members.
                    </div>
                  )}
                </div>

                {/* Team Members List */}
                <div className="md:col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-zinc-900 text-lg">Team Members</h3>
                    <button onClick={fetchMembers} className="text-xs text-zinc-500 hover:text-zinc-800 underline font-semibold">Refresh</button>
                  </div>

                  {loadingMembers ? (
                    <div className="p-12 text-center text-zinc-500 bg-white border border-zinc-200 rounded-2xl shadow-sm">
                      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      Loading team...
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Pending Invitations Section */}
                      {pendingInvites.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="font-bold text-xs text-zinc-400 uppercase tracking-wider">Pending Invitations ({pendingInvites.length})</h4>
                          <div className="space-y-2">
                            {pendingInvites.map((invite) => (
                              <div key={invite.id} className="bg-orange-50/40 border border-orange-100 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full border border-orange-200 bg-orange-100/50 flex items-center justify-center font-bold text-orange-600 text-sm">
                                    @
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
                                      {invite.email}
                                      <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">Pending</span>
                                    </p>
                                    <p className="text-xs text-zinc-500 capitalize">Assigned Role: {invite.role}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                  {isOwner && (
                                    <button
                                      onClick={() => setInviteToDelete({ id: invite.id, email: invite.email })}
                                      className="px-3 py-1.5 text-xs font-bold border border-red-200 hover:border-red-300 hover:bg-red-50 text-red-600 rounded-xl transition-all shadow-sm"
                                    >
                                      Cancel Invite
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Active Members Section */}
                      <div className="space-y-3">
                        <h4 className="font-bold text-xs text-zinc-400 uppercase tracking-wider">Active Team ({members.length})</h4>
                        {members.length === 0 ? (
                          <div className="p-12 text-center text-zinc-500 bg-white border border-zinc-200 rounded-2xl shadow-sm border-dashed">
                            No active staff members registered.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {members.map((member) => {
                              const isSelf = member.userId === authUser?.uid;
                              const isMemberOwner = member.userId === currentOrg.ownerId;
                              const isEditing = editingMemberId === member.id;
                              return (
                                <div key={member.id} className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm flex flex-col gap-4 animate-in fade-in duration-250">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                      <img
                                        src={member.photoURL || `https://ui-avatars.com/api/?name=${member.displayName}`}
                                        className="w-10 h-10 rounded-full border border-zinc-100 shadow-sm"
                                        alt={member.displayName}
                                      />
                                      <div>
                                        <p className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
                                          {member.displayName}
                                          {isSelf && <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold">You</span>}
                                          {isMemberOwner && <span className="text-[9px] bg-zinc-900 text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Owner</span>}
                                        </p>
                                        <p className="text-xs text-zinc-500">{member.email}</p>
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                          {enabledOrgModules.filter(modKey => member.allowedModules?.[modKey]).length > 0 ? (
                                            enabledOrgModules.filter(modKey => member.allowedModules?.[modKey]).map(modKey => (
                                              <span key={modKey} className="inline-flex items-center text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-100 rounded-lg px-2 py-0.5">
                                                {MODULE_LABELS[modKey] || prettify(modKey)}
                                              </span>
                                            ))
                                          ) : (
                                            !isMemberOwner && (
                                              <span className="text-[10px] text-zinc-400 font-medium italic">
                                                No module permissions assigned
                                              </span>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                      {isOwner && !isMemberOwner && !isSelf ? (
                                        <>
                                          <button
                                            onClick={() => {
                                              if (isEditing) {
                                                setEditingMemberId(null);
                                              } else {
                                                setEditingMemberId(member.id);
                                                setEditAllowedModules(member.allowedModules || {});
                                              }
                                            }}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border shadow-sm ${
                                              isEditing
                                                ? 'bg-zinc-800 border-zinc-800 text-white hover:bg-zinc-900'
                                                : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                                            }`}
                                          >
                                            {isEditing ? 'Cancel' : 'Edit Permissions'}
                                          </button>
                                          <button
                                            onClick={() => {
                                              if (member.userId === currentOrg?.ownerId) {
                                                notifyError('Cannot remove the organization owner!');
                                                return;
                                              }
                                              if (member.userId === authUser?.uid) {
                                                notifyError('Cannot remove yourself!');
                                                return;
                                              }
                                              setMemberToRemove({ id: member.id, userId: member.userId, displayName: member.displayName });
                                            }}
                                            className="p-2 border border-red-200 hover:border-red-300 hover:bg-red-50 text-red-600 rounded-xl transition-colors shadow-sm"
                                            title="Remove Staff Member"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </>
                                      ) : (
                                        <span className="text-xs font-bold capitalize bg-zinc-100 text-zinc-600 px-3 py-1.5 rounded-xl">
                                          {isMemberOwner ? 'Owner' : 'Employee'}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {isEditing && (
                                    <div className="pt-4 border-t border-zinc-100 animate-in slide-in-from-top-4 duration-250 space-y-4">
                                      <div>
                                        <p className="text-xs font-bold text-zinc-900">Edit Module Access Permissions</p>
                                        <p className="text-[10px] text-zinc-500">Configure exactly which modules {member.displayName} can access.</p>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {enabledOrgModules.map((modKey) => {
                                          const isSelected = editAllowedModules[modKey] || false;
                                          return (
                                            <button
                                              key={modKey}
                                              type="button"
                                              onClick={() => setEditAllowedModules(prev => ({ ...prev, [modKey]: !prev[modKey] }))}
                                              className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                                                isSelected
                                                  ? 'bg-orange-50 border-orange-500 text-orange-950 shadow-sm'
                                                  : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300'
                                              }`}
                                            >
                                              <span className="text-xs font-bold">{MODULE_LABELS[modKey] || prettify(modKey)}</span>
                                              <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                                                isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-300 bg-white'
                                              }`}>
                                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                      <div className="flex gap-2 justify-end">
                                        <button
                                          onClick={() => setEditingMemberId(null)}
                                          className="px-4 py-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-xl text-xs font-bold transition-all"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handleUpdateModules(member.id, editAllowedModules)}
                                          className="px-4 py-2 bg-orange-500 text-white hover:bg-orange-600 rounded-xl text-xs font-bold shadow-lg shadow-orange-100 transition-all"
                                        >
                                          Save Permissions
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Store & Company Settings Popup Modal */}
      {isStoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl text-orange-600">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 text-lg">Edit Store & Company Settings</h3>
                  <p className="text-xs text-zinc-500">Update seller profile details used dynamically on invoices & PDFs.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStoreModalOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveStoreModal} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                      Store Name
                    </label>
                    <input
                      type="text"
                      value={modalForm.storeName}
                      onChange={(e) => setModalForm({ ...modalForm, storeName: e.target.value })}
                      placeholder="e.g. Purit Network"
                      className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                      Tagline
                    </label>
                    <input
                      type="text"
                      value={modalForm.tagline}
                      onChange={(e) => setModalForm({ ...modalForm, tagline: e.target.value })}
                      placeholder="e.g. smart inventory management"
                      className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                    Address
                  </label>
                  <textarea
                    rows={2}
                    value={modalForm.address}
                    onChange={(e) => setModalForm({ ...modalForm, address: e.target.value })}
                    placeholder="e.g. Main Warehouse, Kozhikode, Kerala - 673631"
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all resize-y"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={modalForm.phone}
                      onChange={(e) => setModalForm({ ...modalForm, phone: e.target.value })}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={modalForm.email}
                      onChange={(e) => setModalForm({ ...modalForm, email: e.target.value })}
                      placeholder="e.g. support@purit.com"
                      className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                      GSTIN
                    </label>
                    <input
                      type="text"
                      value={modalForm.gstin}
                      onChange={(e) => setModalForm({ ...modalForm, gstin: e.target.value })}
                      placeholder="e.g. 32ABCDE1234F1Z5"
                      className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                      Starting Invoice Number
                    </label>
                    <input
                      type="text"
                      value={modalForm.lastGstInvoiceNumber}
                      onChange={(e) => setModalForm({ ...modalForm, lastGstInvoiceNumber: e.target.value })}
                      placeholder="e.g. INV-0105 or 1001"
                      className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all font-mono"
                    />
                    <p className="mt-1 text-xs text-zinc-400">Sequence increments automatically for new invoices.</p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-50 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsStoreModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:text-zinc-900 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SuperDeleteConfirmModal
        isOpen={!!inviteToDelete}
        onClose={() => setInviteToDelete(null)}
        onConfirm={async () => {
          if (inviteToDelete) {
            await handleCancelInvite(inviteToDelete.id, inviteToDelete.email);
            setInviteToDelete(null);
          }
        }}
        title="Cancel Invitation?"
        message={`Are you sure you want to cancel the staff invitation for "${inviteToDelete?.email}"? This action cannot be undone.`}
      />

      <SuperDeleteConfirmModal
        isOpen={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onConfirm={async () => {
          if (memberToRemove) {
            await handleRemoveMember(memberToRemove.id, memberToRemove.userId);
            setMemberToRemove(null);
          }
        }}
        title="Remove Team Member?"
        message={`Are you sure you want to remove "${memberToRemove?.displayName}" from your organization? They will immediately lose access to all modules.`}
      />

      <div className="flex justify-end pt-4">
        <div className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-500 shadow-sm">
          App Version {APP_VERSION}
        </div>
      </div>
    </div>
  );
}
