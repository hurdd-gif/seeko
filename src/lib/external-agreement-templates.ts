import type { ExternalAgreementSection } from './types';

export type ExternalTemplate = {
  id: string;
  name: string;
  description: string;
  sections: ExternalAgreementSection[];
};

export const EXTERNAL_TEMPLATES: ExternalTemplate[] = [
  {
    id: 'external_nda',
    name: 'External NDA',
    description: 'Standard non-disclosure agreement for external parties',
    sections: [
      {
        number: 1,
        title: 'Confidentiality & Non-Disclosure',
        content: `<p>The Receiving Party agrees to hold all Confidential Information in strict confidence. "Confidential Information" includes all non-public information disclosed by SEEKO Studios ("Disclosing Party"), whether orally, in writing, or by any other means, including but not limited to business plans, strategies, technical data, product designs, financial information, customer lists, and proprietary processes.</p>
<p>The Receiving Party shall not, without prior written consent of the Disclosing Party:</p>
<ul>
<li>Disclose any Confidential Information to third parties</li>
<li>Use Confidential Information for any purpose other than the agreed-upon engagement</li>
<li>Copy or reproduce Confidential Information except as necessary for the engagement</li>
</ul>
<p>This obligation of confidentiality shall survive termination of this agreement for a period of two (2) years.</p>`,
      },
      {
        number: 2,
        title: 'Permitted Disclosures',
        content: `<p>The Receiving Party may disclose Confidential Information only:</p>
<ul>
<li>To employees or agents who need to know and are bound by confidentiality obligations at least as protective as these</li>
<li>As required by law or court order, provided the Receiving Party gives prompt written notice to the Disclosing Party</li>
</ul>`,
      },
      {
        number: 3,
        title: 'Return of Materials',
        content: `<p>Upon termination of this agreement or at the Disclosing Party's request, the Receiving Party shall promptly return or destroy all Confidential Information and any copies thereof, and certify in writing that it has done so.</p>`,
      },
      {
        number: 4,
        title: 'No License or Warranty',
        content: `<p>Nothing in this agreement grants any license under any patent, copyright, or other intellectual property right. All Confidential Information is provided "as is" without warranty of any kind.</p>`,
      },
      {
        number: 5,
        title: 'Remedies',
        content: `<p>The Receiving Party acknowledges that any breach of this agreement may cause irreparable harm to the Disclosing Party and that monetary damages may be inadequate. Accordingly, the Disclosing Party shall be entitled to seek equitable relief, including injunction and specific performance, in addition to all other remedies available at law or in equity.</p>`,
      },
      {
        number: 6,
        title: 'General Provisions',
        content: `<p>This agreement shall be governed by the laws of the Commonwealth of Virginia. This agreement constitutes the entire agreement between the parties regarding confidentiality and supersedes all prior agreements. Any amendments must be in writing and signed by both parties.</p>`,
      },
    ],
  },
  {
    id: 'vendor_agreement',
    name: 'Vendor Agreement',
    description: 'Agreement for vendors and service providers working with SEEKO',
    sections: [
      {
        number: 1,
        title: 'Scope of Services',
        content: `<p>The Vendor agrees to provide services as described in the accompanying statement of work or as mutually agreed upon in writing. The Vendor shall perform all services in a professional and workmanlike manner consistent with industry standards.</p>`,
      },
      {
        number: 2,
        title: 'Confidentiality',
        content: `<p>The Vendor acknowledges that during the course of providing services, it may receive or have access to Confidential Information belonging to SEEKO Studios. The Vendor agrees to:</p>
<ul>
<li>Maintain all Confidential Information in strict confidence</li>
<li>Not disclose Confidential Information to any third party without prior written consent</li>
<li>Use Confidential Information solely for the purpose of providing the agreed-upon services</li>
<li>Return or destroy all Confidential Information upon completion of services or upon request</li>
</ul>`,
      },
      {
        number: 3,
        title: 'Intellectual Property',
        content: `<p>All work product, deliverables, and materials created by the Vendor in connection with the services shall be the exclusive property of SEEKO Studios. The Vendor hereby assigns all rights, title, and interest in such work product to SEEKO Studios.</p>`,
      },
      {
        number: 4,
        title: 'Term & Termination',
        content: `<p>This agreement shall remain in effect until the completion of services or until terminated by either party with thirty (30) days' written notice. The confidentiality and intellectual property provisions shall survive termination.</p>`,
      },
      {
        number: 5,
        title: 'Indemnification',
        content: `<p>The Vendor shall indemnify, defend, and hold harmless SEEKO Studios from and against any claims, damages, losses, or expenses arising from the Vendor's breach of this agreement or negligent performance of services.</p>`,
      },
      {
        number: 6,
        title: 'General Provisions',
        content: `<p>This agreement shall be governed by the laws of the Commonwealth of Virginia. This agreement constitutes the entire agreement between the parties and supersedes all prior agreements. The Vendor is an independent contractor and nothing in this agreement creates an employment or agency relationship.</p>`,
      },
    ],
  },
];

export function getTemplateById(id: string): ExternalTemplate | undefined {
  return EXTERNAL_TEMPLATES.find((t) => t.id === id);
}

export const GUARDIAN_AUTHORIZATION_SECTION: ExternalAgreementSection = {
  number: 0,
  title: 'Guardian Authorization',
  content: `<p>The undersigned ("Guardian") represents and warrants that they are the parent or legal guardian of the minor identified in the signature block below ("Minor"), and that they have full legal authority to enter into this Agreement on behalf of the Minor.</p>
<p>By signing this Agreement, the Guardian:</p>
<ul>
<li>Consents to the Minor's engagement with SEEKO Studios under the terms set forth herein</li>
<li>Accepts responsibility for ensuring the Minor's compliance with all obligations under this Agreement</li>
<li>Agrees to be bound by and liable for the Minor's performance of this Agreement</li>
<li>Acknowledges that this Agreement shall remain in effect as to the Minor for the full term stated herein</li>
</ul>
<p>The Guardian further represents that they have read and understand all terms of this Agreement and have had the opportunity to seek independent legal counsel prior to signing.</p>`,
};

/** Append the Guardian Authorization section to a list of agreement sections */
export function withGuardianSection(
  sections: ExternalAgreementSection[]
): ExternalAgreementSection[] {
  return [
    ...sections,
    { ...GUARDIAN_AUTHORIZATION_SECTION, number: sections.length + 1 },
  ];
}
