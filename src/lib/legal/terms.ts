import type { LegalDoc } from './types';

export const termsOfUse: LegalDoc = {
  slug: 'terms',
  title: 'Terms of Use',
  shortTitle: 'Terms of Use',
  effectiveDate: 'July 4, 2026',
  intro:
    'SEEKO Studio is a private, invite-only workspace operated by SEEKO (‘the studio’, ‘we’) for coordinating our game development — tasks, documentation, team information, and payment records. These Terms of Use govern your access to the workspace at seeko-studio.onrender.com. By signing in with an invitation, you agree to them.',
  sections: [
    {
      heading: 'Acceptance of these terms',
      summary:
        'Signing in with an invitation means you agree to these terms; a signed contract with the studio wins where they conflict.',
      body: [
        {
          kind: 'p',
          text: 'These terms are a binding agreement between you and SEEKO. You accept them by accepting an invitation, creating an account, or using the workspace. If you do not agree, do not sign in — there is no other way to use the service.',
        },
        {
          kind: 'p',
          text: 'If you use the workspace as a developer or contractor, the Developer Portal Terms of Service also apply to that use and supplement these terms. If you have signed a separate written agreement with the studio — such as a contractor agreement or NDA — that agreement controls over these terms where the two conflict.',
        },
      ],
    },
    {
      heading: 'Eligibility and invitations',
      summary:
        'Access is invite-only and personal to you — you must be 18+, and you can’t hand your invitation or account to anyone else.',
      body: [
        {
          kind: 'p',
          text: 'The workspace is invite-only. There is no public signup: the studio admin invites team members, contractors, and investors individually by email, and access may be conditioned on an invite code sent to your email address. You may only use an invitation addressed to you, and you may not transfer your access to anyone else.',
        },
        {
          kind: 'p',
          text: 'You must be an adult (at least 18 years old, or the age of majority where you live) with the legal capacity to enter into this agreement. The workspace is a working tool for people collaborating with the studio, not a consumer product.',
        },
      ],
    },
    {
      heading: 'Accounts and credentials',
      summary:
        'Keep your password and passkeys to yourself, and tell us quickly if your account may be compromised.',
      body: [
        {
          kind: 'p',
          text: 'You sign in with an email address and password, or with your Google account. You are responsible for keeping your credentials confidential and for all activity under your account. Notify us promptly at legal@seekostudios.com if you believe your account has been compromised.',
        },
        {
          kind: 'p',
          text: 'Certain areas of the workspace — including the payments area — may require a registered passkey (a WebAuthn credential stored on your device). Passkeys registered to your account are credentials like any other: do not register a passkey on a shared or untrusted device, and remove passkeys from devices you no longer control.',
        },
      ],
    },
    {
      heading: 'Acceptable use',
      summary:
        'Use the workspace for studio work only — no sharing access, probing security, scraping, or uploading anything unlawful or malicious.',
      body: [
        {
          kind: 'p',
          text: 'The workspace exists to coordinate the studio’s work. Use it for that purpose and in compliance with applicable law. In particular, you agree not to:',
        },
        {
          kind: 'list',
          items: [
            'share your credentials, invite codes, or session with anyone else, or attempt to access another user’s account;',
            'attempt to bypass access controls, probe or test the service for vulnerabilities without permission, or interfere with its operation;',
            'copy, export, or disclose workspace content except as needed for your work with the studio;',
            'use automated tools to scrape or bulk-download workspace content;',
            'upload content that is unlawful, infringing, or malicious (including malware); or',
            'misrepresent your identity, role, or authority within the workspace.',
          ],
        },
      ],
    },
    {
      heading: 'Confidentiality',
      summary:
        'Everything in the workspace is confidential; keep it inside the studio, NDA or not, even after your access ends.',
      body: [
        {
          kind: 'p',
          text: 'The workspace contains confidential studio material — unreleased game content, internal documentation, task details, team information, and payment records. You agree to treat workspace content as confidential, to use it only for your work with the studio, and not to disclose it to anyone outside the studio without our permission.',
        },
        {
          kind: 'p',
          text: 'This obligation applies whether or not you have signed a separate NDA, and it survives the end of your access. If you have signed an NDA with the studio, the NDA’s terms apply in addition to — and where broader, instead of — this section.',
        },
      ],
    },
    {
      heading: 'Intellectual property',
      summary:
        'The studio owns the workspace and its materials; you get permission to use them for studio work, and your own prior work stays yours.',
      body: [
        {
          kind: 'p',
          text: 'The studio owns the workspace itself and all studio materials in it — the software, game content, documentation, designs, and other content we or our collaborators create for the studio. These terms give you a limited, revocable, non-transferable permission to access and use the workspace for your work with the studio; they do not transfer any ownership to you.',
        },
        {
          kind: 'p',
          text: 'You retain your rights in work you created before, and independently of, your engagement with the studio. Ownership of work you create for the studio is governed by your separate agreement with us (for example a contractor agreement), not by these terms.',
        },
      ],
    },
    {
      heading: 'NDA signing and electronic records',
      summary:
        'The in-app NDA signing is legally binding, and we record your name, address, IP, and browser as evidence of the signature.',
      body: [
        {
          kind: 'p',
          text: 'The studio NDA is a separate agreement between you and the studio; these terms do not replace or modify it. The workspace provides a tool for signing it electronically: when you sign, we record your typed legal name, typed address, IP address, browser user agent, and a timestamp as evidence of the signature. External signers may sign through a one-time code sent to their email address.',
        },
        {
          kind: 'p',
          text: 'By using the in-app signing flow, you consent to transact electronically and agree that your electronic signature is valid and enforceable to the same extent as a handwritten one, consistent with the U.S. ESIGN Act and applicable state law (including UETA). If you prefer to sign on paper, contact us before signing electronically.',
        },
      ],
    },
    {
      heading: 'Payments ledger — records only',
      summary:
        'The payments area is a record book, not a payment system — no money moves through the app, and entries can be corrected if wrong.',
      body: [
        {
          kind: 'p',
          text: 'The payments area of the workspace is a ledger: it records payment amounts, currencies, descriptions, line items, recipients, and statuses so the studio and its collaborators can track what is owed and what has been paid. The workspace does not process card payments, hold or transmit funds, or move money — actual payment happens outside the app through whatever method you and the studio arrange.',
        },
        {
          kind: 'p',
          text: 'The studio is not a bank, money transmitter, or payment processor. A ledger entry is a record, not a promise to pay by itself — your right to payment comes from your separate agreement or arrangement with the studio. If a ledger entry looks wrong, tell us and we will correct the record.',
        },
      ],
    },
    {
      heading: 'Termination and revocation of access',
      summary:
        'The studio can suspend or revoke access at any time; confidentiality and a few other obligations survive after it ends.',
      body: [
        {
          kind: 'p',
          text: 'Because the workspace is invite-only, access is at the studio’s discretion. We may suspend or revoke your access at any time — for example when your engagement with the studio ends, if you violate these terms, or to protect the security of the workspace. You may stop using the workspace at any time, and you can ask us to delete your account by emailing legal@seekostudios.com.',
        },
        {
          kind: 'p',
          text: 'Sections that by their nature should survive — including confidentiality, intellectual property, the electronic-records consent, disclaimers, limitation of liability, and governing law — survive termination. Records we are required or reasonably need to keep (such as NDA signature records and payment records) are retained as described in our Privacy Policy.',
        },
      ],
    },
    {
      heading: 'Disclaimers',
      summary:
        'The workspace is provided as-is — we don’t guarantee it will always be up, error-free, or perfectly current.',
      body: [
        {
          kind: 'p',
          text: 'The workspace is an internal working tool for a small studio, provided ‘as is’ and ‘as available’. To the fullest extent permitted by law, we disclaim all warranties, express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not promise that the workspace will be uninterrupted, error-free, or secure, or that its content (including task, milestone, and payment records) is complete or current at any given moment.',
        },
      ],
    },
    {
      heading: 'Limitation of liability',
      summary:
        'Our liability for anything relating to the workspace is capped at US $100, except where the law doesn’t allow a cap.',
      body: [
        {
          kind: 'p',
          text: 'To the fullest extent permitted by law: the studio will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits, lost data, or loss of goodwill, arising out of or relating to the workspace, even if we have been advised of the possibility. Our total liability for all claims relating to the workspace will not exceed one hundred U.S. dollars (US $100). These limits do not apply to liability that cannot be limited under applicable law, and they do not limit either party’s obligations under a separately signed NDA or contractor agreement.',
        },
      ],
    },
    {
      heading: 'Changes to these terms',
      summary:
        'We may update these terms; material changes update the date above and come with notice, and continued use means acceptance.',
      body: [
        {
          kind: 'p',
          text: 'We may update these terms from time to time as the workspace changes. When we make material changes, we will update the effective date above and take reasonable steps to notify active users — for example by email or a notice in the workspace. Continuing to use the workspace after a change takes effect means you accept the updated terms; if you do not accept them, stop using the workspace and contact us.',
        },
      ],
    },
    {
      heading: 'Governing law and disputes',
      summary:
        'Delaware law governs, and any dispute goes to Delaware courts.',
      body: [
        {
          kind: 'p',
          text: 'These terms are governed by the laws of the State of Delaware, USA, without regard to its conflict-of-laws rules. Any dispute arising out of or relating to these terms or the workspace will be resolved exclusively in the state or federal courts located in Delaware, and you and the studio each consent to personal jurisdiction and venue there.',
        },
        {
          kind: 'p',
          text: 'If any provision of these terms is found unenforceable, the rest remain in effect. Our failure to enforce a provision is not a waiver of it. These terms, together with the Developer Portal Terms of Service, the Privacy Policy, and any separately signed agreements, are the entire agreement between you and the studio about the workspace.',
        },
      ],
    },
    {
      heading: 'Contact',
      body: [
        {
          kind: 'p',
          text: 'Questions about these terms, your account, or your access can be sent to SEEKO at legal@seekostudios.com. We read everything — the studio is small, and this inbox reaches the person who runs the workspace.',
        },
      ],
    },
  ],
};
