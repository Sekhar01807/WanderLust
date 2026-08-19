const Listing = require("./models/listing");
const Review = require("./models/review.js");
const ExpressError = require("./utils/ExpressError.js");
const { listingSchema, reviewSchema, bookingSchema } = require("./schema.js");

module.exports.isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
        req.session.redirectUrl = req.originalUrl;
        const isAjax = req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || req.get('Accept')?.includes('application/json');
        if (isAjax) {
            return res.status(401).json({ success: false, message: "Please log in to continue.", redirectUrl: "/login" });
        }
        req.flash("error", "You must be logged in to proceed.");
        return res.redirect("/login");
    }
    next();
};

module.exports.saveRedirectUrl = (req, res, next) => {
    if (req.session.redirectUrl) {
        res.locals.redirectUrl = req.session.redirectUrl;
    }
    next();
};

module.exports.isOwner = async (req, res, next) => {
    let { id } = req.params;
    let listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing does not exist!");
        return res.redirect("/listings");
    }
    if (!listing.owner.equals(res.locals.currUser._id)) {
        req.flash("error", "Access denied by the owner.");
        return res.redirect(`/listings/${id}`);
    }
    next();
};

module.exports.validateListing = (req, res, next) => {
    let { error } = listingSchema.validate(req.body);
    if (error) {
        let errmsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errmsg);
    } else {
        next();
    }
};

module.exports.validateReview = (req, res, next) => {
    let { error } = reviewSchema.validate(req.body);
    if (error) {
        let errmsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errmsg);
    } else {
        next();
    }
};

module.exports.validateBooking = (req, res, next) => {
    let { error } = bookingSchema.validate(req.body);
    if (error) {
        let errmsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errmsg);
    } else {
        next();
    }
};

module.exports.isReviewAuthor = async (req, res, next) => {
    let { id, reviewId } = req.params;
    let listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing does not exist!");
        return res.redirect("/listings");
    }
    let review = await Review.findById(reviewId);
    if (!review) {
        req.flash("error", "Review does not exist!");
        return res.redirect(`/listings/${id}`);
    }
    if (!review.author.equals(res.locals.currUser._id)) {
        req.flash("error", "Access denied! You are not the author of this review.");
        return res.redirect(`/listings/${id}`);
    }
    if (!listing.reviews.some(r => r.equals(reviewId))) {
        req.flash("error", "This review does not belong to the specified listing.");
        return res.redirect(`/listings/${id}`);
    }
    next();
};
