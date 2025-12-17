# PWA Push Notifications - VAPID Keys Setup

## Generate VAPID Keys

Visit one of these sites to generate your keys:
- https://vapidkeys.com/
- https://www.attheminute.com/vapid-key-generator

You will get:
- **Public Key** (use in frontend AND Edge Function)
- **Private Key** (use ONLY in Edge Function - keep secret!)

---

## Configure Supabase Edge Function Secrets

1. Go to Supabase Dashboard → Edge Functions → Secrets
2. Add these secrets:

| Name | Value |
|------|-------|
| `VAPID_PUBLIC_KEY` | Your public key |
| `VAPID_PRIVATE_KEY` | Your private key |

---

## Configure Frontend

Update the file `src/hooks/usePushNotifications.ts`:

```typescript
// Line 7 - Replace with your PUBLIC key
const VAPID_PUBLIC_KEY = 'YOUR_PUBLIC_KEY_HERE';
```

---

## Deploy Edge Function

```bash
npx supabase functions deploy send-push
```

---

## Test

1. Enable a notification type in Settings → Sistema → Notificações Push
2. Trigger an action (create task, update deal, etc.)
3. Check if push notification arrives
