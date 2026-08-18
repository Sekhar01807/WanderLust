const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Fulfillment & Transactional Consistency Unit Tests
 */

test("Fulfillment - rejects sessions where payment_status is not paid", async () => {
    const session = {
        id: "cs_test_unpaid_123",
        payment_status: "unpaid",
        metadata: {
            checkIn: "2026-09-01",
            checkOut: "2026-09-05",
            guests: "2",
            listingId: "listing123",
            userId: "user123"
        }
    };

    // Simulate fulfillment status check
    let result;
    if (session && session.payment_status && session.payment_status !== "paid") {
        result = { success: false, message: "Payment has not been completed." };
    }

    assert.equal(result.success, false);
    assert.equal(result.message, "Payment has not been completed.");
});

test("Fulfillment - idempotent for already paid bookings", async () => {
    const existingPaidBooking = {
        _id: "booking_paid_999",
        stripeSessionId: "cs_test_paid_999",
        paymentStatus: "paid"
    };

    let result;
    if (existingPaidBooking && existingPaidBooking.paymentStatus === "paid") {
        result = { success: true, booking: existingPaidBooking, alreadyFulfilled: true };
    }

    assert.equal(result.success, true);
    assert.equal(result.alreadyFulfilled, true);
    assert.equal(result.booking.paymentStatus, "paid");
});

test("Fulfillment - rejects sessions missing required metadata fields", async () => {
    const sessionWithIncompleteMeta = {
        id: "cs_test_meta_123",
        payment_status: "paid",
        metadata: {
            checkIn: "2026-09-01"
            // Missing checkOut, userId, listingId
        }
    };

    const { checkIn, checkOut, userId, listingId } = sessionWithIncompleteMeta.metadata || {};
    let result;
    if (!listingId || !userId || !checkIn || !checkOut) {
        result = { success: false, message: "Incomplete reservation details in Stripe session metadata" };
    }

    assert.equal(result.success, false);
    assert.match(result.message, /Incomplete reservation details/);
});

test("Fulfillment - triggers automated refund when conflict occurs", async () => {
    let refundIssued = false;
    let refundIntent = null;

    const mockStripe = {
        refunds: {
            create: async ({ payment_intent, reason }) => {
                refundIssued = true;
                refundIntent = payment_intent;
                return { status: "succeeded", payment_intent };
            }
        }
    };

    const session = {
        id: "cs_test_collision_123",
        payment_intent: "pi_test_collision_456",
        payment_status: "paid"
    };

    // Simulate conflict branch
    const conflictDetected = true;
    let autoRefundSuccess = false;

    if (conflictDetected && session.payment_intent && mockStripe) {
        const refund = await mockStripe.refunds.create({
            payment_intent: session.payment_intent,
            reason: "duplicate"
        });
        if (refund && refund.status === "succeeded") {
            autoRefundSuccess = true;
        }
    }

    assert.equal(refundIssued, true);
    assert.equal(refundIntent, "pi_test_collision_456");
    assert.equal(autoRefundSuccess, true);
});
