/**
 * The one rule every activity feed reads by: an event we cannot attribute is
 * not an event we show.
 *
 * activity_log holds rows whose user_id is NULL. They are all from the window
 * where the audit triggers stamped auth.uid() while the writes came in over the
 * service role, which has no session user — the triggers dutifully recorded who
 * did it, and recorded nobody. Migration 20260713140000 closed that hole (the
 * actor now travels with the request), but the rows it already produced cannot
 * be repaired: nothing in them names the person, and guessing would be a false
 * audit trail.
 *
 * So they stay in the table — deleting audit rows to tidy up a display problem
 * is exactly the wrong instinct, and a forensic reader can still find them —
 * and the feeds simply decline to render them. A row that cannot say who acted
 * has nothing to say in a feed whose whole shape is "<someone> did <something>".
 *
 * Anything NEW showing up as unattributed is a bug in the actor seam, not a
 * cosmetic issue. It will now be invisible in the UI, so if you are hunting
 * one, query activity_log directly: `select * from activity_log where user_id
 * is null order by created_at desc`.
 *
 * Not applied to the activity heatmap: that counts events per day and has no
 * actor to render, so an unattributable row is still a real day of work.
 */
export function attributedOnly<T extends { not(column: string, operator: 'is', value: null): T }>(
  query: T,
): T {
  return query.not('user_id', 'is', null);
}
