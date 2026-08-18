const test = require("node:test");
const assert = require("node:assert/strict");
const { getAppUrl } = require("../utils/appUrl.js");

test("getAppUrl - respects process.env.APP_URL when defined", () => {
    const originalEnv = process.env.APP_URL;
    process.env.APP_URL = "https://wanderlust.example.com/";

    const url = getAppUrl();
    assert.equal(url, "https://wanderlust.example.com");

    process.env.APP_URL = originalEnv;
});

test("getAppUrl - parses headers from request when APP_URL is unset", () => {
    const originalEnv = process.env.APP_URL;
    delete process.env.APP_URL;

    const req = {
        headers: {
            "x-forwarded-proto": "https",
            "host": "staging.wanderlust.com"
        },
        get: (header) => req.headers[header.toLowerCase()]
    };

    const url = getAppUrl(req);
    assert.equal(url, "https://staging.wanderlust.com");

    process.env.APP_URL = originalEnv;
});

test("getAppUrl - falls back to localhost:8080 if neither APP_URL nor req headers exist", () => {
    const originalEnv = process.env.APP_URL;
    delete process.env.APP_URL;

    const url = getAppUrl();
    assert.equal(url, "http://localhost:8080");

    process.env.APP_URL = originalEnv;
});
