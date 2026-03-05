# Auth email troubleshooting

## "Error sending confirmation email" when inviting

This message comes from Supabase when the OTP/invite email cannot be sent.

### Already using Custom SMTP?

If SMTP is configured and you still see this:

1. **Check Supabase Auth logs**  
   Dashboard → **Logs** (sidebar) or **Authentication** → **Logs**. Filter for auth/sign-in events around the time you sent the invite. The log entry usually includes the real error (e.g. SMTP connection refused, auth failed, recipient rejected).

2. **Verify sender and domain in your SMTP provider**  
   - Sender email/domain must be verified (e.g. Resend/SendGrid “Verify domain”, “Sender identity”).  
   - The “From” Supabase uses must match a verified sender.

3. **Check your SMTP provider’s dashboard**  
   Look for bounces, blocks, or rejections for the invitee’s address. Some providers silence errors and only show them in the dashboard.

4. **Rate limits**  
   - Supabase: e.g. one OTP per 60 seconds per email. Wait a minute and try again.  
   - Your SMTP provider may also throttle; check its docs and dashboard.

5. **Email template errors**  
   If you customized the **Confirm signup** or **Magic Link** template in Supabase, a bad variable or invalid HTML can cause the send to fail. Try reverting to the default template briefly to see if invites work, then re-apply your custom template with small changes.

6. **Try a different recipient**  
   Test with another address (e.g. a personal Gmail) to see if the failure is specific to one mailbox or domain.

---

### Not using SMTP yet (default Supabase email)

Supabase’s built-in email is for **testing only**:

- Sends only to **pre-authorized** addresses (your org’s emails in the dashboard).
- Strict rate limits.
- No guarantee of delivery.

**Fix:** Configure **Custom SMTP** (Authentication → Settings → SMTP) with a provider such as Resend, SendGrid, or Brevo.

---

### Pre-authorize the recipient (default email only)

If you’re on the default Supabase email and only testing, add the invitee’s email to the allowed/pre-authorized list in Authentication settings if your project has that option.

---

**Summary:** With SMTP already set up, the next step is **Auth logs** in the Supabase dashboard for the exact error, then your SMTP provider’s dashboard and sender/domain verification. Use the [email templates](supabase/templates/README.md) so invite emails show the 6-digit code.
