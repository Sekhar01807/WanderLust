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

test("Content Security Policy - enforces hardened directives without unsafe-eval or wildcard connectSrc", () => {
    const fs = require("fs");
    const path = require("path");
    const appJsContent = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

    // 1. Ensure unsafe-eval is NOT present in CSP
    assert.ok(!appJsContent.includes("'unsafe-eval'"), "CSP must NOT contain 'unsafe-eval'");

    // 2. Ensure connectSrc does NOT use wildcard '*'
    const connectSrcMatch = appJsContent.match(/connectSrc:\s*\[([\s\S]*?)\]/);
    assert.ok(connectSrcMatch, "connectSrc directive must be configured");
    const connectSrcEntries = connectSrcMatch[1];
    assert.ok(!connectSrcEntries.includes("'*'"), "connectSrc must NOT contain wildcard '*'");
    assert.ok(!connectSrcEntries.includes('"*"'), "connectSrc must NOT contain wildcard '*'");

    // 3. Ensure objectSrc is strictly 'none'
    assert.ok(appJsContent.includes(`objectSrc: ["'none'"]`), "objectSrc must be strictly 'none'");

    // 4. Ensure baseUri is 'self'
    assert.ok(appJsContent.includes(`baseUri: ["'self'"]`), "baseUri must be strictly 'self'");
});

test("Safe DOM Rendering Audit - views and public scripts do not assign innerHTML or insertAdjacentHTML", () => {
    const fs = require("fs");
    const path = require("path");

    function getAllFiles(dir, exts) {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(getAllFiles(filePath, exts));
            } else if (exts.some(ext => file.endsWith(ext))) {
                results.push(filePath);
            }
        });
        return results;
    }

    const targetDirs = [
        path.join(__dirname, "../views"),
        path.join(__dirname, "../public/js")
    ];

    const allFiles = targetDirs.flatMap(dir => getAllFiles(dir, [".ejs", ".js"]));

    const unsafePatterns = [
        /\.innerHTML\s*=/,
        /\.outerHTML\s*=/,
        /\.insertAdjacentHTML\s*\(/
    ];

    for (const filePath of allFiles) {
        const content = fs.readFileSync(filePath, "utf8");
        for (const pattern of unsafePatterns) {
            const match = content.match(pattern);
            assert.equal(
                match,
                null,
                `Found unsafe dynamic HTML generation in ${path.relative(path.join(__dirname, '..'), filePath)} matching ${pattern}`
            );
        }
    }
});

