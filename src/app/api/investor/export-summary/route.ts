import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { createClient } from '@/lib/supabase/server';
import { fetchProfile, fetchAreas, fetchActivity, fetchAllTasksWithAssignees, fetchTeam } from '@/lib/supabase/data';
import type { Area } from '@/lib/types';
import type { InvestorSummaryPDFData } from '@/lib/investor-summary-pdf-data';
import { buildFallbackPDF } from '@/lib/investor-fallback-pdf';
import React from 'react';

/** Use Node.js runtime so @react-pdf/renderer and fs/path work reliably. */
export const runtime = 'nodejs';

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildUpdates(
  activity: Awaited<ReturnType<typeof fetchActivity>>,
  areas: Area[],
): string[] {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = activity.filter(a => new Date(a.created_at).getTime() > cutoff);

  const completed  = recent.filter(a => a.action === 'Completed').length;
  const started    = recent.filter(a => a.action === 'Started').length;
  const inReview   = recent.filter(a => a.action === 'Moved to review').length;
  const blocked    = recent.filter(a => a.action === 'Blocked').length;
  const comments   = recent.filter(a => a.action === 'Commented on').length;

  const bullets: string[] = [];
  if (completed > 0) bullets.push(`${completed} task${completed !== 1 ? 's' : ''} completed this week`);
  if (started > 0)   bullets.push(`${started} task${started !== 1 ? 's' : ''} started`);
  if (inReview > 0)  bullets.push(`${inReview} task${inReview !== 1 ? 's' : ''} moved to review`);
  if (blocked > 0)   bullets.push(`${blocked} task${blocked !== 1 ? 's' : ''} currently blocked`);
  if (comments > 0)  bullets.push(`${comments} comment${comments !== 1 ? 's' : ''} added`);

  const activeAreas = areas.filter(a => a.status === 'Active');
  if (activeAreas.length > 0) {
    bullets.push(`${activeAreas.length} area${activeAreas.length !== 1 ? 's' : ''} in active development`);
  }

  return bullets;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await fetchProfile(user.id);
  if (!profile?.is_investor && !profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [tasks, areas, activity, team] = await Promise.all([
    fetchAllTasksWithAssignees().catch(() => []),
    fetchAreas().catch((): Area[] => []),
    fetchActivity(30).catch(() => []),
    fetchTeam().catch(() => []),
  ]);

  const blocked = tasks.filter(t => t.status === 'Blocked').length;
  const overdueCount = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date()).length;
  const inProgress = tasks.filter(t => t.status !== 'Complete').length;
  const completedThisWeek = activity.filter(
    a => a.action === 'Completed' && new Date(a.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
  ).length;

  const phaseCounts = areas.reduce<Record<string, number>>((acc, a) => {
    const p = (a.phase || 'Other') as string;
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});
  const phaseSummary = Object.entries(phaseCounts)
    .filter(([k]) => k !== 'Other')
    .map(([k, v]) => `${v} ${k}`)
    .join(', ') || null;

  const updates = buildUpdates(activity, areas);

  const summaryParts: string[] = [];
  if (areas.length > 0) summaryParts.push(`${areas.length} area${areas.length !== 1 ? 's' : ''}`);
  if (inProgress > 0) summaryParts.push(`${inProgress} in progress`);
  if (completedThisWeek > 0) summaryParts.push(`${completedThisWeek} completed this week`);
  const atAGlance = summaryParts.length > 0 ? summaryParts.join(' · ') : null;

  const latestActivity = activity[0]?.created_at;
  const latestTaskUpdate = tasks
    .map(t => t.updated_at)
    .filter((t): t is string => !!t)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const lastUpdatedRaw = [latestActivity, latestTaskUpdate]
    .filter((t): t is string => !!t)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const lastUpdated = lastUpdatedRaw ? timeAgo(lastUpdatedRaw) : null;

  const data: InvestorSummaryPDFData = {
    generatedAt: new Date().toISOString(),
    atAGlance,
    teamCount: team.length,
    phaseSummary,
    lastUpdated,
    areas: areas.map(a => ({
      name: a.name,
      progress: a.progress,
      status: a.status,
      phase: a.phase,
    })),
    recentTasks: tasks
      .slice(0, 15)
      .map(t => ({
        name: t.name,
        status: t.status,
        assignee: (t as { assignee?: { display_name?: string } }).assignee?.display_name,
        due: t.deadline ? new Date(t.deadline).toLocaleDateString() : undefined,
      })),
    updates,
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

  let body: Buffer | Uint8Array;
  try {
    const { pdf } = await import('@react-pdf/renderer');
    const { InvestorSummaryPDF } = await import('@/components/investor/InvestorSummaryPDF');
    const doc = React.createElement(InvestorSummaryPDF, { data, logoSrc });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf() expects Document root; our component renders one
    const result = await pdf(doc as any).toBuffer();
    if (result instanceof Buffer) {
      body = result;
    } else if (result && typeof (result as unknown as ReadableStream).getReader === 'function') {
      const stream = result as unknown as ReadableStream<Uint8Array>;
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    } else {
      body = Buffer.from([]);
    }
    if (body.length === 0) throw new Error('Empty PDF');
  } catch (err) {
    console.warn('[investor/export-summary] React-PDF failed, using fallback:', err);
    body = await buildFallbackPDF(data, logoBuffer);
  }

  const filename = `seeko-investor-summary-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
