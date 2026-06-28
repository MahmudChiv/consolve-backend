# Implementation Plan — Modules 2, 3, 4 (Booking → Trust → Notification)

## Overview

This plan covers the next three modules of the Consolve backend in their required dependency order:

```
Module 2 — Booking       (depends on: Search, Notification)
Module 3 — Trust Score   (depends on: Booking, Review, Vouch, Notification)
Module 4 — Notification  (passive receiver — no upstream dependencies)
```

> [!IMPORTANT]
> Build order is **Notification → Booking → Trust**. Notification is a passive module with no upstream dependencies and must exist before Booking or Trust can call it.

---

## Phase 1 — Prisma Schema (All Models)

All four new models plus enums will be added to `schema.prisma` in one migration.

#### [MODIFY] [schema.prisma](file:///c:/Users/USER%20PC/Documents/consolve/consolve-backend/prisma/schema.prisma)

**New enums to add:**
- `BookingStatus { PENDING, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED, DISPUTED }`
- `BookingType { HIRE_NOW, SCHEDULED }`
- `NotificationType { BOOKING_REQUEST, BOOKING_ACCEPTED, BOOKING_COMPLETED, BOOKING_CANCELLED, BOOKING_DISPUTED, TRUST_SCORE_UPDATED, REVIEW_RECEIVED, VOUCH_RECEIVED, SYSTEM }`

**New models to add:**
- `Booking` — with relation to `Review?`
- `Review` — with unique `bookingId` (one review per booking)
- `TrustScore` — unique `userProfileId`
- `Vouch` — unique `(voucherProfileId, providerProfileId)` pair
- `Notification` — append-only log

**Existing model changes:**
- `UserProfile` — add back-relations: `bookingsAsCustomer Booking[]`, `bookingsAsProvider Booking[]`, `trustScore TrustScore?`, `vouchesReceived Vouch[]`, `vouchesGiven Vouch[]`, `notifications Notification[]`
- `Identity` — no changes required

**Command sequence:**
```bash
npx prisma migrate dev --name add-booking-trust-notification
npx prisma generate
```

---

## Phase 2 — Module 4: Notification (Build First)

> [!NOTE]
> Notification is a passive receiver module. `NotificationService.notify()` is called by Booking and Trust — it never calls them back.

### Files to create

#### [NEW] `src/modules/notification/notification.module.ts`
Exports `NotificationService` so BookingModule and TrustModule can import it.

#### [NEW] `src/modules/notification/notification.service.ts`

Core method:
```typescript
async notify(
  userId: string,
  userProfileId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void>
```
- Writes directly to the `Notification` table via `PrismaService`.
- Fire-and-forget: callers do not await the result (wrapped in try/catch with logger).

