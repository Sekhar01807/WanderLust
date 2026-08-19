const Booking = require("../models/booking");
const Listing = require("../models/listing");
const User = require("../models/user");
const { sendBookingEmail, sendHostBookingNotificationEmail } = require("./emailService");

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY.trim());
}

/**
 * Authoritative, Idempotent Booking Fulfillment
 * Can be called by Stripe Webhook (checkout.session.completed) or the /success redirect route.
 * 
 * Transitions reservation from pending to paid and triggers automated Stripe refunds
 * in the event of an unfulfillable conflict.
 * 
 * @param {Object|string} sessionOrId - Stripe Checkout Session object or session ID
 * @param {Object} [req] - Express request object for email generation context
 * @returns {Promise<{success: boolean, booking?: Object, conflict?: boolean, refunded?: boolean, message?: string, alreadyFulfilled?: boolean}>}
 */
async function fulfillBooking(sessionOrId, req = null) {
    if (!stripe && process.env.STRIPE_SECRET_KEY) {
        stripe = require("stripe")(process.env.STRIPE_SECRET_KEY.trim());
    }

    let session = null;
    let sessionId = null;

    if (typeof sessionOrId === "string") {
        sessionId = sessionOrId;
        if (stripe) {
            try {
                session = await stripe.checkout.sessions.retrieve(sessionId);
            } catch (err) {
                console.error("❌ Failed to retrieve Stripe session:", err.message);
                return { success: false, message: "Could not retrieve Stripe session: " + err.message };
            }
        }
    } else if (sessionOrId && typeof sessionOrId === "object") {
        session = sessionOrId;
        sessionId = session.id;
    }

    if (!session && !sessionId) {
        return { success: false, message: "Invalid session or session ID provided" };
    }

    // If payment is not completed and session is loaded, return early
    if (session && session.payment_status && session.payment_status !== "paid") {
        return { success: false, message: "Payment has not been completed." };
    }

    const { checkIn, checkOut, guests, userId, listingId, bookingId } = (session && session.metadata) ? session.metadata : {};

    // 1. Idempotency Check: Look up existing booking for this Stripe session or bookingId
    let booking = null;
    if (sessionId) {
        booking = await Booking.findOne({ stripeSessionId: sessionId });
    }
    if (!booking && bookingId) {
        booking = await Booking.findById(bookingId);
    }

    if (booking && booking.paymentStatus === "paid") {
        return { success: true, booking, alreadyFulfilled: true };
    }

    const targetListingId = listingId || (booking && booking.listing);
    const targetUserId = userId || (booking && booking.user);
    const reqCheckIn = checkIn ? new Date(checkIn) : (booking && booking.checkIn);
    const reqCheckOut = checkOut ? new Date(checkOut) : (booking && booking.checkOut);
    const guestsNum = guests ? parseInt(guests, 10) : (booking && booking.guests) || 1;
    const amountTotal = (session && session.amount_total) ? session.amount_total / 100 : (booking && booking.totalPrice) || 0;

    if (!targetListingId || !targetUserId || !reqCheckIn || !reqCheckOut) {
        return { success: false, message: "Incomplete reservation details in Stripe session metadata" };
    }

    // 2. Concurrency Safety: Check if another paid booking occupies the same dates
    const paidConflict = await Booking.findOne({
        _id: booking ? { $ne: booking._id } : { $exists: true },
        listing: targetListingId,
        paymentStatus: "paid",
        checkIn: { $lt: reqCheckOut },
        checkOut: { $gt: reqCheckIn }
    });

    if (paidConflict) {
        console.error(`⚠️ Race condition collision detected on listing ${targetListingId} for session ${sessionId}`);
        
        let autoRefundSuccess = false;
        if (session && session.payment_intent && stripe) {
            try {
                const refund = await stripe.refunds.create({
                    payment_intent: session.payment_intent,
                    reason: "duplicate"
                });
                if (refund && refund.status === "succeeded") {
                    autoRefundSuccess = true;
                }
            } catch (refundErr) {
                console.error("❌ Auto-refund attempt error:", refundErr.message);
            }
        }

        if (booking) {
            booking.paymentStatus = "failed";
            booking.expiresAt = undefined;
            await booking.save();
        } else {
            const conflictBooking = new Booking({
                listing: targetListingId,
                user: targetUserId,
                checkIn: reqCheckIn,
                checkOut: reqCheckOut,
                guests: guestsNum,
                totalPrice: amountTotal,
                paymentStatus: "failed",
                stripeSessionId: sessionId
            });
            await conflictBooking.save();
        }

        return {
            success: false,
            conflict: true,
            refunded: autoRefundSuccess,
            message: "Double booking collision: An overlapping reservation was completed. " +
                     (autoRefundSuccess ? "An automatic full refund has been issued." : "Please contact support for refund.")
        };
    }

    // 3. Mark or Create the Booking as Paid and remove reservation expiration hold
    const listing = await Listing.findById(targetListingId).populate("owner");
    const user = await User.findById(targetUserId);

    if (booking) {
        // Atomic update from pending to paid
        booking = await Booking.findOneAndUpdate(
            { _id: booking._id, paymentStatus: { $in: ["pending", "paid"] } },
            {
                $set: {
                    paymentStatus: "paid",
                    totalPrice: amountTotal,
                    stripeSessionId: sessionId || booking.stripeSessionId
                },
                $unset: { expiresAt: "" }
            },
            { new: true }
        );
    } else {
        booking = new Booking({
            listing: targetListingId,
            user: targetUserId,
            checkIn: reqCheckIn,
            checkOut: reqCheckOut,
            guests: guestsNum,
            totalPrice: amountTotal,
            paymentStatus: "paid",
            stripeSessionId: sessionId
        });
        await booking.save();
    }

    // 4. Send confirmation emails to guest and listing owner
    try {
        if (user) {
            await sendBookingEmail(user, booking, listing, req);
        }
        if (listing && listing.owner && listing.owner.email) {
            await sendHostBookingNotificationEmail(listing.owner, user, booking, listing, req);
        }
    } catch (emailErr) {
        console.error("⚠️ Failed to dispatch booking confirmation email:", emailErr.message);
    }

    return { success: true, booking, alreadyFulfilled: false };
}

module.exports = { fulfillBooking };

