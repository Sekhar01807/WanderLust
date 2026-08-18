/**
 * Returns the trusted base URL of the application.
 * Prefers process.env.APP_URL if defined, otherwise constructs a trusted origin
 * from request headers (x-forwarded-proto, host) with safe fallbacks.
 */
function getAppUrl(req) {
    if (process.env.APP_URL && process.env.APP_URL.trim()) {
        return process.env.APP_URL.trim().replace(/\/+$/, "");
    }
    if (req) {
        const protocol = (req.headers && req.headers["x-forwarded-proto"]) || req.protocol || "http";
        const host = (req.get && req.get("host")) || (req.headers && req.headers.host) || "localhost:8080";
        return `${protocol}://${host}`.replace(/\/+$/, "");
    }
    return "http://localhost:8080";
}

module.exports = { getAppUrl };
