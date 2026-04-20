"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './settingsPage.module.css';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { isPremiumPlusPlan } from '@/lib/plans/access';
import { getPublicRouteForMarket, normalizePublicMarket, type PublicMarket } from '@/lib/markets/public-routes';

export default function ContactSection({ initialPublicMarket = 'GB' }: { initialPublicMarket?: PublicMarket }) {
  const [userEmail, setUserEmail] = useState<string>('');
  const [userPlan, setUserPlan] = useState<string>('No plan');
  const [publicMarket, setPublicMarket] = useState<PublicMarket>(initialPublicMarket);
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
        setPublicMarket(normalizePublicMarket(data?.publicMarket));
      } catch (error) {
        console.error('Failed to fetch user plan:', error);
      }
    };
    fetchPlan();
  }, []);

  const planLabel = userPlan.toString();
  const hasPremiumPlusSupport = isPremiumPlusPlan(planLabel);
  const responseTime = hasPremiumPlusSupport ? 'within 1-2 days' : 'within 3-4 days';
  const publicContactHref = getPublicRouteForMarket('/contact', publicMarket);
  const isUS = publicMarket === 'US';
  const sectionHeading = isUS ? 'U.S. Support' : 'Contact Us';
  const sectionDescription = isUS
    ? 'Get in touch with the MyMcKenzieCS team for U.S. rollout, billing, account, and workspace support.'
    : 'Get in touch with the MyMcKenzieCS team for help and support.';
  const subjectPrompt = isUS ? 'Select a U.S. support topic' : 'Select a subject';
  const messagePlaceholder = isUS
    ? 'Describe your issue or question. Include your state, federal, or local court context if it matters.'
    : 'Describe your issue or question...';
  const contactPageLabel = isUS ? 'U.S. contact page' : 'public contact page';
  const contactPageTail = isUS
    ? 'if you need to send a direct rollout, billing, support, or privacy request.'
    : 'if you need to send a direct support, billing, or privacy request.';
  const responseLabel = isUS ? 'Typical Reply Time' : 'Response Time';

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
        <h2 className={styles.sectionHeading}>{sectionHeading}</h2>
        <p className={styles.desc}>{sectionDescription}</p>
        <form className={styles.formGrid} onSubmit={handleSubmit}>
          <div className={styles.formGroup}> 
            <label className={styles.formLabel}>Subject</label>
            <select 
              className={styles.selectInput} 
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              required
            >
              <option value="" disabled>{subjectPrompt}</option>
              <option value="technical">Technical Support</option>
              <option value="billing">Billing Inquiry</option>
              <option value="account">Account Issues</option>
              {isUS ? <option value="us-rollout">U.S. Rollout Question</option> : null}
              <option value="feedback">Feedback</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className={styles.formGroup}> 
            <label className={styles.formLabel}>Message</label>
            <textarea 
              className={styles.textArea} 
              rows={6} 
              placeholder={messagePlaceholder}
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
        <h2 className={styles.sectionHeading}>{isUS ? 'Other U.S. Support Options' : 'Other Ways to Reach Us'}</h2>
        <div className={styles.contactInfo}> 
          <div className={styles.contactItem}>
            <strong>{isUS ? 'U.S. contact page' : 'Contact page'}</strong>
            <p>
              Use the{' '}
              <Link href={publicContactHref} style={{ textDecoration: 'underline' }}>
                {contactPageLabel}
              </Link>{' '}
              {contactPageTail}
            </p>
          </div>
          <div className={styles.contactItem}>
            <strong>{responseLabel}</strong>
            <p>We typically respond {responseTime}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
