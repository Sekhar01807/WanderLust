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

async function seedCategoryProperties() {
    try {
        const Listing = require('./models/listing');
        const User = require('./models/user');
        const sampleCats = [
            {
                title: "Maldives Luxury Overwater Villa",
                description: "Wake up to crystal-clear turquoise ocean waters, a private infinity pool, and direct coral reef access right from your deck.",
                image: { filename: "maldives_villa", url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80" },
                price: 24500, location: "Male", country: "Maldives", category: "beachfront",
                geometry: { type: "Point", coordinates: [73.5093, 4.1755] }
            },
            {
                title: "Glamping Dome under Starlit Skies",
                description: "Experience luxury wilderness camping with transparent heated glass domes, private fire pit, and breathtaking mountain views.",
                image: { filename: "glamping_dome", url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1200&q=80" },
                price: 8900, location: "Manali", country: "India", category: "camping",
                geometry: { type: "Point", coordinates: [77.1887, 32.2432] }
            },
            {
                title: "Royal Edinburgh Historic Castle Suite",
                description: "Live like royalty in a restored 16th-century grand fortress featuring antique fireplaces, vaulted dining halls, and hilltop vistas.",
                image: { filename: "edinburgh_castle", url: "https://images.unsplash.com/photo-1585543805890-6051f7829f98?auto=format&fit=crop&w=1200&q=80" },
                price: 32000, location: "Edinburgh", country: "United Kingdom", category: "castles",
                geometry: { type: "Point", coordinates: [-3.1883, 55.9533] }
            },
            {
                title: "Tromsø Heated Glass Igloo & Aurora Hideaway",
                description: "Immerse yourself in a frozen arctic wonderland with 360-degree panoramic views of the dancing Northern Lights.",
                image: { filename: "tromso_igloo", url: "https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?auto=format&fit=crop&w=1200&q=80" },
                price: 19800, location: "Tromso", country: "Norway", category: "arctic",
                geometry: { type: "Point", coordinates: [18.9553, 69.6492] }
            }
        ];

        let owner = await User.findOne();
        let ownerId = owner ? owner._id : "672ef4689a83bb82eac61046";

        for (let item of sampleCats) {
            const exists = await Listing.findOne({ category: item.category });
            if (!exists) {
                await new Listing({ ...item, owner: ownerId }).save();
                console.log(`Auto-seeded category property: ${item.title}`);
            }
        }
    } catch (e) {
        console.log("Auto-seeding completed.");
    }
}

async function main() {
    await mongoose.connect(dbUrl);
    await seedCategoryProperties();
}


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

// Helmet (Security Headers) - Highly Permissive for Development/Production
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

let MongoStore = require("connect-mongo");

// Defensive check for different connect-mongo versions
if (typeof MongoStore !== "function" && MongoStore.default) {
    MongoStore = MongoStore.default;
}

const store = MongoStore.create({
    mongoUrl: dbUrl,
    touchAfter: 24 * 3600,
    crypto: {
        secret: process.env.SECRET || "thisshouldbeabettersecret",
    }
});

store.on("error", (err) => {
    console.log("ERROR IN MONGO SESSION STORE", err);
});

const sessionOptions = {
    store,
    name: 'session',
    secret: process.env.SECRET || "thisshouldbeabettersecret",
    resave: false,
    saveUninitialized: false,
    proxy: true, // Required for Render/Heroku/Vercel
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
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



app.get('/favicon.ico', (req, res) => res.status(204).end());
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