#### [NEW] `src/modules/notification/notification.controller.ts`

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/notifications` | Paginated list, `?page&limit&unreadOnly` |
| PATCH | `/api/v1/notifications/:id/read` | Mark single notification as read |
| PATCH | `/api/v1/notifications/read-all` | Mark all as read for authenticated user |

Guards: `JwtAuthGuard` + `BlacklistGuard` on all routes.

#### [NEW] `src/modules/notification/dto/`
- `query-notifications.dto.ts` — `page`, `limit`, `unreadOnly` query params

#### [NEW] `src/modules/notification/notification.service.spec.ts`

---

## Phase 3 — Module 2: Booking

### Files to create

#### [NEW] `src/modules/booking/booking.module.ts`
- Imports: `PrismaModule`, `RedisModule`, `AuthModule` (for guards), `NotificationModule`
- Exports: `BookingService` (for TrustModule to call)

#### [NEW] `src/modules/booking/booking.service.ts`

| Method | Description |
|--------|-------------|
| `createBooking(customerId, customerProfileId, dto)` | Look up provider profile → validate it exists and is a SERVICE_PROVIDER or TRADER → create `Booking` with status `PENDING` → call `NotificationService.notify(providerId, BOOKING_REQUEST)` → invalidate Redis cache |
| `getMyHires(userId, profileId, query)` | Paginated bookings where `customerProfileId = profileId`; Redis cache `bookings:customer:<profileId>` TTL 2 min |
| `getMyJobs(userId, profileId, query)` | Paginated bookings where `providerProfileId = profileId`; Redis cache `bookings:provider:<profileId>` TTL 2 min |
| `getBookingById(userId, profileId, bookingId)` | Returns single booking; verifies caller is either customer or provider |
| `acceptBooking(userId, profileId, bookingId)` | Provider only → status `PENDING → ACCEPTED` → notify customer |
| `completeBooking(userId, profileId, bookingId)` | Either party → status `ACCEPTED → COMPLETED` → notify both → call `TrustService.recalculate(providerProfileId)` |
| `cancelBooking(userId, profileId, bookingId, dto)` | Either party, only at `PENDING` or `ACCEPTED` → status `CANCELLED` → notify other party |
| `disputeBooking(userId, profileId, bookingId, dto)` | Either party → status `DISPUTED` → notify other party |
| `submitReview(userId, profileId, bookingId, dto)` | Customer only → booking must be `COMPLETED` → create `Review` → call `TrustService.recalculate(providerProfileId)` → notify provider |

**Cache invalidation:** Any status change deletes both `bookings:customer:<profileId>` and `bookings:provider:<profileId>` keys.

#### [NEW] `src/modules/booking/booking.controller.ts`

| Method | Route | Rate Limit | Auth |
|--------|-------|-----------|------|
| POST | `/api/v1/bookings` | 20/min | JWT + Blacklist |
| GET | `/api/v1/bookings/my-hires` | 60/min | JWT + Blacklist |
| GET | `/api/v1/bookings/my-jobs` | 60/min | JWT + Blacklist |
| GET | `/api/v1/bookings/:id` | 60/min | JWT + Blacklist |
| PATCH | `/api/v1/bookings/:id/accept` | 20/min | JWT + Blacklist |
| PATCH | `/api/v1/bookings/:id/complete` | 20/min | JWT + Blacklist |
| PATCH | `/api/v1/bookings/:id/cancel` | 20/min | JWT + Blacklist |
| PATCH | `/api/v1/bookings/:id/dispute` | 20/min | JWT + Blacklist |
| POST | `/api/v1/bookings/:id/review` | 10/min | JWT + Blacklist |

> [!IMPORTANT]
> `GET /api/v1/bookings/my-hires` and `GET /api/v1/bookings/my-jobs` must be registered **before** `GET /api/v1/bookings/:id` in the controller to avoid NestJS treating `my-hires` as an `:id` parameter.

#### [NEW] `src/modules/booking/dto/`
- `create-booking.dto.ts`
- `cancel-booking.dto.ts` — `reason: string`
- `dispute-booking.dto.ts` — `reason: string`, `description: string`
- `submit-review.dto.ts` — `rating: 1–5`, `comment?: string`
- `booking-query.dto.ts` — `status?: BookingStatus`, `page`, `limit`

#### [NEW] `src/modules/booking/booking.service.spec.ts`

---

## Phase 4 — Module 3: Trust Score

### Files to create

#### [NEW] `src/modules/trust/trust.module.ts`
- Imports: `PrismaModule`, `RedisModule`, `AuthModule`, `NotificationModule`
- Exports: `TrustService` (consumed by BookingModule)

> [!IMPORTANT]
> **Circular dependency risk**: BookingModule imports TrustModule (to call `recalculate`), but TrustModule must NOT import BookingModule. It queries Prisma directly for booking data instead. This is the correct design as specified by the architect.

#### [NEW] `src/modules/trust/trust.service.ts`

| Method | Description |
|--------|-------------|
| `recalculate(providerProfileId)` | Queries Prisma for all bookings, reviews, vouches for the provider → runs score formula → upsert `TrustScore` record → invalidates Redis cache `trust:<providerProfileId>` → notifies provider of score update |
| `getScore(profileId)` | Returns `TrustScore` from Redis cache `trust:<profileId>` TTL 5 min, or DB fallback |
| `getMyScore(userId, profileId)` | Same as `getScore` but for the authenticated user's own profile |
| `vouchForProvider(voucherId, voucherProfileId, targetProfileId, dto)` | Upsert vouch (one per pair) → call `recalculate(targetProfileId)` → notify provider |
| `getVouches(profileId)` | Returns all vouches for a profile; Redis cache `vouches:<profileId>` TTL 10 min |

**Score formula (matching architect specification):**
```
completionRate  = (completedJobs / totalJobs) * 100   → weight 30%
communityScore  = (avgRating / 5 * 100)               → weight 25%
                  + min(vouchCount * 10, 30)
