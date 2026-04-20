"use client";
import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { safeBrowserSignOut } from '@/lib/auth/safe-browser-signout';
import { flushNotesDraftNow } from '@/lib/notes/flush-notes-draft';
import type { User } from '@supabase/supabase-js';
import styles from './settingsPage.module.css';
import CookiePreferencesSection from './CookiePreferencesSection';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';

const googleAnalyticsMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()

export default function AccountSection({ publicMarket }: { publicMarket?: 'GB' | 'US' }) {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteFinalConfirm, setShowDeleteFinalConfirm] = useState(false);
  const [showProfileChangeConfirm, setShowProfileChangeConfirm] = useState(false);
  const [profileChangeSummary, setProfileChangeSummary] = useState<string[]>([]);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [statusModal, setStatusModal] = useState<{ title: string; message: string } | null>(null);
  
  // User data
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [initialProfile, setInitialProfile] = useState({ firstName: '', lastName: '', email: '' });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Load user data from Supabase
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const loadUser = async (user: User | null) => {
      setLoading(true);

      if (!user) {
        setUserId(null);
        setFirstName('');
        setLastName('');
        setEmail('');
        setPendingEmail(null);
        setLoading(false);
        return;
      }

      setUserId(user.id);

      // Derive name from user metadata
      const meta = user.user_metadata || {};
      const displayName = (meta.full_name || meta.display_name || '').trim();
      let resolvedFirstName = '';
      let resolvedLastName = '';
      if (displayName) {
        const parts = displayName.split(' ');
        resolvedFirstName = parts[0] || '';
        resolvedLastName = parts.slice(1).join(' ') || '';
      } else {
        resolvedFirstName = meta.first_name || '';
        resolvedLastName = meta.last_name || '';
      }

      let resolvedEmail = user.email || '';
      if (user.email) {
        resolvedEmail = user.email;
      }

      // Fetch additional profile data from /api/user
      try {
        const res = await fetch('/api/user', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const fullName = (data.fullName || '').trim();
          if (fullName) {
            const parts = fullName.split(' ');
            resolvedFirstName = parts[0] || '';
            resolvedLastName = parts.slice(1).join(' ') || '';
          }
          if (data.email) {
            resolvedEmail = data.email;
          }
          setPendingEmail(typeof data.pendingEmail === 'string' && data.pendingEmail ? data.pendingEmail : null);
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
      } finally {
        setFirstName(resolvedFirstName);
        setLastName(resolvedLastName);
        setEmail(resolvedEmail);
        setInitialProfile({
          firstName: resolvedFirstName,
          lastName: resolvedLastName,
          email: resolvedEmail,
        });
        setLoading(false);
      }
    };

    // Initial load
    supabase.auth.getUser().then(({ data }) => loadUser(data.user));

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const authUserId = userId || (await supabase.auth.getUser()).data.user?.id || null;
      await flushNotesDraftNow(authUserId, { timeoutMs: 2500 });
      await safeBrowserSignOut(supabase);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('userId');
        localStorage.removeItem('currentConversationId');
        localStorage.removeItem('chatHistory');
        window.location.replace('/');
      }
    } catch (error) {
      console.error('Sign out error:', error);
      setStatusModal({ title: 'Sign out failed', message: 'Failed to sign out. Please try again.' });
      setSigningOut(false);
    }
  };

  const getProfileChangeSummary = (): string[] => {
    const changes: string[] = [];
    const nextFirst = firstName.trim();
    const nextLast = lastName.trim();
    const nextEmail = email.trim();
    if (nextFirst !== initialProfile.firstName.trim()) changes.push('First name');
    if (nextLast !== initialProfile.lastName.trim()) changes.push('Last name');
    if (nextEmail.toLowerCase() !== initialProfile.email.trim().toLowerCase()) changes.push('Email address');
    return changes;
  };

  const handleSaveChanges = async () => {
    if (!userId) {
      setStatusModal({ title: 'Update unavailable', message: 'You must be signed in to update your profile.' });
      return;
    }

    const changes = getProfileChangeSummary();
    if (changes.length === 0) {
      setStatusModal({ title: 'No changes', message: 'There are no account changes to save.' });
      return;
    }

    setProfileChangeSummary(changes);
    setShowProfileChangeConfirm(true);
  };

  const persistProfileChanges = async () => {
    setSaving(true);
    setShowProfileChangeConfirm(false);
    try {
      const fullName = `${firstName} ${lastName}`.trim();

      const response = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullName,
          email,
          redirect: getAppRouteForMarket('/settings?tab=account', publicMarket === 'US' ? 'US' : 'GB'),
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusModal({
          title: 'Save failed',
          message: payload?.error || 'Failed to save changes. Please try again.'
        });
        return;
      }

      const persistedEmail = typeof payload?.email === 'string' ? payload.email : email.trim();
      const nextPendingEmail =
        typeof payload?.pendingEmail === 'string' && payload.pendingEmail
          ? payload.pendingEmail
          : null;

      setPendingEmail(nextPendingEmail);
      setStatusModal({
        title: 'Changes saved',
        message: payload?.emailChangeRequested
          ? `We sent a verification link to ${nextPendingEmail || email.trim()}. Your sign-in email will stay ${persistedEmail} until you confirm the new address.`
          : 'Your profile changes were saved successfully.'
      });
      setEmail(persistedEmail);
      setInitialProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: persistedEmail,
      });
    } catch (error) {
      console.error('Unexpected error saving changes:', error);
      const message = error instanceof Error && error.message
        ? error.message
        : 'Failed to save changes. Please try again.'
      setStatusModal({ title: 'Save failed', message });
    } finally {
      setSaving(false);
    }
  };

  const mapPasswordError = (message: string): string => {
    const normalized = (message || '').toLowerCase();
    if (
      normalized.includes('leaked') ||
      normalized.includes('pwned') ||
      normalized.includes('compromised') ||
      normalized.includes('haveibeenpwned') ||
      (normalized.includes('password') && normalized.includes('breach'))
    ) {
      return 'This password appears in known data breaches. Choose a different one.';
    }
    return message || 'We could not update your password. Please try again.';
  };

  const handleUpdatePassword = async () => {
    if (!userId) {
      setStatusModal({ title: 'Update unavailable', message: 'You must be signed in to update your password.' });
      return;
    }

    if (newPassword.length < 8) {
      setStatusModal({ title: 'Weak password', message: 'Please choose a password that is at least 8 characters long.' });
      return;
    }

    if (!/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setStatusModal({ title: 'Weak password', message: 'Please include at least one number and one special character.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusModal({ title: 'Mismatch', message: 'Passwords do not match.' });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: newPassword }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update password');
      }

      setNewPassword('');
      setConfirmPassword('');
      setStatusModal({ title: 'Password updated', message: 'Your password was updated successfully.' });
    } catch (error: any) {
      const message = mapPasswordError(error?.message || '');
      setStatusModal({ title: 'Update failed', message });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setShowDeleteFinalConfirm(false);
    setDeleteAcknowledged(false);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (deletingAccount) return;
    setDeletingAccount(true);
    try {
      const response = await fetch('/api/user', {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to delete account');
      }

      const supabase = getSupabaseBrowserClient();
      const authUserId = userId || (await supabase.auth.getUser()).data.user?.id || null;
      await flushNotesDraftNow(authUserId, { timeoutMs: 2500 });
      await safeBrowserSignOut(supabase);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('userId');
        localStorage.removeItem('currentConversationId');
        localStorage.removeItem('chatHistory');
        window.location.replace('/');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      setStatusModal({ title: 'Delete failed', message: 'Failed to delete account. Please try again.' });
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
      setShowDeleteFinalConfirm(false);
      setDeleteAcknowledged(false);
    }
  };

  return (
    <div className={styles.sectionWrapper}>
      <section className={styles.settingsSection}>
        <h2 className={styles.sectionHeading}>Personal Information</h2>
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
            Loading user data...
          </div>
        ) : (
          <form className={styles.formGrid}>
            <div className={styles.gridRow2}>
              <div className={styles.formGroup}> 
                <label className={styles.formLabel}>First Name</label>
                <input 
                  className={styles.textInput} 
                  type="text" 
                  placeholder="Enter your first name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}> 
                <label className={styles.formLabel}>Last Name</label>
                <input 
                  className={styles.textInput} 
                  type="text" 
                  placeholder="Enter your last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.formGroup}> 
              <label className={styles.formLabel}>Email Address</label>
              <input 
                className={styles.textInput} 
                type="email" 
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {pendingEmail && (
                <p className={styles.helpText} style={{ marginTop: '8px', color: 'rgba(191, 219, 254, 0.92)' }}>
                  Pending verification: {pendingEmail}. Your current sign-in email stays {initialProfile.email} until you confirm the new address.
                </p>
              )}
            </div>
          </form>
        )}
      </section>
      <section className={styles.settingsSection}>
        <h2 className={styles.sectionHeading}>Security Settings</h2>
        <form className={styles.formGrid}>
          <div className={styles.formGroupFull}> 
            <label className={styles.formLabel}>New Password</label>
            <div className={styles.passwordContainer}>
              <input
                className={styles.textInput}
                type={showNewPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button type="button" className={styles.togglePassword} onClick={() => setShowNewPassword(s=>!s)}>
                {showNewPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className={styles.helpText}>At least 8 characters, include numbers & special characters.</p>
          </div>
          <div className={styles.formGroupFull}> 
            <label className={styles.formLabel}>Confirm New Password</label>
            <div className={styles.passwordContainer}>
              <input
                className={styles.textInput}
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button type="button" className={styles.togglePassword} onClick={() => setShowConfirmPassword(s=>!s)}>
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className={styles.actionsRow}>
            <button type="button" className={styles.primaryBtn} onClick={handleUpdatePassword} disabled={passwordSaving}>
              {passwordSaving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </section>
      <section className={styles.settingsSection}>
        <h2 className={styles.sectionHeading}>Active Sessions</h2>
        <div className={styles.sessionControls}>
          <button 
            className={styles.dangerOutlineBtn} 
            onClick={handleSignOut}
            disabled={signingOut}
            style={{ marginBottom: '8px' }}
          >
            {signingOut ? 'Signing Out...' : 'Sign Out'}
          </button>
          <p className={styles.helpText} style={{ marginTop: '8px' }}>Sign out from your current session.</p>
        </div>
      </section>
      <CookiePreferencesSection measurementId={googleAnalyticsMeasurementId} market={publicMarket} />
      <div className={styles.bottomActions}>
        <button 
          className={styles.primaryBtn}
          onClick={handleSaveChanges}
          disabled={saving || loading}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button className={styles.dangerBtn} onClick={handleDeleteAccount}>
          Delete Account
        </button>
      </div>
      {showProfileChangeConfirm && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Confirm account changes</h3>
            <p className={styles.modalBody}>
              Are you sure you want to change: {profileChangeSummary.join(', ')}?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setShowProfileChangeConfirm(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={persistProfileChanges}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Yes, save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Delete account?</h3>
            <p className={styles.modalBody}>
              Your account and data will be permanently removed.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setShowDeleteFinalConfirm(false);
                  setDeleteAcknowledged(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setShowDeleteFinalConfirm(true);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteFinalConfirm && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Are you sure, you wish to delete your account?</h3>
            <p className={styles.modalBody}>
              This action cannot be undone.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <input
                type="checkbox"
                checked={deleteAcknowledged}
                onChange={(e) => setDeleteAcknowledged(e.target.checked)}
              />
              <span style={{ color: 'rgba(226, 232, 240, 0.92)', fontSize: '0.92rem' }}>
                I understand this will permanently delete my account.
              </span>
            </label>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  setShowDeleteFinalConfirm(false);
                  setDeleteAcknowledged(false);
                }}
              >
                No
              </button>
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={handleConfirmDelete}
                disabled={deletingAccount || !deleteAcknowledged}
              >
                {deletingAccount ? 'Deleting...' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {statusModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>{statusModal.title}</h3>
            <p className={styles.modalBody}>{statusModal.message}</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.primaryBtn} onClick={() => setStatusModal(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
