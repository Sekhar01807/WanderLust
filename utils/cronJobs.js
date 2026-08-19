const cron = require("node-cron");
const Booking = require("../models/booking");
const { sendTripReminder } = require("./emailService");

// Run every day at 9:00 AM
cron.schedule("0 9 * * *", async () => {
    try {
        const today = new Date();
        const bookings = await Booking.find({ paymentStatus: "paid" }).populate("user").populate("listing");

        for (let booking of bookings) {
            const checkIn = new Date(booking.checkIn);
            const timeDiff = checkIn.getTime() - today.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

            if ([7, 2, 1].includes(daysDiff)) {
                await sendTripReminder(booking.user, booking.listing, daysDiff);
            }
        }
    } catch (err) {
        console.error("❌ Cron Job Reminder Error:", err.message);
    }
});
