const express = require("express");
const router = express.Router({ mergeParams: true });
const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn, validateBooking } = require("../middleware");
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const { sendCancellationEmail, sendWaitlistAvailableEmail } = require("../utils/emailService");
const { fulfillBooking } = require("../utils/bookingFulfillment");
const { getAppUrl } = require("../utils/appUrl");

// Stripe Initialization with Safety Check
if (!process.env.STRIPE_SECRET_KEY) {
    console.error("❌ CRITICAL ERROR: STRIPE_SECRET_KEY is missing from .env!");
}
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.trim() : "");

router.post("/checkout", isLoggedIn, validateBooking, wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { checkIn, checkOut, guests } = req.body;
    
    const listing = await Listing.findById(id).populate("owner");
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    // Prevent Host from booking their own listing
    if (listing.owner && listing.owner._id.equals(req.user._id)) {
        req.flash("error", "You are the owner of this property and cannot book your own stay.");
        return res.redirect(`/listings/${id}`);
    }

    const reqCheckIn = new Date(checkIn);
    const reqCheckOut = new Date(checkOut);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Validate dates are not in the past
    if (reqCheckIn < startOfToday) {
        req.flash("error", "Check-in date cannot be in the past.");
        return res.redirect(`/listings/${id}`);
    }

    if (reqCheckOut <= reqCheckIn) {
        req.flash("error", "Check-out date must be after check-in date.");
        return res.redirect(`/listings/${id}`);
    }

    // 1. Initial Overlap Check: Purge expired pending holds first
    const now = new Date();
    await Booking.deleteMany({
        listing: id,
        paymentStatus: "pending",
        expiresAt: { $lte: now }
    });

    const overlappingBooking = await Booking.findOne({
        listing: id,
        $or: [
            { paymentStatus: "paid" },
            { paymentStatus: "pending", expiresAt: { $gt: now } }
        ],
        checkIn: { $lt: reqCheckOut },
        checkOut: { $gt: reqCheckIn }
    });

    if (overlappingBooking) {
        const Waitlist = require("../models/waitlist");
        await Waitlist.findOneAndUpdate(
            { listing: id, user: req.user._id, checkIn: reqCheckIn, checkOut: reqCheckOut },
            { $set: { notified: false, createdAt: new Date() } },
            { upsert: true, new: true }
        );

        req.flash("error", "⚠️ Sorry, this property is already booked or currently reserved by another guest for your selected dates! We have saved your interest and will email you instantly if these dates become available.");
        return res.redirect(`/listings/${id}`);
    }

    const listingPrice = listing.price || 0;
    const nights = Math.ceil((reqCheckOut - reqCheckIn) / (1000 * 60 * 60 * 24)) || 1;
    const guestsNum = parseInt(guests, 10) || 1;
    const extraCharge = guestsNum > 1 ? (guestsNum - 1) * 0.25 * listingPrice : 0;
    const amount = nights * (listingPrice + extraCharge);

    if (isNaN(amount) || amount <= 0) {
        req.flash("error", "Invalid booking details. Please check your dates and guests.");
        return res.redirect(`/listings/${id}`);
    }

    // Hold expiration: 30 minutes, synchronized with Stripe Checkout Session expiration
    const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // 2. Atomically create pending reservation hold BEFORE external Stripe API call
    const pendingHold = new Booking({
        listing: id,
        user: req.user._id,
        checkIn: reqCheckIn,
        checkOut: reqCheckOut,
        guests: guestsNum,
        totalPrice: amount,
        paymentStatus: "pending",
        expiresAt: holdExpiresAt
    });
    await pendingHold.save();

    // 3. Atomic Concurrency Collision Check: ensure no other reservation claimed this slot
    const concurrentCollision = await Booking.findOne({
        _id: { $ne: pendingHold._id },
        listing: id,
        $or: [
            { paymentStatus: "paid" },
            { paymentStatus: "pending", expiresAt: { $gt: new Date() } }
        ],
        checkIn: { $lt: reqCheckOut },
        checkOut: { $gt: reqCheckIn },
        createdAt: { $lte: pendingHold.createdAt }
    });

    if (concurrentCollision) {
        await Booking.findByIdAndDelete(pendingHold._id);
        const Waitlist = require("../models/waitlist");
        await Waitlist.findOneAndUpdate(
            { listing: id, user: req.user._id, checkIn: reqCheckIn, checkOut: reqCheckOut },
            { $set: { notified: false, createdAt: new Date() } },
            { upsert: true, new: true }
        );
        req.flash("error", "⚠️ These dates were just reserved by another guest. Please choose alternative dates.");
        return res.redirect(`/listings/${id}`);
    }

    const baseUrl = getAppUrl(req);

    // 4. Create Stripe Checkout Session with synchronized expiration
    try {
        const stripeExpiryUnix = Math.floor(holdExpiresAt.getTime() / 1000);
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{
                price_data: {
                    currency: "inr",
                    product_data: {
                        name: listing.title,
                        description: `Stay from ${reqCheckIn.toDateString()} to ${reqCheckOut.toDateString()}`,
                    },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            mode: "payment",
            expires_at: stripeExpiryUnix,
            success_url: `${baseUrl}/listings/${id}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/listings/${id}`,
            metadata: { 
                checkIn: reqCheckIn.toISOString(), 
                checkOut: reqCheckOut.toISOString(), 
                guests: guestsNum.toString(), 
                listingId: id.toString(), 
                userId: req.user._id.toString(),
                bookingId: pendingHold._id.toString()
            }
        });

        // Link the unique Stripe Checkout Session ID to our held reservation
        pendingHold.stripeSessionId = session.id;
        await pendingHold.save();

        res.redirect(303, session.url);
    } catch (err) {
        console.error("❌ STRIPE API ERROR:", err.message);
        // Rollback hold immediately on Stripe API failure so listing dates remain free
        await Booking.findByIdAndDelete(pendingHold._id);
        req.flash("error", "Stripe Connection Error: " + err.message);
        res.redirect(`/listings/${id}`);
    }
}));

