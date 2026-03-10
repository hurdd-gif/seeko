# External Signing Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone external signing system where admins send invite links to non-members who verify via email, read a document (preset template or AI-parsed PDF), and sign — no account creation required.

**Architecture:** New `external_signing_invites` table tracks the full lifecycle. Public `/sign/[token]` route handles the signer flow. Existing `AgreementForm` is refactored to accept sections as props so both onboarding and external signing share the same UX. Admin UI in the dashboard for sending invites and tracking status.

**Tech Stack:** Next.js 16, Supabase (Postgres + Storage), Resend (email), pdf-lib (PDF gen), pdf-parse (PDF text extraction), Claude API (section parsing), motion/react (animations)

**Design Doc:** `docs/plans/2026-03-09-external-signing-portal-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260309000000_external_signing_invites.sql`
- Modify: `docs/supabase-schema.sql` (append new table definition)

**Step 1: Write the migration SQL**

```sql
-- External signing invites table
create table if not exists public.external_signing_invites (
  id               uuid primary key default gen_random_uuid(),
  token            text unique not null,
  recipient_email  text not null,
  template_type    text not null check (template_type in ('preset', 'custom')),
  template_id      text,
  custom_sections  jsonb,
  custom_title     text,
  personal_note    text,
  expires_at       timestamptz not null,
  verification_code text,
  verification_attempts smallint not null default 0,
  verified_at      timestamptz,
  status           text not null default 'pending'
                   check (status in ('pending', 'verified', 'signed', 'expired', 'revoked')),
  signer_name      text,
  signer_address   text,
  signer_ip        text,
  signer_user_agent text,
  signed_at        timestamptz,
  created_by       uuid references public.profiles(id) not null,
  created_at       timestamptz default now()
);

-- Index for token lookups (public route)
create index if not exists idx_external_signing_token on public.external_signing_invites(token);

-- Index for admin listing
create index if not exists idx_external_signing_created_by on public.external_signing_invites(created_by, created_at desc);

-- RLS: only service role can access (all operations go through API routes)
alter table public.external_signing_invites enable row level security;

-- Storage bucket policy for external signed PDFs
-- External signed PDFs go to: agreements/external/{invite_id}/agreement.pdf
-- Admins can read, service role can write (handled by existing agreements bucket policies)
```

**Step 2: Update the schema doc**

Append the table definition to `docs/supabase-schema.sql` after the existing tables.

**Step 3: Apply the migration**

Run: `npx supabase db push` or apply via Supabase MCP tool.

**Step 4: Commit**

```bash
git add supabase/migrations/20260309000000_external_signing_invites.sql docs/supabase-schema.sql
git commit -m "feat: add external_signing_invites table migration"
```

---

## Task 2: Types & Template Registry

**Files:**
- Modify: `src/lib/types.ts` (add ExternalSigningInvite type)
- Create: `src/lib/external-agreement-templates.ts`

**Step 1: Add the ExternalSigningInvite type**

Add to `src/lib/types.ts`:

```typescript
export type ExternalSigningInvite = {
  id: string;
  token: string;
  recipient_email: string;
  template_type: 'preset' | 'custom';
  template_id?: string;
  custom_sections?: ExternalAgreementSection[];
  custom_title?: string;
  personal_note?: string;
  expires_at: string;
  verification_attempts: number;
  verified_at?: string;
  status: 'pending' | 'verified' | 'signed' | 'expired' | 'revoked';
  signer_name?: string;
  signer_address?: string;
  signer_ip?: string;
  signer_user_agent?: string;
  signed_at?: string;
  created_by: string;
  created_at: string;
};

export type ExternalAgreementSection = {
  number: number;
  title: string;
  content: string; // HTML string
};
```

**Step 2: Create the template registry**

Create `src/lib/external-agreement-templates.ts`:

```typescript
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
        content: `<p>This agreement shall be governed by the laws of the State of Delaware. This agreement constitutes the entire agreement between the parties regarding confidentiality and supersedes all prior agreements. Any amendments must be in writing and signed by both parties.</p>`,
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
        content: `<p>This agreement shall be governed by the laws of the State of Delaware. This agreement constitutes the entire agreement between the parties and supersedes all prior agreements. The Vendor is an independent contractor and nothing in this agreement creates an employment or agency relationship.</p>`,
      },
    ],
  },
];

export function getTemplateById(id: string): ExternalTemplate | undefined {
  return EXTERNAL_TEMPLATES.find((t) => t.id === id);
}
```

**Step 3: Commit**

```bash
git add src/lib/types.ts src/lib/external-agreement-templates.ts
git commit -m "feat: add external signing types and template registry"
```

---

## Task 3: Refactor Shared Utilities — PDF Generation

**Files:**
- Modify: `src/lib/agreement-pdf.ts` (make generic)
- Modify: `src/app/api/agreement/sign/route.ts` (update call site)

**Step 1: Write a test for the refactored PDF generator**

Create `src/__tests__/agreement-pdf.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateAgreementPdf } from '@/lib/agreement-pdf';

describe('generateAgreementPdf', () => {
  it('generates a PDF with custom sections', async () => {
    const result = await generateAgreementPdf({
      title: 'Test Agreement',
      sections: [
        { number: 1, title: 'Section One', content: '<p>Content here</p>' },
      ],
      signer: {
        fullName: 'Jane Doe',
        address: '123 Main St',
        email: 'jane@example.com',
        signedAt: new Date('2026-01-01'),
      },
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('generates a PDF with engagement type for onboarding', async () => {
    const result = await generateAgreementPdf({
      title: 'SEEKO Onboarding Agreement',
      sections: [
        { number: 1, title: 'Confidentiality', content: '<p>NDA text</p>' },
      ],
      signer: {
        fullName: 'John Smith',
        address: '456 Oak Ave',
        email: 'john@seeko.gg',
        signedAt: new Date('2026-01-01'),
        department: 'Coding',
        role: 'Developer',
        engagementType: 'team_member',
      },
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/agreement-pdf.test.ts`
Expected: FAIL — signature mismatch (current function uses `PdfInput` not the new shape)

