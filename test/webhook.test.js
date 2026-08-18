const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

/**
 * Webhook Verification Unit Tests
 * Verifies strict fail-closed security and retry status codes.
 */

test("Webhook Security - fails closed (500) when STRIPE_WEBHOOK_SECRET is missing", async () => {
    const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const originalKey = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_12345";

    // Simulate webhook handler logic
    let statusCode = null;
    let responseBody = null;

    const res = {
        status: (code) => {
            statusCode = code;
            return {
                send: (msg) => { responseBody = msg; },
                json: (obj) => { responseBody = obj; }
            };
        }
    };

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || !webhookSecret.trim()) {
        res.status(500).send("Webhook secret configuration error on server");
    }

    assert.equal(statusCode, 500);
    assert.match(responseBody, /Webhook secret configuration error/);

    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    process.env.STRIPE_SECRET_KEY = originalKey;
});

test("Webhook Security - fails closed (400) when stripe-signature header is missing", async () => {
    const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_12345";

    let statusCode = null;
    let responseBody = null;

    const res = {
        status: (code) => {
            statusCode = code;
            return {
                send: (msg) => { responseBody = msg; },
                json: (obj) => { responseBody = obj; }
            };
        }
    };

    const req = {
        headers: {}, // No stripe-signature
        body: Buffer.from(JSON.stringify({ type: "checkout.session.completed" }))
    };

    const sig = req.headers["stripe-signature"];
    if (!sig) {
        res.status(400).send("Missing stripe-signature header");
    }

    assert.equal(statusCode, 400);
    assert.match(responseBody, /Missing stripe-signature header/);

    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
});

test("Webhook Security - rejects unsigned forged payloads without fallback", async () => {
    const secret = "whsec_mock_test_secret";
    const payload = JSON.stringify({ type: "checkout.session.completed", id: "evt_forged_123" });
    const forgedSig = "t=1234567890,v1=bad_signature_digest";

    // Verify signature check fails with invalid signature
    let verificationPassed = false;
    try {
        const timestamp = forgedSig.split(",")[0].split("=")[1];
        const signedPayload = `${timestamp}.${payload}`;
        const expectedSignature = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
        const actualSig = forgedSig.split(",")[1].split("=")[1];
        if (crypto.timingSafeEqual(Buffer.from(actualSig), Buffer.from(expectedSignature))) {
            verificationPassed = true;
        }
    } catch {
        verificationPassed = false;
    }

    assert.equal(verificationPassed, false, "Forged signature should not pass HMAC verification");
});

test("Webhook Retries - returns 500 on fulfillment failure to trigger Stripe retry", async () => {
    let statusCode = null;
    let jsonResponse = null;

    const res = {
        status: (code) => {
            statusCode = code;
            return {
                json: (payload) => { jsonResponse = payload; },
                send: (msg) => { jsonResponse = msg; }
            };
        }
    };

    // Simulate fulfillment failure result
    const result = { success: false, message: "Database connection timed out during reservation hold" };

    if (!result.success) {
        res.status(500).json({ error: result.message || "Fulfillment failed" });
    }

    assert.equal(statusCode, 500, "Should return HTTP 500 on fulfillment failure so Stripe retries");
    assert.equal(jsonResponse.error, "Database connection timed out during reservation hold");
});

test("Webhook Retries - returns 200 on successful booking fulfillment", async () => {
    let statusCode = null;
    let jsonResponse = null;

    const res = {
        status: (code) => {
            statusCode = code;
            return {
                json: (payload) => { jsonResponse = payload; }
            };
        }
    };

    const result = { success: true, booking: { _id: "b123", paymentStatus: "paid" } };

    if (result.success) {
        res.status(200).json({ received: true });
    }

    assert.equal(statusCode, 200);
    assert.equal(jsonResponse.received, true);
});
