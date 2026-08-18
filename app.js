require('dotenv').config();

const dns = require("dns");
try {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (e) {
    console.log("DNS setServers failed:", e.message);
}


const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
// Session Store Setup
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");

// Security Packages
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");

// Initialize Cron Jobs for Email Reminders
require("./utils/cronJobs.js");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const dbUrl = process.env.ATLASDB_URL;

main()
    .then(() => {
        console.log("connected to DB");
    })
    .catch((err) => {
        console.log(err);
    });

// Password Reset Rate Limiting
const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many password reset attempts, please try again after 15 minutes."
});

async function main() {
    await mongoose.connect(dbUrl);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(mongoSanitize());
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

// Helmet (Security Headers) - Permissive for Required External CDNs
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "https://res.cloudinary.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://api.mapbox.com", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://js.stripe.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://api.mapbox.com", "https://unpkg.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://kit.fontawesome.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://images.unsplash.com", "https://*.mapbox.com", "https://*.stripe.com"],
            connectSrc: ["'self'", "*", "blob:", "data:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://ka-f.fontawesome.com"],
            frameSrc: ["'self'", "https://js.stripe.com"],
            workerSrc: ["'self'", "blob:"],
            childSrc: ["'self'", "blob:"],
            formAction: ["'self'", "https://checkout.stripe.com"],
        },
    },
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// Rate Limiting (Prevent Brute Force)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again after 15 minutes"
});
app.use("/login", limiter);
app.use("/signup", limiter);
app.use("/forgot", passwordResetLimiter);
app.use("/reset", passwordResetLimiter);

// Session Secret Validation - Fail closed in production
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SECRET;
if (!sessionSecret) {
    if (isProduction) {
        throw new Error("CRITICAL SECURITY ERROR: 'SECRET' environment variable must be set in production mode.");
    }
    console.warn("⚠️ WARNING: 'SECRET' environment variable is not set. Using temporary fallback in development.");
}
const secretToUse = sessionSecret || "dev-insecure-session-secret-fallback";

let MongoStore = require("connect-mongo");
if (typeof MongoStore !== "function" && MongoStore.default) {
    MongoStore = MongoStore.default;
}

const store = MongoStore.create({
    mongoUrl: dbUrl,
    touchAfter: 24 * 3600,
    crypto: {
        secret: secretToUse,
    }
});

store.on("error", (err) => {
    console.log("ERROR IN MONGO SESSION STORE", err);
});

const sessionOptions = {
    store,
    name: 'session',
    secret: secretToUse,
    resave: false,
    saveUninitialized: false,
    proxy: true, // Required for Render/Heroku/Vercel
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000, 
    },
};

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// CSRF Protection Middleware
const { csrfProtection } = require("./utils/csrf.js");
app.use(csrfProtection);

app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user || null;
    res.locals.mapToken = process.env.MAP_TOKEN;
    next();
});

// Landing page
app.get("/", (req, res) => {
    res.render("listings/landing.ejs");
});

const bookingRouter = require("./routes/booking.js");
const messageRouter = require("./routes/message.js");
const notificationRouter = require("./routes/notification.js");

// Mount routes
app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/listings/:id/booking", bookingRouter);
app.use("/messages", messageRouter);
app.use("/notifications", notificationRouter);

app.use("/", userRouter);



app.get('/favicon.ico', (req, res) => res.redirect('/favicon.svg'));
app.get(/^\/\.well-known\/.*/, (req, res) => res.status(204).end());

app.all(/(.*)/, (req, res, next) => {
    console.log("Hit 404 handler for:", req.url);
    next(new ExpressError(404, "Page not Found !"));
});


app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    
    let { statusCode = 500, message = "Something went wrong!" } = err;
    
    // FORCE JSON for all chat-related requests
    if (req.url.includes('/messages') || req.headers['content-type'] === 'application/json') {
        console.error("API Error caught:", message);
        return res.status(statusCode).json({ success: false, message: message });
    }
    
    res.status(statusCode).render("error.ejs", { message });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`listening to the port ${port}: `);
});