"use client";
import React, { useState, useEffect } from 'react';
// Expose dummy case creator for browser console in development only
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  import('@/lib/utils/create-dummy-case').then(mod => {
    window.createDummyCaseForCurrentUser = mod.createDummyCaseForCurrentUser;
  });
}
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import type { User } from '@supabase/supabase-js';
import styles from './settingsPage.module.css';

declare global {
  interface Window {
    createDummyCaseForCurrentUser?: (...args: Array<unknown>) => Promise<unknown>;
  }
}

export default function AccountSection() {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteFinalConfirm, setShowDeleteFinalConfirm] = useState(false);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  
  // User data
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

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
        setLoading(false);
        return;
      }

      setUserId(user.id);

      // Derive name from user metadata
      const meta = user.user_metadata || {};
      const displayName = (meta.full_name || meta.display_name || '').trim();
      if (displayName) {
        const parts = displayName.split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
      } else {
        setFirstName(meta.first_name || '');
        setLastName(meta.last_name || '');
      }

      if (user.email) {
        setEmail(user.email);
      }

      // Fetch additional profile data from /api/user
      try {
        const res = await fetch('/api/user', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const fullName = (data.fullName || '').trim();
          if (fullName) {
            const parts = fullName.split(' ');
            setFirstName(parts[0] || '');
            setLastName(parts.slice(1).join(' ') || '');
          }
          if (data.email) {
            setEmail(data.email);
          }
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
      } finally {
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
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('userId');
        localStorage.removeItem('currentConversationId');
        localStorage.removeItem('chatHistory');
        window.location.replace('/');
      }
    } catch (error) {
      console.error('Sign out error:', error);
      alert('Failed to sign out. Please try again.');
      setSigningOut(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!userId) {
      alert('You must be signed in to update your profile.');
      return;
    }

    setSaving(true);
    try {
      const fullName = `${firstName} ${lastName}`.trim();

      const response = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullName,
          email
        })
      });

      if (!response.ok) throw new Error('Failed to save changes');

      alert('Changes saved successfully!');
    } catch (error) {
      console.error('Error saving changes:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
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
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('userId');
        localStorage.removeItem('currentConversationId');
        localStorage.removeItem('chatHistory');
        window.location.replace('/');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      alert('Failed to delete account. Please try again.');
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
              <input className={styles.textInput} type={showNewPassword ? 'text' : 'password'} placeholder="••••••••" />
              <button type="button" className={styles.togglePassword} onClick={() => setShowNewPassword(s=>!s)}>
                {showNewPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className={styles.helpText}>At least 8 characters, include numbers & special characters.</p>
          </div>
          <div className={styles.formGroupFull}> 
            <label className={styles.formLabel}>Confirm New Password</label>
            <div className={styles.passwordContainer}>
              <input className={styles.textInput} type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••" />
              <button type="button" className={styles.togglePassword} onClick={() => setShowConfirmPassword(s=>!s)}>
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className={styles.actionsRow}>
            <button type="button" className={styles.primaryBtn}>Update Password</button>
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
      <div className={styles.bottomActions}>
        <button 
          className={styles.primaryBtn}
          onClick={handleSaveChanges}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button className={styles.dangerBtn} onClick={handleDeleteAccount}>
          Delete Account
        </button>
      </div>
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
    </div>
  );
}
