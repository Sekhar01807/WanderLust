const Listing = require("../models/listing");
const Review = require("../models/review");

module.exports.createReview = async (req, res) => {
    let listing = await Listing.findById(req.params.id);
    if (listing.owner.equals(req.user._id)) {
        req.flash("error", "Hosts cannot post reviews on their own property!");
        return res.redirect(`/listings/${listing._id}`);
    }
    let newReview = new Review(req.body.review);

    newReview.author = req.user._id;

    if (req.file) {
        newReview.image = {
            url: req.file.path,
            filename: req.file.filename
        };
    }

    listing.reviews.push(newReview);
    await newReview.save();
    await listing.save();
    req.flash("success", "New Review Created!");
    res.redirect(`/listings/${listing._id}`);
};

module.exports.deleteReview = async (req, res) => {
    let { id, reviewId } = req.params;
    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review Deleted!");
    res.redirect(`/listings/${id}`);
};
