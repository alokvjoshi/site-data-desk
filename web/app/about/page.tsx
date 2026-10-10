import { PageHeader } from "@/components/ui";

export default function About() {
  return (
    <div className="prose-sdd max-w-3xl">
      <PageHeader title="About, licences and privacy" />
      <h2>What this is</h2>
      <p>Site Data Desk is an open-source demonstration of a cited-answer assistant for environmental consultancies. It is not affiliated with any company. The company shown, Kestrel Environmental Group, and all its projects, people, emails, Slack messages, reports and results are fictional.</p>
      <h2>Standards used</h2>
      <p>The standards in the knowledge base are the National Environment Protection (Assessment of Site Contamination) Measure Schedules B1, B2, B3, B4, B5a and B6, as published on the Federal Register of Legislation (instrument F2013L00768). The Register&apos;s content is provided under the Creative Commons Attribution 4.0 International licence. Text was extracted from the official PDFs and reformatted (page markers and headings added, tables flattened), so always check the original before relying on any value. Page numbers refer to PDF pages, not printed page numbers.</p>
      <p>For PFAS, the knowledge base also contains EPA Victoria Publication 3010, <em>Technical guide: Validation of PFAS soil treatment technologies</em> (April 2024). EPA Victoria states that all material on its website is provided under the Creative Commons Attribution 4.0 International licence, except images, branding and third-party content: © Copyright State Government of Victoria. Text was extracted from the Word document and reformatted (figures and some tables omitted; citations point to sections). Third-party material quoted inside the guide may not be covered by that licence.</p><p>The PFAS National Environmental Management Plan is not included because its reuse licence has not been verified.</p>
      <h2>Not professional advice</h2>
      <p>Answers report what the cited sources say. They are not professional, legal or safety advice and are not a substitute for a qualified practitioner or the regulator.</p>
      <h2>Privacy</h2>
      <p>No accounts. Questions, answers and the steps taken to produce them are logged with a hashed IP address to enforce daily limits, run evaluations and improve the system. Email addresses and phone numbers in free text are removed before storage. If you add your own OpenRouter key it stays in your browser and is forwarded for the language-model step only; it is never stored on the server.</p>
      <h2>Source</h2>
      <p>Code, evaluation suite and the Obsidian vault are in the project repository.</p>
    </div>
  );
}
