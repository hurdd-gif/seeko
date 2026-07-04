import type { LegalDoc } from './types';

export const privacyPolicy: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  shortTitle: 'Privacy Policy',
  effectiveDate: 'July 4, 2026',
  intro:
    'SEEKO Studio is a private, invite-only workspace operated by SEEKO (‘the studio’, ‘we’) for the people who work with us — team members, contractors, and investors. This policy explains what personal information the workspace collects, why, who processes it on our behalf, and the choices you have. It is written to be read, not skimmed: the workspace is small and so is the list of things we do with your data.',
  sections: [
    {
      heading: 'Who we are and what this covers',
      body: [
        {
          kind: 'p',
          text: 'This policy covers the SEEKO Studio workspace at seeko-studio.onrender.com and the data it handles about invited users. There is no public signup and no public-facing product: everyone in the workspace was invited by the studio admin by email. This policy does not cover services we link to but do not operate — for example Google’s or Telegram’s own handling of your accounts with them.',
        },
      ],
    },
    {
      heading: 'Information we collect',
      body: [
        {
          kind: 'p',
          text: 'We collect only what the workspace needs to function. By category:',
        },
        {
          kind: 'defs',
          entries: [
            {
              term: 'Account',
              def: 'Your email address and a password (stored by Supabase as a hash — we never see or store the password itself), or your Google account identifiers if you sign in with Google. Invitations use an 8-digit code sent to your email.',
            },
            {
              term: 'Profile',
              def: 'Your display name, department, role, and flags the admin sets (admin, contractor, investor) that control what you can see.',
            },
            {
              term: 'Authentication devices',
              def: 'If you register a passkey to unlock the payments area: the credential ID, its public key, a device name, and when it was created and last used. The private key never leaves your device.',
            },
            {
              term: 'NDA signature records',
              def: 'If you sign the studio NDA in-app: the legal name and address you type, your IP address, your browser user agent, and a timestamp. External signers additionally verify through a one-time code emailed to them.',
            },
            {
              term: 'Workspace activity',
              def: 'The content you and others create in the workspace — tasks, documents, notes, milestones — plus an activity log of task changes (status, assignee, progress) with who made each change and when.',
            },
            {
              term: 'Payment records',
              def: 'Ledger entries about payments to collaborators: amounts, currencies, descriptions, line items, recipient identity (a profile, or an external payee’s name or email), and status. No card numbers or bank details — money moves outside the app.',
            },
            {
              term: 'Communications',
              def: 'Transactional emails we send you via Resend (invitations, NDA notifications). If the admin uses the private Telegram bot, note text, source, and timestamps are captured into the notes inbox.',
            },
            {
              term: 'Technical',
              def: 'IP address and browser user agent, collected for security purposes such as protecting sign-in and evidencing NDA signatures. We do not run advertising or cross-site tracking.',
            },
          ],
        },
      ],
    },
    {
      heading: 'How we use information',
      body: [
        {
          kind: 'p',
          text: 'We use the information above to:',
        },
        {
          kind: 'list',
          items: [
            'operate the workspace — sign you in, show you the tasks, docs, and records your role permits, and keep the team coordinated;',
            'keep the workspace secure — authenticate devices, gate the payments area behind passkeys, and investigate suspicious access;',
            'maintain legally meaningful records — in particular NDA e-signature records (name, address, IP, user agent, timestamp) that make the signature enforceable;',
            'pay collaborators — track what is owed and paid in the ledger and identify recipients; and',
            'comply with legal obligations, such as keeping records of contracts and payments.',
          ],
        },
        {
          kind: 'p',
          text: 'We do not use your data for advertising, profiling, or any automated decision-making with legal effects.',
        },
      ],
    },
    {
      heading: 'Legal bases for processing',
      body: [
        {
          kind: 'p',
          text: 'Where laws like the GDPR apply, our legal bases are the practical ones you would expect. We process account, profile, workspace, and payment data to perform our working relationship with you (contract). We process technical and security data — IPs, user agents, activity logs, passkey records — because we have a legitimate interest in keeping a confidential workspace secure and its records accurate. We retain NDA and payment records to comply with legal obligations. Where we rely on consent — for example if you choose to sign the NDA electronically or register a passkey — you can decline, and we will tell you what the alternative is.',
        },
      ],
    },
    {
      heading: 'How we share information',
      body: [
        {
          kind: 'p',
          text: 'We do not sell personal information and we do not share it for advertising — not now, not ever, in the CCPA’s sense of ‘sell’ or ‘share’ or anyone else’s. Your information is visible inside the workspace to other invited users according to their roles (for example, the team roster shows names, departments, and roles), and it is processed by a short list of service providers acting on our instructions:',
        },
        {
          kind: 'defs',
          entries: [
            {
              term: 'Supabase',
              def: 'Authentication and our Postgres database — where accounts, profiles, workspace content, NDA records, and payment records live.',
            },
            {
              term: 'Render',
              def: 'Hosting for the application itself.',
            },
            {
              term: 'Resend',
              def: 'Delivery of transactional email — invites and NDA notifications.',
            },
            {
              term: 'Google',
              def: 'Sign-in with Google, if you choose it. Google confirms your identity to us; your Google account remains governed by Google’s own terms.',
            },
            {
              term: 'Telegram',
              def: 'Only if the admin uses the optional notes bot: note text passes through Telegram’s messaging service on its way into the workspace.',
            },
          ],
        },
        {
          kind: 'p',
          text: 'Beyond these providers, we disclose personal information only if the law requires it, to enforce our agreements, or to protect the studio, our users, or others — and in a business transfer (such as a sale of the studio), where this policy would continue to apply to the transferred data.',
        },
      ],
    },
    {
      heading: 'How long we keep information',
      body: [
        {
          kind: 'p',
          text: 'Account, profile, and workspace data are kept while you have access to the workspace. When your engagement ends and your access is revoked or your account is deleted, we delete or de-identify data we no longer need.',
        },
        {
          kind: 'p',
          text: 'Two categories are kept longer, deliberately: NDA and e-signature records (including the IP, user agent, and timestamp that evidence the signature) and payment records are retained for as long as legally necessary — typically for the duration of the underlying agreement plus applicable limitation and tax-record periods — even after you leave. These records exist precisely to remain reliable after the fact, so deletion requests cannot remove them early.',
        },
      ],
    },
    {
      heading: 'How we protect information',
      body: [
        {
          kind: 'p',
          text: 'In plain language: connections to the workspace are encrypted in transit; passwords are stored only as hashes by Supabase; the payments area is gated behind passkeys, which are phishing-resistant hardware-bound credentials; database access is governed by row-level security rules so users can only read what their role permits; and privileged service keys are kept server-side, out of the browser, and used on a least-privilege basis. No system is perfectly secure, but the attack surface here is small by design — a private workspace with a short, known user list.',
        },
      ],
    },
    {
      heading: 'Your rights and choices',
      body: [
        {
          kind: 'p',
          text: 'You can ask us to access, correct, or delete your personal information, or to export a copy of it, by emailing legal@seekostudios.com. We will verify you are who you say you are (usually by confirming through your workspace email) and respond within the timelines applicable law requires — under the GDPR, generally one month; under the CCPA, generally 45 days. We will never treat you differently for exercising these rights.',
        },
        {
          kind: 'p',
          text: 'Two honest caveats. First, NDA signature records and payment records may be retained even after a deletion request, where we are legally required or entitled to keep them — we will tell you exactly what we kept and why. Second, content woven into shared studio records (like a task’s change history) may be de-identified rather than erased, so the studio’s records stay coherent. If you believe we have not handled a request properly, you can complain to your local data-protection authority in addition to contacting us.',
        },
      ],
    },
    {
      heading: 'International transfers',
      body: [
        {
          kind: 'p',
          text: 'The workspace is hosted in the United States, and our service providers process data there. If you access it from outside the U.S. — including from the EEA, UK, or Switzerland — your information is transferred to the U.S., where privacy laws differ from your home jurisdiction’s. Where required, we rely on our providers’ safeguards for such transfers, such as standard contractual clauses and participation in the EU–U.S. Data Privacy Framework.',
        },
      ],
    },
    {
      heading: 'Children',
      body: [
        {
          kind: 'p',
          text: 'The workspace is for adults working with the studio and is not directed at children. We do not knowingly collect personal information from anyone under 16, and no one under 16 is invited. If you believe a minor’s information has ended up in the workspace, contact us and we will delete it.',
        },
      ],
    },
    {
      heading: 'Changes to this policy',
      body: [
        {
          kind: 'p',
          text: 'If we change what we collect, how we use it, or who processes it, we will update this policy and its effective date, and notify active users of material changes by email or a notice in the workspace before they take effect. Because every user is individually known to us, you will actually hear about changes — this is not a policy that quietly rewrites itself.',
        },
      ],
    },
    {
      heading: 'Contact',
      body: [
        {
          kind: 'p',
          text: 'For anything in this policy — questions, rights requests, corrections, or concerns — contact SEEKO at legal@seekostudios.com. The studio is small; your message goes to the person responsible for the workspace and its data.',
        },
      ],
    },
  ],
};
