"use client";
import React, { useState, useEffect } from 'react';
import styles from './settingsPage.module.css';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { isPremiumPlusPlan } from '@/lib/plans/access';

export default function ContactSection() {
  const [userEmail, setUserEmail] = useState<string>('');
  const [userPlan, setUserPlan] = useState<string>('No plan');
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || '');
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    fetchUserData();
  }, []);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const res = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setUserPlan((data?.plan || 'No plan').toString());
      } catch (error) {
        console.error('Failed to fetch user plan:', error);
      }
    };
    fetchPlan();
  }, []);

  const planLabel = userPlan.toString();
  const hasPremiumPlusSupport = isPremiumPlusPlan(planLabel);
  const responseTime = hasPremiumPlusSupport ? 'within 24 hours' : 'within 2-3 days';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.subject || !formData.message.trim()) {
      setStatus({ type: 'error', message: 'Please fill in all required fields.' });
      return;
    }

    if (!userEmail) {
      setStatus({ type: 'error', message: 'Unable to determine your email. Please sign in again.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, email: userEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      setStatus({ type: 'success', message: `Message sent successfully! We'll respond ${responseTime}.` });
      setFormData({ subject: '', message: '' });
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message || 'Failed to send message. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.sectionWrapper}>
      <section className={styles.settingsSection}>
        <h2 className={styles.sectionHeading}>Contact Us</h2>
        <p className={styles.desc}>Get in touch with the MyMcKenzieCS team for help and support.</p>
        <form className={styles.formGrid} onSubmit={handleSubmit}>
          <div className={styles.formGroup}> 
            <label className={styles.formLabel}>Subject</label>
            <select 
              className={styles.selectInput} 
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              required
            >
              <option value="" disabled>Select a subject</option>
              <option value="technical">Technical Support</option>
              <option value="billing">Billing Inquiry</option>
              <option value="account">Account Issues</option>
              <option value="feedback">Feedback</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className={styles.formGroup}> 
            <label className={styles.formLabel}>Message</label>
            <textarea 
              className={styles.textArea} 
              rows={6} 
              placeholder="Describe your issue or question..."
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              required
            ></textarea>
          </div>
          {status && (
            <div className={styles.formGroup}>
              <p style={{ 
                color: status.type === 'success' ? '#16a34a' : '#dc2626',
                fontSize: '0.9rem',
                padding: '8px 12px',
                background: status.type === 'success' ? '#f0fdf4' : '#fef2f2',
                borderRadius: '6px'
              }}>
                {status.message}
              </p>
            </div>
          )}
          <div className={styles.actionsRow}>
            <button 
              type="submit" 
              className={styles.primaryBtn}
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </section>
      <section className={styles.settingsSection}>
        <h2 className={styles.sectionHeading}>Other Ways to Reach Us</h2>
        <div className={styles.contactInfo}> 
          <div className={styles.contactItem}>
            <strong>Email</strong>
            <p>support@mymckenziecs.com</p>
          </div>
          <div className={styles.contactItem}>
            <strong>Response Time</strong>
            <p>We typically respond {responseTime}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
