const express = require("express");
const router = express.Router({ mergeParams: true });
const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn } = require("../middleware");
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const { sendBookingEmail } = require("../utils/emailService");
// Stripe Initialization with Safety Check
if (!process.env.STRIPE_SECRET_KEY) {
    console.error("❌ CRITICAL ERROR: STRIPE_SECRET_KEY is missing from .env!");
}
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.trim() : "");

router.post("/checkout", isLoggedIn, wrapAsync(async (req, res) => {
    console.log("💳 STRIPE: Initializing checkout for listing:", req.params.id);
    const { id } = req.params;
    const { checkIn, checkOut, guests } = req.body;
    
    const listing = await Listing.findById(id).populate("owner");
    if (!listing) {
        console.error("❌ STRIPE ERROR: Listing not found during checkout");
        req.flash("error", "Listing not found");
        return res.redirect("/listings");
    }

    // Prevent Host from booking their own listing
    if (listing.owner && listing.owner._id.equals(req.user._id)) {
        req.flash("error", "You are the owner of this property and cannot book your own stay.");
        return res.redirect(`/listings/${id}`);
    }



    // Double-Booking Prevention: Check if listing is already booked for requested dates
    const reqCheckIn = new Date(checkIn);
    const reqCheckOut = new Date(checkOut);
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

    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)) || 1;
    const guestsNum = parseInt(guests) || 1;
    const extraCharge = guestsNum > 1 ? (guestsNum - 1) * 0.25 * listingPrice : 0;
    const amount = nights * (listingPrice + extraCharge);

    if (isNaN(amount) || amount <= 0) {
        console.error("❌ STRIPE ERROR: Invalid booking amount calculated:", amount);
        req.flash("error", "Invalid booking details. Please check your dates and guests.");
        return res.redirect(`/listings/${id}`);
    }

    console.log(`📊 STRIPE: Total amount to charge: ₹${amount}`);

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{
                price_data: {
                    currency: "inr",
                    product_data: {
                        name: listing.title,
                        description: `Stay from ${checkIn} to ${checkOut}`,
                    },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            mode: "payment",
            success_url: `${req.protocol}://${req.get("host")}/listings/${id}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get("host")}/listings/${id}`,
            metadata: { checkIn, checkOut, guests, listingId: id, userId: req.user._id.toString() }
        });

        console.log("✅ STRIPE: Session created successfully. Redirecting to:", session.url);
        res.redirect(303, session.url);
    } catch (err) {
        console.error("❌ STRIPE API ERROR:", err.message);
        req.flash("error", "Stripe Connection Error: " + err.message);
        res.redirect(`/listings/${id}`);
    }
}));

router.get("/success", isLoggedIn, wrapAsync(async (req, res) => {
    const { id } = req.params;
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    
    if (session.payment_status === "paid") {
        const { checkIn, checkOut, guests } = session.metadata;
        const listing = await Listing.findById(id).populate("owner");
        
        const booking = new Booking({
            listing: id,
            user: req.user._id,
            checkIn: new Date(checkIn),
            checkOut: new Date(checkOut),
            guests: parseInt(guests),
            totalPrice: session.amount_total / 100,
            paymentStatus: "paid",
            stripeSessionId: session.id
        });

        await booking.save();
        
        // 1. Send confirmation email to Guest
        await sendBookingEmail(req.user, booking, listing);
        
        // 2. Send notification email to Host (Listing Owner)
        if (listing.owner && listing.owner.email) {
            const { sendHostBookingNotificationEmail } = require("../utils/emailService");
            await sendHostBookingNotificationEmail(listing.owner, req.user, booking, listing);
        }

        req.flash("success", "Booking confirmed and payment successful! 🎉 Confirmation email sent to you and the host.");
        res.redirect(`/listings/${id}`);
    } else {

        req.flash("error", "Payment failed. Please try again.");
        res.redirect(`/listings/${id}`);
    }
}));

// DELETE / Cancellation Route
router.delete("/:bookingId", isLoggedIn, wrapAsync(async (req, res) => {
    const { id, bookingId } = req.params;
    
    // Find target booking
    const booking = await Booking.findById(bookingId);
    
    // Mark target booking as cancelled
    if (booking) {
        booking.paymentStatus = "cancelled";
        await booking.save();
    }

    // Mark any other paid bookings for this user and listing as cancelled
    await Booking.updateMany(
        { listing: id, user: req.user._id, paymentStatus: "paid" },
        { $set: { paymentStatus: "cancelled" } }
    );



    // Send cancellation email ONLY to the guest
    const listing = await Listing.findById(id);
    if (listing) {
        const { sendCancellationEmail, sendWaitlistAvailableEmail } = require("../utils/emailService");
        await sendCancellationEmail(req.user, booking || { checkIn: new Date(), checkOut: new Date() }, listing);

        // Notify users on waitlist for this property
        const Waitlist = require("../models/waitlist");
        const waitlistedEntries = await Waitlist.find({ listing: id, notified: false }).populate("user");
        for (let entry of waitlistedEntries) {
            if (entry.user && entry.user.email) {
                await sendWaitlistAvailableEmail(entry.user, listing);
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

