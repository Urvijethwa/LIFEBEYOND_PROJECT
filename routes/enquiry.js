// ==========================================
// FEATURE: Enquiry System (Guest → Host message)
// ==========================================

// Route to SHOW the enquiry form for a specific listing
router.get("/listings/:id/enquiry", isLoggedIn, async (req, res) => {

    // Find the listing using the ID from the URL
    // Example: /listings/123/enquiry → req.params.id = 123
    const listing = await Listing.findById(req.params.id);

    // Render the enquiry form page and send listing data to the view
    // This allows us to display listing details (title, etc.) in the form
    res.render("bookings/enquiry", { listing });
});