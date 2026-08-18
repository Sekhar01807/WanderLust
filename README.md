# 🌍 WanderLust — Full-Stack Vacation Rental & Booking Platform

[![Node.js](https://img.shields.io/badge/Node.js-v24.11-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.2-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-success.svg)](https://www.mongodb.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF.svg)](https://stripe.com/)
[![Security Hardened](https://img.shields.io/badge/Security-Freeze--Ready-brightgreen.svg)]()

**WanderLust** is a full-stack hospitality, hotel, and vacation rental platform inspired by Airbnb. Built with Node.js, Express, MongoDB Atlas, and EJS, WanderLust delivers a smooth booking experience, transactional reservation integrity, host analytics, messaging, and security architecture.

---

## ✨ Key Features

### 🏡 Stays & Discovery
- **Explore Listings**: Browse properties across categories (*Beachfront, Cabins, Trending, Arctic, Mountain Chalets, Star Hotels*).
- **Mapbox Geocoding & Maps**: Interactive maps with address search and location autocomplete.
- **Dynamic Filtering & Search**: Instant keyword search with regex escaping to prevent ReDoS.
- **Media Management**: High-resolution image uploads with Cloudinary storage and optimization.

### 💳 Transactional Booking & Stripe Integration
- **Concurrency & Double-Booking Prevention**:
  - Atomic 15-minute temporary reservation holds during active checkout sessions.
  - Real-time collision detection to eliminate double-spend / overlapping reservation race conditions.
- **Authoritative Stripe Webhook Fulfillment (`POST /webhook`)**:
  - Server-to-server webhook processing with cryptographic signature verification (`checkout.session.completed`, `payment_intent.succeeded`).
  - Guarantees booking finalization even if the user drops network connection or closes the browser before redirect.
  - Automatic expiration and release of reservation holds on `checkout.session.expired`.
- **E-Receipts**: Official digital booking receipts with guest/host access control.
- **Waitlist System**: Automated notifications sent when previously booked dates become available due to cancellation.

### 👤 User & Host Ecosystem
- **Dual Role Profiles**: Travelers can browse, save wishlists, and reserve; Hosts get an analytics dashboard (earnings, active/cancelled reservations, and audit logs).
- **Direct Messaging**: In-app messaging between guests and property owners with relationship authorization and scoped conversation deletion.
- **Reviews & Ratings**: Review system with star ratings and comments.
- **Automated Emails**: HTML email notifications via Nodemailer / SendGrid / Mailtrap for bookings, cancellations, waitlists, and reminders.
- **Cron Jobs**: Scheduled daily cron tasks for check-in and check-out email reminders.

---

## 🛡️ Security Architecture & Hardening

| Defense Layer | Implementation Details |
| :--- | :--- |
| **CSRF Protection** | Global session-backed CSRF middleware enforcing token validation on all state-changing verbs (`POST`, `PUT`, `PATCH`, `DELETE`), including `POST /logout`. Webhooks exempted via cryptographic signatures. |
| **Account Enumeration Defense** | Generic, timing-safe error messaging on `/signup`, `/login`, and `/forgot` to prevent discovery of registered emails and phone numbers. |
| **Password Reset Security** | Reset tokens generated via `crypto.randomBytes(32)` and persisted as **SHA-256** hashes with 1-hour expiration. |
| **Authentication & Sessions** | Passport.js local authentication, secure HTTP-only cookies with `SameSite=Lax`, and MongoDB session store. Ephemeral 256-bit crypto fallback in development; strictly fails closed in production without `SECRET`. |
| **Injection & Query Sanitization** | `express-mongo-sanitize` middleware prevents NoSQL operator injection; regex inputs are strictly sanitized. |
| **Rate Limiting** | `express-rate-limit` guards against brute-force attacks on auth and password reset endpoints. |
| **HTTP Security Headers** | `helmet` configured with strict Content Security Policy (CSP), frame guards, and resource policies. |
| **Message Access Control** | Explicit relationship authorization requiring host or interacting guest ownership before message creation or deletion. |

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js (v5)
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

Create a `.env` file in the root directory (refer to [`.env.example`](file:///c:/Users/SOMA%20SEKHAR/OneDrive/Desktop/Course/Projects/WanderLust/.env.example)):

```env
# Server Configuration
PORT=8080
NODE_ENV=development
APP_URL=http://localhost:8080

# Database
ATLASDB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/wanderlust?retryWrites=true&w=majority

# Session Security (Required in production)
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
MAILTRAP_USER=your_mailtrap_user
MAILTRAP_PASS=your_mailtrap_pass
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=notifications@wanderlust.com
```

### 4. Database Seeding (Optional)

To seed initial sample listings into your database:
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

WanderLust includes automated test suites covering input schemas, CSRF protections, booking hold concurrency, relationship authorization, and security sanitization:

```bash
npm test
```

### Test Coverage:
- `test/schema.test.js` — Joi validation constraints for listings, reviews, and reservation dates.
- `test/csrf.test.js` — Session CSRF token lifecycle, `POST /logout` enforcement, and webhook exemption.
- `test/bookingHold.test.js` — Date overlap algorithms, active 15-minute hold validation, and expired hold lifecycle.
- `test/messageAuth.test.js` — Scoped conversation deletion and host/guest authorization.
- `test/security.test.js` — SHA-256 deterministic token hashing and ReDoS search escaping.
- `test/appUrl.test.js` — Multi-environment host resolution.

---

## 📁 Project Structure

```
WanderLust/
├── controllers/          # Business logic handlers (listings, users, reviews)
├── init/                 # Database initialization & sample data
├── models/               # Mongoose schemas (listing, booking, user, message, review, waitlist)
├── public/               # Static assets (CSS, JS, logos, icons)
├── routes/               # Express route definitions
│   ├── booking.js        # Reservation holds, checkout & receipts
│   ├── listing.js        # Listing discovery & CRUD
│   ├── message.js        # Scoped chat & deletion
│   ├── notification.js   # User alerts
│   ├── review.js         # Ratings & feedback
│   ├── user.js           # Auth, profile, wishlist, password reset
│   └── webhook.js        # Stripe server-to-server webhook fulfillment
├── test/                 # Automated test suites
├── utils/                # Utilities (bookingFulfillment, csrf, email, cron, error handlers)
├── views/                # EJS templates (listings, users, messages, layouts)
├── app.js                # Server entry point & middleware pipeline
├── package.json          # Dependencies & npm scripts
└── schema.js             # Joi validation schemas
```

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
