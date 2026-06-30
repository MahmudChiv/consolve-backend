# Consolve Backend

Consolve is a peer-to-peer services marketplace API designed for seamless hiring, service discovery, and secure transacting. Powered by NestJS and PostgreSQL, the backend integrates state-of-the-art features including real-time AI onboarding (both text and voice), natural language search (supporting English and Nigerian Pidgin), a dynamic trust-scoring system, cached booking management, and live notifications.

---

## 🚀 Key Modules & Architecture

### 1. AI-Driven Onboarding
Streamlines registration for service providers and traders by collecting profile and identity details through an interactive interview.
* **Text Mode (SSE):** Leverages Gemini to run an interactive onboarding chat. Emits Server-Sent Events (SSE) including raw text chunks, real-time identity updates (so the client can populate fields on a side panel dynamically), and a `done` payload on completion.
* **Voice Mode (WebSockets):** Allows users to onboard using voice. Mic audio streams directly over WebSockets to a gateway (`/ws/onboarding`). It coordinates:
  * **Deepgram STT:** Transcribes the user's voice in real time.
  * **Gemini LLM:** Decides the next step of the onboarding interview.
  * **ElevenLabs TTS:** Generates synthetic speech of the AI's response, streamed back to the client in binary MP3 frames for instant web-audio playback.
* **Session Recovery:** The state is persisted in Redis under `onboarding:session:<profileId>`. Users can reload the page and seamlessly resume the onboarding conversation.

### 2. Intelligent AI Search & Matchmaking
Enables customers to discover service providers using colloquial or natural language.
* **Intent Parsing:** Processes requests like `"trusted tailor near Lagos senator wear"` using Gemini to parse intent (profession, location, specialties, experience, and pricing details) automatically.
* **Nigerian Pidgin Support:** Handles pidgin search queries (e.g., `"find person wey sabi make fine dress near ikeja"`).
* **Geo-Proximity Filters:** Queries provider latitude and longitude to filter candidates within a specified distance.
* **Query Caching:** Caches search responses in Redis for 5 minutes (based on query string + coordinates) to optimize performance.
* **Graceful Fallbacks:** Automatically falls back to keyword matching if the Gemini API limits or failures occur.

### 3. Trust Score & Verification Engine
Calculates and updates provider trust scores dynamically based on user engagement and feedback.
* **Score Recalculation:** Triggered automatically when a booking status changes to `COMPLETED` or `DISPUTED`, or when a new review/vouch is submitted. Caches results in Redis with a 5-minute TTL.
* **Scoring Formula (Weights):**
  * **Completion Rate (30%):** Percentage of completed bookings out of total bookings.
  * **Community Score (25%):** Average review rating (mapped out of 70) + vouch count boost (+10 points per vouch, capped at 30).
  * **Payment Reliability (20%):** Currently defaults to 70 (placeholder for payment gateway integrations).
  * **Response Time Score (15%):** Currently defaults to 70 (placeholder for socket-level communication tracking).
  * **Profile Completeness (10%):** Graded based on fields filled in the Identity profile (profession, expertise list, pricing details, city/location, summary - 20% each).
  * **Penalties:** Subtracts 15 points from the final score for each active **dispute**. Clamped between 0 and 100.
* **Vouching System:** Verified users can vouch for service providers once to boost their community score.

### 4. Booking Lifecycle
Manages hiring workflows through a structured state machine with the following states:
* `PENDING` ➔ Booking requested by customer.
* `ACCEPTED` ➔ Confirmed by the provider.
* `COMPLETED` ➔ Service completed by either party (triggers trust score recalculation).
* `CANCELLED` ➔ Cancelled by either party (valid during `PENDING` or `ACCEPTED` states).
* `DISPUTED` ➔ Disputed by either party (applies trust score penalty to provider).
* **Cache Invalidation:** State modifications automatically invalidate booking lists cached in Redis (`bookings:customer:<profileId>` and `bookings:provider:<profileId>`).

### 5. Passive Notification Log
A robust, append-only notification system.
* Services (`BookingService`, `TrustService`) dispatch event notifications asynchronously to avoid blocking the main execution path.
* Generates notifications for: booking requests/acceptances/completions/cancellations, trust updates, review alerts, and vouches.
* Supports unread-filtering, single-read marking, and bulk read-all operations.

---

## 🛠 Tech Stack

* **Framework:** NestJS (v11.0)
* **Language:** TypeScript
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Caching & Key-Store:** Redis (ioredis)
* **Authentication:** Passport, JWT (access/refresh token rotation), Google OAuth
* **AI & Media Integration:** Gemini API (@google/generative-ai), Deepgram SDK, ElevenLabs JS SDK
* **Communication Protocol:** HTTP (REST & Server-Sent Events), WebSockets (ws)
* **Mailing:** Nodemailer (SMTP OTP delivery)
* **Rate Limiting:** NestJS Throttler
* **Testing:** Jest, Supertest

