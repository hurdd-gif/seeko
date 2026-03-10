export type AgreementSection = {
  number: number;
  title: string;
  content: string; // HTML string with paragraphs, lists
};

export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    number: 1,
    title: 'Confidentiality & Non-Disclosure',
    content: `<p>The Recipient agrees to hold in strict confidence all Confidential Information disclosed by SEEKO during and after the term of engagement.</p>
<p>"Confidential Information" includes, but is not limited to: game design documents, source code, art assets, business strategies, financial information, user data, marketing plans, and any proprietary materials shared via SEEKO's development dashboard or other communication channels.</p>
<p>The Recipient shall not disclose, publish, or otherwise reveal any Confidential Information to any third party without the prior written consent of SEEKO.</p>`,
  },
  {
    number: 2,
    title: 'Intellectual Property Ownership',
    content: `<p>All work product, deliverables, code, art, designs, documentation, and any other materials created by the Recipient in connection with SEEKO projects shall be the exclusive property of SEEKO.</p>
<p>The Recipient hereby assigns all rights, title, and interest (including all intellectual property rights) in any work product to SEEKO.</p>
<p>The Recipient waives any moral rights to the extent permitted by law.</p>`,
  },
  {
    number: 3,
    title: 'Dashboard & Development Environment Access',
    content: `<p>SEEKO grants the Recipient access to internal development tools, dashboards, and environments solely for the purpose of performing assigned work.</p>
<p>Access credentials must not be shared with any third party. The Recipient agrees to follow all security protocols and immediately report any unauthorized access or security breaches.</p>`,
  },
  {
    number: 4,
    title: 'Scope of Work & Responsibilities',
    content: `<p>The Recipient's scope of work will be defined and tracked via SEEKO's project management dashboard. Tasks, deadlines, and deliverables will be assigned through the platform.</p>
<p>The Recipient agrees to complete assigned tasks within the specified timelines and to communicate promptly about any delays or blockers.</p>`,
  },
  {
    number: 5,
    title: 'Compensation',
    content: `<p>Compensation for the Recipient's services will be determined on a per-project or per-task basis as agreed upon through the SEEKO dashboard. Payment terms and methods will be specified for each engagement.</p>
<p>The Recipient acknowledges that compensation is contingent upon satisfactory completion of assigned work.</p>`,
  },
  {
    number: 6,
    title: 'Non-Compete & Non-Solicitation',
    content: `<p>During the term of engagement and for a period of twelve (12) months thereafter, the Recipient agrees not to:</p>
<ul><li>Directly or indirectly compete with SEEKO in the development of similar gaming products</li>
<li>Solicit or recruit any SEEKO team members or contractors</li>
<li>Use Confidential Information to develop competing products or services</li></ul>`,
  },
  {
    number: 7,
    title: 'Representations & Warranties',
    content: `<p>The Recipient represents and warrants that:</p>
<ul><li>They have the legal capacity to enter into this agreement</li>
<li>Their work will be original and will not infringe upon the rights of any third party</li>
<li>They are not subject to any agreement that would prevent them from fulfilling their obligations under this agreement</li></ul>`,
  },
  {
    number: 8,
    title: 'Term & Termination',
    content: `<p>This agreement remains in effect for the duration of the Recipient's engagement with SEEKO and survives termination with respect to Confidentiality (Section 1) and Intellectual Property (Section 2) obligations.</p>
<p>Either party may terminate the engagement with written notice. Upon termination, the Recipient must return or destroy all Confidential Information and confirm destruction in writing.</p>`,
  },
  {
    number: 9,
    title: 'Indemnification',
    content: `<p>The Recipient agrees to indemnify, defend, and hold harmless SEEKO, its officers, directors, and affiliates from and against any claims, damages, losses, or expenses arising from the Recipient's breach of this agreement or negligent acts.</p>`,
  },
  {
    number: 10,
    title: 'Limitation of Liability',
    content: `<p>In no event shall SEEKO be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to this agreement, regardless of the cause of action or theory of liability.</p>
<p>SEEKO's total liability under this agreement shall not exceed the total compensation paid to the Recipient in the twelve (12) months preceding the claim.</p>`,
  },
  {
    number: 11,
    title: 'Dispute Resolution',
    content: `<p>Any disputes arising under this agreement shall first be attempted to be resolved through good-faith negotiation between the parties.</p>
<p>If negotiation fails, disputes shall be submitted to binding arbitration in accordance with applicable laws. The prevailing party shall be entitled to recover reasonable attorney's fees.</p>`,
  },
  {
    number: 12,
    title: 'General Provisions',
    content: `<p>This agreement shall be governed by the laws of the Commonwealth of Virginia. This agreement constitutes the entire understanding between the parties regarding the subject matter herein. It may only be modified in writing signed by both parties.</p>
<p>If any provision is found to be unenforceable, the remaining provisions shall continue in full force and effect.</p>
<p>The Recipient acknowledges that they have read, understood, and agree to be bound by all terms and conditions of this agreement.</p>`,
  },
];

export const AGREEMENT_TITLE = 'SEEKO Onboarding Agreement';
