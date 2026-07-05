import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { Hono } from 'hono';
import { sendBugReportEmail } from '@/lib/email';
import { isValidNotificationKind } from '@/lib/notification-kinds';
import { buildFallbackPDF } from '@/lib/investor-fallback-pdf';
import type { InvestorSummaryPDFData } from '@/lib/investor-summary-pdf-data';
import { fetchActivity, fetchAllTasksWithAssignees, fetchAreas, fetchProfile, fetchTeam } from '@/lib/supabase/data';
import { getServiceClient } from '@/lib/supabase/service';
import type { Area, NotificationKind } from '@/lib/types';
import { getAuthenticatedUser } from '../supabase';
import { getClientIp, isRateLimited, requireAdmin, requireUser, type AuthGuard } from '../auth-utils';

const geocodeHits = new Map<string, { count: number; resetAt: number }>();
const notifyHits = new Map<string, { count: number; resetAt: number }>();

type WorkflowRoutesOptions = {
  userGuard?: (c: Parameters<typeof requireUser>[0]) => Promise<AuthGuard>;
  adminGuard?: (c: Parameters<typeof requireAdmin>[0]) => Promise<AuthGuard>;
};

export function createWorkflowRoutes(options: WorkflowRoutesOptions = {}) {
  const userGuard = options.userGuard ?? requireUser;
  const adminGuard = options.adminGuard ?? requireAdmin;

  return new Hono()
    .get('/geocode', async (c) => {
      if (isRateLimited(geocodeHits, getClientIp(c), { max: 30, windowMs: 60 * 1000 }, 500)) return c.json([], 429);

      const q = c.req.query('q');
      if (!q || q.length < 3 || q.length > 200) return c.json([]);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({
          q,
          format: 'json',
          addressdetails: '1',
          limit: '5',
        })}`, {
          headers: { 'User-Agent': 'SeekoStudio/1.0 (signing-app)', 'Accept-Language': 'en' },
          signal: controller.signal,
        });
        if (!res.ok) return c.json([], res.status as 400);
        const data = await res.json() as { place_id: number; display_name: string }[];
        return c.json(data.map((row) => ({ place_id: row.place_id, display_name: row.display_name })));
      } catch {
        return c.json([], 504);
      } finally {
        clearTimeout(timeout);
      }
    })
    .post('/bug-report', async (c) => {
      const user = await getAuthenticatedUser(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);

      const formData = await c.req.formData();
      const description = String(formData.get('description') ?? '');
      if (!description.trim()) return c.json({ error: 'Description is required' }, 400);

      const screenshot = formData.get('screenshot');
      let screenshotUrl: string | undefined;
      const service = getServiceClient();
      if (screenshot instanceof File && screenshot.size > 0) {
        const ext = screenshot.name.split('.').pop() || 'png';
        const storagePath = `bug-reports/${user.id}/${Date.now()}.${ext}`;
        const { error } = await service.storage
          .from('bug-reports')
          .upload(storagePath, Buffer.from(await screenshot.arrayBuffer()), { contentType: screenshot.type });
        if (!error) {
          const { data } = service.storage.from('bug-reports').getPublicUrl(storagePath);
          screenshotUrl = data.publicUrl;
        }
      }

      await sendBugReportEmail({
        description: description.trim(),
        pageUrl: String(formData.get('pageUrl') ?? ''),
        screenshotUrl,
        userAgent: String(formData.get('userAgent') ?? ''),
        screenSize: String(formData.get('screenSize') ?? ''),
        isPwa: formData.get('isPwa') === 'true',
        reporterName: String(formData.get('reporterName') ?? ''),
        reporterEmail: String(formData.get('reporterEmail') ?? user.email ?? ''),
      });

      return c.json({ ok: true });
    })
    .post('/notify/admins', async (c) => {
      const guard = await userGuard(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      if (isRateLimited(notifyHits, guard.user.id, { max: 20, windowMs: 60 * 1000 })) {
        return c.json({ error: 'Too many notifications. Try again later.' }, 429);
      }

      const body = await c.req.json().catch(() => null) as { kind?: NotificationKind; title?: string; body?: string; link?: string } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      if (!body.kind || !body.title) return c.json({ error: 'kind and title required' }, 400);
      const linkError = validateNotificationInput(body.kind, body.link);
      if (linkError) return c.json({ error: linkError }, 400);

      const service = getServiceClient();
      const { data: admins, error } = await service.from('profiles').select('id').eq('is_admin', true);
      if (error) return c.json({ error: 'Failed to fetch admin list' }, 500);
      if (!admins?.length) return c.json({ success: true, count: 0 });
      const rows = admins.map(({ id }) => ({
        user_id: id,
        kind: body.kind,
        title: body.title,
        body: body.body ?? null,
        link: body.link ?? null,
        read: false,
      }));
      const { error: insertError } = await service.from('notifications').insert(rows as never[]);
      if (insertError) return c.json({ error: 'Failed to send notifications' }, 500);
      return c.json({ success: true, count: rows.length });
    })
    .post('/notify/user', async (c) => {
      const guard = await adminGuard(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      if (isRateLimited(notifyHits, guard.user.id, { max: 30, windowMs: 60 * 1000 })) {
        return c.json({ error: 'Too many notifications. Try again later.' }, 429);
      }

      const body = await c.req.json().catch(() => null) as { userId?: string; kind?: NotificationKind; title?: string; body?: string; link?: string } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      if (!body.userId || !body.kind || !body.title) return c.json({ error: 'userId, kind, and title required' }, 400);
      const linkError = validateNotificationInput(body.kind, body.link);
      if (linkError) return c.json({ error: linkError }, 400);
      if (body.userId === guard.user.id) return c.json({ success: true, skipped: true });

      const { error } = await getServiceClient().from('notifications').insert({
        user_id: body.userId,
        kind: body.kind,
        title: body.title,
        body: body.body ?? null,
        link: body.link ?? null,
        read: false,
      } as never);
      if (error) return c.json({ error: 'Failed to send notification' }, 500);
      return c.json({ success: true });
    })
    .patch('/areas/:id', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error }, admin.status);
      const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      const updates: Record<string, unknown> = {};
      if (typeof body.progress === 'number' && body.progress >= 0 && body.progress <= 100) updates.progress = body.progress;
      if (body.phase !== undefined) updates.phase = body.phase === '' ? null : body.phase;
      if (body.status !== undefined) updates.status = body.status === '' ? null : body.status;
      if (body.description !== undefined) updates.description = body.description === '' ? null : body.description;
      if (body.target_date !== undefined) {
        if (body.target_date === '' || body.target_date === null) updates.target_date = null;
        else if (typeof body.target_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.target_date)) updates.target_date = body.target_date;
        else return c.json({ error: 'Invalid target_date (expected YYYY-MM-DD)' }, 400);
      }
      if (Object.keys(updates).length === 0) return c.json({ error: 'No valid fields to update' }, 400);
      const { data, error } = await getServiceClient().from('areas').update(updates as never).eq('id', c.req.param('id')).select().single();
      if (error) return c.json({ error: 'Failed to update area' }, 400);
      return c.json(data);
    })
    .post('/deadline-extensions', async (c) => {
      const guard = await requireUser(c);
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      const body = await c.req.json().catch(() => null) as { taskId?: string; extraHours?: number } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      if (!body.taskId) return c.json({ error: 'taskId is required' }, 400);
      if (!Number.isFinite(body.extraHours) || !body.extraHours || body.extraHours < 1 || body.extraHours > 720) {
        return c.json({ error: 'extraHours must be between 1 and 720' }, 400);
      }

      const service = getServiceClient();
      const { data: task } = await service.from('tasks').select('id, name, deadline, assignee_id').eq('id', body.taskId).single();
      if (!task) return c.json({ error: 'Task not found' }, 404);
      if (task.assignee_id !== guard.user.id) return c.json({ error: 'Only the assignee can request an extension' }, 403);
      if (!task.deadline) return c.json({ error: 'Task has no deadline' }, 400);
      const { data: existing } = await service.from('deadline_extensions').select('id').eq('task_id', body.taskId).eq('status', 'pending').limit(1).maybeSingle();
      if (existing) return c.json({ error: 'A pending extension request already exists for this task' }, 409);

      const newDeadlineDate = new Date(`${task.deadline}T00:00:00`);
      newDeadlineDate.setTime(newDeadlineDate.getTime() + body.extraHours * 3600000);
      const newDeadline = newDeadlineDate.toISOString().split('T')[0]!;
      const { data: extension, error } = await service
        .from('deadline_extensions')
        .insert({
          task_id: body.taskId,
          requested_by: guard.user.id,
          extra_hours: body.extraHours,
          original_deadline: task.deadline,
          new_deadline: newDeadline,
          status: 'pending',
        } as never)
        .select('id, extra_hours, new_deadline, status')
        .single();
      if (error) return c.json({ error: 'Failed to create extension request' }, 500);
      await service.from('activity_log').insert({ user_id: guard.user.id, action: 'Requested extension', target: `task: ${task.name}`, task_id: body.taskId } as never);
      await notifyAdminsDirect('deadline_extension_requested', `Extension requested on "${task.name}"`, null, `/tasks?task=${body.taskId}`);
      return c.json({ success: true, extension });
    })
    .patch('/deadline-extensions/:id', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error === 'Forbidden' ? 'Admin access required' : admin.error }, admin.status);
      const body = await c.req.json().catch(() => null) as { action?: 'approve' | 'deny'; reason?: string } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      if (body.action !== 'approve' && body.action !== 'deny') return c.json({ error: 'action must be "approve" or "deny"' }, 400);

      const service = getServiceClient();
      const { data: ext } = await service
        .from('deadline_extensions')
        .select('id, task_id, requested_by, extra_hours, new_deadline, status, tasks(name)')
        .eq('id', c.req.param('id'))
        .single();
      if (!ext) return c.json({ error: 'Extension request not found' }, 404);
      if (ext.status !== 'pending') return c.json({ error: 'Extension request is no longer pending' }, 409);
      const taskName = (ext.tasks as unknown as { name?: string })?.name ?? 'Unknown task';
      const newStatus = body.action === 'approve' ? 'approved' : 'denied';
      const { error } = await service
        .from('deadline_extensions')
        .update({ status: newStatus, decided_by: admin.user.id, decided_at: new Date().toISOString(), ...(body.action === 'deny' && body.reason ? { denial_reason: body.reason } : {}) } as never)
        .eq('id', c.req.param('id'))
        .eq('status', 'pending');
      if (error) return c.json({ error: 'Failed to update extension request' }, 500);
      if (body.action === 'approve') {
        const { error: taskError } = await service.from('tasks').update({ deadline: ext.new_deadline } as never).eq('id', ext.task_id);
        if (taskError) {
          await service.from('deadline_extensions').update({ status: 'pending', decided_by: null, decided_at: null } as never).eq('id', c.req.param('id'));
          return c.json({ error: 'Failed to update task deadline' }, 500);
        }
      }
      await service.from('activity_log').insert({ user_id: admin.user.id, action: body.action === 'approve' ? 'Approved extension' : 'Denied extension', target: `task: ${taskName}`, task_id: ext.task_id } as never);
      await notifyUserDirect(ext.requested_by, body.action === 'approve' ? 'deadline_extension_approved' : 'deadline_extension_denied', body.action === 'approve' ? `Extension approved on "${taskName}"` : `Extension denied on "${taskName}"`, body.reason ?? null, `/tasks?task=${ext.task_id}`);
      return c.json({ success: true, status: newStatus });
    })
    .get('/investor/export-summary', async (c) => {
      const user = await getAuthenticatedUser(c);
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
      const profile = await fetchProfile(user.id);
      if (!profile?.is_investor && !profile?.is_admin) return c.json({ error: 'Forbidden' }, 403);
      const body = await buildInvestorSummaryPdf();
      return new Response(body as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="seeko-investor-summary-${new Date().toISOString().slice(0, 10)}.pdf"`,
        },
      });
    });
}