---

## 📊 Database Schema Relationships

```mermaid
erDiagram
    User ||--o{ UserProfile : "has"
    User ||--o{ Identity : "owns"
    UserProfile ||--|| Identity : "possesses"
    UserProfile ||--o{ Booking : "customer/provider"
    UserProfile ||--o{ Review : "reviewer/provider"
    UserProfile ||--|| TrustScore : "has score"
    UserProfile ||--o{ Vouch : "vouches/receives"
    UserProfile ||--o{ Notification : "receives"
```

---

## 🔌 API Reference

### 🔐 Authentication (`/api/v1/auth`)
* `POST /auth/register` - Create account, trigger email verification OTP.
* `POST /auth/verifyOtp` - Verify OTP; issues access and refresh cookies.
* `POST /auth/resendOtp` - Re-trigger OTP delivery.
* `POST /auth/login` - Local credential login.
* `POST /auth/google` - Sign-in/up via Google ID token.
* `POST /auth/logout` - Revoke tokens (blacklist access token in Redis) and clear cookies.
* `POST /auth/forgotPassword` - Trigger password reset OTP flow.
* `PATCH /auth/resetPassword` - Reset password with OTP.
* `POST /auth/refresh` - Rotate access & refresh tokens.

### 👤 User Onboarding (`/api/v1/user/onboarding`)
* `GET /user/onboarding/session` - Retrieve active AI onboarding progress (Redis-backed).
* `POST /user/onboarding` - Send message to onboarding chatbot (SSE stream).
* `PATCH /user/onboarding` - Finalize onboarding by saving location.
* `WS /ws/onboarding` - WebSocket gateway for real-time voice onboarding.

### 🔍 Search & Matchmaking (`/api/v1/search`)
* `POST /search` - Natural language provider search (Gemini intent parsing).
* `GET /search/nearby` - Find nearby providers using geographic coordinates.
* `GET /search/categories` - Fetch all unique professions.
* `GET /search/:profileId` - View provider public profile details.

### 📅 Bookings (`/api/v1/bookings`)
* `POST /bookings` - Create a booking request.
* `GET /bookings/my-hires` - View bookings made as a customer.
* `GET /bookings/my-jobs` - View bookings received as a provider.
* `GET /bookings/:id` - Get booking status and details.
* `PATCH /bookings/:id/accept` - Accept a booking (provider only).
* `PATCH /bookings/:id/complete` - Mark a booking as completed.
* `PATCH /bookings/:id/cancel` - Cancel a booking (adds cancel reason).
* `PATCH /bookings/:id/dispute` - Raise a dispute.
* `POST /bookings/:id/review` - Review a completed booking.

### 🛡 Trust & Vouches (`/api/v1/trust`)
* `GET /trust/score/me` - Fetch own trust score breakdown.
* `GET /trust/score/:profileId` - Fetch trust score breakdown of a provider.
* `POST /trust/vouch/:profileId` - Vouch for a provider.
* `GET /trust/vouches/:profileId` - List all vouches received by a provider.

### 🔔 Notifications (`/api/v1/notifications`)
* `GET /notifications` - Retrieve paginated notifications.
* `PATCH /notifications/:id/read` - Mark a notification as read.
* `PATCH /notifications/read-all` - Mark all notifications as read.

---

## ⚙️ Getting Started

### 📋 Prerequisites
* Node.js (v18+)
* PostgreSQL
* Redis

### 📦 Installation
1. Clone the repository and navigate to the project directory:
   ```bash
   git clone https://github.com/MahmudChiv/consolve-backend.git
   cd consolve-backend
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```

### 🔑 Environment Setup
Create a `.env` file based on `.env.example`:
```env
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000

DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/consolve_db
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=your_jwt_access_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
JWT_ACCESS_EXPIRY=900
JWT_REFRESH_EXPIRY=604800

GEMINI_API_KEY=your_gemini_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your.email@gmail.com
SMTP_PASS=your_email_app_password
SMTP_FROM="Consolve <your.email@gmail.com>"

GOOGLE_CLIENT_ID=your_google_client_id
```

### 🗄 Database Initialization
Run Prisma migrations to set up the database tables:
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 🏃 Running the Application
* **Development mode (hot reload):**
  ```bash
  npm run start:dev
  ```
* **Production mode:**
  ```bash
  npm run build
  ```
  ```bash
  npm run start:prod
  ```

---

## 🧪 Testing

The backend includes a comprehensive suite of unit and integration tests built with Jest.

```bash
# Run all unit tests
npm run test

# Run e2e tests
npm run test:e2e

# Generate test coverage reports
npm run test:cov
```
