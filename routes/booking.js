const express = require("express");
const router = express.Router({ mergeParams: true });
const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn, validateBooking } = require("../middleware");
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const { sendBookingEmail, sendHostBookingNotificationEmail, sendCancellationEmail, sendWaitlistAvailableEmail } = require("../utils/emailService");
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

    // Double-Booking Prevention: Check if listing is already booked for requested dates
    const overlappingBooking = await Booking.findOne({
        listing: id,
        paymentStatus: "paid",
        $or: [
            { checkIn: { $lt: reqCheckOut }, checkOut: { $gt: reqCheckIn } }
        ]
    });

    if (overlappingBooking) {
        const Waitlist = require("../models/waitlist");
        await Waitlist.create({
            listing: id,
            user: req.user._id,
            checkIn: reqCheckIn,
            checkOut: reqCheckOut
        });

        req.flash("error", "⚠️ Sorry, this property is already booked for your selected dates! We have saved your interest and will email you instantly if these dates become available.");
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

    const baseUrl = getAppUrl(req);

    try {
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
            success_url: `${baseUrl}/listings/${id}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/listings/${id}`,
            metadata: { 
                checkIn: reqCheckIn.toISOString(), 
                checkOut: reqCheckOut.toISOString(), 
                guests: guestsNum.toString(), 
                listingId: id.toString(), 
                userId: req.user._id.toString() 
            }
        });

        res.redirect(303, session.url);
    } catch (err) {
        console.error("❌ STRIPE API ERROR:", err.message);
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

    const { checkIn, checkOut, guests, userId: sessionUserId, listingId: sessionListingId } = session.metadata || {};

    // Strictly verify session belongs to authenticated user and this listing
    if (sessionUserId !== req.user._id.toString()) {
        req.flash("error", "Unauthorized: Checkout session was initiated by a different user.");
        return res.redirect(`/listings/${id}`);
    }

    if (sessionListingId !== id.toString()) {
        req.flash("error", "Invalid checkout session for this property.");
        return res.redirect(`/listings/${id}`);
    }

    // Idempotency: Check if booking was already created for this Stripe Session
    const existingBooking = await Booking.findOne({ stripeSessionId: session.id });
    if (existingBooking) {
        req.flash("success", "Your booking is confirmed! 🎉");
        return res.redirect(`/listings/${id}`);
    }

    const reqCheckIn = new Date(checkIn);
    const reqCheckOut = new Date(checkOut);

    // Concurrency / Race condition check: Ensure no overlapping paid booking was confirmed in the interim
    const raceOverlappingBooking = await Booking.findOne({
        listing: id,
        paymentStatus: "paid",
        $or: [
            { checkIn: { $lt: reqCheckOut }, checkOut: { $gt: reqCheckIn } }
        ]
    });

    if (raceOverlappingBooking) {
        // Handle double-booking race condition: record booking as conflict/failed for refund
        const conflictBooking = new Booking({
            listing: id,
            user: req.user._id,
            checkIn: reqCheckIn,
            checkOut: reqCheckOut,
            guests: parseInt(guests, 10),
            totalPrice: session.amount_total / 100,
            paymentStatus: "failed",
            stripeSessionId: session.id
        });
        await conflictBooking.save();

        req.flash("error", "⚠️ Another guest completed reservation for these dates just before you. Your payment was captured and our support team will process a full refund or rebooking immediately.");
        return res.redirect(`/listings/${id}`);
    }

    const listing = await Listing.findById(id).populate("owner");
    
    const booking = new Booking({
        listing: id,
        user: req.user._id,
        checkIn: reqCheckIn,
        checkOut: reqCheckOut,
        guests: parseInt(guests, 10),
        totalPrice: session.amount_total / 100,
        paymentStatus: "paid",
        stripeSessionId: session.id
    });

    await booking.save();
    
    // 1. Send confirmation email to Guest
    await sendBookingEmail(req.user, booking, listing, req);
    
    // 2. Send notification email to Host (Listing Owner)
    if (listing && listing.owner && listing.owner.email) {
        await sendHostBookingNotificationEmail(listing.owner, req.user, booking, listing, req);
    }

    req.flash("success", "Booking confirmed and payment successful! 🎉 Confirmation email sent to you and the host.");
    res.redirect(`/listings/${id}`);
}));

// DELETE / Cancellation Route - Verified Ownership & Scoped
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

    // Mark target booking as cancelled
    booking.paymentStatus = "cancelled";
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

    req.flash("success", "Reservation cancelled successfully. A confirmation email has been sent to you.");

    // Handle AJAX/JSON requests for real-time UI updates
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: "Reservation cancelled successfully." });
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

