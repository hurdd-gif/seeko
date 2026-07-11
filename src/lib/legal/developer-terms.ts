import type { LegalDoc } from './types';

export const developerTerms: LegalDoc = {
  slug: 'developer-terms',
  title: 'Developer Portal Terms of Service',
  shortTitle: 'Developer Portal Terms',
  effectiveDate: 'July 4, 2026',
  intro:
    'The Developer Portal is the SEEKO Studio workspace as used by developers and contractors — viewing and claiming tasks (some carrying bounty amounts), submitting work for review, reading restricted documentation, and seeing payments recorded in the studio ledger. These terms, from SEEKO (‘the studio’, ‘we’), govern that use. They supplement the Terms of Use; they do not replace your separate contractor agreement or NDA.',
  sections: [
    {
      heading: 'Relationship to the Terms of Use',
      summary:
        'These terms add to the Terms of Use for developer work; a signed contractor agreement or NDA still wins over both.',
      body: [
        {
          kind: 'p',
          text: 'These terms apply in addition to the SEEKO Studio Terms of Use, which continue to govern your account, acceptable use, confidentiality, and everything else about the workspace. If these terms and the Terms of Use conflict on a point about your use of the portal as a developer or contractor, these terms control for that point.',
        },
        {
          kind: 'p',
          text: 'If you have signed a separate written agreement with the studio — a contractor agreement, NDA, or similar — that agreement controls over both documents where they conflict. These portal terms describe how the tool works; your commercial relationship with the studio lives in those separate agreements.',
        },
      ],
    },
    {
      heading: 'Portal access and scope',
      summary:
        'What you can see in the portal is a permission set by the admin, and it can change with your engagement.',
      body: [
        {
          kind: 'p',
          text: 'Portal access is granted by invitation only and is scoped to your engagement with the studio. Depending on your role and flags set by the admin, you may see tasks, milestones, documentation, the team roster, activity feeds, and payment records that concern you. Access to any particular area is a permission, not an entitlement — the studio decides what each account can see and may adjust it at any time.',
        },
      ],
    },
    {
      heading: 'Tasks, claims, and bounties',
      summary:
        'Claiming a task signals intent, not a contract; a bounty becomes payable only when the studio accepts the finished work.',
      body: [
        {
          kind: 'p',
          text: 'The studio posts tasks in the portal, some with a bounty — an amount the studio offers for completing the task to its satisfaction. Claiming or being assigned a task means you intend to do the work; it does not by itself create an obligation on either side beyond what your separate agreement with the studio provides. Task details, deadlines, priorities, and bounty amounts may be changed or withdrawn by the studio before a task is accepted for work, and tasks may be reassigned if work stalls.',
        },
        {
          kind: 'p',
          text: 'A bounty shown on a task is an offer amount recorded for coordination. It becomes payable only when the studio accepts the completed work, and it is then recorded in the payments ledger as described below.',
        },
      ],
    },
    {
      heading: 'Review and acceptance of work',
      summary:
        'Submitted work is reviewed and may be accepted, sent back, or rejected — statuses in the portal track where it stands.',
      body: [
        {
          kind: 'p',
          text: 'Submitted work goes through review — the studio may accept it, request changes, or reject it if it does not meet the task description or the studio’s reasonable quality standards. Task statuses in the portal (such as ‘In Review’ or ‘Done’) track this process. Acceptance decisions are made by the studio in good faith; if you think a decision is wrong, raise it with us directly at legal@seekostudios.com.',
        },
      ],
    },
    {
      heading: 'Payment, taxes, and the ledger',
      summary:
        'The ledger records what you’re owed and paid; money moves outside the app, and your taxes are your responsibility.',
      body: [
        {
          kind: 'p',
          text: 'Amounts owed to you are recorded in the workspace payments ledger — amounts, currency, descriptions, line items, and status. The portal does not move money: actual payment happens outside the app through the method you and the studio arrange, and a ledger entry marked ‘paid’ records that such a payment was made. The studio is not a payment processor or money transmitter.',
        },
        {
          kind: 'p',
          text: 'You are responsible for your own taxes on amounts the studio pays you, including income and self-employment taxes and any required registrations or filings in your jurisdiction. The studio does not withhold taxes from bounty or contractor payments unless the law requires it to.',
        },
      ],
    },
    {
      heading: 'Independent-contractor status',
      summary:
        'Using the portal doesn’t make you an employee — you work as an independent contractor unless a signed agreement says otherwise.',
      body: [
        {
          kind: 'p',
          text: 'Using the portal does not make you an employee, agent, partner, or joint venturer of the studio. Unless a separate written agreement says otherwise, you work as an independent contractor: you choose how and when to do the work, you use your own equipment, and you are not entitled to employee benefits. Nothing in these terms gives you authority to act or make commitments on the studio’s behalf.',
        },
      ],
    },
    {
      heading: 'Work submissions and intellectual property',
      summary:
        'Who owns your work is decided by your contractor agreement, not these terms; you promise what you submit is yours and clean.',
      body: [
        {
          kind: 'p',
          text: 'Ownership of work you create for the studio — code, art, animation, assets, documentation — is governed by your separate contractor agreement or NDA with the studio. These portal terms do not transfer intellectual property by themselves; they only govern the tool you use to claim tasks and submit that work.',
        },
        {
          kind: 'p',
          text: 'When you submit work through or in connection with the portal, you represent that it is your own (or that you have the rights needed to submit it), that it does not knowingly infringe anyone else’s rights, and that it contains no malicious code. You keep your rights in pre-existing tools, libraries, and techniques you bring to the work, subject to whatever license your separate agreement grants the studio to use them in the deliverables.',
        },
      ],
    },
    {
      heading: 'Restricted documentation and granted access',
      summary:
        'Access grants to restricted docs are personal — read them for your work, don’t forward or keep them.',
      body: [
        {
          kind: 'p',
          text: 'Some documentation in the portal is restricted by department, or shared with you individually by an access grant. A grant is personal: it lets you read the document for your work, not republish, forward, or retain it beyond your engagement. Do not attempt to access documents your account is not granted, and do not share restricted content with other portal users who lack access to it — the studio controls who sees what.',
        },
        {
          kind: 'p',
          text: 'All portal content remains confidential studio material under the Terms of Use and any NDA you have signed, whether or not a specific document is marked restricted.',
        },
      ],
    },
    {
      heading: 'Security obligations',
      summary:
        'Keep your credentials and devices to yourself, don’t scrape or probe the portal, and report anything you shouldn’t have seen.',
      body: [
        {
          kind: 'p',
          text: 'Because the portal holds unreleased game content and payment records, we hold portal users to a few concrete security rules:',
        },
        {
          kind: 'list',
          items: [
            'do not share your password, passkeys, invite codes, or signed-in sessions with anyone — including other members of the studio;',
            'do not scrape the portal or access it with bots, crawlers, or other automated tools; use the interface as a person;',
            'do not probe, scan, or test the portal for vulnerabilities, or attempt to bypass access restrictions;',
            'if you discover a vulnerability or accidentally access data you should not see, stop, do not share or exploit it, and report it privately to legal@seekostudios.com; and',
            'keep the devices you use to access the portal reasonably secure — screen locks, current software, no shared logins.',
          ],
        },
      ],
    },
    {
      heading: 'Suspension and revocation',
      summary:
        'Access can be revoked at any time, but money genuinely owed for accepted work stays owed.',
      body: [
        {
          kind: 'p',
          text: 'The studio may suspend or revoke portal access at any time — when an engagement ends, when these terms or the Terms of Use are violated, or when needed to protect the workspace or its content. Revocation of access does not erase obligations that have already accrued: amounts genuinely owed for accepted work remain owed under your separate agreement, and your confidentiality obligations survive.',
        },
      ],
    },
    {
      heading: 'Disclaimers',
      summary:
        'Portal records are working documents kept by a small team — as-is, with genuine mistakes corrected when flagged.',
      body: [
        {
          kind: 'p',
          text: 'The portal is provided ‘as is’ and ‘as available’, and the disclaimers and limitation of liability in the Terms of Use apply fully to your use of it. In particular, the studio does not warrant that task listings, bounty amounts, statuses, or ledger entries are error-free at any given moment — they are working records maintained by a small team, and we correct genuine mistakes when they are pointed out.',
        },
      ],
    },
    {
      heading: 'Contact',
      body: [
        {
          kind: 'p',
          text: 'Questions about the portal, a task, a review decision, or a ledger entry can be sent to SEEKO at legal@seekostudios.com.',
        },
      ],
    },
  ],
};
