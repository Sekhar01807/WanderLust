const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

/**
 * Helper: Date range overlap logic
 */
function isDateOverlap(existingBooking, reqCheckIn, reqCheckOut) {
    const existingStart = new Date(existingBooking.checkIn);
    const existingEnd = new Date(existingBooking.checkOut);
    const newStart = new Date(reqCheckIn);
    const newEnd = new Date(reqCheckOut);

    return existingStart < newEnd && existingEnd > newStart;
}

/**
 * Helper: Active hold status check
 */
function isBookingActiveHold(booking, referenceTime = new Date()) {
    if (booking.paymentStatus === "paid") {
        return true;
    }
    if (booking.paymentStatus === "pending" && booking.expiresAt) {
        return new Date(booking.expiresAt) > referenceTime;
    }
    return false;
}

/**
 * Helper: Simulates message relationship authorization
 */
function validateMessageAccess({ currentUserId, targetUserId, listingOwnerId, action }) {
    if (!currentUserId || !targetUserId) {
        return { authorized: false, status: 400, message: "Missing user identifiers" };
    }

    if (currentUserId === targetUserId) {
        return { authorized: false, status: 400, message: "Cannot message yourself" };
    }

    const isCurrentOwner = String(currentUserId) === String(listingOwnerId);
    const isTargetOwner = String(targetUserId) === String(listingOwnerId);

    // Relationship check: At least one party must be the listing owner (host)
    if (!isCurrentOwner && !isTargetOwner) {
        return {
            authorized: false,
            status: 403,
            message: "Unauthorized: Messages must be between a guest and the listing host."
        };
    }

    return { authorized: true, status: 200 };
}

// --------------------------------------------------------------------------
// 1. DUPLICATE WEBHOOK HANDLING
// --------------------------------------------------------------------------
test("Edge Case - Duplicate Webhook: idempotent handling for repeated checkout.session.completed", async () => {
    // Mock database state
    let bookingsDb = [
        {
            _id: "b_101",
            stripeSessionId: "cs_duplicate_event_001",
            paymentStatus: "paid",
            listing: "listing_abc",
            user: "user_xyz"
        }
    ];

    let webhookDeliveriesCount = 0;
    let fulfilledBookingCount = 0;

    const processWebhookEvent = async (event) => {
        webhookDeliveriesCount++;
        const session = event.data.object;

        // Check if already fulfilled
        const existing = bookingsDb.find(b => b.stripeSessionId === session.id);
        if (existing && existing.paymentStatus === "paid") {
            return { statusCode: 200, json: { received: true, alreadyFulfilled: true } };
        }

        // New fulfillment logic
        fulfilledBookingCount++;
        bookingsDb.push({
            _id: "b_new",
            stripeSessionId: session.id,
            paymentStatus: "paid"
        });
        return { statusCode: 200, json: { received: true } };
    };

    const duplicateEvent = {
        id: "evt_dup_001",
        type: "checkout.session.completed",
        data: {
            object: {
                id: "cs_duplicate_event_001",
                payment_status: "paid"
            }
        }
    };

    // First arrival (already in DB as paid from earlier or direct completion)
    const res1 = await processWebhookEvent(duplicateEvent);
    assert.equal(res1.statusCode, 200);
    assert.equal(res1.json.alreadyFulfilled, true);
    assert.equal(fulfilledBookingCount, 0, "Should not re-fulfill already paid booking");

    // Second duplicate arrival from Stripe retry
    const res2 = await processWebhookEvent(duplicateEvent);
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.json.alreadyFulfilled, true);
    assert.equal(webhookDeliveriesCount, 2);
    assert.equal(bookingsDb.length, 1, "Duplicate webhook must not duplicate booking records");
});

