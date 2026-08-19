const User = require("../models/user.js");
const Listing = require("../models/listing.js");
const Review = require("../models/review.js");
const Message = require("../models/message");
const crypto = require("crypto");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../utils/emailService");

module.exports.renderSignup = (req, res) => {
    res.render("users/signup.ejs");
};

module.exports.signup = async (req, res, next) => {
    try {
        let { username, email, password, countryCode, phoneNumber, role } = req.body;
        
        email = email ? email.trim().toLowerCase() : "";
        phoneNumber = phoneNumber ? phoneNumber.trim() : "";
        countryCode = countryCode ? countryCode.trim() : "+91";
        role = (role === "Host") ? "Host" : "Traveler";

        if (!email) {
            req.flash("error", "Please enter a valid email address.");
            return res.redirect("/signup");
        }

        if (!phoneNumber) {
            req.flash("error", "Please enter your mobile number.");
            return res.redirect("/signup");
        }

        const fullPhoneNumber = `${countryCode} ${phoneNumber}`;

        const genericSignupErrorMessage = "Unable to register account with the provided details. If you already have an account, please log in.";

        // Check if an account with this email address already exists
        const existingEmail = await User.findOne({ email: { $regex: new RegExp(`^${email.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, "i") } });
        if (existingEmail) {
            req.flash("error", genericSignupErrorMessage);
            return res.redirect("/signup");
        }

        // Check if an account with this mobile number already exists
        const existingPhone = await User.findOne({ $or: [{ phoneNumber: fullPhoneNumber }, { phoneNumber: phoneNumber }] });
        if (existingPhone) {
            req.flash("error", genericSignupErrorMessage);
            return res.redirect("/signup");
        }

        const newUser = new User({ email, username, phoneNumber: fullPhoneNumber, role, isVerified: true });
        const registeredUser = await User.register(newUser, password);

        req.login(registeredUser, async (err) => {
            if (err) {
                return next(err);
            }
            await sendWelcomeEmail(registeredUser);
            req.flash("success", `Welcome to WanderLust, ${registeredUser.username}! 🎉 Your account and phone number have been verified.`);
            let redirectUrl = req.session.redirectUrl || "/profile";
            delete req.session.redirectUrl;
            res.redirect(redirectUrl);
        });
    } catch (e) {
        if (e.name === "UserExistsError" || e.code === 11000) {
            req.flash("error", "Unable to register account with the provided details. If you already have an account, please log in.");
        } else {
            req.flash("error", e.message || "Registration failed. Please try again.");
        }
        res.redirect("/signup");
    }
};


module.exports.renderLogin = (req, res) => {
    res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
    req.flash("success", `Welcome back to WanderLust, ${req.user.username}! 🌍`);
    let redirectUrl = res.locals.redirectUrl || "/listings";
    delete req.session.redirectUrl;
    res.redirect(redirectUrl);
};


module.exports.logout = (req, res, next) => {
    req.logout((err) => {
        if (err) {
            next(err);
        }
        req.flash("success", "you are logged out!");
        res.redirect("/listings");
    });
};

module.exports.toggleWishlist = async (req, res) => {
    let { id } = req.params;
    let user = await User.findById(req.user._id);
    if (!user.wishlist) {
        user.wishlist = [];
    }
    const targetId = id.toString();
    const idx = user.wishlist.findIndex(w => (w ? w.toString() : '') === targetId);
    let wishlisted;
    if (idx === -1) {
        user.wishlist.push(id);
        wishlisted = true;
    } else {
        user.wishlist.splice(idx, 1);
        wishlisted = false;
    }
    await user.save();

    if (req.user) {
        req.user.wishlist = user.wishlist;
    }

    const isAjax = req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest' || req.get('Accept')?.includes('application/json');
    if (isAjax) {
        return res.json({ success: true, wishlisted, count: user.wishlist.length });
    }
    req.flash("success", wishlisted ? "Added to Wishlist ❤️" : "Removed from Wishlist");
    res.redirect(req.get('Referrer') || "/listings");
};

module.exports.showWishlist = async (req, res) => {
    const user = await User.findById(req.user._id).populate("wishlist");
    res.render("listings/index.ejs", {
        allListings: user.wishlist,
        search: "",
        category: "wishlist",
    });
};

module.exports.showProfile = async (req, res) => {
    const user = await User.findById(req.user._id).populate("wishlist");
    const userListings = await Listing.find({ owner: req.user._id });
    
    // Automatically set role to Host if user owns any listings
    if (userListings.length > 0 && user.role !== 'Host') {
        user.role = 'Host';
        await user.save();
    }

    const Booking = require("../models/booking");
    const now = new Date();

    const userBookings = await Booking.find({ user: req.user._id }).populate("listing").sort({ createdAt: -1 });

    // Fetch ALL incoming reservations & audit logs for stays owned by this Host
    const hostListingIds = userListings.map(l => l._id);
    const hostReservations = await Booking.find({
        listing: { $in: hostListingIds }
    }).populate("user listing").sort({ createdAt: -1 });

    // Compute Host Analytics & Reservation Audit Logs in Real Time
    let hostTotalEarnings = 0;
    let hostActiveBookings = 0;
    let hostCancelledBookings = 0;
    let hostCompletedStays = 0;

    hostReservations.forEach(b => {
        if (b.paymentStatus === 'paid' || b.paymentStatus === 'completed') {
            hostTotalEarnings += (b.totalPrice || 0);
            if (now > new Date(b.checkOut)) {
                hostCompletedStays++;
            } else {
                hostActiveBookings++;
            }
        } else if (b.paymentStatus === 'cancelled') {
            hostCancelledBookings++;
        }
    });

    const hostStats = {
        totalEarnings: hostTotalEarnings,
        activeBookings: hostActiveBookings,
        completedStays: hostCompletedStays,
        cancelledBookings: hostCancelledBookings,
        totalReservations: hostReservations.length
    };

    const userReviews = await Review.find({ author: req.user._id }).sort({ createdAt: -1 });
    let reviewsWithListings = [];
    for(let r of userReviews) {
        let listing = await Listing.findOne({ reviews: r._id });
        if(listing) {
            reviewsWithListings.push({ review: r, listing: listing });
        }
    }

    const userMessages = await Message.find({
        $or: [{ sender: req.user._id }, { receiver: req.user._id }]
    }).populate("sender receiver listing").sort({ createdAt: -1 });

    const conversations = [];
    const seenConvos = new Set();
    for (let msg of userMessages) {
        if (msg.sender && msg.receiver && msg.listing) {
            const otherUser = msg.sender._id.equals(req.user._id) ? msg.receiver : msg.sender;
            const convoId = `${msg.listing._id}_${otherUser._id}`;
            if (!seenConvos.has(convoId)) {
                seenConvos.add(convoId);
                conversations.push({
                    lastMessage: msg,
                    otherUser,
                    listing: msg.listing
                });
            }
        }
    }
    
    res.render("users/profile.ejs", { user, userListings, reviewsWithListings, userBookings, hostReservations, hostStats, conversations });
};

module.exports.updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const { username, country, bio, role, phoneNumber, languages } = req.body;

        if (username && username !== user.username) {
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                req.flash("error", "Username is already taken. Please choose another one.");
                return res.redirect("/profile");
            }
            user.username = username;
        }

        if (country !== undefined) user.country = country;
        if (bio !== undefined) user.bio = bio;
        
        // Enforce Host role if user manages any listings
        const ownsListings = await Listing.exists({ owner: user._id });
        if (ownsListings) {
            user.role = 'Host';
        } else if (role !== undefined) {
            user.role = role;
        }

        if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
        if (languages !== undefined) user.languages = languages;

        if (typeof req.file !== "undefined") {
            let url = req.file.path;
            let filename = req.file.filename;
            user.profileImage = { url, filename };
        }

        await user.save();
        
        req.login(user, (err) => {
            if (err) {
                req.flash("error", "Error updating session");
                return res.redirect("/profile");
            }
            req.flash("success", "Profile updated successfully!");
            res.redirect("/profile");
        });
    } catch (e) {
        req.flash("error", e.message);
        res.redirect("/profile");
    }
};

module.exports.renderForgotForm = (req, res) => {
    res.render("users/forgot.ejs");
};

module.exports.forgotPassword = async (req, res) => {
    try {
        const emailInput = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        if (!emailInput) {
            req.flash("error", "Please enter your email address.");
            return res.redirect("/forgot");
        }

        // Case-insensitive exact email lookup
        const escapedEmail = emailInput.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const user = await User.findOne({ email: { $regex: new RegExp(`^${escapedEmail}$`, "i") } });
        
        if (user) {
            const rawToken = crypto.randomBytes(32).toString("hex");
            const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

            user.resetPasswordToken = hashedToken;
            user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
            await user.save();

            await sendPasswordResetEmail(user, rawToken, req);
        }

        // Generic response to prevent user enumeration
        req.flash("success", "If an account with that email exists, password reset instructions have been sent.");
        res.redirect("/forgot");
    } catch (err) {
        console.error("❌ Forgot Password Error:", err.message);
        req.flash("error", "Something went wrong while requesting password reset. Please try again.");
        res.redirect("/forgot");
    }
};

module.exports.renderResetForm = async (req, res) => {
    const rawToken = req.params.token;
    if (!rawToken || typeof rawToken !== "string") {
        req.flash("error", "Password reset token is invalid or has expired.");
        return res.redirect("/forgot");
    }

    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const user = await User.findOne({ 
        resetPasswordToken: hashedToken, 
        resetPasswordExpires: { $gt: Date.now() } 
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
        req.flash("error", "Password reset token is invalid or has expired.");
        return res.redirect("/forgot");
    }
    res.render("users/reset.ejs", { token: rawToken });
};

module.exports.resetPassword = async (req, res) => {
    const rawToken = req.params.token;
    if (!rawToken || typeof rawToken !== "string") {
        req.flash("error", "Password reset token is invalid or has expired.");
        return res.redirect("/forgot");
    }

    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const user = await User.findOne({ 
        resetPasswordToken: hashedToken, 
        resetPasswordExpires: { $gt: Date.now() } 
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
        req.flash("error", "Password reset token is invalid or has expired.");
        return res.redirect("/forgot");
    }

    const { password, confirm } = req.body;
    if (!password || !confirm || password !== confirm) {
        req.flash("error", "Passwords do not match or are invalid.");
        return res.redirect(`/reset/${rawToken}`);
    }

    if (password.length < 6) {
        req.flash("error", "Password must be at least 6 characters long.");
        return res.redirect(`/reset/${rawToken}`);
    }

    await user.setPassword(password);
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    req.login(user, (err) => {
        if (err) {
            req.flash("success", "Password changed successfully. Please log in.");
            return res.redirect("/login");
        }
        req.flash("success", "Success! Your password has been changed.");
        res.redirect("/listings");
    });
};
