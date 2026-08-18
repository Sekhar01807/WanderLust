const express = require("express");
const router = express.Router();
const Booking = require("../models/booking");
const { fulfillBooking } = require("../utils/bookingFulfillment");

/**
 * Stripe Webhook Handler
 * Authoritative fulfillment path for Stripe Checkout events.
 * Enforces strict cryptographic signature verification and fail-closed security.
 */
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    // Fail closed: Webhook secret must be explicitly configured
    if (!webhookSecret || !webhookSecret.trim()) {
        console.error("❌ CRITICAL: Stripe Webhook Secret (STRIPE_WEBHOOK_SECRET) is not configured.");
        return res.status(500).send("Webhook secret configuration error on server");
    }

    // Fail closed: Stripe secret key must be configured
    if (!stripeSecretKey || !stripeSecretKey.trim()) {
        console.error("❌ CRITICAL: Stripe Secret Key (STRIPE_SECRET_KEY) is not configured.");
        return res.status(500).send("Stripe SDK configuration error on server");
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
        console.error("❌ Stripe Webhook Error: Missing stripe-signature header.");
        return res.status(400).send("Missing stripe-signature header");
    }

    const stripe = require("stripe")(stripeSecretKey.trim());
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret.trim());
    } catch (err) {
        console.error("❌ Stripe Webhook Signature Verification Error:", err.message);
        return res.status(400).send(`Webhook Signature Verification Error: ${err.message}`);
    }

    if (!event || !event.type) {
        return res.status(400).send("Invalid event payload");
    }

    // Process Supported Stripe Event Types
    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const result = await fulfillBooking(session, req);
                
                if (!result.success) {
                    console.error("❌ Webhook fulfillment failed for session:", session && session.id, result.message);
                    // Return HTTP 500 so Stripe will retry with exponential backoff
                    return res.status(500).json({ error: result.message || "Fulfillment failed" });
                }
                break;
            }

            case "checkout.session.expired": {
                const session = event.data.object;
                if (session && session.id) {
                    const booking = await Booking.findOne({ stripeSessionId: session.id, paymentStatus: "pending" });
                    if (booking) {
                        booking.paymentStatus = "cancelled";
                        booking.expiresAt = undefined;
                        await booking.save();
                        console.log(`ℹ️ Released reservation hold for expired checkout session: ${session.id}`);

                        // Notify waitlisted users that dates are available again
                        try {
                            const Waitlist = require("../models/waitlist");
                            const Listing = require("../models/listing");
                            const { sendWaitlistAvailableEmail } = require("../utils/emailService");
                            
                            const listing = await Listing.findById(booking.listing);
                            if (listing) {
                                const waitlistedEntries = await Waitlist.find({ listing: booking.listing, notified: false }).populate("user");
                                for (let entry of waitlistedEntries) {
                                    if (entry.user && entry.user.email) {
                                        await sendWaitlistAvailableEmail(entry.user, listing, req);
                                        entry.notified = true;
                                        await entry.save();
                                    }
                                }
                            }
                        } catch (notifyErr) {
                            console.error("⚠️ Failed to notify waitlist on session expiration:", notifyErr.message);
                        }
                    }
                }
                break;
            }

            default:
                // Unhandled event types acknowledged silently
                break;
        }

        return res.status(200).json({ received: true });
    } catch (processErr) {
        console.error("❌ Unexpected error during webhook processing:", processErr.message);
        return res.status(500).json({ error: "Internal webhook processing error" });
    }
});

module.exports = router;
