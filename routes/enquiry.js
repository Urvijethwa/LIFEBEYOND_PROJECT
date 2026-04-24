router.get("/listings/:id/enquiry", isLoggedIn, async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    res.render("bookings/enquiry", { listing });
});