**Step 3: Refactor `agreement-pdf.ts`**

Update the `PdfInput` interface and function to accept generic sections:

```typescript
interface PdfSigner {
  fullName: string;
  address: string;
  email: string;
  signedAt: Date;
  // Optional fields for onboarding (omitted for external signing)
  department?: string;
  role?: string;
  engagementType?: 'team_member' | 'contractor';
}

interface PdfInput {
  title: string;
  sections: { number: number; title: string; content: string }[];
  signer: PdfSigner;
}

export async function generateAgreementPdf(input: PdfInput): Promise<Uint8Array>
```

Key changes:
- Accept `title` (was hardcoded to `AGREEMENT_TITLE`)
- Accept `sections[]` (was hardcoded to `AGREEMENT_SECTIONS`)
- Signer info block: only show department/role/engagementType if provided
- Rest of PDF generation logic stays the same

**Step 4: Update the onboarding sign route**

Update `src/app/api/agreement/sign/route.ts` to use the new signature:

```typescript
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';

const pdfBytes = await generateAgreementPdf({
  title: AGREEMENT_TITLE,
  sections: AGREEMENT_SECTIONS,
  signer: {
    fullName: body.full_name,
    address: body.address,
    email: user.email!,
    signedAt: new Date(),
    department: profile.department,
    role: profile.role,
    engagementType: body.engagement_type,
  },
});
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/agreement-pdf.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/agreement-pdf.ts src/app/api/agreement/sign/route.ts src/__tests__/agreement-pdf.test.ts
git commit -m "refactor: make PDF generator accept generic sections and signer info"
```

---

## Task 4: Refactor Shared Utilities — Email

**Files:**
- Modify: `src/lib/email.ts` (extract shared functions, add new ones)

**Step 1: Refactor `sendAgreementEmail` to accept sections**

Currently `buildAgreementHtml` hardcodes `AGREEMENT_SECTIONS`. Refactor to accept sections as parameter:

```typescript
function buildAgreementHtml(
  title: string,
  sections: { number: number; title: string; content: string }[],
  signerName: string,
  signedDate: string
): string
```

Update `sendAgreementEmail` to accept title and sections:

```typescript
export interface SendAgreementEmailParams {
  recipientEmail: string;
  signerName: string;
  pdfBytes: Uint8Array;
  title: string;
  sections: { number: number; title: string; content: string }[];
}
```

**Step 2: Add new email functions**

```typescript
export interface SendExternalInviteEmailParams {
  recipientEmail: string;
  token: string;
  personalNote?: string;
  templateName: string;
  expiresAt: Date;
}

export async function sendExternalInviteEmail({
  recipientEmail,
  token,
  personalNote,
  templateName,
  expiresAt,
}: SendExternalInviteEmailParams): Promise<void> {
  const signUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sign/${token}`;
  const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  await resend.emails.send({
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: `You've been invited to sign: ${templateName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 24px; color: #fff;">SEEKO Studio</h1>
        <p>You've been invited to review and sign a document: <strong>${templateName}</strong></p>
        ${personalNote ? `<div style="background: #2a2a2a; border-left: 3px solid #666; padding: 12px 16px; margin: 16px 0; border-radius: 4px;"><p style="margin: 0; color: #ccc;">${personalNote}</p></div>` : ''}
        <a href="${signUrl}" style="display: inline-block; background: #fff; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Review & Sign Document</a>
        <p style="color: #888; font-size: 14px;">This link expires on ${expiresFormatted}.</p>
      </div>
    `,
  });
}

export interface SendVerificationCodeEmailParams {
  recipientEmail: string;
  code: string;
}