function validateNotificationInput(kind: NotificationKind, link?: string) {
  if (!isValidNotificationKind(kind)) return 'Invalid notification kind';
  if (link && (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//'))) {
    return 'link must be a relative path starting with /';
  }
  return null;
}

async function notifyAdminsDirect(kind: NotificationKind, title: string, body: string | null, link: string | null) {
  const service = getServiceClient();
  const { data: admins } = await service.from('profiles').select('id').eq('is_admin', true);
  if (!admins?.length) return;
  await service.from('notifications').insert(admins.map(({ id }) => ({ user_id: id, kind, title, body, link, read: false })) as never[]);
}

async function notifyUserDirect(userId: string, kind: NotificationKind, title: string, body: string | null, link: string | null) {
  await getServiceClient().from('notifications').insert({ user_id: userId, kind, title, body, link, read: false } as never);
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildUpdates(activity: Awaited<ReturnType<typeof fetchActivity>>, areas: Area[]): string[] {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = activity.filter((item) => new Date(item.created_at).getTime() > cutoff);
  const completed = recent.filter((item) => item.action === 'Completed').length;
  const started = recent.filter((item) => item.action === 'Started').length;
  const comments = recent.filter((item) => item.action === 'Commented on').length;
  const bullets: string[] = [];
  if (completed > 0) bullets.push(`${completed} task${completed !== 1 ? 's' : ''} completed this week`);
  if (started > 0) bullets.push(`${started} task${started !== 1 ? 's' : ''} started`);
  if (comments > 0) bullets.push(`${comments} comment${comments !== 1 ? 's' : ''} added`);
  const activeAreas = areas.filter((area) => area.status === 'Active');
  if (activeAreas.length > 0) bullets.push(`${activeAreas.length} area${activeAreas.length !== 1 ? 's' : ''} in active development`);
  return bullets;
}

async function buildInvestorSummaryPdf() {
  const [tasks, areas, activity, team] = await Promise.all([
    fetchAllTasksWithAssignees().catch(() => []),
    fetchAreas().catch((): Area[] => []),
    fetchActivity(30).catch(() => []),
    fetchTeam().catch(() => []),
  ]);
  const blocked = tasks.filter((task) => task.status === 'Backlog').length;
  const overdueCount = tasks.filter((task) => task.deadline && new Date(task.deadline) < new Date()).length;
  const inProgress = tasks.filter((task) => task.status !== 'Done').length;
  const completedThisWeek = activity.filter((item) => item.action === 'Completed' && new Date(item.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000).length;
  const phaseCounts = areas.reduce<Record<string, number>>((acc, area) => {
    const phase = (area.phase || 'Other') as string;
    acc[phase] = (acc[phase] || 0) + 1;
    return acc;
  }, {});
  const phaseSummary = Object.entries(phaseCounts).filter(([key]) => key !== 'Other').map(([key, value]) => `${value} ${key}`).join(', ') || null;
  const latestActivity = activity[0]?.created_at;
  const latestTaskUpdate = tasks.map((task) => task.updated_at).filter((value): value is string => !!value).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const lastUpdatedRaw = [latestActivity, latestTaskUpdate].filter((value): value is string => !!value).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const summaryParts = [
    areas.length > 0 ? `${areas.length} area${areas.length !== 1 ? 's' : ''}` : null,
    inProgress > 0 ? `${inProgress} in progress` : null,
    completedThisWeek > 0 ? `${completedThisWeek} completed this week` : null,
  ].filter(Boolean);

  const data: InvestorSummaryPDFData = {
    generatedAt: new Date().toISOString(),
    atAGlance: summaryParts.length ? summaryParts.join(' · ') : null,
    teamCount: team.length,
    phaseSummary,
    lastUpdated: lastUpdatedRaw ? timeAgo(lastUpdatedRaw) : null,
    areas: areas.map((area) => ({ name: area.name, progress: area.progress, status: area.status, phase: area.phase })),
    recentTasks: tasks.slice(0, 15).map((task) => ({
      name: task.name,
      status: task.status,
      assignee: (task as { assignee?: { display_name?: string } }).assignee?.display_name,
      due: task.deadline ? new Date(task.deadline).toLocaleDateString() : undefined,
    })),
    updates: buildUpdates(activity, areas),
    blocked,
    overdueCount,
  };

  let logoSrc: string | null = null;
  let logoBuffer: Uint8Array | undefined;
  const logoPath = path.join(process.cwd(), 'public', 'seeko-logo-white.png');
  if (fs.existsSync(logoPath)) {
    const buf = fs.readFileSync(logoPath);
    logoBuffer = new Uint8Array(buf);
    logoSrc = `data:image/png;base64,${buf.toString('base64')}`;
  }

  try {
    const { pdf } = await import('@react-pdf/renderer');
    const { InvestorSummaryPDF } = await import('@/components/investor/InvestorSummaryPDF');
    const doc = React.createElement(InvestorSummaryPDF, { data, logoSrc });
    const result = await pdf(doc as never).toBuffer();
    if (result instanceof Buffer || result instanceof Uint8Array) return result;
  } catch (error) {
    console.warn('[hono investor/export-summary] React-PDF failed, using fallback:', error);
  }
  return buildFallbackPDF(data, logoBuffer);
}
