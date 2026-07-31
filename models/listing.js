const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review.js");

const CATEGORIES = [
    "trending", "rooms", "cities", "pools", "hills",
    "star_hotels", "private_house", "best_deals",
    "premium", "nearby", "beachfront", "camping",
    "castles", "arctic", "others"
];


const listingSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    image: {
        filename: String,
        url: {
            type: String,
            default:
                "https://images.unsplash.com/photo-1728048756938-de1ccee0ab15?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8cHJpdmF0ZSUyMHZpbGxhc3xlbnwwfHwwfHx8MA%3D%3D",
        },
    },
    price: Number,
    location: String,
    country: String,
    category: {
        type: String,
        enum: CATEGORIES,
        default: "others",
    },
    images: [
        {
            filename: String,
            url: String,
        }
    ],
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: "Review"
        },
    ],
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    geometry: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },
    isVerified: {
        type: Boolean,
        default: false
    }
});




listingSchema.post("findOneAndDelete", async (listing) => {
    if (listing) {
        await Review.deleteMany({ _id: { $in: listing.reviews } })
    }
});

const Listing = mongoose.model("Listing", listingSchema);
Listing.CATEGORIES = CATEGORIES;
module.exports = Listing;