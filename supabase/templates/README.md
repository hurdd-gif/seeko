# Supabase email templates

Templates use [Go template](https://pkg.go.dev/text/template) variables (e.g. `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .SiteURL }}`).

## Which template does the app use for invites?

The app uses **`signInWithOtp`** (not `inviteUserByEmail`). When inviting a **new** email address, Supabase often sends the **Confirm signup** template—so you get the default “Confirm your email” body even if the subject says “Your SEEKO Studio invite code”. When the email is for an existing user, Supabase may use the **Magic Link** template.

To send an **invite code** (6-digit) instead of “Confirm your email”:

1. Paste the body of `invite.html` into **both** templates (see below):
   - **Confirm signup** ← this is the one that was still sending “Confirm your email”
   - **Magic Link**
2. Set the **Subject** to e.g. **Your SEEKO Studio invite code** on both.

---

## Where to find Email Templates in the dashboard

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. In the **left sidebar**, click **Authentication** (lock icon).
3. In the Authentication section, open the **Templates** tab (or **Email Templates** in the sub-nav).
4. You’ll see a list of templates (**Magic Link**, **Confirm signup**, Invite user, Reset password, etc.). For invites to show a **code**, you must update **both** Magic Link and **Confirm signup** (see below).

**Direct URL:**  
`https://supabase.com/dashboard/project/<your-project-ref>/auth/templates`  
(Replace `<your-project-ref>` with your project reference, e.g. from your project URL.)

If you don’t see **Templates**, look for **Email** or **Auth** → **Email templates** in the same Authentication area—Supabase sometimes renames or groups this under “Auth” or “Providers”.

**Important:** When you invite a **new** user with `signInWithOtp`, Supabase often uses the **Confirm signup** template. If only the subject was changed and the body still says “Confirm your email”, update the **Confirm signup** template body (paste `invite.html` there too). Update **both** Confirm signup and Magic Link so the code is sent in all cases.

**Redirect URL for invite flow:**  
So invite links land on your set-password page, add this to **Authentication → URL Configuration → Redirect URLs**:

- `https://your-domain.com/api/auth/callback/invite`
- For local: `http://localhost:3000/api/auth/callback/invite`

---

## Invite email (code, not sign-up link)

- **File to paste from:** `supabase/templates/invite.html` (in this repo).
- **Paste into both:** Supabase **Confirm signup** and **Magic Link** templates.  
  Inviting a **new** user often triggers the **Confirm signup** template (which is why you still saw “Confirm your email”). Pasting our template into **both** Confirm signup and Magic Link ensures users always get the **6-digit code** ({{ .Token }}) instead of a button or link.
- **Subject (set in dashboard for both):** e.g. `Your SEEKO Studio invite code`.

### How to use

**Supabase Dashboard (hosted):**

1. Go to **Authentication → Templates** (see “Where to find” above).
2. Open **Confirm signup**. Set **Subject** to `Your SEEKO Studio invite code`. Copy everything from `<body` through `</body>` in **`supabase/templates/invite.html`** and paste into the **Message body** (replace the default “Confirm your email” content). Save.
3. Open **Magic Link**. Set **Subject** to `Your SEEKO Studio invite code`. Paste the same body from `invite.html` into the **Message body**. Save.

**Local Supabase (`config.toml`):**

Use both template configs so the same code-based email is sent in all cases:

```toml
[auth.email.template.magic_link]
subject = "Your SEEKO Studio invite code"
content_path = "./supabase/templates/invite.html"

[auth.email.template.confirmation]
subject = "Your SEEKO Studio invite code"
content_path = "./supabase/templates/invite.html"
```