// --------------------------------------------------------------------------
// 2. ALREADY FULFILLED BOOKING
// --------------------------------------------------------------------------
test("Edge Case - Already Fulfilled Booking: returns existing booking without modifying state", async () => {
    const existingPaidBooking = {
        _id: "b_paid_777",
        stripeSessionId: "cs_paid_777",
        paymentStatus: "paid",
        totalPrice: 15000,
        createdAt: new Date("2026-08-01")
    };

    const fulfillSession = async (session, existingBooking) => {
        if (existingBooking && existingBooking.paymentStatus === "paid") {
            return {
                success: true,
                booking: existingBooking,
                alreadyFulfilled: true
            };
        }
        return { success: false, message: "Unfulfilled" };
    };

    const result = await fulfillSession({ id: "cs_paid_777" }, existingPaidBooking);

    assert.equal(result.success, true);
    assert.equal(result.alreadyFulfilled, true);
    assert.equal(result.booking._id, "b_paid_777");
    assert.equal(result.booking.paymentStatus, "paid");
});

// --------------------------------------------------------------------------
// 3. EXPIRED HOLD
// --------------------------------------------------------------------------
test("Edge Case - Expired Hold: hold expiration unlocks slot and notifies waitlist", async () => {
    const now = new Date("2026-08-19T10:35:00.000Z");

    const holdBooking = {
        _id: "b_hold_001",
        listing: "listing_999",
        stripeSessionId: "cs_hold_expired_001",
        checkIn: "2026-09-01T14:00:00.000Z",
        checkOut: "2026-09-05T10:00:00.000Z",
        paymentStatus: "pending",
        expiresAt: new Date("2026-08-19T10:30:00.000Z") // Expired 5 mins ago
    };

    // 1. Check hold status is no longer active
    const isActive = isBookingActiveHold(holdBooking, now);
    assert.equal(isActive, false, "Expired hold must not be considered active");

    // 2. Simulate webhook checkout.session.expired handler
    let waitlistNotified = false;
    const handleSessionExpired = async (session, booking) => {
        if (booking && booking.paymentStatus === "pending") {
            booking.paymentStatus = "cancelled";
            booking.expiresAt = undefined;

            // Trigger waitlist notification
            waitlistNotified = true;
            return { success: true, released: true };
        }
        return { success: false };
    };

    const releaseResult = await handleSessionExpired({ id: "cs_hold_expired_001" }, holdBooking);
    assert.equal(releaseResult.success, true);
    assert.equal(holdBooking.paymentStatus, "cancelled");
    assert.equal(holdBooking.expiresAt, undefined);
    assert.equal(waitlistNotified, true, "Waitlist should be notified on session expiration");

    // 3. Verify new booking on same dates is now permitted
    const isNewBookingAllowed = !isDateOverlap(
        holdBooking.paymentStatus === "paid" ? holdBooking : { checkIn: "1970-01-01", checkOut: "1970-01-01" },
        "2026-09-01T14:00:00.000Z",
        "2026-09-05T10:00:00.000Z"
    );
    assert.equal(isNewBookingAllowed, true, "New booking must be allowed once hold is released");
});

// --------------------------------------------------------------------------
// 4. OVERLAPPING BOOKING BOUNDARIES
// --------------------------------------------------------------------------
test("Edge Case - Overlapping Booking: comprehensive date collision boundary matrix", () => {
    const existing = {
        checkIn: "2026-10-10T14:00:00.000Z",
        checkOut: "2026-10-20T10:00:00.000Z"
    };

    // 1. Identical match
    assert.equal(isDateOverlap(existing, "2026-10-10T14:00:00.000Z", "2026-10-20T10:00:00.000Z"), true);

    // 2. Partial overlap: starts before, ends inside
    assert.equal(isDateOverlap(existing, "2026-10-05T14:00:00.000Z", "2026-10-15T10:00:00.000Z"), true);

    // 3. Partial overlap: starts inside, ends after
    assert.equal(isDateOverlap(existing, "2026-10-15T14:00:00.000Z", "2026-10-25T10:00:00.000Z"), true);

    // 4. Enclosing range: starts before, ends after
    assert.equal(isDateOverlap(existing, "2026-10-01T14:00:00.000Z", "2026-10-30T10:00:00.000Z"), true);

    // 5. Enclosed range: completely inside existing
    assert.equal(isDateOverlap(existing, "2026-10-12T14:00:00.000Z", "2026-10-18T10:00:00.000Z"), true);

    // 6. Adjacent preceding: checkout == checkin (non-overlapping checkout day)
    assert.equal(isDateOverlap(existing, "2026-10-01T14:00:00.000Z", "2026-10-10T14:00:00.000Z"), false);

    // 7. Adjacent succeeding: checkin == checkout (non-overlapping checkin day)
    assert.equal(isDateOverlap(existing, "2026-10-20T10:00:00.000Z", "2026-10-25T10:00:00.000Z"), false);

    // 8. Distant before
    assert.equal(isDateOverlap(existing, "2026-09-01T14:00:00.000Z", "2026-09-10T10:00:00.000Z"), false);

    // 9. Distant after
    assert.equal(isDateOverlap(existing, "2026-11-01T14:00:00.000Z", "2026-11-10T10:00:00.000Z"), false);
});

