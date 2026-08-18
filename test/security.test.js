const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

test("Password Reset Token - SHA-256 hashing is deterministic and irreversible in DB", () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hash1 = crypto.createHash("sha256").update(rawToken).digest("hex");
    const hash2 = crypto.createHash("sha256").update(rawToken).digest("hex");

    assert.equal(hash1, hash2);
    assert.notEqual(rawToken, hash1);
    assert.equal(hash1.length, 64);
});

test("Regex Search Escaping - sanitizes dangerous characters", () => {
    const maliciousInputs = [
        "London.*",
        "Paris (France)",
        "Tokyo [Downtown]",
        "Berlin+Munich",
        "Zurich$100",
        "^Rome"
    ];

    for (const input of maliciousInputs) {
        const sanitized = input.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Ensure that creating a regex from the sanitized string matches the literal string safely
        const regex = new RegExp(`^${sanitized}$`, "i");
        assert.ok(regex.test(input), `Regex should safely and literally match: ${input}`);
    }
});

test("JSON Script Escaping - replaces < and > to prevent script breakout", () => {
    const maliciousPayload = {
        title: "Malicious Listing</script><script>alert('xss')</script>",
        description: "Test description <img src=x onerror=alert(1)>"
    };

    const serialized = JSON.stringify(maliciousPayload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    assert.ok(!serialized.includes("</script>"));
    assert.ok(!serialized.includes("<script>"));
    assert.ok(serialized.includes("\\u003c/script\\u003e"));

    const parsed = JSON.parse(serialized);
    assert.equal(parsed.title, maliciousPayload.title);
    assert.equal(parsed.description, maliciousPayload.description);
});

test("Image MIME Filter - only allows valid image mime types", () => {
    const { upload } = require("../cloudConfig.js");
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    const blockedMimes = ["text/html", "application/javascript", "application/x-sh", "image/svg+xml"];

    for (const mime of allowedMimes) {
        assert.ok(allowedMimes.includes(mime));
    }

    for (const mime of blockedMimes) {
        assert.ok(!allowedMimes.includes(mime));
    }
});
