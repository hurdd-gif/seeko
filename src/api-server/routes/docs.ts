import { Hono, type Context } from 'hono';
import {
  loadDocsIndex,
  type DocsIndexData,
} from '@/lib/docs-index';
import { AccessError, accessErrorStatus } from '@/lib/access-error';
import { getServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '../auth-utils';
import { getAuthenticatedUser, type AuthenticatedUser } from '../supabase';

type DocsIndexLoader = (user: AuthenticatedUser) => Promise<DocsIndexData>;
type AuthResolver = (c: Context) => Promise<AuthenticatedUser | null>;

type DocsRoutesOptions = {
  authResolver?: AuthResolver;
  docsIndexLoader?: DocsIndexLoader;
};

export function createDocsRoutes(options: DocsRoutesOptions = {}) {
  const authResolver = options.authResolver ?? getAuthenticatedUser;
  const docsIndexLoader = options.docsIndexLoader ?? loadDocsIndex;

  return new Hono()
  .get('/docs-index', async (c) => {
    const user = await authResolver(c);

    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    try {
      const data = await docsIndexLoader(user);
      return c.json(data);
    } catch (error) {
      if (error instanceof AccessError) {
        return c.json({ error: error.message }, accessErrorStatus(error.reason));
      }

      console.error('[hono docs-index] load failed:', error);
      return c.json({ error: 'Failed to load documents.' }, 500);
    }
  })
  .post('/docs', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return c.json({ error: admin.error }, admin.status);

    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'Invalid JSON' }, 400);

    const { title, content, sort_order, restricted_department, granted_user_ids, type, slides, deck_orientation } = body;
    const service = getServiceClient();
    const { data, error } = await service
      .from('docs')
      .insert({
        title,
        content,
        sort_order: sort_order ?? 0,
        restricted_department: restricted_department ?? null,
        granted_user_ids: Array.isArray(granted_user_ids) && granted_user_ids.length ? granted_user_ids : null,
        ...(type === 'deck' ? { type: 'deck' } : {}),
        ...(slides ? { slides } : {}),
        ...(deck_orientation ? { deck_orientation } : {}),
      } as never)
      .select()
      .single();

    if (error) {
      console.error('[hono docs] create failed:', error);
      return c.json({ error: 'Failed to create document' }, 500);
    }

    return c.json(data, 201);
  })
  .patch('/docs/:id', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return c.json({ error: admin.error }, admin.status);

    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'Invalid JSON' }, 400);

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if ('restricted_department' in body) updates.restricted_department = body.restricted_department ?? null;
    if ('granted_user_ids' in body) {
      updates.granted_user_ids = Array.isArray(body.granted_user_ids) && body.granted_user_ids.length
        ? body.granted_user_ids
        : null;
    }
    if ('slides' in body) updates.slides = body.slides;
    if ('deck_orientation' in body) updates.deck_orientation = body.deck_orientation;
    updates.updated_at = new Date().toISOString();

    const service = getServiceClient();
    if ('slides' in body) {
      const { data: existing } = await service.from('docs').select('slides').eq('id', id).single();
      const oldSlides = (existing?.slides as { sort_order: number }[] | null) ?? [];
      const newSlides = (body.slides as { sort_order: number }[] | null) ?? [];
      if (oldSlides.length > newSlides.length) {
        const orphanPaths = Array.from(
          { length: oldSlides.length - newSlides.length },
          (_, i) => {
            const index = newSlides.length + i;
            return [`${id}/${index}.webp`, `${id}/${index}-thumb.webp`];
          }
        ).flat();
        await service.storage.from('deck-slides').remove(orphanPaths);
      }
    }

    const { data, error } = await service
      .from('docs')
      .update(updates as never)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[hono docs/:id] update failed:', error);
      return c.json({ error: 'Operation failed' }, 500);
    }

    return c.json(data);
  })
  .delete('/docs/:id', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return c.json({ error: admin.error }, admin.status);

    const { error } = await getServiceClient().from('docs').delete().eq('id', c.req.param('id'));
    if (error) {
      console.error('[hono docs/:id] delete failed:', error);
      return c.json({ error: 'Operation failed' }, 500);
    }

    return c.json({ success: true });
  })
  .post('/docs/upload', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return c.json({ error: admin.error }, admin.status);

    const formData = await c.req.formData().catch(() => null);
    if (!formData) return c.json({ error: 'Invalid multipart form data' }, 400);

    const file = formData.get('file');
    if (!(file instanceof File)) return c.json({ error: 'No file provided' }, 400);
    if (!file.type.startsWith('image/')) return c.json({ error: 'Only image files allowed' }, 400);
    if (file.size > 5 * 1024 * 1024) return c.json({ error: 'File too large (max 5 MB)' }, 400);

    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const service = getServiceClient();
    const { error } = await service.storage.from('doc-images').upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      console.error('[hono docs/upload] upload failed:', error);
      return c.json({ error: 'Failed to upload image' }, 500);
    }

    const { data: { publicUrl } } = service.storage.from('doc-images').getPublicUrl(path);
    return c.json({ url: publicUrl }, 201);
  })
  .post('/docs/upload-deck', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin.ok) return c.json({ error: admin.error }, admin.status);

    const formData = await c.req.formData();
    const deckId = formData.get('deckId');
    const slideIndex = formData.get('slideIndex');
    const file = formData.get('file');
    const thumbnail = formData.get('thumbnail');

    if (typeof deckId !== 'string' || typeof slideIndex !== 'string' || !(file instanceof File)) {
      return c.json({ error: 'Missing deckId, slideIndex, or file' }, 400);
    }
    if (file.size > 10 * 1024 * 1024) return c.json({ error: 'File too large (max 10MB)' }, 400);
    if (thumbnail instanceof File && thumbnail.size > 1024 * 1024) {
      return c.json({ error: 'Thumbnail too large (max 1MB)' }, 400);
    }

    const service = getServiceClient();
    const path = `${deckId}/${slideIndex}.webp`;
    const thumbnailPath = `${deckId}/${slideIndex}-thumb.webp`;
    const { error } = await service.storage.from('deck-slides').upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: 'image/webp',
      upsert: true,
    });
    if (error) {
      console.error('[hono docs/upload-deck] upload failed:', error);
      return c.json({ error: 'Failed to upload slide' }, 500);
    }

    let thumbnailUrl: string | undefined;
    if (thumbnail instanceof File) {
      const { error: thumbnailError } = await service.storage
        .from('deck-slides')
        .upload(thumbnailPath, Buffer.from(await thumbnail.arrayBuffer()), {
          contentType: 'image/webp',
          upsert: true,
        });
      if (thumbnailError) {
        console.error('[hono docs/upload-deck] thumbnail upload failed:', thumbnailError);
        return c.json({ error: 'Failed to upload slide thumbnail' }, 500);
      }
      const { data } = service.storage.from('deck-slides').getPublicUrl(thumbnailPath);
      thumbnailUrl = `${data.publicUrl}?v=${Date.now()}`;
    }

    const { data } = service.storage.from('deck-slides').getPublicUrl(path);
    return c.json({ url: `${data.publicUrl}?v=${Date.now()}`, thumbnail_url: thumbnailUrl, sort_order: Number(slideIndex) }, 201);
  });
}
