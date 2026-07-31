const express = require("express");
const router = express.Router();
const Booking = require("../models/booking.js");
const Message = require("../models/message.js");
const { isLoggedIn } = require("../middleware.js");
const wrapAsync = require("../utils/wrapAsync.js");

router.get("/summary", isLoggedIn, wrapAsync(async (req, res) => {
    const userId = req.user._id;
    const now = new Date();
    
    // 1. Fetch Booking Alerts
    // We look for paid bookings starting in the future
    const bookings = await Booking.find({ 
        user: userId, 
        paymentStatus: "paid",
        checkIn: { $gt: now }
    }).populate("listing");

    const bookingAlerts = [];
    bookings.forEach(b => {
        const diffTime = Math.abs(b.checkIn - now);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Alert on specific intervals: 1, 2, 5, 7 days
        if ([1, 2, 5, 7].includes(diffDays)) {
            bookingAlerts.push({
                type: "booking",
                days: diffDays,
                listingTitle: b.listing.title,
                listingId: b.listing._id,
                message: `Your trip to ${b.listing.title} is in ${diffDays} day${diffDays > 1 ? 's' : ''}! ✈️`
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

    // 3. Fetch Host Alerts (New Bookings & Cancellations for Host Stays)
    const Listing = require("../models/listing.js");
    const hostListings = await Listing.find({ owner: userId }).select("_id title");
    const hostListingIds = hostListings.map(l => l._id);
    
    let hostAlerts = [];
    if (hostListingIds.length > 0) {
        const hostBookings = await Booking.find({
            listing: { $in: hostListingIds },
            user: { $ne: userId }
        }).populate("user listing").sort({ createdAt: -1 }).limit(10);

        hostBookings.forEach(b => {
            if (!b.listing || !b.user) return;
            if (b.paymentStatus === "paid") {
                hostAlerts.push({
                    type: "host_booking",
                    id: b._id,
                    guestName: b.user.username,
                    listingTitle: b.listing.title,
                    message: `🎉 New Booking Alert! @${b.user.username} booked ${b.listing.title} (₹${b.totalPrice ? b.totalPrice.toLocaleString('en-IN') : '0'})`
                });
            } else if (b.paymentStatus === "cancelled") {
                hostAlerts.push({
                    type: "host_cancellation",
                    id: b._id,
                    guestName: b.user.username,
                    listingTitle: b.listing.title,
                    message: `⚠️ Cancellation Alert: @${b.user.username} cancelled their stay at ${b.listing.title}`
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

