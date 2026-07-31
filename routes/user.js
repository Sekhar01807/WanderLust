const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const { saveRedirectUrl, isLoggedIn } = require("../middleware.js");
const { signup, renderSignup, renderLogin, login, logout, toggleWishlist, showWishlist, showProfile, updateProfile } = require("../controllers/users.js");
const multer = require('multer');
const { storage } = require("../cloudConfig.js");
const upload = multer({ storage });

router
   .route("/signup")
   .get(renderSignup)
   .post(wrapAsync(signup));

// If user enters an email, resolve it to username before Passport authenticates
const User = require("../models/user.js");
const resolveEmailToUsername = async (req, res, next) => {
    try {
        const input = req.body.username;
        if (input && input.includes("@")) {
            const user = await User.findOne({ email: input.trim().toLowerCase() });
            if (user) {
                req.body.username = user.username;
            }
        }
        next();
    } catch (e) {
        next(e);
    }
};

router
   .route("/login")
   .get(renderLogin)
   .post(saveRedirectUrl, resolveEmailToUsername, (req, res, next) => {
       passport.authenticate("local", (err, user, info) => {
           if (err) return next(err);
           if (!user) {
               req.flash("error", info ? info.message : "Invalid username or password.");
               return res.redirect("/login");
           }
           req.login(user, (loginErr) => {
               if (loginErr) return next(loginErr);
               return login(req, res);
           });
       })(req, res, next);
   });







router.get("/logout", logout);

// Wishlist
router.get("/wishlist", isLoggedIn, wrapAsync(showWishlist));
router.post("/wishlist/:id", isLoggedIn, wrapAsync(toggleWishlist));

// Profile
router.get("/profile", isLoggedIn, wrapAsync(showProfile));
router.put("/profile", isLoggedIn, upload.single("profileImage"), wrapAsync(updateProfile));

// Forgot Password
const { renderForgotForm, forgotPassword, renderResetForm, resetPassword } = require("../controllers/users.js");
router.get("/forgot", renderForgotForm);
router.post("/forgot", wrapAsync(forgotPassword));
router.get("/reset/:token", renderResetForm);
router.post("/reset/:token", wrapAsync(resetPassword));

// Standalone Receipt Route
const Booking = require("../models/booking.js");
router.get("/receipt/:bookingId", isLoggedIn, wrapAsync(async (req, res) => {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId).populate("listing user");
    if (!booking) {
        req.flash("error", "Booking receipt not found.");
        return res.redirect("/profile");
    }
    
    // Check authorization: User must be booking guest or listing owner
    const isGuest = booking.user && booking.user._id.equals(req.user._id);
    const isOwner = booking.listing && booking.listing.owner && booking.listing.owner.equals(req.user._id);
    
    if (!isGuest && !isOwner) {
        req.flash("error", "Unauthorized to view this receipt.");
        return res.redirect("/profile");
    }

    res.render("users/receipt.ejs", { booking });
}));


module.exports = router;

