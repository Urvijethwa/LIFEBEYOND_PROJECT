// ==========================================
// SETUP
// ==========================================
const express = require("express");

// mergeParams: true → allows access to :id from parent route (/listings/:id)
const router = express.Router({ mergeParams: true });

// Models
const Listing = require("../models/listing");
const Review = require("../models/review");

// Middleware (security + validation)
const { isLoggedIn, isReviewAuthor, validateReview } = require("../middleware");


// ==========================================
// FEATURE 1: CREATE REVIEW (ONLY LOGGED-IN USERS)
// ==========================================
router.post("/", isLoggedIn, validateReview, async (req, res) => {

    // Get listing ID from URL (/listings/:id/reviews)
    const { id } = req.params;

    // Find the listing user is reviewing
    const listing = await Listing.findById(id);

    // Safety check: listing must exist
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    // Create new review from form data (comment + rating)
    const review = new Review(req.body);

    // Link review to current logged-in user
    review.author = req.session.userId;

    // Save review in database
    await review.save();

    // Add review reference to listing (relationship)
    listing.reviews.push(review);

    // Save updated listing
    await listing.save();

    // Feedback message
    req.flash("success", "Review added successfully.");

    // Redirect back to listing page
    res.redirect(`/listings/${id}`);
});


// ==========================================
// FEATURE 2: DELETE REVIEW (ONLY AUTHOR CAN DELETE)
// ==========================================
router.delete("/:reviewId", isLoggedIn, isReviewAuthor, async (req, res) => {

    const { id, reviewId } = req.params;

    // Remove review reference from listing (important!)
    await Listing.findByIdAndUpdate(id, {
        $pull: { reviews: reviewId }
    });

    // Delete review document from database
    await Review.findByIdAndDelete(reviewId);

    // Feedback message
    req.flash("success", "Review deleted successfully.");

    // Redirect back to listing page
    res.redirect(`/listings/${id}`);
});


// ==========================================
module.exports = router;