export async function sendVerificationCodeEmail({
  recipientEmail,
  code,
}: SendVerificationCodeEmailParams): Promise<void> {
  const spaced = code.split('').join(' ');

  await resend.emails.send({
    from: FROM_EMAIL,
    to: recipientEmail,
    subject: 'Your verification code — SEEKO Studio',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 24px; color: #fff;">SEEKO Studio</h1>
        <p>Enter this code to verify your identity and access the document:</p>
        <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; text-align: center; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #fff;">${spaced}</span>
        </div>
        <p style="color: #888; font-size: 14px;">This code expires in 10 minutes. Do not share it with anyone.</p>
      </div>
    `,
  });
}
```

**Step 3: Update onboarding sign route call site**

```typescript
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';

await sendAgreementEmail({
  recipientEmail: user.email!,
  signerName: body.full_name,
  pdfBytes,
  title: AGREEMENT_TITLE,
  sections: AGREEMENT_SECTIONS,
});
```

**Step 4: Commit**

```bash
git add src/lib/email.ts src/app/api/agreement/sign/route.ts
git commit -m "refactor: make email functions generic, add external invite and verification emails"
```

---

## Task 5: Refactor AgreementForm Component

**Files:**
- Modify: `src/components/agreement/AgreementForm.tsx`
- Modify: `src/app/agreement/page.tsx` (update props passed)

**Step 1: Update AgreementForm props**

Change the interface to accept sections and configuration:

```typescript
interface AgreementFormProps {
  userId: string;
  userEmail: string;
  sections: { number: number; title: string; content: string }[];
  title: string;
  // Onboarding-specific (optional)
  department?: string;
  role?: string;
  isContractor?: boolean;
  onboarded?: number;
  showEngagementType?: boolean;
  // API endpoint configuration
  signEndpoint: string;
  // Redirect after signing (null = no redirect, show success message)
  successRedirect?: string | null;
  // Optional personal note to display
  personalNote?: string;
}
```

**Step 2: Update the component internals**

Key changes:
- Replace `AGREEMENT_SECTIONS` references with `props.sections`
- Replace `AGREEMENT_TITLE` references with `props.title`
- Conditionally render engagement type field based on `showEngagementType`
- Use `signEndpoint` for the POST URL
- Handle `successRedirect: null` to show a static success message (no auto-redirect)
- Show `personalNote` in a callout at the top if provided

**Step 3: Update the onboarding agreement page**

In `src/app/agreement/page.tsx`:

```typescript
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';

<AgreementForm
  userId={user.id}
  userEmail={user.email!}
  sections={AGREEMENT_SECTIONS}
  title={AGREEMENT_TITLE}
  department={profile.department}
  role={profile.role}
  isContractor={profile.is_contractor}
  onboarded={profile.onboarded}
  showEngagementType={true}
  signEndpoint="/api/agreement/sign"
  successRedirect={profile.onboarded === 0 ? '/onboarding' : '/'}
/>
```

**Step 4: Verify onboarding flow still works**

Manually test the existing onboarding agreement flow to ensure no regressions.

**Step 5: Commit**

```bash
git add src/components/agreement/AgreementForm.tsx src/app/agreement/page.tsx
git commit -m "refactor: make AgreementForm accept generic sections and config props"
```

---

## Task 6: PDF Parsing Endpoint

**Files:**
- Create: `src/app/api/external-signing/parse-pdf/route.ts`
- Install: `pdf-parse` package

**Step 1: Install pdf-parse**

```bash
npm install pdf-parse
npm install -D @types/pdf-parse
```

**Step 2: Write the failing test**

Create `src/__tests__/api-external-signing-parse-pdf.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('POST /api/external-signing/parse-pdf', () => {
  it('rejects non-admin users', async () => {
    // Mock a non-admin user and verify 403
  });

  it('rejects requests without a PDF file', async () => {
    // Mock admin user, send empty body, verify 400
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api-external-signing-parse-pdf.test.ts`

**Step 4: Implement the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  // 1. Auth check — must be admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 2. Extract PDF from form data
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'PDF file required' }, { status: 400 });
  }

  // 3. Parse PDF text
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await pdfParse(buffer);
  const rawText = parsed.text;

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 422 });
  }

  // 4. Use Claude API to parse into sections
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Parse the following legal document text into numbered sections. Extract each section's title and body content. Format the body as HTML with <p> for paragraphs and <ul>/<li> for lists.

Return ONLY a JSON array with this exact format, no markdown code fences:
[{"number": 1, "title": "Section Title", "content": "<p>HTML content...</p>"}]

If the document has no clear sections, create logical sections based on content breaks.

Document text:
${rawText}`,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'Failed to parse document' }, { status: 500 });
  }

  try {
    const sections = JSON.parse(textContent.text);
    return NextResponse.json({ sections, title: file.name.replace('.pdf', '') });
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api-external-signing-parse-pdf.test.ts`

**Step 6: Commit**

```bash
git add src/app/api/external-signing/parse-pdf/route.ts src/__tests__/api-external-signing-parse-pdf.test.ts package.json package-lock.json
git commit -m "feat: add PDF parsing endpoint with Claude API section extraction"
```

---

## Task 7: Create Invite Endpoint

**Files:**
- Create: `src/app/api/external-signing/invite/route.ts`

**Step 1: Write the failing test**

Create `src/__tests__/api-external-signing-invite.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('POST /api/external-signing/invite', () => {
  it('rejects missing recipient_email', () => {
    // Validate that empty email returns 400
  });

  it('rejects missing template_type', () => {
    // Validate that missing template_type returns 400
  });

  it('rejects invalid template_type', () => {
    // Validate that invalid template_type returns 400
  });

  it('rejects preset template with invalid template_id', () => {
    // Validate unknown template_id returns 400
  });

  it('rejects missing expires_at', () => {
    // Validate that missing expiration returns 400
  });

  it('rejects expires_at in the past', () => {
    // Validate past date returns 400
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api-external-signing-invite.test.ts`

