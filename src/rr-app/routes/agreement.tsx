import { useState } from 'react';
import { Link, useLoaderData, useNavigate, type LoaderFunctionArgs } from 'react-router';
import { CheckCircle2, Loader2, PenLine } from 'lucide-react';

type AgreementSection = {
  number: number;
  title: string;
  content: string;
};

type AgreementIndexData =
  | { status: 'ready'; userId: string; userEmail: string; title: string; sections: AgreementSection[]; department: string; role: string; isContractor: boolean; onboarded: number }
  | { status: 'admin_exempt'; redirect: string }
  | { status: 'already_signed'; redirect: string };

type AgreementLoaderData =
  | { status: 'ready'; index: Extract<AgreementIndexData, { status: 'ready' }> }
  | { status: 'admin_exempt'; redirect: string }
  | { status: 'already_signed'; redirect: string }
  | { status: 'unauthorized' };

export async function agreementLoader(_args: LoaderFunctionArgs): Promise<AgreementLoaderData> {
  const response = await fetch('/api/agreement-index');

  if (response.status === 401) return { status: 'unauthorized' };

  if (!response.ok) {
    throw new Response('Unable to load agreement', { status: response.status });
  }

  const body = (await response.json()) as AgreementIndexData;
  if (body.status === 'ready') return { status: 'ready', index: body };
  return body;
}

export function AgreementRoute() {
  const data = useLoaderData() as AgreementLoaderData;
  return <AgreementRouteContent data={data} />;
}

export function AgreementRouteContent({ data }: { data: AgreementLoaderData }) {
  if (data.status === 'unauthorized') {
    return <State title="Sign in required" description="Use your SEEKO account to sign the onboarding agreement." action="/login" />;
  }

  if (data.status === 'admin_exempt') {
    return <State title="Agreement not required" description="Admins are exempt from the onboarding agreement." action={data.redirect} />;
  }

  if (data.status === 'already_signed') {
    return <State title="Agreement already signed" description="Your signed agreement is already on file." action={data.redirect} />;
  }

  return <AgreementForm index={data.index} />;
}

function AgreementForm({ index }: { index: Extract<AgreementIndexData, { status: 'ready' }> }) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [engagementType, setEngagementType] = useState(index.isContractor ? 'contractor' : 'team_member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch('/api/agreement/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        address,
        engagement_type: engagementType,
      }),
    });

    const body = await response.json().catch(() => null) as { error?: string; redirect?: string } | null;

    if (!response.ok) {
      setError(body?.error || 'Failed to sign agreement.');
      setSaving(false);
      return;
    }

    navigate(body?.redirect || (index.onboarded === 0 ? '/onboarding' : '/issues'));
  }

  return (
    <section className="rr-agreement-page">
      <div className="rr-agreement">
        <div className="rr-auth-heading">
          <img src="/seeko-s.png" alt="" className="rr-auth-logo" />
          <h1>{index.title}</h1>
          <p>Please review and sign the agreement below to continue.</p>
        </div>

        <div className="rr-agreement-doc">
          {index.sections.map((section) => (
            <section key={section.number}>
              <h2>{section.number}. {section.title}</h2>
              <div dangerouslySetInnerHTML={{ __html: section.content }} />
            </section>
          ))}
        </div>

        <form className="rr-agreement-form" onSubmit={handleSubmit}>
          <div className="rr-agreement-form-heading">
            <PenLine className="size-4" />
            <h2>Signature</h2>
          </div>

          <label>
            <span>Full legal name</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </label>

          <label>
            <span>Address</span>
            <textarea value={address} onChange={(event) => setAddress(event.target.value)} required rows={3} />
          </label>

          <label>
            <span>Engagement type</span>
            <select value={engagementType} onChange={(event) => setEngagementType(event.target.value)}>
              <option value="team_member">Team member</option>
              <option value="contractor">Contractor</option>
            </select>
          </label>

          {error ? <p className="rr-auth-error">{error}</p> : null}

          <button className="rr-auth-submit" type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Signing...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Sign agreement
              </>
            )}
          </button>
        </form>
      </div>
    </section>
  );
}

function State({ title, description, action }: { title: string; description: string; action: string }) {
  return (
    <section className="rr-auth-page">
      <div className="rr-auth-card">
        <img src="/seeko-s.png" alt="" className="rr-auth-logo" />
        <div className="rr-auth-heading">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Link className="rr-auth-submit" to={action}>Continue</Link>
      </div>
    </section>
  );
}
