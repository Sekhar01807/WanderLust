const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema({
    listing: {
        type: Schema.Types.ObjectId,
        ref: "Listing",
        required: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    checkIn: {
        type: Date,
        required: true
    },
    checkOut: {
        type: Date,
        required: true
    },
    guests: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ["pending", "paid", "failed", "cancelled", "completed", "no_show"],
        default: "pending"
    },


    stripeSessionId: {
        type: String,
        sparse: true,
        index: true
    },
    expiresAt: {
        type: Date,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

bookingSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });
bookingSchema.index({ listing: 1, paymentStatus: 1, checkIn: 1, checkOut: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
