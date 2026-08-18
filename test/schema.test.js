const test = require("node:test");
const assert = require("node:assert/strict");
const { listingSchema, reviewSchema, bookingSchema } = require("../schema.js");

test("bookingSchema - validates valid reservation data", () => {
    const validBooking = {
        checkIn: "2026-09-01",
        checkOut: "2026-09-05",
        guests: 2,
    };
    const { error } = bookingSchema.validate(validBooking);
    assert.equal(error, undefined, "Valid booking should have no Joi validation error");
});

test("bookingSchema - rejects checkOut before checkIn", () => {
    const invalidBooking = {
        checkIn: "2026-09-10",
        checkOut: "2026-09-05",
        guests: 2,
    };
    const { error } = bookingSchema.validate(invalidBooking);
    assert.ok(error, "Should fail when checkOut is earlier than checkIn");
});

test("bookingSchema - rejects invalid guest counts", () => {
    const zeroGuests = {
        checkIn: "2026-09-01",
        checkOut: "2026-09-05",
        guests: 0,
    };
    assert.ok(bookingSchema.validate(zeroGuests).error, "Should reject 0 guests");

    const excessiveGuests = {
        checkIn: "2026-09-01",
        checkOut: "2026-09-05",
        guests: 25,
    };
    assert.ok(bookingSchema.validate(excessiveGuests).error, "Should reject > 20 guests");
});

test("reviewSchema - validates rating between 1 and 5 and comment length", () => {
    const validReview = {
        review: {
            rating: 5,
            comment: "Wonderful beachfront villa experience!"
        }
    };
    assert.equal(reviewSchema.validate(validReview).error, undefined);

    const invalidRating = {
        review: {
            rating: 6,
            comment: "Invalid rating value"
        }
    };
    assert.ok(reviewSchema.validate(invalidRating).error, "Should reject rating > 5");
});

test("listingSchema - validates listing details and category constraints", () => {
    const validListing = {
        listing: {
            title: "Serene Mountain Chalet",
            description: "A cozy and modern wooden chalet with panoramic views of the Swiss Alps.",
            location: "Zermatt",
            country: "Switzerland",
            price: 18000,
            category: "hills"
        }
    };
    assert.equal(listingSchema.validate(validListing).error, undefined);

    const invalidCategory = {
        listing: {
            title: "Invalid Stay",
            description: "Description",
            location: "Location",
            country: "Country",
            price: 1000,
            category: "invalid-category-name"
        }
    };
    assert.ok(listingSchema.validate(invalidCategory).error, "Should reject unapproved category");
});
