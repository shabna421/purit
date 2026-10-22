import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, TenancyProvider, useTenancy } from './contexts';
import { RealtimeDataProvider } from './contexts/RealtimeDataContext';
import { NotificationProvider, useNotifications } from './notifications';
import { OrganizationSettings } from './types';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Building2,
  Truck,
  Settings,
  LogOut,
  Menu,
  X,
  History,
  Plus,
  FileText,
  RotateCcw,
  AlertTriangle,
  MoreHorizontal,
  Download,
  Wallet,
  Mail,
  Lock,
  User as UserIcon,
  Target,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppSelect } from './components/AppSelect';

import ItemsPage from './pages/ItemsPage';
import TransactionsPage from './pages/TransactionsPage';
import SettingsPage from './pages/SettingsPage';
import { CreatePurchasePage } from './pages/CreatePurchasePage';
import { CreateSalePage } from './pages/CreateSalePage';
import SalesPage from './pages/SalesPage';
import SalesTargetPage from './pages/SalesTargetPage';
import PurchasesPage from './pages/PurchasesPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailsPage from './pages/CustomerDetailsPage';
import SuppliersPage from './pages/SuppliersPage';
import SupplierDetailsPage from './pages/SupplierDetailsPage';
import { Dashboard } from './pages/Dashboard';
import { InvoicePage } from './pages/InvoicePage';
import { ReportsPage } from './pages/ReportsPage';
import { SalesReportPage } from './pages/SalesReportPage';
import TrucksPage from './pages/TrucksPage';
import TruckStockPage from './pages/TruckStockPage';
import ReturnsPage from './pages/ReturnsPage';
import DamagesPage from './pages/DamagesPage';
import ExpenseTrackerPage from './pages/ExpenseTrackerPage';
import BarcodePrintPage from './pages/BarcodePrintPage';
import { ProductInsightsPage } from './pages/ProductInsightsPage';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type NavEntry = {
  icon: React.ComponentType<any>;
  label: string;
  to: string;
  mobilePrimary?: boolean;
  mobileAccent?: boolean;
  requires?: 'inventory' | 'purchases' | 'sales' | 'truckInventory' | 'returns' | 'damages' | 'advancedReports' | 'expenseTracker';
};

const navEntries: NavEntry[] = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/', mobilePrimary: true },
  { icon: Package, label: 'Inventory', to: '/items', mobilePrimary: true, requires: 'inventory' },
  { icon: ShoppingCart, label: 'Sales', to: '/sales', mobilePrimary: true, mobileAccent: true, requires: 'sales' },
  { icon: Target, label: 'My Target', to: '/sales/target', requires: 'sales' },
  { icon: Users, label: 'Customers', to: '/customers', mobilePrimary: true },
  { icon: Building2, label: 'Suppliers', to: '/suppliers', requires: 'purchases' },
  { icon: Wallet, label: 'Expense Tracker', to: '/expenses', requires: 'expenseTracker' },
  { icon: Plus, label: 'Purchases', to: '/purchases', requires: 'purchases' },
  { icon: History, label: 'Transactions', to: '/transactions' },
  { icon: Truck, label: 'Trucks', to: '/trucks', requires: 'truckInventory' },
  { icon: RotateCcw, label: 'Returns', to: '/returns', requires: 'returns' },
  { icon: AlertTriangle, label: 'Damages', to: '/damages', requires: 'damages' },
  { icon: FileText, label: 'Sales Report', to: '/sales-report', mobilePrimary: true },
  { icon: BarChart3, label: 'Product Insights', to: '/product-insights' },
  { icon: FileText, label: 'Reports', to: '/reports', requires: 'advancedReports' },
  { icon: Settings, label: 'Settings', to: '/settings' },
];

