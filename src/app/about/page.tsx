import LegalPageLayout from '@/components/layout/LegalPageLayout';

export const revalidate = 86400;

export default function AboutPage() {
  return (
    <LegalPageLayout
      title="About"
      subtitle="Why we built MyMcKenzieCS and who it serves."
      meta="Built by Lenjordan Ltd • Empowering Litigants in Person"
    >
      <div className="space-y-6 text-base md:text-lg">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Our Purpose</h2>
          <p>
            MyMcKenzieCS is an AI-powered support platform designed to help Litigants in Person
            navigate the court process with greater clarity, confidence, and organisation.
          </p>
          <p className="mt-3">
            Court processes can feel overwhelming. We built this platform so you can prepare documents, understand
            procedures, stay organised, and manage your case in one place — with the help of advanced AI tools.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">What We Provide</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>AI-powered guidance on court procedures</li>
            <li>Drafting assistance for statements, letters, forms, and case documents</li>
            <li>Document upload and AI analysis</li>
            <li>Case dashboard and timeline organisation</li>
            <li>Plain-English explanations and step-by-step support</li>
            <li>Subscription tiers and optional one-off services</li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">Not a Law Firm</h2>
          <p>
            MyMcKenzieCS does not provide legal advice and is not a law firm or regulated legal service.
            All support offered is informational, procedural, and organisational. You remain fully responsible for
            your own legal decisions and filings.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">Who We Are</h2>
          <p>
            MyMckenzieCS is an AI-powered legal support platform designed for individuals representing themselves in court (Litigants in Person). 
            It provides tools that help users understand legal procedures, prepare documents, analyse case materials, and organise their cases in a clearer and more structured way.
            The platform is designed to make navigating the legal process more accessible and manageable. MyMcKenzieCS provides technology and informational support, 
            but it is not a law firm and does not provide legal advice.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">Our Vision</h2>
          <p>
            To redefine access to justice by developing the leading AI-powered platform that empowers individuals 
            representing themselves in court with clear, structured, and intelligent legal support.
          </p>
        </div>
      </div>
    </LegalPageLayout>
  );
}
