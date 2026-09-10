# Backend setup

Everything below happens in your Vercel and Neon dashboards. None of it is in
this repository, and no secret value belongs in this repository. Do it once,
in this order, then deploy.

## 1. The database — DONE

Neon, from the Vercel Marketplace, on the Free plan. It is called
**neon-citron-basket** and it is already connected to `anteroom-site`.
The integration wrote `DATABASE_URL` into the project's environment variables
by itself, along with a pile of `POSTGRES_*` and `PG*` aliases this code does
not use. `DATABASE_URL` is the only one it reads.

## 2. The photograph store — DONE

**anteroom-leads-private-prod**, the private Blob store you made on
4 September, is now connected to `anteroom-site`.

Note what the connection created: `BLOB_STORE_ID` and
`BLOB_WEBHOOK_PUBLIC_KEY`, but **not** `BLOB_READ_WRITE_TOKEN`. Vercel's
current dialog authenticates the functions with a scoped store identity rather
than a long-lived token, and offers the static token only as a tick box, which
was left unticked. The SDK supports both, and an identity that cannot be
copied out and reused elsewhere is the safer of the two.

If an upload ever fails with a token error, the fix is to reconnect the store
with **Add a read-write token env var to this connection** ticked.

Private means there is no URL that opens a guest's photograph, not even an
unguessable one. `/admin` fetches each image through `/api/photo-view`, which
checks your admin token first. Nothing is ever readable without it.

## 3. The table — DONE

`schema.sql` ran in the Neon SQL Editor on 10 September: 7 statements, all
successful. `neondb` → `public` → `leads` exists, with 0 rows.

Running it again is safe if you ever need to.

## 4. The two secrets — YOUR TURN

These are passwords. Nobody types them for you, and they should not pass
through a chat window.

Settings → Environment Variables → Add. Tick Production and Preview for each,
matching what Neon and Blob already set.

| Name | What it is | Required |
| --- | --- | --- |
| `ADMIN_TOKEN` | The password for `/admin`. Must be at least 16 characters; the code refuses anything shorter. | Yes |
| `IP_SALT` | Salt for the IP hash used by the rate limiter. Any long random string. | Yes |
| `RESEND_API_KEY` | Resend API key, if you want an email when a lead arrives. | No |
| `NOTIFY_EMAIL` | Where those emails go. | No |
| `NOTIFY_FROM` | The from address, on a domain verified in Resend. | No |

Generate them in Terminal:

```
openssl rand -hex 32   # ADMIN_TOKEN
openssl rand -hex 32   # IP_SALT
```

If the three Resend variables are absent, the notification step is skipped
silently. Leads still save; you just read them at `/admin` instead of being
told about them.

## 4. Deploy

```
cd ~/"Hospitality Development/anteroom-site"
git add -A
git commit -m "Lead capture backend, wired forms, admin list"
git push origin main
```

`package.json` has no build script, so Vercel installs the two dependencies for
the functions and serves the pages exactly as it does now.

## 5. Check it works

1. Open `/send-one-photograph`, submit a real photo, and confirm you get the
   "Your scene is in production" screen.
2. Open `/start-a-brief`, complete all four steps, and confirm "Brief received."
3. Open `/admin`, paste `ADMIN_TOKEN`, and confirm both leads are listed, with
   the photograph thumbnail clickable.
4. Change a status and save a note. Reload. The change should still be there.

If step 1 or 2 shows a red error line instead, the message is the real reason —
almost always a missing environment variable.

## What is deliberately not here

No pipeline, no automation, no email sequences. One table, one list, five
statuses, a notes box. Adding a second table before you have used the first one
would be building for a problem you have not had yet.

## Notes

- `/admin` is excluded from search engines twice: a `robots` meta tag in the
  page and an `X-Robots-Tag` header in `vercel.json`. The token is kept in
  `sessionStorage`, so it dies with the tab and is never written to disk.
- No raw IP address is ever stored. The rate limiter compares salted hashes.
- The database holds the path of a photograph inside the private store, never
  a link. The alert email does not carry the image either — it points you at
  `/admin` instead, because an email is the last place to put something that
  would open a guest's photograph.
- The browser downscales a photograph before sending it, because the platform
  rejects any request body over 4.5 MB. A file already under the limit is sent
  untouched rather than re-encoded.
- The server checks the first bytes of every upload, not the declared type, so
  a PDF renamed `.jpg` never reaches storage.
