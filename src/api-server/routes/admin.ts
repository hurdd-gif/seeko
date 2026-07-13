import { Hono } from 'hono';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAdmin, getAdminProfile, getClientIp, isRateLimited } from '../auth-utils';
import { getServiceClient, getServiceClientAs } from '@/lib/supabase/service';
import { sendInviteEmail } from '@/lib/email';
import type { Department } from '@/lib/types';

const VALID_DEPARTMENTS: Department[] = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inviteIpHits = new Map<string, { count: number; resetAt: number }>();
const bootAttempts = new Map<string, { count: number; resetAt: number }>();

export function createAdminRoutes() {
  return new Hono()
    .post('/invite', async (c) => {
      if (isRateLimited(inviteIpHits, getClientIp(c), { max: 5, windowMs: 60 * 60 * 1000 })) {
        return c.json({ error: 'Too many requests. Try again later.' }, 429);
      }

      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error === 'Forbidden' ? 'Admin only' : admin.error }, admin.status);

      const body = await c.req.json().catch(() => null) as {
        email?: unknown;
        department?: unknown;
        isContractor?: unknown;
        isInvestor?: unknown;
      } | null;
      if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!email || !EMAIL_REGEX.test(email)) return c.json({ error: 'Valid email is required' }, 400);

      const emailLower = email.toLowerCase();
      const department = typeof body.department === 'string' && VALID_DEPARTMENTS.includes(body.department as Department)
        ? body.department
        : null;
      const service = getServiceClient();

      const { error: insertError } = await service.from('pending_invites').upsert(
        {
          email: emailLower,
          department,
          is_contractor: body.isContractor ?? false,
          is_investor: body.isInvestor ?? false,
        } as never,
        { onConflict: 'email' }
      );

      if (insertError) {
        console.error('[hono invite] pending invite failed:', insertError);
        return c.json({ error: 'Failed to create invite record' }, 400);
      }

      const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || new URL(c.req.url).origin;
      const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
        type: 'invite',
        email: emailLower,
        options: { redirectTo: `${siteOrigin}/login` },
      });

      if (linkError) {
        console.error('[hono invite] generateLink failed:', linkError);
        return c.json({ error: 'Failed to generate invite link' }, 400);
      }

      const inviteCode = linkData.properties.email_otp;
      if (!inviteCode) {
        console.error('[hono invite] no OTP returned:', linkData.properties);
        return c.json({ error: 'Failed to generate invite code' }, 500);
      }

      try {
        await sendInviteEmail({ recipientEmail: emailLower, inviteCode });
      } catch (error) {
        console.error('[hono invite] email failed:', error);
        return c.json({ error: 'Failed to send invite email' }, 500);
      }

      return c.json({ success: true });
    })
    .post('/admin/boot-member', async (c) => {
      const admin = await requireAdmin(c);
      if (!admin.ok) return c.json({ error: admin.error === 'Forbidden' ? 'Admin only' : admin.error }, admin.status);

      if (isRateLimited(bootAttempts, admin.user.id, { max: 3, windowMs: 15 * 60 * 1000 }, 50)) {
        return c.json({ error: 'Too many attempts. Try again later.' }, 429);
      }

      const body = await c.req.json().catch(() => null) as { userId?: unknown; password?: unknown } | null;
      if (!body) return c.json({ error: 'Invalid JSON' }, 400);
      const userId = typeof body.userId === 'string' ? body.userId : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!userId || !password) return c.json({ error: 'userId and password required' }, 400);
      if (userId === admin.user.id) return c.json({ error: 'Cannot boot yourself' }, 400);

      const adminProfile = await getAdminProfile(admin.user.id);
      const email = adminProfile?.email ?? admin.user.email;
      if (!email) return c.json({ error: 'Could not determine admin email' }, 500);

      const verifier = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { error: authError } = await verifier.auth.signInWithPassword({ email, password });
      if (authError) return c.json({ error: 'Incorrect password' }, 403);

      const service = getServiceClient();
      // Actor-bound: unassigning the departing user's tasks trips tasks_audit_update
      // → 'assignee_changed' rows. The admin running the deletion is who did that;
      // without the actor these land as the anonymous rows this whole seam exists to
      // stop. (The departing user obviously cannot be the actor — they are the object.)
      await getServiceClientAs(admin.user.id).from('tasks').update({ assignee_id: null }).eq('assignee_id', userId);
      await service.from('task_comment_reactions').delete().eq('user_id', userId);
      await service.from('task_comments').delete().eq('user_id', userId);
      await service.from('task_handoffs').delete().eq('from_user_id', userId);
      await service.from('task_handoffs').delete().eq('to_user_id', userId);
      await service.from('task_deliverables').delete().eq('uploaded_by', userId);

      const { data: userPayments } = await service
        .from('payments')
        .select('id')
        .or(`recipient_id.eq.${userId},created_by.eq.${userId}`);
      if (userPayments?.length) {
        await service.from('payment_items').delete().in('payment_id', userPayments.map((payment) => payment.id));
      }
      await service.from('payments').delete().or(`recipient_id.eq.${userId},created_by.eq.${userId}`);
      await service.from('notifications').delete().eq('user_id', userId);
      await service.from('activity_log').delete().eq('user_id', userId);

      const { data: avatarFiles } = await service.storage.from('avatars').list(userId);
      if (avatarFiles?.length) await service.storage.from('avatars').remove(avatarFiles.map((file) => `${userId}/${file.name}`));
      const { data: agreementFiles } = await service.storage.from('agreements').list(userId);
      if (agreementFiles?.length) await service.storage.from('agreements').remove(agreementFiles.map((file) => `${userId}/${file.name}`));

      const { data: grantedDocs } = await service.from('docs').select('id, granted_user_ids').contains('granted_user_ids', [userId]);
      for (const doc of grantedDocs ?? []) {
        const updated = ((doc.granted_user_ids as string[] | null) ?? []).filter((id) => id !== userId);
        await service.from('docs').update({ granted_user_ids: updated } as never).eq('id', doc.id);
      }

      const { data: bootedProfile } = await service.from('profiles').select('email').eq('id', userId).single();
      if (bootedProfile?.email) await service.from('pending_invites').delete().eq('email', bootedProfile.email.toLowerCase());

      const { error: profileError } = await service.from('profiles').delete().eq('id', userId);
      if (profileError) return c.json({ error: 'Database error deleting user' }, 500);

      const { error: deleteError } = await service.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.error('[hono boot-member] auth delete failed:', deleteError);
        return c.json({ error: 'Failed to remove user account' }, 500);
      }

      return c.json({ success: true });
    });
}