router.get("/success", isLoggedIn, wrapAsync(async (req, res) => {
    const { id } = req.params;
    const sessionId = req.query.session_id;

    if (!sessionId || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
        req.flash("error", "Invalid or missing checkout session ID.");
        return res.redirect(`/listings/${id}`);
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status !== "paid") {
        req.flash("error", "Payment failed or incomplete. Please try again.");
        return res.redirect(`/listings/${id}`);
    }

    const { userId: sessionUserId, listingId: sessionListingId } = session.metadata || {};

    // Strictly verify session belongs to authenticated user and this listing
    if (sessionUserId !== req.user._id.toString()) {
        req.flash("error", "Unauthorized: Checkout session was initiated by a different user.");
        return res.redirect(`/listings/${id}`);
    }

    if (sessionListingId !== id.toString()) {
        req.flash("error", "Invalid checkout session for this property.");
        return res.redirect(`/listings/${id}`);
    }

    // Execute authoritative, idempotent booking fulfillment
    const fulfillment = await fulfillBooking(session, req);

    if (!fulfillment.success) {
        if (fulfillment.conflict) {
            req.flash("error", "⚠️ " + (fulfillment.message || "Reservation collision detected. An automatic full refund has been issued."));
        } else {
            req.flash("error", fulfillment.message || "Unable to complete reservation. Please contact support.");
        }
        return res.redirect(`/listings/${id}`);
    }

    if (fulfillment.alreadyFulfilled) {
        req.flash("success", "Your booking is confirmed! 🎉");
    } else {
        req.flash("success", "Booking confirmed and payment successful! 🎉 Confirmation email sent to you and the host.");
    }
    
    res.redirect(`/listings/${id}`);
}));

