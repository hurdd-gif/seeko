import { afterEach, describe, expect, it, vi } from 'vitest';
import { app, createApiApp } from '../app';

/** The actor the route bound its service client to. supabase-js puts global
 *  headers on every request the client builds; postgrest-js holds them in a
 *  `Headers` instance, which JSON.stringify()s to `{}` — read them via entries()
 *  or the assertion passes without checking anything. */
function actorOf(service: unknown): string | undefined {
  const builder = (service as { from: (t: string) => { select: (c: string) => { headers: Headers } } })
    .from('tasks')
    .select('id');
  return Object.fromEntries(builder.headers.entries())['x-seeko-actor'];
}

describe('API server', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('exposes a health endpoint', async () => {
    const response = await app.request('/api/health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      service: 'seeko-api',
      runtime: 'hono',
    });
  });

  it('requires auth before running EKO', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Summarize tasks' }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('validates EKO chat payloads', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Message is required' });
  });

  it('requires an approval decision in approval mode', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Create Issue A', mode: 'approval' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Approval decision is required' });
  });

  it('never creates a new approval from a bare confirmation chat message', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });

    for (const message of ['Yes', 'go ahead', 'do it', 'Okay!', 'approve it', 'yep.']) {
      const response = await testApp.request('/api/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, mode: 'chat' }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        reply: 'Use the Approve button on the pending action, or tell EKO the specific action you want prepared. Writes stay gated until approved.',
        provider: 'anthropic',
        model: 'eko-local',
      });
    }
  });

  it('runs EKO through an injected agent runner', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      agentRunner: async (input, user) => ({
        reply: `Handled ${input.mode ?? 'chat'} for ${user.email}: ${input.message}`,
        provider: 'anthropic',
        model: 'test-model',
      }),
    });

    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Summarize tasks', mode: 'chat' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: 'Handled chat for member@example.invalid: Summarize tasks',
      provider: 'anthropic',
      model: 'test-model',
    });
  });

  it('returns a config error when the EKO Anthropic key is missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });
    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Summarize tasks' }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Missing ANTHROPIC_API_KEY for EKO.' });
  });

  it('requires pendingActionIds to approve', async () => {
    const testApp = createApiApp({
      agentAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
    });
    const response = await testApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '', mode: 'approval', decision: 'approve' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'pendingActionIds are required to approve' });
  });

  it('redirects after signout', async () => {
    const testApp = createApiApp({
      authSignOut: async () => {},
    });
    const response = await testApp.request('/auth/signout', { method: 'POST' });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/login');
  });

  it('returns 404 for a missing invoice request token', async () => {
    const testApp = createApiApp({
      invoiceLoader: async () => ({ found: false, initialData: { status: 'not_found' } }),
    });

    const response = await testApp.request('/api/invoice-request/missing-token');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Invite not found' });
  });

  it('returns invoice request data for a valid token', async () => {
    let receivedSessionToken: string | null | undefined;
    const testApp = createApiApp({
      invoiceLoader: async (_token, sessionToken) => {
        receivedSessionToken = sessionToken;
        return {
          found: true,
          initialData: {
            status: 'pending',
            maskedEmail: 'r********@example.invalid',
            expiresAt: '2026-06-20T00:00:00.000Z',
          },
        };
      },
    });

    const response = await testApp.request('/api/invoice-request/pending-token', {
      headers: { cookie: 'invoice_request_session=session-123' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedSessionToken).toBe('session-123');
    expect(body).toEqual({
      status: 'pending',
      maskedEmail: 'r********@example.invalid',
      expiresAt: '2026-06-20T00:00:00.000Z',
    });
  });

  it('returns expired invoice request data', async () => {
    const testApp = createApiApp({
      invoiceLoader: async () => ({ found: true, initialData: { status: 'expired' } }),
    });

    const response = await testApp.request('/api/invoice-request/expired-token');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'expired' });
  });

  it('requires an authenticated user before returning agreement data', async () => {
    const testApp = createApiApp({
      agreementAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/agreement-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns agreement data and validates signing payloads', async () => {
    const testApp = createApiApp({
      agreementAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      agreementLoader: async (user) => ({
        status: 'ready',
        userId: user.id,
        userEmail: user.email ?? '',
        title: 'SEEKO Agreement',
        sections: [{ number: 1, title: 'Terms', content: '<p>Agreement terms.</p>' }],
        department: 'Coding',
        role: 'Developer',
        isContractor: false,
        onboarded: 0,
      }),
      agreementSigner: async () => ({ success: true, redirect: '/onboarding' }),
    });

    const loadResponse = await testApp.request('/api/agreement-index');
    expect(loadResponse.status).toBe(200);
    expect(await loadResponse.json()).toMatchObject({
      status: 'ready',
      title: 'SEEKO Agreement',
    });

    const invalidResponse = await testApp.request('/api/agreement/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ full_name: '', address: '', engagement_type: 'team_member' }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toEqual({ error: 'full_name is required' });

    const signResponse = await testApp.request('/api/agreement/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Member Example',
        address: '123 Example St',
        engagement_type: 'team_member',
      }),
    });
    expect(signResponse.status).toBe(200);
    expect(await signResponse.json()).toEqual({ success: true, redirect: '/onboarding' });
  });

  it('returns 404 for a missing doc-share token', async () => {
    const testApp = createApiApp({
      docShareLoader: async () => ({ found: false, initialData: { status: 'not_found' } }),
    });

    const response = await testApp.request('/api/doc-share/missing-token');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Invite not found' });
  });

  it('returns doc-share data for a valid token', async () => {
    const testApp = createApiApp({
      docShareLoader: async () => ({
        found: true,
        initialData: {
          status: 'pending',
          maskedEmail: 'r********@example.invalid',
          docTitle: 'Pitch Deck',
          docType: 'deck',
          expiresAt: '2026-06-20T00:00:00.000Z',
        },
      }),
    });

    const response = await testApp.request('/api/doc-share/pending-token');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: 'pending',
      maskedEmail: 'r********@example.invalid',
      docTitle: 'Pitch Deck',
      docType: 'deck',
      expiresAt: '2026-06-20T00:00:00.000Z',
    });
  });

  it('validates doc-share send-code payloads before service access', async () => {
    const response = await app.request('/api/doc-share/send-code', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Token required' });
  });

  it('requires a doc-share session cookie before viewing content', async () => {
    const response = await app.request('/api/doc-share/view', {
      method: 'POST',
      body: JSON.stringify({ token: 'shared-token' }),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'session_expired' });
  });

  it('returns 404 for a missing external-signing token', async () => {
    const testApp = createApiApp({
      externalSigningLoader: async () => ({ found: false, initialData: { status: 'notfound' } }),
    });

    const response = await testApp.request('/api/external-signing/missing-token');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Invite not found' });
  });

  it('returns external-signing data for a valid token', async () => {
    const testApp = createApiApp({
      externalSigningLoader: async () => ({
        found: true,
        initialData: {
          status: 'pending',
          maskedEmail: 'r********@example.invalid',
          templateName: 'Contractor Agreement',
          personalNote: 'Please sign',
          isGuardianSigning: false,
        },
      }),
    });

    const response = await testApp.request('/api/external-signing/pending-token');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: 'pending',
      maskedEmail: 'r********@example.invalid',
      templateName: 'Contractor Agreement',
      personalNote: 'Please sign',
      isGuardianSigning: false,
    });
  });

  it('validates external-signing send-code payloads before service access', async () => {
    const response = await app.request('/api/external-signing/send-code', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Token required' });
  });

  it('validates external-signing sign payloads before service access', async () => {
    const response = await app.request('/api/external-signing/sign', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Token required' });
  });

  it('requires admin auth before external-signing admin actions', async () => {
    const testApp = createApiApp({
      externalSigningAdminAuthResolver: async () => null,
    });

    const inviteResponse = await testApp.request('/api/external-signing/invite', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const parsePdfResponse = await testApp.request('/api/external-signing/parse-pdf', {
      method: 'POST',
    });
    const resendResponse = await testApp.request('/api/external-signing/resend', {
      method: 'POST',
      body: JSON.stringify({ invite_id: 'invite-1' }),
      headers: { 'content-type': 'application/json' },
    });
    const revokeResponse = await testApp.request('/api/external-signing/revoke', {
      method: 'POST',
      body: JSON.stringify({ invite_id: 'invite-1' }),
      headers: { 'content-type': 'application/json' },
    });
    const syncResponse = await testApp.request('/api/external-signing/sync', {
      method: 'POST',
      body: JSON.stringify({ invite_id: 'invite-1' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(inviteResponse.status).toBe(401);
    expect(await inviteResponse.json()).toEqual({ error: 'Unauthorized' });
    expect(parsePdfResponse.status).toBe(401);
    expect(await parsePdfResponse.json()).toEqual({ error: 'Unauthorized' });
    expect(resendResponse.status).toBe(401);
    expect(await resendResponse.json()).toEqual({ error: 'Unauthorized' });
    expect(revokeResponse.status).toBe(401);
    expect(await revokeResponse.json()).toEqual({ error: 'Unauthorized' });
    expect(syncResponse.status).toBe(401);
    expect(await syncResponse.json()).toEqual({ error: 'Unauthorized' });
  });

  it('keeps external-signing download on the fixed download route', async () => {
    const testApp = createApiApp({
      externalSigningLoader: async () => {
        throw new Error('download route should not hit token loader');
      },
    });

    const response = await testApp.request('/api/external-signing/download');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Token required' });
  });

  it('keeps external-signing reissue disabled on the migrated route', async () => {
    const response = await app.request('/api/external-signing/reissue', {
      method: 'POST',
      body: JSON.stringify({ token: 'public-token' }),
      headers: { 'content-type': 'application/json' },
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Public link reissue is disabled. Contact the sender for a new link.' });
  });

  it('requires an authenticated admin before returning external-signing admin data', async () => {
    const testApp = createApiApp({
      externalSigningAdminAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/external-signing-admin');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns external-signing admin index data', async () => {
    const testApp = createApiApp({
      externalSigningAdminAuthResolver: async () => ({ id: 'admin-1', email: 'admin@example.invalid' }),
      externalSigningAdminLoader: async () => ({
        profile: {
          id: 'admin-1',
          displayName: 'Admin Example',
          email: 'admin@example.invalid',
          isAdmin: true,
        },
        invites: [
          {
            id: 'invite-1',
            recipient_email: 'signer@example.invalid',
            template_type: 'preset',
            template_id: 'contractor',
            custom_title: null,
            personal_note: null,
            expires_at: '2026-06-25T12:00:00.000Z',
            verification_attempts: 0,
            verified_at: null,
            status: 'pending',
            signer_name: null,
            signed_at: null,
            created_at: '2026-06-18T12:00:00.000Z',
            is_guardian_signing: false,
            minor_name: null,
            expired: false,
            title: 'contractor',
          },
        ],
        stats: {
          total: 1,
          active: 1,
          verified: 0,
          signed: 0,
          archive: 0,
        },
      }),
    });

    const response = await testApp.request('/api/external-signing-admin');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      stats: { total: 1, active: 1 },
      invites: [expect.objectContaining({ id: 'invite-1', recipient_email: 'signer@example.invalid' })],
    });
  });

  it('requires an authenticated user before returning team data', async () => {
    const testApp = createApiApp({
      teamAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/team');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns authenticated team roster data', async () => {
    const testApp = createApiApp({
      teamAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      teamLoader: async (user) => ({
        currentUser: user,
        currentProfile: {
          id: 'user-1',
          display_name: 'Riley Example',
          is_admin: true,
          onboarded: 1,
          tour_completed: 1,
        },
        isAdmin: true,
        team: [
          {
            id: 'user-1',
            display_name: 'Riley Example',
            department: 'Coding',
            is_admin: true,
            onboarded: 1,
            tour_completed: 1,
          },
        ],
        members: [
          {
            id: 'user-1',
            display_name: 'Riley Example',
            department: 'Coding',
            is_admin: true,
            onboarded: 1,
            tour_completed: 1,
          },
        ],
        contractors: [],
        onlineCount: 0,
      }),
    });

    const response = await testApp.request('/api/team');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      isAdmin: true,
      members: [expect.objectContaining({ id: 'user-1', department: 'Coding' })],
      contractors: [],
    });
  });

  it('requires admin access before notifying an arbitrary user', async () => {
    const testApp = createApiApp({
      workflowAdminGuard: async () => ({ ok: false, status: 403, error: 'Forbidden' }),
    });

    const response = await testApp.request('/api/notify/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 'user-2',
        kind: 'task_handoff',
        title: 'Task update',
        link: '/tasks?task=task-1',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('requires an authenticated user before returning docs index data', async () => {
    const testApp = createApiApp({
      docsAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/docs-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns authenticated docs index data', async () => {
    const testApp = createApiApp({
      docsAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      docsIndexLoader: async (user) => ({
        currentUser: user,
        profile: {
          id: 'user-1',
          displayName: 'Riley Example',
          department: 'Coding',
          avatarUrl: null,
          isAdmin: false,
        },
        docs: [
          {
            id: 'doc-1',
            title: 'Engineering Notes',
            type: 'doc',
            restrictedDepartments: ['Coding'],
            locked: false,
            preview: 'Build notes',
            slideCount: 0,
            thumbnailUrl: null,
            updatedAt: '2026-06-18T12:00:00.000Z',
            createdAt: '2026-06-18T12:00:00.000Z',
            recentlyUpdated: true,
          },
        ],
        docCount: 1,
        deckCount: 0,
        lockedCount: 0,
      }),
    });

    const response = await testApp.request('/api/docs-index');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      docCount: 1,
      deckCount: 0,
      docs: [expect.objectContaining({ id: 'doc-1', title: 'Engineering Notes' })],
    });
  });

  it('requires an authenticated user before returning tasks index data', async () => {
    const testApp = createApiApp({
      tasksAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/tasks-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns authenticated tasks index data', async () => {
    const testApp = createApiApp({
      tasksAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      tasksIndexLoader: async (user) => ({
        currentUser: user,
        profile: {
          id: 'user-1',
          displayName: 'Riley Example',
          department: 'Coding',
          avatarUrl: null,
          isAdmin: true,
        },
        tasks: [
          {
            id: 'task-1',
            name: 'Ship task index',
            department: 'Coding',
            status: 'In Progress',
            priority: 'High',
            areaId: 'area-1',
            areaName: 'Migration',
            assigneeId: 'user-1',
            assigneeName: 'Riley Example',
            assigneeAvatarUrl: null,
            deadline: '2026-06-25',
            description: 'Move task board data into Hono.',
            bounty: null,
            createdAt: '2026-06-18T12:00:00.000Z',
            overdue: false,
          },
        ],
        columns: [
          {
            status: 'In Progress',
            tasks: [
              {
                id: 'task-1',
                name: 'Ship task index',
                department: 'Coding',
                status: 'In Progress',
                priority: 'High',
                areaId: 'area-1',
                areaName: 'Migration',
                assigneeId: 'user-1',
                assigneeName: 'Riley Example',
                assigneeAvatarUrl: null,
                deadline: '2026-06-25',
                description: 'Move task board data into Hono.',
                bounty: null,
                createdAt: '2026-06-18T12:00:00.000Z',
                overdue: false,
              },
            ],
          },
        ],
        totalCount: 1,
        overdueCount: 0,
      }),
    });

    const response = await testApp.request('/api/tasks-index');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      totalCount: 1,
      tasks: [expect.objectContaining({ id: 'task-1', status: 'In Progress' })],
    });
  });

  it('returns authenticated task detail data', async () => {
    const testApp = createApiApp({
      tasksAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      taskDetailLoader: async (_user, taskId) => ({
        profile: {
          id: 'user-1',
          displayName: 'Riley Example',
          department: 'Coding',
          avatarUrl: null,
          isAdmin: true,
        },
        task: {
          id: taskId,
          name: 'Ship task detail',
          department: 'Coding',
          status: 'In Progress',
          priority: 'High',
          areaId: 'area-1',
          areaName: 'Migration',
          assigneeId: 'user-1',
          assigneeName: 'Riley Example',
          assigneeAvatarUrl: null,
          deadline: '2026-06-25',
          description: 'Move task detail into Hono.',
          bounty: null,
          createdAt: '2026-06-18T12:00:00.000Z',
          overdue: false,
        },
        activity: [
          {
            id: 'activity-1',
            action: 'created',
            target: 'Ship task detail',
            createdAt: '2026-06-18T12:00:00.000Z',
          },
        ],
      }),
    });

    const response = await testApp.request('/api/tasks-index/task-1');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      task: { id: 'task-1', name: 'Ship task detail' },
      activity: [expect.objectContaining({ action: 'created' })],
    });
  });

  it('requires auth before creating a task', async () => {
    const testApp = createApiApp({
      tasksAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New task' }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('creates a task and returns the created row', async () => {
    const createTaskFn = vi.fn(async (fields: Record<string, unknown>, _service?: unknown) => ({
      task: { id: 'task-9', name: fields.name, status: 'Todo' },
    }));
    const testApp = createApiApp({
      tasksAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      createTaskFn: createTaskFn as never,
    });

    const response = await testApp.request('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New task', status: 'Todo', evil: 'dropped' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ task: { id: 'task-9', name: 'New task', status: 'Todo' } });
    expect(createTaskFn).toHaveBeenCalledWith({ name: 'New task', status: 'Todo' }, expect.anything());
    expect(actorOf(createTaskFn.mock.calls[0][1])).toBe('user-1');
  });

  it('requires auth before updating a task', async () => {
    const testApp = createApiApp({
      tasksAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Done' }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('updates a task with the sanitized patch', async () => {
    const updateTaskFn = vi.fn(async (_id: string, _patch: unknown, _service?: unknown) => ({ ok: true as const }));
    const testApp = createApiApp({
      tasksAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      updateTaskFn,
    });

    const response = await testApp.request('/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Done', task_number: 999 }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(updateTaskFn).toHaveBeenCalledWith('task-1', { status: 'Done' }, expect.anything());
    expect(actorOf(updateTaskFn.mock.calls[0][2])).toBe('user-1');
  });

  it('rejects a task patch that only contains unknown keys', async () => {
    const updateTaskFn = vi.fn(async () => ({ ok: true as const }));
    const testApp = createApiApp({
      tasksAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      updateTaskFn,
    });

    const response = await testApp.request('/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task_number: 999, id: 'nope' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'empty_patch' });
    expect(updateTaskFn).not.toHaveBeenCalled();
  });

  it('requires auth before deleting a task', async () => {
    const testApp = createApiApp({
      tasksAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/tasks/task-1', { method: 'DELETE' });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('requires an authenticated investor before returning investor overview data', async () => {
    const testApp = createApiApp({
      investorAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/investor-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns investor overview data', async () => {
    const testApp = createApiApp({
      investorAuthResolver: async () => ({ id: 'investor-1', email: 'investor@example.invalid' }),
      investorOverviewLoader: async () => ({
        profile: {
          id: 'investor-1',
          displayName: 'Investor Example',
          email: 'investor@example.invalid',
          avatarUrl: null,
          timezone: 'America/New_York',
          paypalEmail: null,
          isAdmin: false,
          isInvestor: true,
        },
        stats: {
          totalTasks: 10,
          completedTasks: 4,
          overallProgress: 40,
          blockedTasks: 1,
          overdueTasks: 0,
          activeAreas: 2,
          completedThisWeek: 2,
        },
        areas: [
          {
            id: 'area-1',
            name: 'Gameplay',
            status: 'Active',
            progress: 55,
            description: null,
            phase: 'Build',
            targetDate: null,
            taskCount: 5,
            completedTaskCount: 2,
          },
        ],
        recentActivity: [
          {
            id: 'activity-1',
            action: 'Completed',
            target: 'Prototype',
            createdAt: '2026-06-18T12:00:00.000Z',
            taskId: 'task-1',
            docId: null,
          },
        ],
        healthSummary: '2 tasks completed this week.',
      }),
    });

    const response = await testApp.request('/api/investor-index');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      stats: { overallProgress: 40 },
      areas: [expect.objectContaining({ id: 'area-1', name: 'Gameplay' })],
    });
  });

  it('returns investor docs and payments data', async () => {
    const investorAuthResolver = async () => ({ id: 'investor-1', email: 'investor@example.invalid' });
    const profile = {
      id: 'investor-1',
      displayName: 'Investor Example',
      email: 'investor@example.invalid',
      avatarUrl: null,
      timezone: 'America/New_York',
      paypalEmail: null,
      isAdmin: false,
      isInvestor: true,
    };
    const testApp = createApiApp({
      investorAuthResolver,
      investorDocsLoader: async () => ({
        profile,
        docs: [
          {
            id: 'doc-1',
            title: 'Investor Update',
            type: 'doc',
            restrictedDepartments: [],
            locked: false,
            preview: 'Monthly update',
            slideCount: 0,
            thumbnailUrl: null,
            updatedAt: '2026-06-18T12:00:00.000Z',
            createdAt: '2026-06-18T12:00:00.000Z',
            recentlyUpdated: true,
          },
        ],
        docCount: 1,
        deckCount: 0,
      }),
      investorPaymentsLoader: async () => ({
        profile,
        stats: {
          thisMonth: 500,
          lastMonth: 250,
          allTime: 750,
          peoplePaid: 2,
          paymentCount: 2,
        },
        payments: [
          {
            id: 'payment-1',
            recipientId: 'user-1',
            recipientName: 'Riley Example',
            recipientAvatarUrl: null,
            recipientDepartment: 'Coding',
            amount: 500,
            currency: 'USD',
            description: 'Milestone',
            paidAt: '2026-06-18T12:00:00.000Z',
            createdAt: '2026-06-18T12:00:00.000Z',
            itemCount: 1,
          },
        ],
      }),
      investorSettingsLoader: async () => ({
        profile: {
          ...profile,
          timezone: 'America/New_York',
          paypalEmail: 'payments@example.invalid',
        },
      }),
      investorSettingsUpdater: async (_user, input) => ({
        profile: {
          ...profile,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl ?? null,
          timezone: input.timezone ?? null,
          paypalEmail: input.paypalEmail ?? null,
        },
      }),
    });

    const docsResponse = await testApp.request('/api/investor-docs-index');
    const paymentsResponse = await testApp.request('/api/investor-payments-index');
    const settingsResponse = await testApp.request('/api/investor-settings-index');
    const updateSettingsResponse = await testApp.request('/api/investor-settings-index', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Updated Investor',
        avatarUrl: null,
        timezone: 'America/New_York',
        paypalEmail: 'payments@example.invalid',
      }),
    });

    expect(docsResponse.status).toBe(200);
    expect(await docsResponse.json()).toMatchObject({
      docCount: 1,
      docs: [expect.objectContaining({ id: 'doc-1' })],
    });
    expect(paymentsResponse.status).toBe(200);
    expect(await paymentsResponse.json()).toMatchObject({
      stats: { allTime: 750 },
      payments: [expect.objectContaining({ id: 'payment-1' })],
    });
    expect(settingsResponse.status).toBe(200);
    expect(await settingsResponse.json()).toMatchObject({
      profile: { paypalEmail: 'payments@example.invalid' },
    });
    expect(updateSettingsResponse.status).toBe(200);
    expect(await updateSettingsResponse.json()).toMatchObject({
      profile: { displayName: 'Updated Investor' },
    });
  });

  it('requires an authenticated user before returning onboarding profile data', async () => {
    const testApp = createApiApp({
      profileAuthResolver: async () => null,
    });

    const response = await testApp.request('/api/profile/onboarding');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns and updates onboarding profile data', async () => {
    const profile = {
      currentUser: { id: 'user-1', email: 'member@example.invalid' },
      profile: {
        id: 'user-1',
        displayName: 'Member Example',
        avatarUrl: null,
        email: 'member@example.invalid',
        onboarded: 1,
      },
    };
    const testApp = createApiApp({
      profileAuthResolver: async () => ({ id: 'user-1', email: 'member@example.invalid' }),
      onboardingLoader: async () => profile,
      onboardingUpdater: async (_user, input) => ({
        ...profile,
        profile: {
          ...profile.profile,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl ?? null,
        },
      }),
    });

    const loadResponse = await testApp.request('/api/profile/onboarding');
    expect(loadResponse.status).toBe(200);
    expect(await loadResponse.json()).toMatchObject({
      profile: { displayName: 'Member Example' },
    });

    const saveResponse = await testApp.request('/api/profile/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Updated Member', avatarUrl: null, timezone: 'America/New_York' }),
    });

    expect(saveResponse.status).toBe(200);
    expect(await saveResponse.json()).toMatchObject({
      profile: { displayName: 'Updated Member' },
    });
  });

  it('requires a payments token before returning payments index data', async () => {
    const testApp = createApiApp({
      paymentsAuthResolver: async () => ({
        ok: false,
        status: 401,
        error: 'payments_token_required',
      }),
    });

    const response = await testApp.request('/api/payments-index');
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'payments_token_required' });
  });

  it('returns authenticated payments index data', async () => {
    const testApp = createApiApp({
      paymentsAuthResolver: async () => ({
        ok: true,
        auth: {
          user: { id: 'admin-1', email: 'admin@example.invalid' },
          supabase: {} as never,
          isAdmin: true,
          isInvestor: false,
          tokenValid: true,
        },
      }),
      paymentsIndexLoader: async (user) => ({
        currentUser: user,
        stats: {
          pendingTotal: 250,
          paidThisMonth: 500,
          peopleOwed: 1,
          paymentsThisMonth: 2,
        },
        people: [
          {
            id: 'user-1',
            displayName: 'Riley Example',
            department: 'Coding',
            avatarUrl: null,
            paypalEmail: 'payments@example.invalid',
            pendingAmount: 250,
            hasPaid: true,
          },
        ],
        pendingRequests: [],
        recentPaid: [
          {
            id: 'payment-1',
            recipientId: 'user-1',
            recipientName: 'Riley Example',
            recipientEmail: null,
            recipientAvatarUrl: null,
            amount: 500,
            currency: 'USD',
            description: 'Milestone',
            status: 'paid',
            paidAt: '2026-06-18T12:00:00.000Z',
            createdAt: '2026-06-18T12:00:00.000Z',
            itemCount: 1,
          },
        ],
      }),
    });

    const response = await testApp.request('/api/payments-index');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      stats: { pendingTotal: 250, paidThisMonth: 500 },
      people: [expect.objectContaining({ id: 'user-1', pendingAmount: 250 })],
      recentPaid: [expect.objectContaining({ id: 'payment-1', status: 'paid' })],
    });
  });
});
