# MASSFRONT live auth/social verification — 2026-08-19

Production target: `https://massfront-auth.jasondixon1994.workers.dev`

This record covers the account/friends/block/report backend only. It did not
publish an APK, OTA payload, Hugging Face release, update manifest, or game
client channel.

## Production repair

- Initial `/health`: HTTP 200, `{"status":"ok","service":"massfront-auth"}`.
- Initial route manifest exposed only register/login/logout/me/save.
- Initial D1 contained two accounts and only the original
  `users/sessions/saves/attempts` tables.
- Pre-change D1 Time Travel bookmark:
  `00000109-00000000-000050cd-10104020f97b154f39969ac90443708c`.
- Local Worker/D1 suite: 146/146 checks passed.
- Applied idempotent `schema.sql`: 20 queries completed.
- Applied one-time `migrations/0001-social-columns.sql`: two queries completed.
- Post-migration D1 retained both original accounts and added all six social
  tables plus `users.verified_at` and `users.social_banned`.
- Wrangler dry-run: 39.20 KiB upload / 8.58 KiB gzip, correct
  `env.DB (massfront-accounts)` binding.
- Deployed Worker version:
  `bdabbc29-9607-4565-8847-941ea59d2e37`.
- Post-deploy route manifest exposes verification, age, username, account
  deletion, friends, requests, blocks, unblock, and abuse-report routes.

## Isolated live exercise

Run from the repository root only with explicit production confirmation:

```powershell
./tools/test-social-live.ps1 -ConfirmProduction
```

The probe creates two unique `example.invalid` QA accounts, marks exactly those
two rows verified through authenticated D1 access, drives the public HTTPS API,
deletes both accounts, and queries every affected table for residue.

Final result: **15 passed, 0 failed**.

- production health;
- two registrations and authenticated identity reads;
- cloud-save PUT/GET round trip;
- friend request and recipient inbox;
- symmetric friend acceptance;
- block removes the friendship and returns the privacy-preserving
  `403 blocked` response in either direction;
- unblock restores request ability without restoring friendship;
- abuse report accepted;
- both account deletions accepted;
- zero residual user/session/save/verification/friend/request/block/report rows
  for the two QA identities.

Post-run authoritative D1 counts: two original users remain; friendships,
friend requests, blocks, and reports are all zero. The IP-keyed registration
rate-limit entries deliberately remain and expire under the normal 24-hour
prune policy; they contain no QA e-mail or username.

## Remaining production dependency

Cloudflare authentication is authorized with D1 access, but the account has no
Email Sending subdomain and no Email Routing zone. Production therefore cannot
deliver verification codes yet. The Worker never echoes codes in production;
the live probe used direct verification of only its isolated rows rather than
weakening that security gate.

Cloudflare Email Service can send verification mail once the owner onboards a
sender domain and has a Workers Paid entitlement for arbitrary recipients.
The codebase retains a fail-closed provider seam; binding configuration must not
be deployed until a real sender domain and `MAIL_FROM` are selected.

Official references:

- https://developers.cloudflare.com/email-service/get-started/send-emails/
- https://developers.cloudflare.com/email-service/configuration/send-bindings/
- https://developers.cloudflare.com/email-service/platform/pricing/

## Staged communication foundation — intentionally not deployed

The repository now also contains additive migration
`migrations/0002-chat-presence.sql` and disabled-by-default chat/presence
handlers. This stage is not active on the production Worker and was not applied
to production D1 during the repair above. Both capabilities require an exact
feature flag *and* a successful table-readiness probe, so a stray truthy value
cannot expose a half-migrated service.

The expanded local Worker suite is **262/262 green** and the network-free
client contract probe is **46/46 green**. The staged design provides friend-only
direct messages, two-way block enforcement, keyset pagination capped at 50,
bounded message size and rate limits, participant-only reporting, privacy-safe
120-second presence, session-epoch isolation across account switches, and an
optional fail-closed content-safety binding. Shipped Wrangler chat, presence,
email, and sender values remain commented/inactive.

The verification-mail seam now uses Cloudflare Email Service's current
structured Workers contract, `env.EMAIL.send({to, from, subject, text, html})`,
only when both the binding and a syntactically valid `MAIL_FROM` exist. Missing,
invalid, or throwing providers preserve the existing `sent:false` response and
never echo the code or provider error. This API shape was checked against the
official Workers API and June 2026 Email Sending documentation:

- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- https://developers.cloudflare.com/email-service/examples/email-sending/

Activation still requires the owner to place a sending domain on Cloudflare
DNS, onboard it to Email Service, select `MAIL_FROM`, and enable the binding.
Until then, keeping verification mail and the communication flags off is the
only honest production configuration.
