//backend protection 
// Import models
const Listing = require("./models/listing");
const Review = require("./models/review");

// Import Joi validation schemas
const { listingSchema, userSchema, reviewSchema } = require("./schema");

// Check if user is logged in
module.exports.isLoggedIn = (req, res, next) => {
    if (!req.session.userId) {
        req.flash("error", "You must be logged in first.");
        return res.redirect("/login");
    }
    next(); // allow access
};

// Only guests can book properties
module.exports.isGuest = (req, res, next) => {

    if (!req.session.user) {
        req.flash("error", "You must be logged in.");
        return res.redirect("/login");
    }

    if (req.session.user.role !== "guest") {
        req.flash("error", "Hosts cannot book properties.");
        return res.redirect("/listings");
    }

    next();
};

//Check if current user owns the listing
module.exports.isOwner = async (req, res, next) => {
    const { id } = req.params;

    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    if (!listing.owner || String(listing.owner) !== String(req.session.userId)) {
        req.flash("error", "You do not have permission to edit this listing.");
        return res.redirect(`/listings/${id}`);
    }

    next();
};

//Check if user wrote the review
module.exports.isReviewAuthor = async (req, res, next) => {
    const { id, reviewId } = req.params;
    const review = await Review.findById(reviewId);

    if (!review) {
        req.flash("error", "Review not found.");
        return res.redirect(`/listings/${id}`);
    }

    // Only author can delete review
    if (!review.author || !review.author.equals(req.session.userId)) {
        req.flash("error", "You do not have permission to do that.");
        return res.redirect(`/listings/${id}`);
    }

    next();
};

//Validate listing form data (Joi)
module.exports.validateListing = (req, res, next) => {
    const { error } = listingSchema.validate(req.body, { abortEarly: false });

    if (error) {
        const messages = error.details.map(detail => detail.message).join(" ");
        req.flash("error", messages);

        const backURL = req.get("Referrer") || "/listings";
        return res.redirect(backURL);
    }

    next();
};

//Validate user registration data
module.exports.validateUser = (req, res, next) => {
    const { error } = userSchema.validate(req.body);

    if (error) {
        req.flash("error", error.details[0].message);
        return res.redirect("/register");
    }

    next();
};

//Validate review form data
module.exports.validateReview = (req, res, next) => {
    const { error } = reviewSchema.validate(req.body);

    if (error) {
        req.flash("error", error.details[0].message);
        return res.redirect("back");
    }

    next();
};