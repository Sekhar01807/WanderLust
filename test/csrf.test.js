const test = require("node:test");
const assert = require("node:assert/strict");
const { csrfProtection } = require("../utils/csrf.js");

test("CSRF Middleware - generates token on GET request", () => {
    const req = {
        method: "GET",
        session: {},
        headers: {},
    };
    const res = { locals: {} };
    let nextCalled = false;

    csrfProtection(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.ok(req.session.csrfToken, "Session should contain a csrfToken");
    assert.equal(res.locals.csrfToken, req.session.csrfToken, "res.locals should match session token");
});

test("CSRF Middleware - allows safe HTTP methods without token in body", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
        const req = {
            method,
            session: { csrfToken: "sample-csrf-token-1234567890abcdef" },
            headers: {},
        };
        const res = { locals: {} };
        let nextCalled = false;

        csrfProtection(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true, `Method ${method} should be allowed without token`);
    }
});

test("CSRF Middleware - blocks POST request without CSRF token", () => {
    const req = {
        method: "POST",
        session: { csrfToken: "valid-session-token-1234567890abcdef" },
        body: {},
        headers: {},
    };
    let errorPassed = null;
    const res = {
        locals: {},
        status: (code) => ({
            json: (payload) => ({ code, payload })
        })
    };

    csrfProtection(req, res, (err) => {
        errorPassed = err;
    });

    assert.ok(errorPassed, "Should pass an error for missing CSRF token");
    assert.equal(errorPassed.statusCode, 403);
});

test("CSRF Middleware - accepts valid CSRF token in body._csrf", () => {
    const validToken = "valid-session-token-1234567890abcdef";
    const req = {
        method: "POST",
        session: { csrfToken: validToken },
        body: { _csrf: validToken },
        headers: {},
    };
    const res = { locals: {} };
    let nextCalled = false;

    csrfProtection(req, res, (err) => {
        if (!err) nextCalled = true;
    });

    assert.equal(nextCalled, true, "Valid CSRF token in body should pass validation");
});

test("CSRF Middleware - accepts valid CSRF token in x-csrf-token header", () => {
    const validToken = "valid-session-token-1234567890abcdef";
    const req = {
        method: "POST",
        session: { csrfToken: validToken },
        body: {},
        headers: { "x-csrf-token": validToken },
    };
    const res = { locals: {} };
    let nextCalled = false;

    csrfProtection(req, res, (err) => {
        if (!err) nextCalled = true;
    });

    assert.equal(nextCalled, true, "Valid CSRF token in header should pass validation");
});

test("CSRF Middleware - returns 403 JSON for AJAX/JSON request with invalid token", () => {
    const req = {
        method: "POST",
        session: { csrfToken: "valid-session-token-1234567890abcdef" },
        body: { _csrf: "wrong-token" },
        headers: { "accept": "application/json" },
        xhr: true,
    };
    let statusCode = null;
    let jsonResponse = null;
    const res = {
        locals: {},
        status: (code) => {
            statusCode = code;
            return {
                json: (payload) => {
                    jsonResponse = payload;
                }
            };
        }
    };

    csrfProtection(req, res, () => {});

    assert.equal(statusCode, 403);
    assert.equal(jsonResponse.success, false);
test("CSRF Middleware - enforces CSRF protection on POST /logout", () => {
    const validToken = "session-token-logout-test-12345";
    
    // 1. POST /logout without token should be blocked
    const unauthenticatedReq = {
        method: "POST",
        url: "/logout",
        originalUrl: "/logout",
        session: { csrfToken: validToken },
        body: {},
        headers: {},
    };
    let errorPassed = null;
    csrfProtection(unauthenticatedReq, { locals: {} }, (err) => {
        errorPassed = err;
    });
    assert.ok(errorPassed, "POST /logout without token must be blocked");
    assert.equal(errorPassed.statusCode, 403);

    // 2. POST /logout with valid token should pass
    const validLogoutReq = {
        method: "POST",
        url: "/logout",
        originalUrl: "/logout",
        session: { csrfToken: validToken },
        body: { _csrf: validToken },
        headers: {},
    };
    let nextCalled = false;
    csrfProtection(validLogoutReq, { locals: {} }, (err) => {
        if (!err) nextCalled = true;
    });
    assert.equal(nextCalled, true, "POST /logout with valid CSRF token must pass");
});

test("CSRF Middleware - exempts /webhook endpoints from session CSRF", () => {
    const webhookReq = {
        method: "POST",
        url: "/webhook",
        originalUrl: "/webhook",
        session: {},
        body: Buffer.from(JSON.stringify({ type: "checkout.session.completed" })),
        headers: {
            "stripe-signature": "t=123,v1=test_sig"
        }
    };
    let nextCalled = false;
    csrfProtection(webhookReq, { locals: {} }, (err) => {
        if (!err) nextCalled = true;
    });
    assert.equal(nextCalled, true, "POST /webhook must bypass session CSRF");
});
