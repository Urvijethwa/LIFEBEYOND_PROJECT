// Import models
const Listing = require("./models/listing");
const Review = require("./models/review");

// Import Joi validation schemas
const { listingSchema, userSchema, reviewSchema } = require("./schema");

// 🔐 Check if user is logged in
module.exports.isLoggedIn = (req, res, next) => {
    if (!req.session.userId) {
        req.flash("error", "You must be logged in first.");
        return res.redirect("/login");
    }
    next(); // allow access
};

// 🏠 Check if current user owns the listing
module.exports.isOwner = async (req, res, next) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/");
    }

    // Only owner can edit/delete
    if (!listing.owner || !listing.owner.equals(req.session.userId)) {
        req.flash("error", "You do not have permission.");
        return res.redirect(`/listings/${id}`);
    }

    next();
};

// ✍️ Check if user wrote the review
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

// ✅ Validate listing form data (Joi)
module.exports.validateListing = (req, res, next) => {
    const { error } = listingSchema.validate(req.body);

    if (error) {
        req.flash("error", error.details[0].message);
        return res.redirect("back");
    }

    next();
};

// 👤 Validate user registration data
module.exports.validateUser = (req, res, next) => {
    const { error } = userSchema.validate(req.body);

    if (error) {
        req.flash("error", error.details[0].message);
        return res.redirect("/register");
    }

    next();
};

// ⭐ Validate review form data
module.exports.validateReview = (req, res, next) => {
    const { error } = reviewSchema.validate(req.body);

    if (error) {
        req.flash("error", error.details[0].message);
        return res.redirect("back");
    }

    next();
};