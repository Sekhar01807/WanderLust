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
    res.cookie("XSRF-TOKEN", req.session.csrfToken, {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false
    });

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
    let queryToken = (req.query && req.query._csrf);
    if (!queryToken && (req.originalUrl || req.url)) {
        try {
            queryToken = new URL(req.originalUrl || req.url, 'http://localhost').searchParams.get('_csrf');
        } catch (e) {
            queryToken = null;
        }
    }

    const submittedToken =
        (req.body && req.body._csrf) ||
        queryToken ||
        req.headers["x-csrf-token"] ||
        req.headers["csrf-token"] ||
        req.headers["x-xsrf-token"];

    const sessionToken = req.session ? req.session.csrfToken : null;
    const rawCookies = req.headers.cookie || "";
    const cookieMatch = rawCookies.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
    const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

    const isTokenMatch = (expected, submitted) => {
        if (!expected || !submitted || typeof submitted !== "string") return false;
        if (expected === submitted) return true;
        try {
            const expectedBuf = Buffer.from(expected, "utf8");
            const submittedBuf = Buffer.from(submitted, "utf8");
            if (expectedBuf.length !== submittedBuf.length) return false;
            return crypto.timingSafeEqual(expectedBuf, submittedBuf);
        } catch (e) {
    const tokenValid = isTokenMatch(sessionToken, submittedToken) || isTokenMatch(cookieToken, submittedToken);

    if (tokenValid) {
        return next();
    }

    // For same-origin authenticated AJAX requests (e.g. wishlist, messaging), verify same-origin headers and authentication
    const secFetchSite = req.headers["sec-fetch-site"];
    const isSameOrigin = secFetchSite === "same-origin" || secFetchSite === "same-site" || !secFetchSite;
    const isAjax = req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest" || req.headers.accept?.includes("application/json");

    if (isSameOrigin && isAjax && typeof req.isAuthenticated === "function" && req.isAuthenticated()) {
        return next();
    }

    if (isAjax || req.url?.includes("/wishlist") || req.url?.includes("/messages")) {
        return res.status(403).json({ success: false, message: "Invalid or expired CSRF token." });
    }
    return next(new ExpressError(403, "Invalid or expired CSRF token. Please refresh the page and try again."));
}

module.exports = { csrfProtection };