paymentReliability = 70 (placeholder)                 → weight 20%
responseTimeScore  = 70 (placeholder)                 → weight 15%
profileCompleteness                                    → weight 10%
  (has avatarUrl + pricing field on Identity + availability field)

overallScore = weighted sum − (openDisputeCount * 15)
overallScore = clamp(overallScore, 0, 100)
```

#### [NEW] `src/modules/trust/trust.controller.ts`

| Method | Route | Cache | Auth |
|--------|-------|-------|------|
| GET | `/api/v1/trust/score/me` | None | JWT + Blacklist |
| GET | `/api/v1/trust/score/:profileId` | Redis 5 min | JWT + Blacklist |
| POST | `/api/v1/trust/vouch/:profileId` | Invalidates vouches cache | JWT + Blacklist |
| GET | `/api/v1/trust/vouches/:profileId` | Redis 10 min | JWT + Blacklist |

> [!IMPORTANT]
> `GET /api/v1/trust/score/me` must be declared before `GET /api/v1/trust/score/:profileId`.

#### [NEW] `src/modules/trust/dto/`
- `vouch.dto.ts` — `message?: string`

#### [NEW] `src/modules/trust/trust.service.spec.ts`

---

## Phase 5 — Search Ranker Update

#### [MODIFY] [search.ranker.ts](file:///c:/Users/USER%20PC/Documents/consolve/consolve-backend/src/modules/search/search.ranker.ts)

Update `computeRankScore()` to accept an optional `trustScore` parameter:
- If a `TrustScore` record exists for the provider, use `trustScore.overallScore` as the primary score.
- If no `TrustScore` exists, fall back to the current profile completeness rank score.
- This change is backwards-compatible — Search works before and after Trust is built.

#### [MODIFY] [search.service.ts](file:///c:/Users/USER%20PC/Documents/consolve/consolve-backend/src/modules/search/search.service.ts)

Update the DB query in `search()` and `nearby()` to also fetch the `trustScore` relation on `UserProfile` (via Prisma include) and pass it to the ranker.

---

## Phase 6 — App Module Wiring

#### [MODIFY] [app.module.ts](file:///c:/Users/USER%20PC/Documents/consolve/consolve-backend/src/app.module.ts)

Add three new module imports in dependency order:
```typescript
import { NotificationModule } from './modules/notification/notification.module';
import { BookingModule } from './modules/booking/booking.module';
import { TrustModule } from './modules/trust/trust.module';
```

---

## Verification Plan

### Automated Tests
```bash
npm run test          # All 91+ tests must still pass after each phase
npm run build         # TypeScript must compile cleanly
npx prisma validate   # Schema must be valid before migration
```

### Manual Verification (Swagger / Postman)
After each phase, verify using the seeded credentials (`+2348000000001` / `Password123!`):

| # | Endpoint | Expected |
|---|----------|----------|
| 1 | `POST /api/v1/bookings` | Booking created with `PENDING` status |
| 2 | `GET /api/v1/bookings/my-hires` | Returns the created booking |
| 3 | `PATCH /api/v1/bookings/:id/accept` | Status changes to `ACCEPTED` |
| 4 | `PATCH /api/v1/bookings/:id/complete` | Status → `COMPLETED`, Trust score recalculated |
| 5 | `POST /api/v1/bookings/:id/review` | Review saved, Trust recalculated again |
| 6 | `GET /api/v1/trust/score/:profileId` | Score > 0 returned |
| 7 | `POST /api/v1/trust/vouch/:profileId` | Vouch saved, Trust score updated |
| 8 | `GET /api/v1/notifications` | Notifications visible for triggered events |
| 9 | `POST /api/v1/search` | Results now include `trustScore` in rank |

---

## Open Questions

> [!IMPORTANT]
> 1. **Provider self-booking**: Should a provider be able to book themselves? Current plan: prevent this (check `customerProfileId !== providerProfileId`).
> 2. **Seed data for testing**: The existing seed script creates one user/profile/identity. Should we seed a second user as a **Customer** (`UserType.CUSTOMER`) so we can test the full Customer → Provider booking flow without re-registering?
> 3. **`IN_PROGRESS` status**: The architect spec includes `IN_PROGRESS` in the enum but no route moves a booking to this state. Should we add a `PATCH /bookings/:id/start` route, or keep `IN_PROGRESS` as a future placeholder?
