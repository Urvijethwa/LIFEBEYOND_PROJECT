const express = require("express");
const router = express.Router();

router.get("/contact", (req, res) => {
    res.render("pages/contact");
});

router.get("/about", (req, res) => {
    res.render("pages/about");
});

router.get("/terms", (req, res) => {
    res.render("pages/terms");
});

module.exports = router;