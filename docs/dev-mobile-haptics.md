# Testing haptics on your phone (local server)

Haptic feedback (WebHaptics) only runs on real mobile devices. To test from your phone using your machine’s local Next.js server:

## 1. Same Wi‑Fi

Make sure your phone and your computer are on the **same Wi‑Fi network**.

## 2. Start the dev server bound to all interfaces

From the project root:

```bash
npm run dev:mobile
```

This runs `next dev --turbopack -H 0.0.0.0` so the server listens on all interfaces instead of only `localhost`.

## 3. Find your computer’s local IP

- **macOS:** System Settings → Network → Wi‑Fi → Details, or run:
  ```bash
  ipconfig getifaddr en0
  ```
  (Use `en1` if you’re on Ethernet, or run `ifconfig` and look for `inet` under your active interface.)

- **Windows:** `ipconfig` and look for “IPv4 Address” under your Wi‑Fi adapter.

- **Linux:** `ip addr` or `hostname -I`.

Example: `192.168.1.42`

## 4. Open the app on your phone

In your phone’s browser (Safari on iOS, Chrome on Android), go to:

```
http://<YOUR_IP>:3000
```

e.g. `http://192.168.1.42:3000`

## 5. What you should feel

- **Taps on buttons/links:** light “selection” haptic (every interactive tap).
- **Login / invite / set-password / onboarding success:** “success” pattern.
- **Validation or API errors:** “error” pattern.
- **Toasts (settings saved, doc saved, PDF downloaded, etc.):** “success” or “error” with the toast.

**iOS:** Uses Taptic Engine (iPhone 7+).  
**Android:** Uses `navigator.vibrate()`.  
**Desktop:** No haptics (library no-ops).

## Optional: HTTPS for iOS (if needed)

Some iOS features (e.g. certain permissions) require HTTPS. For local testing, HTTP is usually enough for haptics. If you need HTTPS on the network, use a tunnel (e.g. ngrok, Cloudflare Tunnel) or a local HTTPS setup and open the HTTPS URL on your phone.
