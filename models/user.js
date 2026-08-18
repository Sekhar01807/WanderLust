const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require('passport-local-mongoose').default;

const userSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    country: {
        type: String,
        default: "Not specified"
    },
    profileImage: {
        url: {
            type: String,
            default: ""
        },
        filename: String
    },
    wishlist: [
        {
            type: Schema.Types.ObjectId,
            ref: "Listing",
        }
    ],
    bio: {
        type: String,
        default: ""
    },
    role: {
        type: String,
        enum: ["Traveler", "Host"],
        default: "Traveler"
    },
    phoneNumber: {
        type: String,
        default: ""
    },
    languages: {
        type: String,
        default: "English"
    },
    isVerified: {
        type: Boolean,
        default: true
    },
    resetPasswordToken: {
        type: String,
        select: false
    },
    resetPasswordExpires: {
        type: Date,
        select: false
    },
    sessionVersion: {
        type: Number,
        default: 0
    }
});

userSchema.set("toJSON", {
    transform: function (doc, ret) {
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.hash;
        delete ret.salt;
        return ret;
    }
});

userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model('User', userSchema);