// DELETE / Cancellation Route - Verified Ownership & Scoped with Refund Processing
router.delete("/:bookingId", isLoggedIn, wrapAsync(async (req, res) => {
    const { id, bookingId } = req.params;
    
    // Find target booking
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/profile");
    }

    // Verify booking belongs to this listing
    if (!booking.listing.equals(id)) {
        req.flash("error", "Invalid booking for this listing.");
        return res.redirect("/profile");
    }

    // Verify booking ownership: Authenticated user must be the guest who booked
    if (!booking.user.equals(req.user._id)) {
        req.flash("error", "Access Denied: You do not own this reservation.");
        return res.redirect("/profile");
    }

    // Process Stripe refund if booking was paid
    let refundIssued = false;
    let refundAmount = 0;
    let refundId = null;

    if (booking.paymentStatus === "paid") {
        if (booking.stripeSessionId && process.env.STRIPE_SECRET_KEY) {
            try {
                const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
                if (session && session.payment_intent) {
                    const refund = await stripe.refunds.create({
                        payment_intent: session.payment_intent,
                        reason: "requested_by_customer"
                    });
                    if (refund && (refund.status === "succeeded" || refund.status === "pending")) {
                        refundIssued = true;
                        refundId = refund.id;
                        refundAmount = (refund.amount || (booking.totalPrice * 100)) / 100;
                        booking.refundStatus = "refunded";
                        booking.refundId = refundId;
                        booking.refundAmount = refundAmount;
                    } else {
                        booking.refundStatus = "failed";
                    }
                } else {
                    booking.refundStatus = "none";
                }
            } catch (refundErr) {
                console.error("❌ Stripe Refund Error on cancellation:", refundErr.message);
                booking.refundStatus = "failed";
            }
        } else {
            booking.refundStatus = "none";
        }
    } else {
        booking.refundStatus = "none";
    }

    // Mark target booking as cancelled and record timestamp
    booking.paymentStatus = "cancelled";
    booking.cancelledAt = new Date();
    booking.expiresAt = undefined;
    await booking.save();

    // Send cancellation email to guest
    const listing = await Listing.findById(id);
    if (listing) {
        await sendCancellationEmail(req.user, booking, listing, req);

        // Notify users on waitlist for this property
        const Waitlist = require("../models/waitlist");
        const waitlistedEntries = await Waitlist.find({ listing: id, notified: false }).populate("user");
        for (let entry of waitlistedEntries) {
            if (entry.user && entry.user.email) {
                await sendWaitlistAvailableEmail(entry.user, listing, req);
                entry.notified = true;
                await entry.save();
            }
        }
    }

    const successMsg = refundIssued
        ? `Reservation cancelled successfully. A full refund of ₹${refundAmount.toLocaleString("en-IN")} has been initiated to your original payment method.`
        : "Reservation cancelled successfully. A confirmation email has been sent to you.";
    req.flash("success", successMsg);

    // Handle AJAX/JSON requests for real-time UI updates
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: successMsg, refundIssued, refundAmount });
    }

    const referer = req.get("Referer") || "";
    if (referer.includes("/profile")) {
        return res.redirect("/profile");
    }
    res.redirect(`/listings/${id}`);
}));

// GET /listings/:id/booking/:bookingId/receipt - Official E-Receipt
router.get("/:bookingId/receipt", isLoggedIn, wrapAsync(async (req, res) => {
    const { id, bookingId } = req.params;
    const booking = await Booking.findById(bookingId).populate("listing user");
    if (!booking) {
        req.flash("error", "Booking receipt not found.");
        return res.redirect("/profile");
    }
    
    // Check authorization: User must be booking guest or listing owner
    const isGuest = booking.user && booking.user._id.equals(req.user._id);
    const isOwner = booking.listing && booking.listing.owner && booking.listing.owner.equals(req.user._id);
    
    if (!isGuest && !isOwner) {
        req.flash("error", "Unauthorized to view this receipt.");
        return res.redirect("/profile");
    }

    res.render("users/receipt.ejs", { booking });
}));

module.exports = router;

