import { Client } from '@notionhq/client';
import type { Task, Area, TeamMember, NotionBlock } from './types';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// ─── Tasks ────────────────────────────────────────────────────────────────────

function pageToTask(page: Record<string, unknown>): Task {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (page as any).properties;
  return {
    id: (page as { id: string }).id,
    name: props?.Name?.title?.[0]?.plain_text ?? 'Untitled',
    department: props?.Department?.select?.name ?? '',
    status: props?.Status?.select?.name ?? 'In Progress',
    priority: props?.Priority?.select?.name ?? 'Medium',
    area: props?.Area?.relation?.[0]?.id,
    assignee: props?.Assignee?.people?.[0]?.name,
    deadline: props?.Deadline?.date?.start,
    description: props?.Description?.rich_text?.[0]?.plain_text,
  };
}

/**
 * Fetch tasks, optionally filtered by assignee display name.
 * Note: @notionhq/client v5 uses dataSources.query (renamed from databases.query).
 * People filters require a Notion User ID. We filter by assignee name in-memory
 * until profiles store notion_user_id.
 */
export async function fetchTasks(assigneeName?: string): Promise<Task[]> {
  const res = await notion.dataSources.query({
    data_source_id: process.env.NOTION_TASKS_DB_ID!,
    sorts: [{ property: 'Deadline', direction: 'ascending' }],
  });

  const tasks = res.results.map((p) => pageToTask(p as Record<string, unknown>));

  if (assigneeName) {
    return tasks.filter(
      (t) => t.assignee?.toLowerCase() === assigneeName.toLowerCase()
    );
  }

  return tasks;
}

// ─── Areas ────────────────────────────────────────────────────────────────────

function pageToArea(page: Record<string, unknown>): Area {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (page as any).properties;
  return {
    id: (page as { id: string }).id,
    name: props?.Name?.title?.[0]?.plain_text ?? 'Untitled',
    status: props?.Status?.select?.name ?? '',
    progress: props?.Progress?.number ?? 0,
    description: props?.Description?.rich_text?.[0]?.plain_text,
    phase: props?.Phase?.select?.name,
  };
}

export async function fetchAreas(): Promise<Area[]> {
  const res = await notion.dataSources.query({
    data_source_id: process.env.NOTION_AREAS_DB_ID!,
    sorts: [{ property: 'Name', direction: 'ascending' }],
  });

  return res.results.map((p) => pageToArea(p as Record<string, unknown>));
}

// ─── Team ─────────────────────────────────────────────────────────────────────

function pageToTeamMember(page: Record<string, unknown>): TeamMember {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (page as any).properties;
  return {
    id: (page as { id: string }).id,
    name: props?.Name?.title?.[0]?.plain_text ?? 'Unknown',
    role: props?.Role?.rich_text?.[0]?.plain_text ?? '',
    department: props?.Department?.select?.name ?? '',
    email: props?.Email?.email,
    notionHandle: props?.NotionHandle?.rich_text?.[0]?.plain_text,
  };
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const res = await notion.dataSources.query({
    data_source_id: process.env.NOTION_TEAM_DB_ID!,
    sorts: [{ property: 'Name', direction: 'ascending' }],
  });

  return res.results.map((p) => pageToTeamMember(p as Record<string, unknown>));
}

// ─── Docs ─────────────────────────────────────────────────────────────────────

export async function fetchDocBlocks(): Promise<NotionBlock[]> {
  const res = await notion.blocks.children.list({
    block_id: process.env.NOTION_DOCS_PAGE_ID!,
  });

  return res.results as NotionBlock[];
}
