# 🌍 WanderLust — Full-Stack Vacation Rental & Booking Platform

[![Node.js](https://img.shields.io/badge/Node.js-v24.11-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.2-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-success.svg)](https://www.mongodb.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF.svg)](https://stripe.com/)
[![Security](https://img.shields.io/badge/Security-Layered--Controls-brightgreen.svg)]()

**WanderLust** is a full-stack hospitality, hotel, and vacation rental platform inspired by Airbnb. Built with Node.js, Express 5, MongoDB Atlas, and EJS, WanderLust delivers an intuitive booking workflow, per-user persistent wishlists, real-time host analytics, in-app messaging, seamless profile management, and layered application security controls.

---

## ✨ Key Features

### 🏡 Stays, Discovery & Landing Experience
- **Interactive Landing Page (`/`)**: Dedicated hero presentation with curated travel categories, top destinations, and a dynamic navbar that adapts to guest vs authenticated user sessions.
- **Explore Listings (`/listings`)**: Browse properties across categories (*Beachfront, Cabins, Trending, Arctic, Mountain Chalets, Star Hotels, Iconic Cities*).
- **Mapbox Geocoding & Dynamic Maps**: Interactive maps with address search and location autocomplete.
- **Dynamic Filter Bar**: Category filtering with smooth horizontal scroll navigation and auto-centering pills.
- **Media Management**: High-resolution image uploads with Cloudinary cloud storage and aspect ratio optimization.

### ❤️ Persistent Per-User Wishlist
- **Individual User Isolation**: Wishlists are stored directly within each user's document in MongoDB Atlas — ensuring every user has their own private, persistent wishlist that remains saved across logouts and logins.
- **Instant Optimistic UI Toggle**: Tapping the heart on any hotel card fills it completely with solid crimson red (<i class="fa-solid fa-heart" style="color: #ff385c;"></i>) with pulse animation and toast alerts (`"Saved to Wishlist ❤️"`).
- **Guest Protection**: Prompts unauthenticated visitors to log in before saving items to their wishlist.
- **Profile Wishlist Hub**: View and manage all saved properties under **Profile &rarr; My Wishlist**.

### 👤 Profile & One-Click Photo Upload
- **One-Click Camera Badge**: Direct camera button on the circular avatar opens the file picker, live-previews the chosen image, and auto-submits to Cloudinary.
- **Site-Wide Avatar Propagation**: Updated profile pictures immediately synchronize across the navigation bar, guest reviews, listing host cards, chat headers, and reservation modals.
- **Clean Profile Details Form**: Dedicated form for updating username, account role (*Traveler / Host*), bio, country, phone number, and languages.

### 💳 Transactional Booking & Stripe Integration
- **Best-Effort Reservation Holds & Collision Mitigation**:
  - Proactive purging of expired pending holds prior to overlap checks.
  - Best-effort 30-minute temporary reservation holds created in the database *prior* to Stripe Checkout session initialization.
  - Hold expiration synchronized with Stripe Checkout Session's `expires_at` timestamp.
  - Pre-checkout collision verification with narrow-window race mitigation and automatic Stripe refund fallback on fulfillment conflicts.
- **Paid Booking Cancellation with Automated Stripe Refunds**:
  - Cancelling a confirmed paid booking triggers automated Stripe payment refunds (`stripe.refunds.create()`).
  - Persists full refund state (`refundStatus`, `refundId`, `refundAmount`, `cancelledAt`) in the database with guest email confirmations.
- **Authoritative Stripe Webhook Fulfillment (`POST /webhook`)**:
  - Strict **fail-closed** cryptographic signature verification (`stripe.webhooks.constructEvent`) — rejects all unsigned or forged payloads without fallback.
  - Automatic retry signaling: returns `HTTP 500` on any fulfillment failure so Stripe automatically retries event delivery with exponential backoff.
  - Dedicated handling for `checkout.session.completed` (transition from `pending` to `paid` with idempotency checks) and `checkout.session.expired` (hold release).
- **E-Receipts**: Official digital booking receipts with guest/host access control.
- **Deduplicated Waitlist System**: Unique compound indexing prevents duplicate waitlist requests for the same user, listing, and date range.

### 📞 Customer Support & Footer Integration
- **Interactive Support Modal**: Accessible from the footer with direct contact options:
  - 📞 **Direct Phone / WhatsApp**: `+91 7995511936`
  - ✉️ **Official Support Email**: `sekharsekhar1919@gmail.com`
  - 📸 **Instagram**: [`@sekhar_redde_`](https://www.instagram.com/sekhar_redde_/)
  - 💼 **LinkedIn**: [`Sekhar Reddy`](https://www.linkedin.com/in/sekhar-reddy-408560281/)

### 💬 User & Host Ecosystem
- **Dual Role Profiles**: Travelers can browse, save wishlists, and reserve; Hosts get an analytics dashboard (earnings, active/cancelled reservations, and audit logs).
- **Direct Messaging**: In-app messaging between guests and property owners with relationship authorization, scoped conversation deletion, and safe DOM `.textContent` rendering.
- **Verified Reviews & Ratings**: Strict review creation policy requiring an actual completed stay at the property; scoped review deletion verification preventing cross-listing mutations.
- **Automated Emails & Cron Jobs**: HTML email notifications via Nodemailer / SendGrid / Mailtrap for bookings, cancellations, refunds, waitlists, and daily check-in/check-out reminders.

---

## 🛡️ Layered Application Security Controls

| Defense Layer | Implementation Details |
| :--- | :--- |
| **Dual Session & XSRF-TOKEN CSRF Defense** | Session-backed CSRF middleware with synchronized `XSRF-TOKEN` cookie verification and same-origin authenticated fetch support to eliminate 403 errors while maintaining strict CSRF defense. |
| **Express 5 Routing & Sanitization** | Express 5 compatible routing and error handling with safe custom NoSQL query sanitization (`req.body`, `req.params`). |
| **XSS Prevention (Chat & Views)** | Stored chat messages and user labels rendered using safe DOM `.textContent` and `.replaceChildren()` APIs. Zero dynamic `innerHTML` in client scripts. |
| **Session Invalidation on Password Reset** | `sessionVersion` tracking on user accounts invalidates all pre-existing authenticated sessions across all devices immediately upon password reset. |
| **Verified Stay Authorization** | Reviews restricted strictly to guests with completed bookings (`checkOut <= now`); review deletion validates listing association. |
| **Paid Booking Refunds & Cancellation** | Full transactional refund handling via Stripe API with persisted database refund audit logs. |
| **Stripe Webhook Verification** | Strict fail-closed verification rejecting missing configurations (500), missing signatures (400), and invalid signatures (400) with zero unsigned fallback. |
| **Upload Boundaries & MIME Filter** | Multer configured with strict MIME type allowlisting (`JPEG`, `PNG`, `WebP`) and a 5MB per-file boundary limit. |
| **Account Enumeration Defense** | Generic, timing-safe error messaging on `/signup`, `/login`, and `/forgot` to prevent discovery of registered emails and phone numbers. |
| **Password Reset Security** | Reset tokens generated via `crypto.randomBytes(32)` and persisted as **SHA-256** hashes with 1-hour expiration. |
| **HTTP Security Headers** | `helmet` configured with strict Content Security Policy (CSP), frame guards, and resource policies. |

---

## 🛠️ Technology Stack

- **Backend**: Node.js (v24), Express.js (v5)
- **Database**: MongoDB Atlas, Mongoose ODM
- **Templating**: EJS, EJS-Mate
- **Payments**: Stripe Checkout API & Stripe Webhooks
- **Maps**: Mapbox GL JS & Mapbox Geocoding SDK
- **Media**: Cloudinary & Multer Cloudinary Storage
- **Security**: Helmet, Express-Mongo-Sanitize, Express-Rate-Limit, Crypto
- **Email**: Nodemailer, SendGrid, Node-Cron
- **Testing**: Node.js native test runner (`node:test`, `node:assert/strict`)

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20.x or higher (v24 LTS recommended)
- **MongoDB**: Local MongoDB or MongoDB Atlas URI
- **Stripe Account**: API Secret & Publishable keys

### 2. Installation

Clone the repository and install dependencies:
```bash
git clone https://github.com/Sekhar01807/Mern.git
cd Mern
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory (refer to `.env.example`):

```env
# Server Configuration
PORT=8080
NODE_ENV=development
APP_URL=http://localhost:8080

# Database
ATLASDB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/wanderlust?retryWrites=true&w=majority

# Session Security
SECRET=your_super_secret_session_key_here

# Cloudinary
CLOUD_NAME=your_cloudinary_cloud_name
CLOUD_API_KEY=your_cloudinary_api_key
CLOUD_API_SECRET=your_cloudinary_api_secret

# Mapbox
MAP_TOKEN=your_mapbox_public_token

# Stripe Payments & Webhooks
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret

# Email Service
FROM_EMAIL=sekharsekhar1919@gmail.com
GMAIL_APP_PASSWORD=your_gmail_app_password
```

### 4. Database Seeding (Optional)

To seed sample listings:
```bash
node init/index.js
```

### 5. Running the Application

Start the local server:
```bash
npm start
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## 🧪 Automated Testing

Run the test suite:
```bash
npm test
```

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
