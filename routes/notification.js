const express = require("express");
const router = express.Router();
const Booking = require("../models/booking.js");
const Message = require("../models/message.js");
const { isLoggedIn } = require("../middleware.js");
const wrapAsync = require("../utils/wrapAsync.js");

router.get("/summary", isLoggedIn, wrapAsync(async (req, res) => {
    const userId = req.user._id;
    const now = new Date();
    
    // 1. Fetch Active / Upcoming Booking Alerts for this Traveler
    const bookings = await Booking.find({ 
        user: userId, 
        paymentStatus: "paid",
        checkOut: { $gte: now }
    }).populate("listing");

    const bookingAlerts = [];
    bookings.forEach(b => {
        if (!b.listing) return;
        if (b.checkIn > now) {
            const diffTime = Math.abs(b.checkIn - now);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            bookingAlerts.push({
                type: "booking",
                days: diffDays,
                listingTitle: b.listing.title,
                listingId: b.listing._id,
                message: `Upcoming trip to ${b.listing.title} in ${diffDays} day${diffDays > 1 ? 's' : ''}! ✈️`
            });
        } else if (now >= b.checkIn && now <= b.checkOut) {
            bookingAlerts.push({
                type: "booking",
                days: 0,
                listingTitle: b.listing.title,
                listingId: b.listing._id,
                message: `🌟 Active Stay: You are currently checked in at ${b.listing.title}!`
            });
        }
    });

    // 2. Fetch Unread Message Alerts
    const unreadMessages = await Message.find({
        receiver: userId,
        isRead: false
    }).populate("sender").populate("listing").sort({ createdAt: -1 });

    const messageAlerts = unreadMessages.map(m => ({
        type: "message",
        senderName: m.sender ? m.sender.username : 'User',
        senderId: m.sender ? m.sender._id : '',
        listingId: m.listing ? m.listing._id : '',
        content: m.content,
        message: `New message from @${m.sender ? m.sender.username : 'User'} about ${m.listing ? m.listing.title : 'stay'}`
    }));

    // 3. Fetch Recent Host Alerts (Created in the last 48 hours for Host listings)
    const Listing = require("../models/listing.js");
    const hostListings = await Listing.find({ owner: userId }).select("_id title");
    const hostListingIds = hostListings.map(l => l._id);
    
    let hostAlerts = [];
    if (hostListingIds.length > 0) {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const hostBookings = await Booking.find({
            listing: { $in: hostListingIds },
            user: { $ne: userId },
            createdAt: { $gte: twoDaysAgo }
        }).populate("user listing").sort({ createdAt: -1 });

        hostBookings.forEach(b => {
            if (!b.listing || !b.user) return;
            if (b.paymentStatus === "paid") {
                hostAlerts.push({
                    type: "host_booking",
                    id: b._id,
                    guestName: b.user.username,
                    listingTitle: b.listing.title,
                    message: `🎉 New Booking: @${b.user.username} booked ${b.listing.title} (₹${b.totalPrice ? b.totalPrice.toLocaleString('en-IN') : '0'})`
                });
            } else if (b.paymentStatus === "cancelled") {
                hostAlerts.push({
                    type: "host_cancellation",
                    id: b._id,
                    guestName: b.user.username,
                    listingTitle: b.listing.title,
                    message: `⚠️ Cancellation: @${b.user.username} cancelled their reservation at ${b.listing.title}`
                });
            }
        });
    }

    res.json({
        success: true,
        alerts: [...bookingAlerts, ...messageAlerts, ...hostAlerts]
    });
}));

module.exports = router;

