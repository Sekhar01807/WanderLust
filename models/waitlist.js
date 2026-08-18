const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const waitlistSchema = new Schema({
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
    checkIn: Date,
    checkOut: Date,
    notified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

waitlistSchema.index({ listing: 1, user: 1, checkIn: 1, checkOut: 1 }, { unique: true });

module.exports = mongoose.model("Waitlist", waitlistSchema);
