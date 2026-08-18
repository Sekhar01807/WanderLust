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
