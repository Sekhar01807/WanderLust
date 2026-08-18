const crypto = require("crypto");
const ExpressError = require("./ExpressError");

/**
 * Session-backed CSRF Protection Middleware
 * - Generates and persists a token in the user's session.
 * - Exposes res.locals.csrfToken for all EJS templates and views.
 * - Enforces CSRF token validation on all state-changing HTTP verbs (POST, PUT, PATCH, DELETE).
 * - Accepts tokens from req.body._csrf, req.query._csrf, or X-CSRF-Token / csrf-token headers.
 */
function csrfProtection(req, res, next) {
    if (!req.session) {
        return next();
    }

    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }

    res.locals.csrfToken = req.session.csrfToken;

    // Webhook endpoints receive server-to-server cryptographically signed payloads and bypass session CSRF
    const path = req.originalUrl || req.path || req.url || "";
    if (path.startsWith("/webhook")) {
        return next();
    }

    // Safe HTTP methods do not require CSRF validation
    const safeMethods = ["GET", "HEAD", "OPTIONS"];
    if (safeMethods.includes(req.method.toUpperCase())) {
        return next();
    }

    // Extract submitted CSRF token
    const submittedToken =
        (req.body && req.body._csrf) ||
        (req.query && req.query._csrf) ||
        req.headers["x-csrf-token"] ||
        req.headers["csrf-token"] ||
        req.headers["x-xsrf-token"];

    const sessionToken = req.session.csrfToken;

    if (!submittedToken || typeof submittedToken !== "string" || !sessionToken) {
        if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest" || req.headers.accept?.includes("application/json") || req.url?.includes("/messages")) {
            return res.status(403).json({ success: false, message: "Invalid or missing CSRF token." });
        }
        return next(new ExpressError(403, "Invalid or missing CSRF token. Please refresh the page and try again."));
    }

    // Constant-time buffer comparison to prevent timing attacks
    const sessionTokenBuffer = Buffer.from(sessionToken, "utf8");
    const submittedTokenBuffer = Buffer.from(submittedToken, "utf8");

    if (
        sessionTokenBuffer.length !== submittedTokenBuffer.length ||
        !crypto.timingSafeEqual(sessionTokenBuffer, submittedTokenBuffer)
    ) {
        if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest" || req.headers.accept?.includes("application/json") || req.url?.includes("/messages")) {
            return res.status(403).json({ success: false, message: "Invalid or expired CSRF token." });
        }
        return next(new ExpressError(403, "Invalid or expired CSRF token. Please refresh the page and try again."));
    }

    next();
}

module.exports = { csrfProtection };
