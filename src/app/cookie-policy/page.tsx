import React from 'react';
import LegalPageLayout from '@/components/layout/LegalPageLayout';

export default function CookiePolicyPage() {
  return (
    <LegalPageLayout
      title="Cookie Policy"
      subtitle="How we use cookies and local storage to keep the platform secure."
      meta="Owned by MyMcKenzieCS Ltd • Last Updated: February 10, 2026"
    >
      <ol className="list-decimal pl-6 space-y-6 text-base md:text-lg">
        <li>
          <b>Introduction</b>
          <p className="mt-2">This Cookie Policy explains how MyMcKenzieCS (&quot;The Platform&quot;, &quot;We&quot;, &quot;Us&quot;) uses cookies and similar technologies on our website and web application.</p>
          <p>By using the Platform, you agree to the use of cookies as described in this policy.</p>
        </li>
        <li>
          <b>What Are Cookies?</b>
          <p className="mt-2">Cookies are small text files stored on your device when you visit a website. They help websites function properly, improve security, remember your preferences, and provide analytics insights.</p>
          <p>Cookies may be:</p>
          <ul className="list-disc pl-6 mt-1">
            <li>Session Cookies – deleted when you close your browser</li>
            <li>Persistent Cookies – remain on your device for a period of time</li>
            <li>First-Party Cookies – set by our website</li>
            <li>Third-Party Cookies – set by services we integrate with</li>
          </ul>
        </li>
        <li>
          <b>How We Use Cookies</b>
          <p className="mt-2">The Platform uses cookies for the following purposes:</p>
          <ol className="list-decimal pl-6 mt-2 space-y-2">
            <li>
              <b>Essential Cookies (Strictly Necessary)</b>
              <p className="mt-1">These cookies are required for the website to function and cannot be turned off.</p>
              <p>They include:</p>
              <ul className="list-disc pl-6 mt-1">
                <li>Authentication cookies – keep you logged in securely</li>
                <li>Session cookies – maintain your logged-in state as you navigate</li>
                <li>Security cookies – prevent misuse, fraud, and unauthorised access</li>
                <li>Load balancing cookies – ensure stable performance during use</li>
              </ul>
              <p className="mt-1">Without these cookies, you cannot use the Platform.</p>
            </li>
            <li>
              <b>Analytics &amp; Performance Cookies</b>
              <p className="mt-1">These cookies help us understand:</p>
              <ul className="list-disc pl-6 mt-1">
                <li>How users interact with the platform</li>
                <li>Which pages are most used</li>
                <li>Errors or performance issues</li>
              </ul>
              <p className="mt-1">We may use analytics tools (only if enabled and with consent).</p>
              <p className="mt-1">Analytics cookies do not collect personal information that directly identifies you. These cookies are only activated with your consent.</p>
            </li>
            <li>
              <b>Functionality Cookies</b>
              <p className="mt-1">These allow the Platform to remember:</p>
              <ul className="list-disc pl-6 mt-1">
                <li>Your display preferences</li>
                <li>Your saved settings</li>
                <li>Features you previously enabled</li>
              </ul>
              <p className="mt-1">They help provide a seamless user experience.</p>
            </li>
            <li>
              <b>AI-Related Cookies &amp; Local Storage</b>
              <p className="mt-1">The Platform may use:</p>
              <ul className="list-disc pl-6 mt-1">
                <li>Local storage</li>
                <li>Session storage</li>
                <li>Cache storage</li>
              </ul>
              <p className="mt-1">...to keep track of:</p>
              <ul className="list-disc pl-6 mt-1">
                <li>Documents you’re working on</li>
                <li>Chat session continuity</li>
                <li>Temporary case-preparation data</li>
              </ul>
              <p className="mt-1">This is not used for tracking or advertising.</p>
            </li>
          </ol>
        </li>
        <li>
          <b>Third-Party Cookies</b>
          <p className="mt-2">We use third-party services that may set cookies, including:</p>
          
          <b className="block mt-2">Stripe (Payments)</b>
          <ul className="list-disc pl-6 mt-1">
            <li>Fraud prevention</li>
            <li>Secure checkout session</li>
          </ul>
          <b className="block mt-2">Email Providers (if applicable)</b>
          <ul className="list-disc pl-6 mt-1">
            <li>Anti-spam measures</li>
            <li>Account security and email delivery</li>
          </ul>
          <p className="mt-2">These providers have their own cookie and privacy policies.</p>
        </li>
        <li>
          <b>Managing Cookies</b>
          <p className="mt-2">You can manage or disable cookies through:</p>
          <ul className="list-disc pl-6 mt-1">
            <li>Your browser settings</li>
            <li>Our cookie consent banner (for analytics cookies)</li>
          </ul>
          <p className="mt-2">However:</p>
          <ul className="list-disc pl-6 mt-1">
            <li>Disabling essential cookies will prevent the Platform from functioning</li>
            <li>Analytics cookies will only run if you opt in</li>
          </ul>
        </li>
        <li>
          <b>Changes to This Cookie Policy</b>
          <p className="mt-2">We may update this Cookie Policy at any time. A new revision date will appear at the top of this page. Continued use of the Platform indicates acceptance of changes.</p>
        </li>
        <li>
          <b>Contact Information</b>
          <p className="mt-2">MyMcKenzieCS Ltd<br/>Email: support@mymckenziecs.com<br/>Registered Office: [Insert]</p>
        </li>
      </ol>
    </LegalPageLayout>
  );
}
