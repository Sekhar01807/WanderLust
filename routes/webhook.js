const express = require("express");
const router = express.Router();
const Booking = require("../models/booking");
const { fulfillBooking } = require("../utils/bookingFulfillment");

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY.trim());
}

/**
 * Stripe Webhook Handler
 * Authoritative fulfillment path for Stripe Checkout events
 */
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripe && process.env.STRIPE_SECRET_KEY) {
        stripe = require("stripe")(process.env.STRIPE_SECRET_KEY.trim());
    }

    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    if (webhookSecret && sig && stripe) {
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error("❌ Stripe Webhook Signature Error:", err.message);
            return res.status(400).send(`Webhook Signature Verification Error: ${err.message}`);
        }
    } else {
        // Fallback for dev / test environments when payload is raw buffer or JSON
        try {
            event = typeof req.body === "string" ? JSON.parse(req.body) : (Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString("utf8")) : req.body);
        } catch (err) {
            console.error("❌ Failed to parse webhook payload:", err.message);
            return res.status(400).send("Invalid webhook payload format");
        }
    }

    if (!event || !event.type) {
        return res.status(400).send("Invalid event payload");
    }

    // Process Supported Stripe Event Types
    switch (event.type) {
        case "checkout.session.completed":
        case "payment_intent.succeeded": {
            const session = event.data.object;
            const result = await fulfillBooking(session, req);
            if (!result.success && result.conflict) {
                console.warn("⚠️ Webhook fulfillment encountered booking conflict for session:", session.id);
            }
            break;
        }

        case "checkout.session.expired": {
            const session = event.data.object;
            if (session && session.id) {
                await Booking.updateOne(
                    { stripeSessionId: session.id, paymentStatus: "pending" },
                    { $set: { paymentStatus: "cancelled" }, $unset: { expiresAt: "" } }
                );
                console.log(`ℹ️ Released reservation hold for expired checkout session: ${session.id}`);
            }
            break;
        }

        default:
            // Unhandled event types acknowledged silently
            break;
    }

    res.json({ received: true });
});

module.exports = router;
