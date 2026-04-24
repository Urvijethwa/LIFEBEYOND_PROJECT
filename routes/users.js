const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/user");
const { validateUser } = require("../middleware");

// Register form
router.get("/register", (req, res) => {
    res.render("users/register");
});

// Register user
router.post("/register", validateUser, async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            role
        });

        await newUser.save();
        req.session.userId = newUser._id;
        req.flash("success", "Welcome to LifeBeyond.");
        res.redirect("/listings");
    } catch (err) {
        req.flash("error", "User already exists or registration failed.");
        res.redirect("/register");
    }
});

// Login form
router.get("/login", (req, res) => {
    res.render("users/login");
});

// Login user
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        req.flash("error", "Invalid email or password.");
        return res.redirect("/login");
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
        req.flash("error", "Invalid email or password.");
        return res.redirect("/login");
    }

    req.session.userId = user._id;
    
    if(user) {
    req.session.user = user;
    res.redirect("/listings");
    }
});

// Logout user
router.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect("/listings");
        }

        res.clearCookie("connect.sid");
        res.redirect("/listings");
    });
});

module.exports = router;