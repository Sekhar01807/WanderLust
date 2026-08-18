const joi = require("joi");

const validCategories = [
  "trending", "rooms", "cities", "pools", "hills",
  "star_hotels", "private_house", "best_deals",
  "premium", "nearby", "beachfront", "camping",
  "castles", "arctic", "others"
];

module.exports.listingSchema = joi.object({
  listing: joi.object({
    title: joi.string().required().trim().max(150),
    description: joi.string().required().trim().max(5000),
    price: joi.number().required().min(0).max(10000000),
    location: joi.string().required().trim().max(100),
    country: joi.string().required().trim().max(100),
    category: joi.string().valid(...validCategories).default("others"),
    image: joi.alternatives().try(
      joi.object({
        url: joi.string().allow("", null),
        filename: joi.string().allow("", null)
      }),
      joi.string().allow("", null)
    ).allow("", null),
    images: joi.alternatives().try(
      joi.array().items(joi.any()),
      joi.object().allow(null),
      joi.string().allow("", null)
    ).allow("", null)
  }).required(),
  _csrf: joi.string().optional()
});

module.exports.reviewSchema = joi.object({
  review: joi.object({
    rating: joi.number().required().min(1).max(5),
    comment: joi.string().required().trim().max(2000),
  }).required(),
  _csrf: joi.string().optional()
});

module.exports.bookingSchema = joi.object({
  checkIn: joi.date().iso().required(),
  checkOut: joi.date().iso().greater(joi.ref('checkIn')).required(),
  guests: joi.number().integer().min(1).max(20).required(),
  _csrf: joi.string().optional()
});