import { getServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/database.types';

const DOCS_INDEX_SELECT =
  'id, title, content, restricted_department, granted_user_ids, type, slides, deck_orientation, created_at, updated_at, sort_order' as const;
const PROFILE_SELECT = 'id, display_name, department, avatar_url, is_admin, is_investor' as const;
const RECENTLY_UPDATED_MS = 48 * 60 * 60 * 1000;

type DocsRow = Pick<
  Database['public']['Tables']['docs']['Row'],
  | 'id'
  | 'title'
  | 'content'
  | 'restricted_department'
  | 'granted_user_ids'
  | 'type'
  | 'slides'
  | 'deck_orientation'
  | 'created_at'
  | 'updated_at'
  | 'sort_order'
>;

export type DocsIndexItem = {
  id: string;
  title: string;
  type: 'doc' | 'deck';
  restrictedDepartments: string[];
  locked: boolean;
  preview: string;
  slideCount: number;
  thumbnailUrl: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  recentlyUpdated: boolean;
};

export type DocsIndexData = {
  currentUser: {
    id: string;
    email?: string | null;
  };
  profile: {
    id: string;
    displayName: string | null;
    department: string | null;
    avatarUrl: string | null;
    isAdmin: boolean;
  };
  docs: DocsIndexItem[];
  docCount: number;
  deckCount: number;
  lockedCount: number;
};

export class DocsIndexAccessError extends Error {
  constructor(public readonly code: 'profile_not_found' | 'investor_forbidden') {
    super(code);
    this.name = 'DocsIndexAccessError';
  }
}

export async function loadDocsIndex(currentUser: {
  id: string;
  email?: string | null;
}): Promise<DocsIndexData> {
  const service = getServiceClient();
  const [{ data: profile, error: profileError }, { data, error }] = await Promise.all([
    service
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', currentUser.id)
      .maybeSingle(),
    service
      .from('docs')
      .select(DOCS_INDEX_SELECT)
      .is('parent_id', null)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true }),
  ]);

  if (profileError) throw profileError;
  if (error) throw error;
  if (!profile) throw new DocsIndexAccessError('profile_not_found');
  if (profile.is_investor && !profile.is_admin) throw new DocsIndexAccessError('investor_forbidden');

  const docs = ((data ?? []) as DocsRow[]).map((doc) => toDocsIndexItem(doc, {
    currentUserId: currentUser.id,
    userDepartment: profile.department,
    isAdmin: profile.is_admin,
  }));

  return {
    currentUser,
    profile: {
      id: profile.id,
      displayName: profile.display_name,
      department: profile.department,
      avatarUrl: profile.avatar_url,
      isAdmin: profile.is_admin,
    },
    docs,
    docCount: docs.filter((doc) => doc.type !== 'deck').length,
    deckCount: docs.filter((doc) => doc.type === 'deck').length,
    lockedCount: docs.filter((doc) => doc.locked).length,
  };
}

export function toDocsIndexItem(
  doc: DocsRow,
  access: {
    currentUserId: string;
    userDepartment: string | null;
    isAdmin: boolean;
  }
): DocsIndexItem {
  const restrictedDepartments = doc.restricted_department ?? [];
  const locked = isDocLocked({
    restrictedDepartments,
    grantedUserIds: doc.granted_user_ids ?? [],
    ...access,
  });
  const slides = parseSlides(doc.slides);
  const timestamp = doc.updated_at ?? doc.created_at;

  return {
    id: doc.id,
    title: doc.title,
    type: doc.type === 'deck' ? 'deck' : 'doc',
    restrictedDepartments,
    locked,
    preview: locked ? '' : stripHtml(doc.content ?? '').slice(0, doc.type === 'deck' ? 100 : 200),
    slideCount: locked ? 0 : slides.length,
    thumbnailUrl: locked ? null : slides[0]?.thumbnail_url ?? slides[0]?.url ?? null,
    updatedAt: doc.updated_at,
    createdAt: doc.created_at,
    recentlyUpdated: timestamp ? Date.now() - new Date(timestamp).getTime() < RECENTLY_UPDATED_MS : false,
  };
}

export function isDocLocked({
  restrictedDepartments,
  grantedUserIds,
  currentUserId,
  userDepartment,
  isAdmin,
}: {
  restrictedDepartments: string[];
  grantedUserIds: string[];
  currentUserId: string;
  userDepartment: string | null;
  isAdmin: boolean;
}) {
  if (isAdmin) return false;
  if (restrictedDepartments.length === 0) return false;
  if (userDepartment && restrictedDepartments.includes(userDepartment)) return false;
  if (grantedUserIds.includes(currentUserId)) return false;
  return true;
}

function parseSlides(slides: DocsRow['slides']): { url?: string; thumbnail_url?: string }[] {
  if (!Array.isArray(slides)) return [];
  return slides.filter((slide): slide is { url?: string; thumbnail_url?: string } => {
    return !!slide && typeof slide === 'object' && !Array.isArray(slide);
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