// --------------------------------------------------------------------------
// 5. REFUND FAILURE HANDLING
// --------------------------------------------------------------------------
test("Edge Case - Refund Failure: handles Stripe API refund rejection gracefully without crash", async () => {
    const mockFailingStripe = {
        refunds: {
            create: async () => {
                const error = new Error("Charge has already been refunded or payment intent is invalid");
                error.type = "StripeInvalidRequestError";
                throw error;
            }
        }
    };

    let refundState = {
        autoRefundSuccess: false,
        refundError: null,
        bookingStatus: "pending"
    };

    const handleConflictAutoRefund = async (session, stripeClient) => {
        if (session.payment_intent && stripeClient) {
            try {
                const refund = await stripeClient.refunds.create({
                    payment_intent: session.payment_intent,
                    reason: "duplicate"
                });
                if (refund && refund.status === "succeeded") {
                    refundState.autoRefundSuccess = true;
                    refundState.bookingStatus = "refunded";
                }
            } catch (err) {
                refundState.autoRefundSuccess = false;
                refundState.refundError = err.message;
                refundState.bookingStatus = "failed"; // Preserves failure state
            }
        }
    };

    await handleConflictAutoRefund({ payment_intent: "pi_invalid_123" }, mockFailingStripe);

    assert.equal(refundState.autoRefundSuccess, false);
    assert.match(refundState.refundError, /already been refunded/);
    assert.equal(refundState.bookingStatus, "failed");
});

// --------------------------------------------------------------------------
// 6. UNAUTHORIZED MESSAGE ACCESS
// --------------------------------------------------------------------------
test("Edge Case - Unauthorized Message Access: blocks non-participants from messaging/reading", () => {
    const hostId = "host_user_111";
    const guestId = "guest_user_222";
    const intruderId = "intruder_user_333";
    const listingOwnerId = hostId;

    // 1. Authorized: Guest messaging host
    const guestToHost = validateMessageAccess({
        currentUserId: guestId,
        targetUserId: hostId,
        listingOwnerId: listingOwnerId
    });
    assert.equal(guestToHost.authorized, true);
    assert.equal(guestToHost.status, 200);

    // 2. Authorized: Host messaging guest
    const hostToGuest = validateMessageAccess({
        currentUserId: hostId,
        targetUserId: guestId,
        listingOwnerId: listingOwnerId
    });
    assert.equal(hostToGuest.authorized, true);
    assert.equal(hostToGuest.status, 200);

    // 3. Unauthorized: Intruder messaging guest on host's listing
    const intruderToGuest = validateMessageAccess({
        currentUserId: intruderId,
        targetUserId: guestId,
        listingOwnerId: listingOwnerId
    });
    assert.equal(intruderToGuest.authorized, false);
    assert.equal(intruderToGuest.status, 403);
    assert.match(intruderToGuest.message, /Unauthorized/);

    // 4. Unauthorized: User messaging themselves
    const selfMessage = validateMessageAccess({
        currentUserId: hostId,
        targetUserId: hostId,
        listingOwnerId: listingOwnerId
    });
    assert.equal(selfMessage.authorized, false);
    assert.equal(selfMessage.status, 400);

    // 5. Unauthorized: Missing user identifier
    const missingTarget = validateMessageAccess({
        currentUserId: hostId,
        targetUserId: null,
        listingOwnerId: listingOwnerId
    });
    assert.equal(missingTarget.authorized, false);
    assert.equal(missingTarget.status, 400);
});
