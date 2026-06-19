import CookiePreferencesSection from '@/components/settings/CookiePreferencesSection';

type UkCookiePolicyContentProps = {
  measurementId?: string;
}

export default function UkCookiePolicyContent({ measurementId }: UkCookiePolicyContentProps) {
  return (
    <ol className="list-decimal pl-6 space-y-6 text-base md:text-lg">
      <li>
        <b>Introduction</b>
        <p className="mt-2">
          This Cookie Policy explains how MyMcKenzieCS uses cookies, local storage, session storage, and similar technologies on our website and web app.
        </p>
        <p>
          Essential cookies are used to keep the platform secure and functional. Optional analytics cookies are only used if you choose to allow them.
        </p>
      </li>
      <li>
        <b>What Cookies and Similar Technologies Are</b>
        <p className="mt-2">
          Cookies are small files stored on your device. Local storage, session storage, and cache storage are similar browser technologies that help us remember settings and keep the service working smoothly.
        </p>
        <p>
          We use a mix of:
        </p>
        <ul className="list-disc pl-6 mt-1">
          <li>Session cookies - removed when you close your browser</li>
          <li>Persistent cookies - remain for a period of time unless deleted</li>
          <li>First-party cookies - set by our own site</li>
          <li>Third-party cookies - set by providers we use for specific services</li>
        </ul>
      </li>
      <li>
        <b>How We Use Cookies</b>
        <ol className="list-decimal pl-6 mt-2 space-y-2">
          <li>
            <b>Strictly Necessary Cookies</b>
            <p className="mt-1">
              These are required for the platform to function and cannot be turned off from our systems.
            </p>
            <ul className="list-disc pl-6 mt-1">
              <li>Authentication and sign-in cookies</li>
              <li>Session cookies that keep you logged in as you move around the site</li>
              <li>Security cookies that help prevent misuse, fraud, and unauthorised access</li>
              <li>Load balancing and routing cookies that help keep the service stable</li>
            </ul>
          </li>
          <li>
            <b>Analytics Cookies</b>
            <p className="mt-1">
              These help us understand how people use the platform, which pages are working well, and where errors or friction appear.
            </p>
            <p className="mt-1">
              We only enable analytics cookies if you opt in. If you disable analytics, we stop the related tracking where technically possible.
            </p>
          </li>
          <li>
            <b>Preference and Functionality Storage</b>
            <p className="mt-1">
              We may store settings and preferences to make the platform easier to use, such as:
            </p>
            <ul className="list-disc pl-6 mt-1">
              <li>Dismissed notices and UI preferences</li>
              <li>Draft note recovery and autosave support</li>
              <li>Navigation and session continuity</li>
              <li>Other small usability settings</li>
            </ul>
          </li>
        </ol>
      </li>
      <li>
        <b>Third-Party Services</b>
        <p className="mt-2">
          Some providers we use may set their own cookies or similar technologies.
        </p>
        <ul className="list-disc pl-6 mt-2">
          <li>Hosting, authentication, and database providers</li>
          <li>Stripe or similar payment providers</li>
          <li>Email delivery services</li>
          <li>Analytics providers, if enabled</li>
        </ul>
        <p className="mt-2">
          These providers have their own privacy and cookie policies.
        </p>
      </li>
      <li>
        <b>Managing Your Choices</b>
        <p className="mt-2">
          You can manage your cookie choices through your browser, through your account settings, or using the controls on this page.
        </p>
        <p>
          Essential cookies remain in use because the platform cannot function without them.
        </p>
        <div className="mt-4">
          <CookiePreferencesSection measurementId={measurementId} />
        </div>
      </li>
      <li>
        <b>How Long We Keep Cookies</b>
        <p className="mt-2">
          Some cookies last only for the browser session. Others may remain for a longer period so the platform can remember your preferences or maintain secure access.
        </p>
        <p>
          You can clear cookies and browser storage at any time using your browser controls.
        </p>
      </li>
      <li>
        <b>Changes to This Policy</b>
        <p className="mt-2">
          We may update this Cookie Policy from time to time. The updated version will be posted on this page with a new date.
        </p>
      </li>
      <li>
        <b>Contact</b>
        <p className="mt-2">
          Lenjordan Ltd<br />
          Email: jordan@lenjordan.tech<br />
          Registered Office: 66 Chamberlain Way, Pinner HA5 2AT
        </p>
      </li>
    </ol>
  );
}