**Step 3: Implement the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { getTemplateById } from '@/lib/external-agreement-templates';
import { sendExternalInviteEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  // 1. Auth — admin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 2. Validate body
  const body = await request.json();
  const { recipient_email, template_type, template_id, custom_sections, custom_title, personal_note, expires_at } = body;

  if (!recipient_email || typeof recipient_email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!template_type || !['preset', 'custom'].includes(template_type)) {
    return NextResponse.json({ error: 'template_type must be "preset" or "custom"' }, { status: 400 });
  }
  if (template_type === 'preset') {
    if (!template_id || !getTemplateById(template_id)) {
      return NextResponse.json({ error: 'Invalid template_id' }, { status: 400 });
    }
  }
  if (template_type === 'custom') {
    if (!custom_sections || !Array.isArray(custom_sections) || custom_sections.length === 0) {
      return NextResponse.json({ error: 'custom_sections required for custom template' }, { status: 400 });
    }
  }
  if (!expires_at) {
    return NextResponse.json({ error: 'expires_at required' }, { status: 400 });
  }
  const expiresDate = new Date(expires_at);
  if (expiresDate <= new Date()) {
    return NextResponse.json({ error: 'expires_at must be in the future' }, { status: 400 });
  }

  // 3. Generate token and verification code
  const token = randomBytes(32).toString('base64url');
  const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
  const hashedCode = await bcrypt.hash(verificationCode, 10);

  // 4. Get template name for email
  let templateName = custom_title || 'Document';
  if (template_type === 'preset') {
    const template = getTemplateById(template_id);
    templateName = template!.name;
  }

  // 5. Insert invite
  const service = getServiceClient();
  const { error: insertError } = await service
    .from('external_signing_invites')
    .insert({
      token,
      recipient_email,
      template_type,
      template_id: template_type === 'preset' ? template_id : null,
      custom_sections: template_type === 'custom' ? custom_sections : null,
      custom_title: template_type === 'custom' ? custom_title : null,
      personal_note: personal_note || null,
      expires_at: expiresDate.toISOString(),
      verification_code: hashedCode,
      status: 'pending',
      created_by: user.id,
    });

  if (insertError) {
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }

  // 6. Send invite email (non-blocking)
  sendExternalInviteEmail({
    recipientEmail: recipient_email,
    token,
    personalNote: personal_note,
    templateName,
    expiresAt: expiresDate,
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api-external-signing-invite.test.ts`

**Step 5: Commit**

```bash
git add src/app/api/external-signing/invite/route.ts src/__tests__/api-external-signing-invite.test.ts
git commit -m "feat: add external signing invite creation endpoint"
```

---

## Task 8: Get Invite Status Endpoint

**Files:**
- Create: `src/app/api/external-signing/[token]/route.ts`

**Step 1: Implement the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at, template_type, template_id, custom_title, personal_note')
    .eq('token', token)
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  // Check expiration
  if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
    await service
      .from('external_signing_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return NextResponse.json({ status: 'expired' });
  }

  if (invite.status === 'revoked') {
    return NextResponse.json({ status: 'revoked' });
  }

  if (invite.status === 'expired') {
    return NextResponse.json({ status: 'expired' });
  }

  if (invite.status === 'signed') {
    return NextResponse.json({ status: 'signed' });
  }

  // Mask email: j***@example.com
  const [local, domain] = invite.recipient_email.split('@');
  const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;

  // Get template name
  let templateName = invite.custom_title || 'Document';
  if (invite.template_type === 'preset' && invite.template_id) {
    const { getTemplateById } = await import('@/lib/external-agreement-templates');
    const template = getTemplateById(invite.template_id);
    templateName = template?.name || 'Document';
  }

  return NextResponse.json({
    status: invite.status,
    maskedEmail,
    templateName,
    personalNote: invite.personal_note,
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/external-signing/\[token\]/route.ts
git commit -m "feat: add external signing invite status endpoint"
```

---

## Task 9: Verify Code Endpoint

**Files:**
- Create: `src/app/api/external-signing/verify/route.ts`

**Step 1: Implement the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { getTemplateById } from '@/lib/external-agreement-templates';

export async function POST(request: NextRequest) {
  const { token, code } = await request.json();

  if (!token || !code) {
    return NextResponse.json({ error: 'Token and code required' }, { status: 400 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('*')
    .eq('token', token)
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  // Check status
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 });
  }

  // Check expiration
  if (new Date(invite.expires_at) < new Date()) {
    await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  // Check attempts
  if (invite.verification_attempts >= 3) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }

  // Increment attempts
  await service
    .from('external_signing_invites')
    .update({ verification_attempts: invite.verification_attempts + 1 })
    .eq('id', invite.id);

  // Verify code
  const valid = await bcrypt.compare(code, invite.verification_code);
  if (!valid) {
    const remaining = 2 - invite.verification_attempts;
    return NextResponse.json(
      { error: `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` },
      { status: 400 }
    );
  }

  // Mark as verified
  await service
    .from('external_signing_invites')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', invite.id);

  // Return sections
  let sections;
  let title;
  if (invite.template_type === 'preset') {
    const template = getTemplateById(invite.template_id);
    sections = template!.sections;
    title = template!.name;
  } else {
    sections = invite.custom_sections;
    title = invite.custom_title || 'Agreement';
  }

  return NextResponse.json({
    status: 'verified',
    sections,
    title,
    personalNote: invite.personal_note,
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/external-signing/verify/route.ts
git commit -m "feat: add external signing verification endpoint"
```

---

## Task 10: Send Verification Code Endpoint

**Files:**
- Create: `src/app/api/external-signing/send-code/route.ts`

**Step 1: Implement the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { sendVerificationCodeEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('id, recipient_email, status, expires_at')
    .eq('token', token)
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  // Generate new code, reset attempts
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hashedCode = await bcrypt.hash(code, 10);

  await service
    .from('external_signing_invites')
    .update({ verification_code: hashedCode, verification_attempts: 0 })
    .eq('id', invite.id);

  // Send email
  await sendVerificationCodeEmail({
    recipientEmail: invite.recipient_email,
    code,
  });

  return NextResponse.json({ success: true });
}
```

**Step 2: Commit**

```bash
git add src/app/api/external-signing/send-code/route.ts
git commit -m "feat: add send verification code endpoint for external signing"
```

---

## Task 11: External Sign Endpoint

**Files:**
- Create: `src/app/api/external-signing/sign/route.ts`

**Step 1: Write the failing test**

Create `src/__tests__/api-external-signing-sign.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('POST /api/external-signing/sign', () => {
  it('rejects missing token', () => {
    // 400
  });

  it('rejects missing full_name', () => {
    // 400
  });

  it('rejects missing address', () => {
    // 400
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api-external-signing-sign.test.ts`

**Step 3: Implement the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getTemplateById } from '@/lib/external-agreement-templates';
import { generateAgreementPdf } from '@/lib/agreement-pdf';
import { sendAgreementEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, full_name, address } = body;

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return NextResponse.json({ error: 'Full name required' }, { status: 400 });
  }
  if (!address || typeof address !== 'string' || !address.trim()) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }

  const service = getServiceClient();

  const { data: invite } = await service
    .from('external_signing_invites')
    .select('*')
    .eq('token', token)
    .single();

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  if (invite.status !== 'verified') {
    return NextResponse.json({ error: 'Invite must be verified before signing' }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await service.from('external_signing_invites').update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 });
  }

  // Capture IP + user agent
  const ip = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Resolve sections
  let sections;
  let title;
  if (invite.template_type === 'preset') {
    const template = getTemplateById(invite.template_id);
    sections = template!.sections;
    title = template!.name;
  } else {
    sections = invite.custom_sections;
    title = invite.custom_title || 'Agreement';
  }

  // Generate PDF
  const pdfBytes = await generateAgreementPdf({
    title,
    sections,
    signer: {
      fullName: full_name,
      address,
      email: invite.recipient_email,
      signedAt: new Date(),
    },
  });

  // Upload to storage
  const { error: uploadError } = await service.storage
    .from('agreements')
    .upload(`external/${invite.id}/agreement.pdf`, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('PDF upload error:', uploadError);
  }

  // Update invite record
  await service
    .from('external_signing_invites')
    .update({
      status: 'signed',
      signer_name: full_name,
      signer_address: address,
      signer_ip: ip,
      signer_user_agent: userAgent,
      signed_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  // Send emails (non-blocking)
  sendAgreementEmail({
    recipientEmail: invite.recipient_email,
    signerName: full_name,
    pdfBytes,
    title,
    sections,
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api-external-signing-sign.test.ts`

**Step 5: Commit**

```bash
git add src/app/api/external-signing/sign/route.ts src/__tests__/api-external-signing-sign.test.ts
git commit -m "feat: add external signing sign endpoint with PDF gen and email"
```

---

## Task 12: Revoke & Resend Endpoints

**Files:**
- Create: `src/app/api/external-signing/revoke/route.ts`
- Create: `src/app/api/external-signing/resend/route.ts`

**Step 1: Implement revoke**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { invite_id } = await request.json();
  if (!invite_id) return NextResponse.json({ error: 'invite_id required' }, { status: 400 });

  const service = getServiceClient();
  const { data: invite } = await service
    .from('external_signing_invites')
    .select('status')
    .eq('id', invite_id)
    .single();

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.status === 'signed') {
    return NextResponse.json({ error: 'Cannot revoke a signed invite' }, { status: 400 });
  }

  await service.from('external_signing_invites').update({ status: 'revoked' }).eq('id', invite_id);
  return NextResponse.json({ success: true });
}
```

**Step 2: Implement resend**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import bcrypt from 'bcryptjs';
import { sendExternalInviteEmail } from '@/lib/email';
import { getTemplateById } from '@/lib/external-agreement-templates';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { invite_id } = await request.json();
  if (!invite_id) return NextResponse.json({ error: 'invite_id required' }, { status: 400 });

  const service = getServiceClient();
  const { data: invite } = await service
    .from('external_signing_invites')
    .select('*')
    .eq('id', invite_id)
    .single();

  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.status === 'signed') return NextResponse.json({ error: 'Already signed' }, { status: 400 });
  if (invite.status === 'revoked') return NextResponse.json({ error: 'Invite is revoked' }, { status: 400 });

  // Generate new verification code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hashedCode = await bcrypt.hash(code, 10);

  await service
    .from('external_signing_invites')
    .update({
      verification_code: hashedCode,
      verification_attempts: 0,
      status: 'pending',
      verified_at: null,
    })
    .eq('id', invite_id);

  // Get template name
  let templateName = invite.custom_title || 'Document';
  if (invite.template_type === 'preset' && invite.template_id) {
    const template = getTemplateById(invite.template_id);
    templateName = template?.name || 'Document';
  }

  await sendExternalInviteEmail({
    recipientEmail: invite.recipient_email,
    token: invite.token,
    personalNote: invite.personal_note,
    templateName,
    expiresAt: new Date(invite.expires_at),
  });

  return NextResponse.json({ success: true });
}
```

**Step 3: Commit**

```bash
git add src/app/api/external-signing/revoke/route.ts src/app/api/external-signing/resend/route.ts
git commit -m "feat: add revoke and resend endpoints for external signing invites"
```

---

## Task 13: Public Signing Page

**Files:**
- Create: `src/app/sign/[token]/page.tsx`
- Create: `src/components/external-signing/VerificationForm.tsx`

**Step 1: Create the verification form component**

```typescript
'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, ShieldCheck, Loader2 } from 'lucide-react';

interface VerificationFormProps {
  token: string;
  maskedEmail: string;
  onVerified: (data: {
    sections: { number: number; title: string; content: string }[];
    title: string;
    personalNote?: string;
  }) => void;
}

export function VerificationForm({ token, maskedEmail, onVerified }: VerificationFormProps) {
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  async function handleSendCode() {
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/external-signing/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send code');
      }
      setCodeSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError('');
    try {
      const res = await fetch('/api/external-signing/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      onVerified(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <div className="rounded-full bg-white/5 p-4">
        <ShieldCheck className="h-8 w-8 text-white/60" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white">Verify your identity</h2>
        <p className="mt-2 text-sm text-white/50">
          A verification code will be sent to <span className="text-white/70">{maskedEmail}</span>
        </p>
      </div>

      {!codeSent ? (
        <button
          onClick={handleSendCode}
          disabled={sending}
          className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Send Verification Code
        </button>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-col items-center gap-4">
          <p className="text-sm text-white/50">Enter the 6-digit code sent to your email</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-48 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl font-mono tracking-[0.3em] text-white placeholder:text-white/20 focus:border-white/30 focus:outline-none"
          />
          <button
            type="submit"
            disabled={code.length !== 6 || verifying}
            className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </motion.div>
  );
}
```

**Step 2: Create the signing page**

```typescript
// src/app/sign/[token]/page.tsx
import { SigningPageClient } from './client';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ExternalSignPage({ params }: Props) {
  const { token } = await params;

  // Fetch initial status server-side
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/external-signing/${token}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#1a1a1a] p-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white">Link not found</h1>
          <p className="mt-2 text-sm text-white/50">This signing link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  const data = await res.json();
  return <SigningPageClient token={token} initialData={data} />;
}
```

**Step 3: Create the client component**

Create `src/app/sign/[token]/client.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { FileCheck, Clock, Ban } from 'lucide-react';
import { VerificationForm } from '@/components/external-signing/VerificationForm';
import { AgreementForm } from '@/components/agreement/AgreementForm';

interface SigningPageClientProps {
  token: string;
  initialData: {
    status: string;
    maskedEmail?: string;
    templateName?: string;
    personalNote?: string;
  };
}

export function SigningPageClient({ token, initialData }: SigningPageClientProps) {
  const [verified, setVerified] = useState(false);
  const [sections, setSections] = useState<{ number: number; title: string; content: string }[] | null>(null);
  const [title, setTitle] = useState(initialData.templateName || 'Agreement');
  const [personalNote, setPersonalNote] = useState(initialData.personalNote);

  // Terminal states
  if (initialData.status === 'signed') {
    return (
      <StatusPage
        icon={<FileCheck className="h-8 w-8 text-green-400" />}
        title="Document already signed"
        description="This document has already been signed. A copy was sent to your email."
      />
    );
  }

  if (initialData.status === 'expired') {
    return (
      <StatusPage
        icon={<Clock className="h-8 w-8 text-yellow-400" />}
        title="Link expired"
        description="This signing link has expired. Please contact the sender for a new link."
      />
    );
  }

  if (initialData.status === 'revoked') {
    return (
      <StatusPage
        icon={<Ban className="h-8 w-8 text-red-400" />}
        title="Link revoked"
        description="This signing link is no longer valid."
      />
    );
  }

  // Verification phase
  if (!verified || !sections) {
    return (
      <PageWrapper>
        <Logo />
        <h1 className="text-2xl font-bold text-white">You&apos;ve been invited to sign a document</h1>
        <p className="text-sm text-white/50">{initialData.templateName}</p>
        <VerificationForm
          token={token}
          maskedEmail={initialData.maskedEmail || '***'}
          onVerified={(data) => {
            setSections(data.sections);
            setTitle(data.title);
            setPersonalNote(data.personalNote);
            setVerified(true);
          }}
        />
      </PageWrapper>
    );
  }

  // Signing phase — reuse AgreementForm
  return (
    <div className="min-h-dvh bg-[#1a1a1a]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Logo />
        <AgreementForm
          userId=""
          userEmail=""
          sections={sections}
          title={title}
          showEngagementType={false}
          signEndpoint="/api/external-signing/sign"
          signPayloadExtra={{ token }}
          successRedirect={null}
          personalNote={personalNote}
        />
      </div>
    </div>
  );
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#1a1a1a] p-4">
      <div className="flex max-w-md flex-col items-center gap-6">{children}</div>
    </div>
  );
}

function StatusPage({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <PageWrapper>
      <Logo />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 text-center"
      >
        <div className="rounded-full bg-white/5 p-4">{icon}</div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="text-sm text-white/50">{description}</p>
      </motion.div>
    </PageWrapper>
  );
}

function Logo() {
  return (
    <div className="mb-4">
      <span className="text-lg font-bold text-white">SEEKO</span>
      <span className="ml-1 text-lg text-white/40">Studio</span>
    </div>
  );
}
```

**Step 4: Add `signPayloadExtra` prop to AgreementForm**

In `src/components/agreement/AgreementForm.tsx`, add an optional `signPayloadExtra` prop:

```typescript
signPayloadExtra?: Record<string, string>;
```

In the submit handler, spread it into the POST body:

```typescript
const res = await fetch(signEndpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    full_name: fullName,
    address,
    ...(showEngagementType ? { engagement_type: engagementType } : {}),
    ...signPayloadExtra,
  }),
});
```

**Step 5: Commit**

```bash
git add src/app/sign/\[token\]/page.tsx src/app/sign/\[token\]/client.tsx src/components/external-signing/VerificationForm.tsx src/components/agreement/AgreementForm.tsx
git commit -m "feat: add public external signing page with verification and agreement flow"
```

---

## Task 14: Update Proxy for Public Routes

**Files:**
- Modify: `src/proxy.ts`

**Step 1: Add `/sign` to public routes**

In the route classification section, add `/sign` to the list of routes that should be accessible without auth:

```typescript
const isSignRoute = pathname.startsWith('/sign');
```

Add `isSignRoute` to the condition that allows unauthenticated access (same as auth routes and public assets).

**Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: allow unauthenticated access to /sign routes in proxy"
```

---

## Task 15: Admin UI — External Signing Management Page

**Files:**
- Create: `src/app/(dashboard)/admin/external-signing/page.tsx`
- Create: `src/components/external-signing/SendInviteForm.tsx`
- Create: `src/components/external-signing/InviteTable.tsx`

**Step 1: Create the SendInviteForm component**

```typescript
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Upload, FileText, Loader2, X, Eye } from 'lucide-react';
import { EXTERNAL_TEMPLATES } from '@/lib/external-agreement-templates';
import { toast } from 'sonner';

interface SendInviteFormProps {
  onInviteSent: () => void;
}

export function SendInviteForm({ onInviteSent }: SendInviteFormProps) {
  const [email, setEmail] = useState('');
  const [templateMode, setTemplateMode] = useState<'preset' | 'upload'>('preset');
  const [templateId, setTemplateId] = useState(EXTERNAL_TEMPLATES[0]?.id || '');
  const [customSections, setCustomSections] = useState<{ number: number; title: string; content: string }[] | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [personalNote, setPersonalNote] = useState('');
  const [expiration, setExpiration] = useState('7');
  const [customDate, setCustomDate] = useState('');
  const [sending, setSending] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  async function handlePdfUpload(file: File) {
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/external-signing/parse-pdf', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse PDF');
      setCustomSections(data.sections);
      setCustomTitle(data.title);
      setShowPreview(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse PDF');
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);

    try {
      let expiresAt: Date;
      if (expiration === 'custom') {
        expiresAt = new Date(customDate);
      } else {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(expiration));
      }

      const payload: Record<string, unknown> = {
        recipient_email: email,
        template_type: templateMode === 'preset' ? 'preset' : 'custom',
        expires_at: expiresAt.toISOString(),
        personal_note: personalNote || undefined,
      };

      if (templateMode === 'preset') {
        payload.template_id = templateId;
      } else {
        payload.custom_sections = customSections;
        payload.custom_title = customTitle;
      }

      const res = await fetch('/api/external-signing/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send invite');
      }

      toast.success('Invite sent successfully');
      setEmail('');
      setPersonalNote('');
      setCustomSections(null);
      setCustomTitle('');
      setTemplateMode('preset');
      onInviteSent();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSending(false);
    }
  }

  const canSubmit = email && (templateMode === 'preset' ? templateId : customSections);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-semibold text-white">Send External Signing Invite</h2>

      {/* Email */}
      <div>
        <label className="mb-1 block text-sm text-white/60">Recipient Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="name@company.com"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
        />
      </div>

      {/* Template Mode Toggle */}
      <div>
        <label className="mb-1 block text-sm text-white/60">Document</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTemplateMode('preset')}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${templateMode === 'preset' ? 'bg-white text-black' : 'border border-white/10 text-white/60'}`}
          >
            <FileText className="h-4 w-4" /> Template
          </button>
          <button
            type="button"
            onClick={() => setTemplateMode('upload')}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${templateMode === 'upload' ? 'bg-white text-black' : 'border border-white/10 text-white/60'}`}
          >
            <Upload className="h-4 w-4" /> Upload PDF
          </button>
        </div>
      </div>

      {/* Preset Template Dropdown */}
      {templateMode === 'preset' && (
        <div>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
          >
            {EXTERNAL_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
            ))}
          </select>
        </div>
      )}

      {/* PDF Upload */}
      {templateMode === 'upload' && (
        <div>
          {!customSections ? (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 p-8 transition-colors hover:border-white/20">
              {parsing ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                  <span className="text-sm text-white/40">Parsing PDF...</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-white/40" />
                  <span className="text-sm text-white/40">Drop a PDF or click to upload</span>
                </>
              )}
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePdfUpload(file);
                }}
              />
            </label>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-white/40" />
                <span className="text-sm text-white">{customTitle}</span>
                <span className="text-xs text-white/40">{customSections.length} sections</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setShowPreview(!showPreview)} className="rounded p-1 hover:bg-white/10">
                  <Eye className="h-4 w-4 text-white/40" />
                </button>
                <button type="button" onClick={() => { setCustomSections(null); setCustomTitle(''); }} className="rounded p-1 hover:bg-white/10">
                  <X className="h-4 w-4 text-white/40" />
                </button>
              </div>
            </div>
          )}

          {/* Section Preview */}
          <AnimatePresence>
            {showPreview && customSections && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-4"
              >
                {customSections.map((s) => (
                  <div key={s.number} className="mb-3">
                    <h4 className="text-sm font-semibold text-white">{s.number}. {s.title}</h4>
                    <div className="mt-1 text-xs text-white/50" dangerouslySetInnerHTML={{ __html: s.content }} />
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Expiration */}
      <div>
        <label className="mb-1 block text-sm text-white/60">Expires in</label>
        <div className="flex gap-2">
          <select
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
          >
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="custom">Custom date</option>
          </select>
          {expiration === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
            />
          )}
        </div>
      </div>

      {/* Personal Note */}
      <div>
        <label className="mb-1 block text-sm text-white/60">Personal Note (optional)</label>
        <textarea
          value={personalNote}
          onChange={(e) => setPersonalNote(e.target.value)}
          rows={2}
          placeholder="Include a message for the recipient..."
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit || sending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send Invite
      </button>
    </form>
  );
}
```

**Step 2: Create the InviteTable component**

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RotateCw, Ban, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ExternalSigningInvite } from '@/lib/types';

interface InviteTableProps {
  refreshKey: number;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400',
  verified: 'bg-blue-500/10 text-blue-400',
  signed: 'bg-green-500/10 text-green-400',
  expired: 'bg-white/5 text-white/40',
  revoked: 'bg-red-500/10 text-red-400',
};

export function InviteTable({ refreshKey }: InviteTableProps) {
  const [invites, setInvites] = useState<ExternalSigningInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('external_signing_invites')
      .select('*')
      .order('created_at', { ascending: false });
    setInvites(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchInvites(); }, [fetchInvites, refreshKey]);

  async function handleAction(inviteId: string, action: 'revoke' | 'resend') {
    setActionLoading(inviteId);
    try {
      const res = await fetch(`/api/external-signing/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast.success(action === 'revoke' ? 'Invite revoked' : 'Invite resent');
      fetchInvites();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDownload(inviteId: string) {
    setActionLoading(inviteId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from('agreements')
        .download(`external/${inviteId}/agreement.pdf`);
      if (error || !data) throw new Error('Failed to download');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agreement-${inviteId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>;
  }

  if (invites.length === 0) {
    return <p className="py-8 text-center text-sm text-white/40">No invites sent yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-white/40">
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Document</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Sent</th>
            <th className="px-4 py-3 font-medium">Expires</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => (
            <tr key={invite.id} className="border-b border-white/5">
              <td className="px-4 py-3 text-white">{invite.recipient_email}</td>
              <td className="px-4 py-3 text-white/60">
                {invite.template_type === 'preset' ? invite.template_id : invite.custom_title || 'Custom'}
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[invite.status] || ''}`}>
                  {invite.status}
                </span>
              </td>
              <td className="px-4 py-3 text-white/40">
                {new Date(invite.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-white/40">
                {new Date(invite.expires_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {(invite.status === 'pending' || invite.status === 'verified') && (
                    <>
                      <button
                        onClick={() => handleAction(invite.id, 'resend')}
                        disabled={actionLoading === invite.id}
                        title="Resend"
                        className="rounded p-1.5 hover:bg-white/10"
                      >
                        <RotateCw className="h-4 w-4 text-white/40" />
                      </button>
                      <button
                        onClick={() => handleAction(invite.id, 'revoke')}
                        disabled={actionLoading === invite.id}
                        title="Revoke"
                        className="rounded p-1.5 hover:bg-white/10"
                      >
                        <Ban className="h-4 w-4 text-white/40" />
                      </button>
                    </>
                  )}
                  {invite.status === 'signed' && (
                    <button
                      onClick={() => handleDownload(invite.id)}
                      disabled={actionLoading === invite.id}
                      title="Download PDF"
                      className="rounded p-1.5 hover:bg-white/10"
                    >
                      <Download className="h-4 w-4 text-white/40" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 3: Create the admin page**

```typescript
// src/app/(dashboard)/admin/external-signing/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ExternalSigningAdmin } from './client';

export default async function ExternalSigningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) redirect('/');

  return <ExternalSigningAdmin />;
}
```

Create `src/app/(dashboard)/admin/external-signing/client.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { SendInviteForm } from '@/components/external-signing/SendInviteForm';
import { InviteTable } from '@/components/external-signing/InviteTable';

export function ExternalSigningAdmin() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">External Signing</h1>
        <p className="mt-1 text-sm text-white/50">Send documents for external parties to sign</p>
      </div>
      <SendInviteForm onInviteSent={() => setRefreshKey((k) => k + 1)} />
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Sent Invites</h2>
        <InviteTable refreshKey={refreshKey} />
      </div>
    </div>
  );
}
```

**Step 4: Add navigation link**

Find where admin navigation links are defined (likely in a sidebar or admin layout) and add a link to `/admin/external-signing` with label "External Signing".

**Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/external-signing/ src/components/external-signing/SendInviteForm.tsx src/components/external-signing/InviteTable.tsx
git commit -m "feat: add admin UI for external signing invite management"
```

---

## Task 16: Install Dependencies & Verify Build

**Step 1: Install new dependencies**

```bash
npm install pdf-parse @anthropic-ai/sdk bcryptjs
npm install -D @types/pdf-parse @types/bcryptjs
```

Note: Check if `bcryptjs` and `@anthropic-ai/sdk` are already installed (they may be from existing features).

**Step 2: Run the full test suite**

```bash
npx vitest run
```

**Step 3: Verify the build compiles**

```bash
npm run build
```

**Step 4: Fix any type errors or build failures**

**Step 5: Commit dependency changes if any**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdf-parse and anthropic SDK dependencies"
```

---

## Task 17: Add Admin RLS Policy for Invite Table

**Files:**
- Create: `supabase/migrations/20260309000001_external_signing_rls.sql`

**Step 1: Write the migration**

```sql
-- Allow admins to read external_signing_invites (for the admin table UI)
create policy "Admins can read external signing invites"
  on public.external_signing_invites
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.is_admin = true
    )
  );
```

Note: All write operations go through API routes using the service role client, so only a SELECT policy is needed for the admin UI table fetch.

**Step 2: Apply migration**

**Step 3: Commit**

```bash
git add supabase/migrations/20260309000001_external_signing_rls.sql
git commit -m "feat: add RLS policy for admin read access to external signing invites"
```

---

## Task Order & Dependencies

```
Task 1 (DB migration) ─────────────────────┐
Task 2 (Types + Templates) ─────────────────┤
                                             ├─► Task 7 (Invite endpoint)
Task 3 (Refactor PDF gen) ──────────────────┤   Task 8 (Status endpoint)
Task 4 (Refactor email) ───────────────────┤   Task 9 (Verify endpoint)
Task 5 (Refactor AgreementForm) ───────────┤   Task 10 (Send code endpoint)
                                             │   Task 11 (Sign endpoint)
Task 6 (Parse PDF endpoint) ───────────────┘   Task 12 (Revoke/Resend)
                                                     │
Task 14 (Proxy update) ────────────────────────────┤
                                                     │
                                                     ├─► Task 13 (Public signing page)
                                                     └─► Task 15 (Admin UI)
                                                              │
                                                     Task 16 (Deps + Build verify)
                                                     Task 17 (RLS policy)
```

Tasks 1-6 can be partially parallelized (1+2 in parallel, then 3+4+5+6 in parallel). Tasks 7-12 depend on 1-6. Tasks 13-15 depend on 7-12. Tasks 16-17 are final verification.
