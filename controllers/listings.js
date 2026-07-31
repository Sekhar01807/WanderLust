const Listing = require("../models/listing");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });

module.exports.index = async (req, res) => {
    const { category, search } = req.query;
    let filter = {};

    if (category && category !== "all") {
        filter.category = category;
    }

    if (search) {
        filter.$or = [
            { title: { $regex: search, $options: "i" } },
            { location: { $regex: search, $options: "i" } },
            { country: { $regex: search, $options: "i" } }
        ];
    }
    const allListings = await Listing.find(filter);
    res.render("listings/index.ejs", { allListings, category, search });
};


module.exports.renderNewForm = (req, res) => {
    const categories = Listing.CATEGORIES;
    res.render("listings/new.ejs", { categories });
};

module.exports.showListing = async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id)
        .populate({
            path: "reviews",
            populate: { path: "author" }
        })
        .populate("owner");
    
    if (!listing) {
        req.flash("error", "Listing you requested for does not exist!");
        return res.redirect("/listings");
    }

    // Check if current user has an ACTIVE paid booking for this listing
    let userBooking = null;
    if (req.user) {
        const Booking = require("../models/booking");
        userBooking = await Booking.findOne({
            listing: id,
            user: req.user._id,
            paymentStatus: "paid"
        }).sort({ createdAt: -1 });
    }

    res.render("listings/show.ejs", { listing, userBooking });
};

module.exports.createListing = async (req, res, next) => {
    let response = await geocodingClient.forwardGeocode({
        query: req.body.listing.location,
        limit: 1
    }).send();

    const newUser = req.user._id;
    const newListing = new Listing(req.body.listing);
    newListing.owner = newUser;
    newListing.isVerified = true;

    
    if (typeof req.files['listing[image]'] !== "undefined") {
        let url = req.files['listing[image]'][0].path;
        let filename = req.files['listing[image]'][0].filename;
        newListing.image = { url, filename };
    }

    if (typeof req.files['listing[images]'] !== "undefined") {
        newListing.images = req.files['listing[images]'].map(f => ({ url: f.path, filename: f.filename }));
    }

    newListing.geometry = response.body.features[0].geometry;
    let savedListing = await newListing.save();

    // Automatically update User role to Host
    const User = require("../models/user");
    await User.findByIdAndUpdate(newUser, { role: "Host" });

    console.log(savedListing);
    req.flash("success", "New Listing Created! You are now an active Host 🏠");
    res.redirect("/listings");
};


module.exports.editListing = async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing you requested for does not exist!");
        return res.redirect("/listings");
    }
    let originalImageUrl = listing.image ? listing.image.url : "";
    originalImageUrl = originalImageUrl.replace("/upload", "/upload/w_250");

    const categories = Listing.CATEGORIES;
    res.render("listings/edit.ejs", { listing, originalImageUrl, categories });
};

module.exports.updateListing = async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });

    if (typeof req.files['listing[image]'] !== "undefined") {
        let url = req.files['listing[image]'][0].path;
        let filename = req.files['listing[image]'][0].filename;
        listing.image = { url, filename };
    }

    if (typeof req.files['listing[images]'] !== "undefined") {
        const newImages = req.files['listing[images]'].map(f => ({ url: f.path, filename: f.filename }));
        listing.images.push(...newImages);
    }

    await listing.save();
    req.flash("success", "Listing Updated!");
    res.redirect(`/listings/${id}`);
};

module.exports.deleteListing = async (req, res) => {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);
    req.flash("success", "Listing Deleted!");
    res.redirect("/listings");
};
