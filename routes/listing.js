const express = require("express");
const router = express.Router()
const wrapAsync = require("../utils/wrapAsync.js");
const { index, renderNewForm, showListing, createListing, editListing, updateListing, deleteListing } = require("../controllers/listings.js");
const { isLoggedIn, isOwner, validateListing } = require("../middleware.js");
const { upload } = require("../cloudConfig.js");

router
  .route("/")
  .get(wrapAsync(index)) // index
  .post(
    isLoggedIn,
    upload.fields([{ name: 'listing[image]', maxCount: 1 }, { name: 'listing[images]', maxCount: 6 }]),
    validateListing,
    wrapAsync(createListing)); // create

router.get("/new", isLoggedIn, renderNewForm); //new route   

router
  .route("/:id")
  .get(wrapAsync(showListing)) //show route
  .put(isLoggedIn, isOwner, upload.fields([{ name: 'listing[image]', maxCount: 1 }, { name: 'listing[images]', maxCount: 6 }]), validateListing, wrapAsync(updateListing)) // update route
  .delete(isLoggedIn, isOwner, wrapAsync(deleteListing)) //Delete route

router.get("/:id/edit", isLoggedIn, isOwner, wrapAsync(editListing)); // edit Route 

// New route for login redirection before booking
router.get("/:id/reserve", isLoggedIn, (req, res) => {
    res.redirect(`/listings/${req.params.id}`);
});

module.exports = router;