function LoginScreen() {
  const { login, loginWithEmail, signupWithEmail, getSignInMethodsForEmailAddress, sendPasswordReset } = useAuth();
  const { error: notifyError, success } = useNotifications();
  const [mode, setMode] = React.useState<'signin' | 'signup' | 'forgot'>('signin');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [checkingMethods, setCheckingMethods] = React.useState(false);
  const [resettingPassword, setResettingPassword] = React.useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = React.useState('');
  const [detectedMethods, setDetectedMethods] = React.useState<string[] | null>(null);
  const [checkedEmail, setCheckedEmail] = React.useState('');

  const normalizedEmail = email.trim().toLowerCase();
  const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  const detectSignInMethods = React.useCallback(async (targetEmail: string) => {
    const normalizedTarget = targetEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedTarget)) {
      setDetectedMethods(null);
      setCheckedEmail('');
      return [];
    }

    setCheckingMethods(true);
    try {
      const methods = await getSignInMethodsForEmailAddress(normalizedTarget);
      setDetectedMethods(methods);
      setCheckedEmail(normalizedTarget);
      return methods;
    } catch (error) {
      console.error('Failed to detect sign-in methods:', error);
      setDetectedMethods(null);
      setCheckedEmail(normalizedTarget);
      return [];
    } finally {
      setCheckingMethods(false);
    }
  }, [getSignInMethodsForEmailAddress]);

  React.useEffect(() => {
    if (!hasValidEmail) {
      setDetectedMethods(null);
      setCheckedEmail('');
      setCheckingMethods(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void detectSignInMethods(normalizedEmail);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [detectSignInMethods, hasValidEmail, normalizedEmail]);

  const resolvedMethods = checkedEmail === normalizedEmail ? (detectedMethods || []) : [];
  const hasGoogleMethod = resolvedMethods.includes('google.com');
  const hasPasswordMethod = resolvedMethods.includes('password');
  const isGoogleOnlyAccount = hasGoogleMethod && !hasPasswordMethod;
  const isExistingAccount = resolvedMethods.length > 0;

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      notifyError('Email and password are required');
      return;
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        notifyError('Full name is required for sign up');
        return;
      }

      if (password.length < 6) {
        notifyError('Password must be at least 6 characters');
        return;
      }

      if (password !== confirmPassword) {
        notifyError('Passwords do not match');
        return;
      }
    }

    setSubmitting(true);
    try {
      const methods = hasValidEmail ? await detectSignInMethods(normalizedEmail) : [];

      if (mode === 'signup') {
        if (methods.length > 0 && methods.includes('password')) {
          throw new Error('An account with this email already exists. Sign in instead, or click "Forgot Password" to reset it.');
        }
        await signupWithEmail(name, email, password);
        success('Account created successfully');
      } else {
        await loginWithEmail(email, password);
      }
    } catch (error: any) {
      console.error('Email auth failed:', error);
      notifyError(error?.message || `Failed to ${mode === 'signup' ? 'sign up' : 'sign in'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setSubmitting(true);
    try {
      await login();
    } catch (error: any) {
      console.error('Google auth failed:', error);
      notifyError(error?.message || 'Failed to continue with Google');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();

    if (!normalizedEmail || !hasValidEmail) {
      notifyError('Please enter a valid email address.');
      return;
    }

    setResettingPassword(true);
    setResetSuccessMessage('');
    try {
      await sendPasswordReset(normalizedEmail);
      setResetSuccessMessage(
        `Password reset link sent to ${normalizedEmail}. Check your inbox (and spam folder), click the link to set your password, then return here to sign in.`
      );
      success('Password reset email sent successfully!');
    } catch (error: any) {
      console.error('Password reset failed:', error);
      notifyError(error?.message || 'Failed to send password reset email.');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4 font-sans">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-sm border border-zinc-200">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200">
            <Package className="text-white w-10 h-10" />
          </div>
        </div>
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-zinc-900">Stockii</h2>
          <p className="mt-2 text-sm text-zinc-600 italic font-serif">Brutally practical distribution management.</p>
        </div>

        {mode !== 'forgot' ? (
          <>
            <div className="flex rounded-2xl bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => { setMode('signin'); setResetSuccessMessage(''); }}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${mode === 'signin' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setResetSuccessMessage(''); }}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${mode === 'signup' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              {mode === 'signup' && (
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Full Name</span>
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <UserIcon className="h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-transparent text-sm text-zinc-900 outline-none"
                    />
                  </div>
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Email</span>
                <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <Mail className="h-4 w-4 text-zinc-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full bg-transparent text-sm text-zinc-900 outline-none"
                  />
                </div>
              </label>

              {hasValidEmail && (checkingMethods || resolvedMethods.length > 0) && (
                <div className={`rounded-2xl border px-4 py-3 text-xs ${isGoogleOnlyAccount ? 'border-blue-200 bg-blue-50 text-blue-800' : isExistingAccount ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}>
                  {checkingMethods ? (
                    <span>Checking account status...</span>
                  ) : mode === 'signin' ? (
                    isGoogleOnlyAccount ? (
                      <div className="flex gap-2 items-start">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>This email originally signed up with Google. You can sign in with Google below or click <strong>Forgot Password</strong> to set an email password.</span>
                      </div>
                    ) : hasGoogleMethod && hasPasswordMethod ? (
                      <span>This email can sign in with either Google or email + password.</span>
                    ) : hasPasswordMethod ? (
                      <span>Account found. Enter your password to sign in.</span>
                    ) : null
                  ) : isExistingAccount ? (
                    <div className="flex gap-2 items-start">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>An account with this email already exists. Switch to <strong>Sign In</strong> to log in.</span>
                    </div>
                  ) : null}
                </div>
              )}

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Password</span>
                <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <Lock className="h-4 w-4 text-zinc-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Create a password' : 'Enter your password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="w-full bg-transparent text-sm text-zinc-900 outline-none"
                  />
                </div>
              </label>

              {mode === 'signup' && (
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Confirm Password</span>
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <Lock className="h-4 w-4 text-zinc-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      autoComplete="new-password"
                      className="w-full bg-transparent text-sm text-zinc-900 outline-none"
                    />
                  </div>
                </label>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 disabled:opacity-50"
              >
                {submitting ? (mode === 'signup' ? 'Creating account...' : 'Signing in...') : (mode === 'signup' ? 'Create Account' : 'Sign In with Email')}
              </button>

              {mode === 'signin' && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setResetSuccessMessage(''); }}
                    className="text-xs font-semibold text-orange-600 transition hover:text-orange-700"
                  >
                    Forgot Password / Reset
                  </button>
                </div>
              )}
            </form>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-200" />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">or</span>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={submitting}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-700 transition-all hover:bg-zinc-50 disabled:opacity-50"
              >
                Continue with Google
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4 animate-in fade-in duration-200">
            <div className="border-b border-zinc-100 pb-3">
              <h3 className="text-lg font-bold text-zinc-900">Reset Password</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Enter your registered email address below. We'll send you a password reset link to your email.
              </p>
            </div>

            {resetSuccessMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 space-y-2">
                <p className="font-bold flex items-center gap-1.5 text-sm">
                  <span>✉️</span> Reset Link Sent!
                </p>
                <p>{resetSuccessMessage}</p>
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Registered Email</span>
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <Mail className="h-4 w-4 text-zinc-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      className="w-full bg-transparent text-sm text-zinc-900 outline-none"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 disabled:opacity-50"
                >
                  {resettingPassword ? 'Sending Reset Email...' : 'Send Password Reset Email'}
                </button>

                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-bold text-zinc-600 transition-all hover:bg-zinc-100"
                >
                  Back to Sign In
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function NavItem({ icon: Icon, label, to, active }: { key?: React.Key; icon: any; label: string; to: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        active
          ? 'bg-orange-500 text-white shadow-lg shadow-orange-200'
          : 'text-zinc-600 hover:bg-zinc-100'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </Link>
  );
}

function MobileFooterNav({
  entries,
  activePath,
  onMore,
}: {
  entries: NavEntry[];
  activePath: string;
  onMore: () => void;
}) {
  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur supports-[padding:max(0px)]:pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="grid grid-cols-5 gap-1 px-2 py-2">
        {entries.map((entry) => {
          const Icon = entry.icon;
          const active = activePath === entry.to || activePath.startsWith(`${entry.to}/`);
          const accent = entry.mobileAccent;
          return (
            <Link
              key={entry.to}
              to={entry.to}
              className={`flex flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium transition-all ${
                accent
                  ? active
                    ? '-translate-y-4 rounded-3xl bg-orange-500 text-white shadow-lg shadow-orange-200'
                    : '-translate-y-4 rounded-3xl bg-white text-orange-600 shadow-md ring-1 ring-orange-200'
                  : active
                    ? 'rounded-2xl bg-orange-500 text-white shadow-md shadow-orange-100'
                    : 'rounded-2xl text-zinc-600'
              }`}
            >
              <Icon className={`${accent ? 'w-6 h-6' : 'w-5 h-5'}`} />
              <span>{entry.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-all ${
            activePath.startsWith('/transactions') ||
            activePath.startsWith('/customers') ||
            activePath.startsWith('/expenses') ||
            activePath.startsWith('/reports') ||
            activePath.startsWith('/product-insights') ||
            activePath.startsWith('/settings') ||
            activePath.startsWith('/trucks') ||
            activePath.startsWith('/returns') ||
            activePath.startsWith('/damages')
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>More</span>
        </button>
      </div>
    </div>
  );
}

function QuickSaleFab({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <Link
      to="/sales/new"
      className="md:hidden fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-xl shadow-orange-200 transition-all hover:bg-orange-600"
      aria-label="Create direct sale"
      title="Create direct sale"
    >
      <ShoppingCart className="h-6 w-6" />
    </Link>
  );
}

function MoreSheet({
  open,
  onClose,
  entries,
  activePath,
  onInstall,
  canInstall,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  entries: NavEntry[];
  activePath: string;
  onInstall: () => void;
  canInstall: boolean;
  onLogout: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="md:hidden fixed inset-0 z-50 bg-zinc-900/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="md:hidden fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white border-t border-zinc-200 px-5 pb-8 pt-4 shadow-2xl"
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-zinc-200" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">More Options</h3>
                <p className="text-sm text-zinc-500">Everything else you may need on the go.</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-zinc-100">
                <X className="h-5 w-5 text-zinc-500" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {entries.map((entry) => {
                const Icon = entry.icon;
                const active = activePath === entry.to || activePath.startsWith(`${entry.to}/`);
                return (
                  <Link
                    key={entry.to}
                    to={entry.to}
                    onClick={onClose}
                    className={`rounded-2xl border px-4 py-4 transition-all ${
                      active ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-zinc-200 bg-white text-zinc-700'
                    }`}
                  >
                    <Icon className="mb-2 h-5 w-5" />
                    <p className="text-sm font-semibold">{entry.label}</p>
                  </Link>
                );
              })}
              {canInstall && (
                <button
                  type="button"
                  onClick={() => {
                    onInstall();
                    onClose();
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-left text-zinc-700 transition-all"
                >
                  <Download className="mb-2 h-5 w-5" />
                  <p className="text-sm font-semibold">Install App</p>
                </button>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-left text-red-700 transition-all"
              >
                <LogOut className="mb-2 h-5 w-5" />
                <p className="text-sm font-semibold">Logout</p>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InstallPromptCard({
  visible,
  onInstall,
  onDismiss,
}: {
  visible: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="md:hidden fixed left-4 right-4 bottom-24 z-40 rounded-3xl border border-orange-200 bg-white p-4 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white">
              <Download className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-900">Install Stockii</p>
              <p className="text-sm text-zinc-600">Add it to your home screen for a smoother, app-like experience.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={onInstall} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white">
                  Install
                </button>
                <button onClick={onDismiss} className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700">
                  Later
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AppBootScreen({ message = 'Loading your workspace...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 shadow-lg shadow-orange-100">
          <Package className="h-8 w-8 text-white" />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-bold text-zinc-900">Opening Stockii</p>
          <p className="text-sm text-zinc-500">{message}</p>
        </div>
        <div className="h-8 w-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );
}

function PasswordRecoveryPrompt() {
  const { isGoogleOnlyUser, hasEmailProvider, setPasswordForCurrentUser, logout } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  if (!isGoogleOnlyUser || hasEmailProvider) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      notifyError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      notifyError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await setPasswordForCurrentUser(password);
      success('Password set successfully. You can now use email + password for this same account.');
      setPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Failed to link password:', error);
      notifyError(error?.message || 'Failed to set password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Set your password now</h3>
            <p className="mt-1 text-sm text-zinc-500">
              This account came in through Google. Add an email password now so you can always reopen the same workspace without depending on Google sign-in.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">New Password</span>
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <Lock className="h-4 w-4 text-zinc-400" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                className="w-full bg-transparent text-sm text-zinc-900 outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Confirm Password</span>
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <Lock className="h-4 w-4 text-zinc-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat your password"
                className="w-full bg-transparent text-sm text-zinc-900 outline-none"
              />
            </div>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={logout}
              className="flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50"
            >
              Sign Out
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Set Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { currentOrg, orgs, switchOrg, membership } = useTenancy();
  const { info } = useNotifications();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isMoreOpen, setIsMoreOpen] = React.useState(false);
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = React.useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const availableNavEntries = React.useMemo(() => {
    const isOwner = user?.uid === currentOrg?.ownerId;
    return navEntries.filter((entry) => {
      if (!entry.requires) return true;
      const orgEnabled = Boolean(currentOrg?.settings?.modules?.[entry.requires]);
      if (!orgEnabled) return false;
      if (isOwner) return true;
      return Boolean(membership?.allowedModules?.[entry.requires]);
    });
  }, [currentOrg, user, membership]);

  const mobilePrimaryEntries = availableNavEntries.filter((entry) => entry.mobilePrimary).slice(0, 4);
  const moreEntries = availableNavEntries.filter((entry) => !entry.mobilePrimary);
  const showQuickSaleFab = Boolean(currentOrg?.settings?.modules?.sales) && !location.pathname.startsWith('/sales/new');

  React.useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      setInstallPrompt(promptEvent);
      setShowInstallPrompt(true);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowInstallPrompt(false);
      info('Stockii installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [info]);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setShowInstallPrompt(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row font-sans">
      <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-zinc-200 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <Package className="text-white w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-zinc-900 block leading-none">Stockii</span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-400">bulk operations</span>
          </div>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-zinc-600">
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-zinc-200 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="h-full flex flex-col p-4">
          <div className="hidden md:flex items-center gap-3 mb-8 px-2">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-100">
              <Package className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-zinc-900 leading-none">Stockii</h1>
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">v1.0.0</span>
            </div>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto pr-1">
            {availableNavEntries.map((entry) => (
              <NavItem key={entry.to} icon={entry.icon} label={entry.label} to={entry.to} active={isActive(entry.to)} />
            ))}
          </div>

          <div className="pt-4 border-t border-zinc-100 pb-20 md:pb-0">
            <div className="flex items-center gap-3 px-2 mb-4">
              <img src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.displayName}`} className="w-8 h-8 rounded-full border border-zinc-200" alt="Avatar" referrerPolicy="no-referrer" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">{user?.displayName}</p>
                <AppSelect
                  value={currentOrg?.id || ''}
                  onChange={switchOrg}
                  options={
                    orgs.length > 0
                      ? orgs.map((org) => ({ value: org.id, label: org.name }))
                      : [{ value: '', label: 'No Org Selected' }]
                  }
                  placeholder="Select workspace"
                  buttonClassName="border-none bg-transparent px-0 py-0 text-xs text-zinc-500 shadow-none hover:text-zinc-700"
                  panelClassName="rounded-2xl"
                />
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-8 pb-28 md:pb-8">
          {children}
        </div>
      </main>

      <InstallPromptCard
        visible={showInstallPrompt && Boolean(installPrompt)}
        onInstall={handleInstall}
        onDismiss={() => setShowInstallPrompt(false)}
      />

      <QuickSaleFab visible={showQuickSaleFab} />
      <MobileFooterNav entries={mobilePrimaryEntries} activePath={location.pathname} onMore={() => setIsMoreOpen(true)} />
      <MoreSheet
        open={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        entries={moreEntries}
        activePath={location.pathname}
        onInstall={handleInstall}
        canInstall={Boolean(installPrompt)}
        onLogout={logout}
      />

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-zinc-900/20 backdrop-blur-sm z-30 md:hidden"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MainContent() {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { currentOrg, createOrganization, loading: tenancyLoading, membership, orgs } = useTenancy();
  const { error: notifyError } = useNotifications();
  const [orgName, setOrgName] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const modules = currentOrg?.settings?.modules;

  const isOwner = user?.uid === currentOrg?.ownerId;
  const isAllowed = (modKey: keyof OrganizationSettings['modules']) => {
    if (!modules?.[modKey]) return false;
    if (isOwner) return true;
    return Boolean(membership?.allowedModules?.[modKey]);
  };

  if (location.pathname === '/print/barcode') {
    return <BarcodePrintPage />;
  }

  if (authLoading) {
    return <AppBootScreen message="Checking your account..." />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  const shouldKeepBooting =
    tenancyLoading ||
    (orgs.length > 0 && !currentOrg) ||
    isCreating;

  if (shouldKeepBooting) {
    return <AppBootScreen message={isCreating ? 'Creating your workspace...' : 'Loading your workspace...'} />;
  }

  if (!currentOrg) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-zinc-200 text-center space-y-6">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
              <Package className="text-orange-500 w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">Welcome to Stockii</h2>
              <p className="text-sm text-zinc-500 mt-2">You haven't joined an organization yet. Create your workspace to get started.</p>
            </div>
            <div className="space-y-4">
              <div className="text-left">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Acme Distribution"
                  className="w-full mt-1 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                />
              </div>
              <button
                className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!orgName.trim() || isCreating}
                onClick={async () => {
                  setIsCreating(true);
                  try {
                    await createOrganization(orgName);
                  } catch (error: any) {
                    console.error(error);
                    notifyError(error?.message || 'Failed to create organization.');
                  } finally {
                    setIsCreating(false);
                  }
                }}
              >
                {isCreating ? 'Creating...' : 'Create Organization'}
              </button>
            </div>
            <div className="pt-4 border-t border-zinc-100">
              <button onClick={() => window.location.reload()} className="text-xs text-zinc-400 hover:text-zinc-600">Refresh Account</button>
            </div>
          </div>
        </div>
        <PasswordRecoveryPrompt />
      </>
    );
  }

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/items" element={isAllowed('inventory') ? <ItemsPage /> : <Navigate to="/" replace />} />
          <Route path="/purchases" element={isAllowed('purchases') ? <PurchasesPage /> : <Navigate to="/" replace />} />
          <Route path="/purchases/new" element={isAllowed('purchases') ? <CreatePurchasePage /> : <Navigate to="/" replace />} />
          <Route path="/sales" element={isAllowed('sales') ? <SalesPage /> : <Navigate to="/" replace />} />
          <Route path="/sales/target" element={isAllowed('sales') ? <SalesTargetPage /> : <Navigate to="/" replace />} />
          <Route path="/sales/new" element={isAllowed('sales') ? <CreateSalePage /> : <Navigate to="/" replace />} />
          <Route path="/sales/:id/invoice" element={<InvoicePage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailsPage />} />
          <Route path="/suppliers" element={isAllowed('purchases') ? <SuppliersPage /> : <Navigate to="/" replace />} />
          <Route path="/suppliers/:id" element={isAllowed('purchases') ? <SupplierDetailsPage /> : <Navigate to="/" replace />} />
          <Route path="/expenses" element={isAllowed('expenseTracker') ? <ExpenseTrackerPage /> : <Navigate to="/" replace />} />
          <Route path="/trucks" element={isAllowed('truckInventory') ? <TrucksPage /> : <Navigate to="/" replace />} />
          <Route path="/trucks/:id/stock" element={isAllowed('truckInventory') ? <TruckStockPage /> : <Navigate to="/" replace />} />
          <Route path="/returns" element={isAllowed('returns') ? <ReturnsPage /> : <Navigate to="/" replace />} />
          <Route path="/damages" element={isAllowed('damages') ? <DamagesPage /> : <Navigate to="/" replace />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/sales-report" element={<SalesReportPage />} />
          <Route path="/product-insights" element={<ProductInsightsPage />} />
          <Route path="/reports" element={isAllowed('advancedReports') ? <ReportsPage /> : <Navigate to="/" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/print/barcode" element={<BarcodePrintPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </AppShell>
      <PasswordRecoveryPrompt />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NotificationProvider>
        <AuthProvider>
          <TenancyProvider>
            <RealtimeDataProvider>
              <MainContent />
            </RealtimeDataProvider>
          </TenancyProvider>
        </AuthProvider>
      </NotificationProvider>
    </BrowserRouter>
  );
}
