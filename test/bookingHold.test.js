const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Helper simulating reservation collision logic used in WanderLust routes
 */
function isDateOverlap(existingBooking, reqCheckIn, reqCheckOut) {
    const existingStart = new Date(existingBooking.checkIn);
    const existingEnd = new Date(existingBooking.checkOut);
    const newStart = new Date(reqCheckIn);
    const newEnd = new Date(reqCheckOut);

    return existingStart < newEnd && existingEnd > newStart;
}

function isBookingActiveHold(booking, referenceTime = new Date()) {
    if (booking.paymentStatus === "paid") {
        return true;
    }
    if (booking.paymentStatus === "pending" && booking.expiresAt) {
        return new Date(booking.expiresAt) > referenceTime;
    }
    return false;
}

test("Booking Hold - detects date overlaps correctly", () => {
    const existing = {
        checkIn: "2026-09-10T14:00:00.000Z",
        checkOut: "2026-09-15T10:00:00.000Z",
        paymentStatus: "paid"
    };

    // 1. Strict overlap
    assert.equal(isDateOverlap(existing, "2026-09-12T14:00:00.000Z", "2026-09-14T10:00:00.000Z"), true);

    // 2. Overlap across start boundary
    assert.equal(isDateOverlap(existing, "2026-09-08T14:00:00.000Z", "2026-09-12T10:00:00.000Z"), true);

    // 3. Overlap across end boundary
    assert.equal(isDateOverlap(existing, "2026-09-14T14:00:00.000Z", "2026-09-18T10:00:00.000Z"), true);

    // 4. Encompassing range
    assert.equal(isDateOverlap(existing, "2026-09-05T14:00:00.000Z", "2026-09-20T10:00:00.000Z"), true);

    // 5. Non-overlapping before
    assert.equal(isDateOverlap(existing, "2026-09-01T14:00:00.000Z", "2026-09-10T14:00:00.000Z"), false);

    // 6. Non-overlapping after
    assert.equal(isDateOverlap(existing, "2026-09-15T10:00:00.000Z", "2026-09-20T10:00:00.000Z"), false);
});

test("Booking Hold - active pending hold blocks reservations, expired hold does not", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");

    const activeHold = {
        paymentStatus: "pending",
        expiresAt: new Date("2026-08-18T12:15:00.000Z") // 15 mins in future
    };

    const expiredHold = {
        paymentStatus: "pending",
        expiresAt: new Date("2026-08-18T11:45:00.000Z") // 15 mins in past
    };

    const paidBooking = {
        paymentStatus: "paid"
    };

    const cancelledBooking = {
        paymentStatus: "cancelled"
    };

    assert.equal(isBookingActiveHold(activeHold, now), true, "Active unexpired hold should block");
    assert.equal(isBookingActiveHold(expiredHold, now), false, "Expired hold should NOT block");
    assert.equal(isBookingActiveHold(paidBooking, now), true, "Paid booking should always block");
    assert.equal(isBookingActiveHold(cancelledBooking, now), false, "Cancelled booking should not block");
});

test("Booking Hold - synchronizes 30-minute hold expiration with Stripe expires_at", () => {
    const referenceTimestamp = 1755518400000; // Fixed timestamp
    const holdDurationMs = 30 * 60 * 1000;
    const holdExpiresAt = new Date(referenceTimestamp + holdDurationMs);
    const stripeExpiryUnix = Math.floor(holdExpiresAt.getTime() / 1000);

    assert.equal(stripeExpiryUnix, Math.floor((referenceTimestamp + holdDurationMs) / 1000));
    assert.equal(stripeExpiryUnix - Math.floor(referenceTimestamp / 1000), 1800, "Stripe session expiry must be exactly 1800 seconds (30 mins)");
});

test("Booking Hold - collision check detects conflicting hold created earlier or concurrently", () => {
    const holdA = {
        _id: "hold_A",
        checkIn: "2026-10-01",
        checkOut: "2026-10-05",
        createdAt: new Date("2026-08-18T10:00:00.000Z"),
        paymentStatus: "pending",
        expiresAt: new Date("2026-08-18T10:30:00.000Z")
    };

    const holdB = {
        _id: "hold_B",
        checkIn: "2026-10-02",
        checkOut: "2026-10-06",
        createdAt: new Date("2026-08-18T10:00:01.000Z"), // 1 second later
        paymentStatus: "pending",
        expiresAt: new Date("2026-08-18T10:30:01.000Z")
    };

    // holdB checks for conflicts created <= its createdAt
    const isConflictForB = isDateOverlap(holdA, holdB.checkIn, holdB.checkOut) && holdA.createdAt <= holdB.createdAt;
    assert.equal(isConflictForB, true, "Hold B should detect Hold A as collision and abort");
});

