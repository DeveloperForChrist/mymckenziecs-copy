import LegalPageLayout from '@/components/layout/LegalPageLayout';

export const revalidate = 86400;

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms & Conditions"
      subtitle="Clear rules for using the platform and keeping your case data safe."
      meta="Owned by Lenjordan Ltd • Last Updated: March 2, 2026"
    >
      <ol className="list-decimal pl-6 space-y-6 text-base md:text-lg">
        <li>
          <b>Introduction</b>
          <p className="mt-2">These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of MyMcKenzieCS (&quot;The Platform&quot;), owned and operated by Lenjordan Ltd (&quot;We&quot;, &quot;Us&quot;, &quot;Our&quot;).</p>
          <p>By registering an account, using the Platform, or purchasing any service, you agree to these Terms. If you do not agree, you must stop using the Platform immediately.</p>
          <p>MyMcKenzieCS is a digital tool for Litigants in Person, providing AI-powered guidance, drafting assistance, and case-support tools. We are not a law firm and do not provide legal advice.</p>
        </li>
        <li>
          <b>Nature of Service (Important Disclaimer)</b>
          <ol className="list-decimal pl-6 mt-2 space-y-2">
            <li>The Platform provides informational guidance, procedural explanations, document drafting support, and automated analysis using AI.</li>
            <li>We are not a regulated legal service provider. We do not offer legal advice, representation, advocacy, or reserved legal activities under the Legal Services Act 2007.</li>
            <li>All generated documents must be reviewed, edited, and approved by you. You remain fully responsible for your case, filings, deadlines, and legal strategy.</li>
            <li>If you require specific legal advice, you must consult a qualified solicitor or barrister.</li>
          </ol>
        </li>
        <li>
          <b>Eligibility</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Be at least 18 years old</li>
            <li>Create an account with accurate information</li>
            <li>Have the legal right to upload documents you submit</li>
            <li>Agree to these Terms and our Privacy Policy</li>
          </ul>
        </li>
        <li>
          <b>Platform Features</b>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li><b>AI Legal Guidance:</b> Explanation of legal processes, procedural steps, strategy options (non-advisory), court-process clarification</li>
            <li><b>Document Assistance:</b> AI-assisted drafting of witness statements, letter drafting, N1/N244 and other form-support, proofreading, case summaries</li>
            <li><b>Document Review:</b> AI analysis of uploaded case files, highlighting missing information or inconsistencies</li>
            <li><b>Case Dashboard:</b> Evidence organisation, timeline building, note-taking, progress tracking</li>
            <li><b>Research Tools:</b> Explanations of legislation, case management guidance, plain-English interpretations</li>
            <li><b>Subscription Services:</b> Basic, Premium, and Premium + paid plans</li>
          </ul>
        </li>
        <li>
          <b>User Responsibilities</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Upload accurate and lawful documents</li>
            <li>Not rely solely on AI output</li>
            <li>Review all drafts before use</li>
            <li>Use the Platform for lawful purposes</li>
            <li>Keep your login details confidential</li>
            <li>Not misuse or attempt to access restricted systems</li>
          </ul>
        </li>
        <li>
          <b>Payments &amp; Billing</b>
          <ol className="list-decimal pl-6 mt-2 space-y-1">
            <li>Paid services are provided through recurring subscription plans (Basic, Premium, and Premium +).</li>
            <li>All payments are made in advance.</li>
            <li>Prices are listed on the Platform and may change with notice.</li>
            <li>Subscriptions renew automatically unless cancelled through your account settings.</li>
            <li>You are responsible for cancelling your subscription before renewal if you do not wish to continue.</li>
            <li>If payment fails, your subscription may move to a <b>past_due</b> status with a grace period typically up to 5 days (or as stated in your billing notices).</li>
            <li>During grace, we may retry payment and send billing reminders to your account email.</li>
            <li>If payment is not completed by grace expiry, your subscription may become <b>expired</b> or <b>cancelled</b> and paid features are paused.</li>
            <li>After lapse, dashboard tools may switch to read-only mode and chat input/attachments may be locked until billing is resumed.</li>
            <li>During read-only mode, retained data remains available for viewing and download where supported.</li>
            <li>For long-term non-payment, lifecycle timelines apply (typically hard lock/archive around day 30 and deletion scheduling around day 90, subject to product notices).</li>
            <li>We send lifecycle warning emails before hard lock and deletion milestones (typically at 7, 5, 3, and 1 days).</li>
            <li>Operational billing/security communications are essential service notices and are not marketing messages.</li>
          </ol>
        </li>
        <li>
          <b>Refund Policy</b>
          <p className="mt-2">Refunds are offered only where:</p>
          <ul className="list-disc pl-6 mt-1">
            <li>You paid for a service that failed to function and we could not fix it</li>
            <li>The Platform was inaccessible due to issues caused solely by us</li>
          </ul>
          <p className="mt-2">Refunds are not granted for:</p>
          <ul className="list-disc pl-6 mt-1">
            <li>Used subscription periods</li>
            <li>User misunderstanding of features</li>
            <li>Incorrect uploads or user errors</li>
            <li>Case outcomes</li>
          </ul>
          <p className="mt-2">Refunds are processed to the original payment method.</p>
        </li>
        <li>
          <b>Data Protection &amp; Privacy</b>
          <p className="mt-2">We comply with the Data Protection Act 2018 and UK GDPR.</p>
          <ul className="list-disc pl-6 mt-1">
            <li><b>Data Collected:</b> Name, email, account details, uploaded documents, AI chat content, case notes, usage/technical data</li>
            <li><b>Data Storage:</b> Encrypted database/document storage, secure authentication, GDPR-compliant hosting</li>
            <li><b>Purpose of Data Use:</b> Operating/improving the Platform, delivering features, generating drafts/analysis, security, compliance</li>
            <li><b>No Selling of Data:</b> We do not sell or trade your information. See our full Privacy Policy for more details.</li>
          </ul>
        </li>
        <li>
          <b>Intellectual Property</b>
          <ol className="list-decimal pl-6 mt-2 space-y-1">
            <li>The Platform, branding, design, algorithms, and AI workflows belong to Lenjordan Ltd.</li>
            <li>You retain ownership of documents and data you upload.</li>
            <li>Generated drafts belong to you once created, but you grant us a licence to process them for quality improvement and system functioning.</li>
            <li>You may not:
              <ul className="list-disc pl-6 mt-1">
                <li>Copy our platform design or systems</li>
                <li>Distribute or resell platform content</li>
                <li>Reverse-engineer any part of the software</li>
              </ul>
            </li>
          </ol>
        </li>
        <li>
          <b>Limitation of Liability</b>
          <ol className="list-decimal pl-6 mt-2 space-y-1">
            <li>We are not liable for court outcomes, filing errors, or legal losses.</li>
            <li>All Platform content is informational only and not legal advice.</li>
            <li>Our total liability to you is capped at the amount you paid us in the past 30 days.</li>
            <li>We are not responsible for:
              <ul className="list-disc pl-6 mt-1">
                <li>Missed deadlines</li>
                <li>Incorrect user inputs</li>
                <li>Incorrect reliance on AI outputs</li>
                <li>Third-party service disruptions</li>
                <li>Loss of documents caused by user deletion</li>
              </ul>
            </li>
          </ol>
        </li>
        <li>
          <b>Service Availability</b>
          <ol className="list-decimal pl-6 mt-2 space-y-1">
            <li>We aim to provide 24/7 availability but cannot guarantee uninterrupted access.</li>
            <li>We may suspend the Platform for maintenance or updates.</li>
            <li>Features may change or be removed at our discretion.</li>
          </ol>
        </li>
        <li>
          <b>Account Suspension or Termination</b>
          <p className="mt-2">We may suspend or terminate accounts for:</p>
          <ul className="list-disc pl-6 mt-1">
            <li>Misuse or abuse of the Platform</li>
            <li>Uploading illegal or harmful content</li>
            <li>Fraudulent payment activity</li>
            <li>Violations of these Terms</li>
            <li>Long-term non-payment under the billing lifecycle described above</li>
          </ul>
          <p className="mt-2">If a paid subscription lapses, account features may be restricted and retention timelines (read-only, archive, and deletion phases) may apply after notice emails.</p>
          <p className="mt-2">You may delete your account at any time.</p>
        </li>
        <li>
          <b>Third-Party Services</b>
          <p className="mt-2">The Platform integrates with:</p>
          <ul className="list-disc pl-6 mt-1">
            <li>Hosting, storage, and authentication providers</li>
            <li>Payment processors (e.g., Stripe)</li>
            <li>AI APIs (e.g., model providers)</li>
          </ul>
          <p className="mt-2">These services have their own terms and policies. We are not responsible for their actions or outages.</p>
        </li>
        <li>
          <b>Governing Law</b>
          <p className="mt-2">These Terms are governed by the laws of England and Wales. Disputes will be resolved exclusively in the courts of England and Wales.</p>
        </li>
        <li>
          <b>Changes to Terms</b>
          <p className="mt-2">We may update these Terms at any time. Changes take effect upon being posted on the Platform. Continued use means acceptance of the new Terms.</p>
        </li>
        <li>
          <b>Contact Information</b>
          <p className="mt-2">Lenjordan Ltd<br/>Email: support@mymckenziecs.com<br/>Registered Office: 66 Chamberlain Way, Pinner HA5 2AT</p>
        </li>
        <li>
          <b>Agreement</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>You have read these Terms</li>
            <li>You understand the Platform does not provide legal advice</li>
            <li>You accept responsibility for your case</li>
            <li>You agree to abide by these Terms and our Privacy Policy</li>
          </ul>
        </li>
      </ol>
    </LegalPageLayout>
  );
}
