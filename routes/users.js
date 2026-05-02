// ==========================================
// SETUP & IMPORTS
// ==========================================
const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const User = require("../models/user");

// Import validation + login check
const { validateUser, isLoggedIn } = require("../middleware");


// ==========================================
// FEATURE 1: SHOW REGISTER FORM
// ==========================================
router.get("/register", (req, res) => {
    res.render("users/register");
});


// ==========================================
// FEATURE 2: USER REGISTRATION
// ==========================================
router.post("/register", validateUser, async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        const passwordRegex = /^(?=.*[0-9])(?=.*[^A-Za-z0-9]).{6,}$/;

        if (!passwordRegex.test(password)) {
            req.flash("error", "Password must be at least 6 characters and include a number and special character.");
            return res.redirect("/register");
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            req.flash("error", "Email already registered.");
            return res.redirect("/register");
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            role
        });

        await newUser.save();

        req.session.userId = newUser._id;
        req.session.user = newUser;

        req.flash("success", "Welcome to LifeBeyond.");
        res.redirect("/listings");

    } catch (err) {
        console.log(err);
        req.flash("error", "Registration failed. Please try again.");
        res.redirect("/register");
    }
});


// ==========================================
// FEATURE 3: SHOW LOGIN FORM
// ==========================================
router.get("/login", (req, res) => {
    res.render("users/login");
});


// ==========================================
// FEATURE 4: USER LOGIN
// ==========================================
router.post("/login", async (req, res) => {
    try {
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
        req.session.user = user;

        req.flash("success", "Welcome back.");
        res.redirect("/listings");

    } catch (err) {
        console.log(err);
        req.flash("error", "Login failed. Please try again.");
        res.redirect("/login");
    }
});


// ==========================================
// FEATURE 5: HOST PROFILE
// ==========================================

// Show host profile edit page
router.get("/host/profile", isLoggedIn, async (req, res) => {
    const user = await User.findById(req.session.userId);

    if (!user || user.role !== "host") {
        req.flash("error", "Only hosts can edit a host profile.");
        return res.redirect("/listings");
    }

    res.render("users/hostProfile", { currentUser: user });
});

// Save host profile
router.post("/host/profile", isLoggedIn, async (req, res) => {
    const user = await User.findById(req.session.userId);

    if (!user || user.role !== "host") {
        req.flash("error", "Only hosts can update a host profile.");
        return res.redirect("/listings");
    }

    const { bio, hostWork, hostLocation, responseTime } = req.body;

    await User.findByIdAndUpdate(req.session.userId, {
        bio,
        hostWork,
        hostLocation,
        responseTime
    });

    req.flash("success", "Host profile updated successfully.");
    res.redirect("/listings");
});

// ==========================================
// FEATURE 7: ACCOUNT MANAGEMENT PAGE
// ==========================================
router.get("/account", isLoggedIn, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render("users/account", { user });
});

// UPDATE ACCOUNT DETAILS
router.post("/account/update", isLoggedIn, async (req, res) => {
    try {
        const { username, email } = req.body;

        await User.findByIdAndUpdate(req.session.userId, {
            username,
            email
        });

        req.flash("success", "Account updated successfully.");
        res.redirect("/account");

    } catch (err) {
        console.log(err);
        req.flash("error", "Update failed.");
        res.redirect("/account");
    }
});

// CHANGE PASSWORD
router.post("/account/password", isLoggedIn, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.session.userId);

        const valid = await bcrypt.compare(currentPassword, user.password);

        if (!valid) {
            req.flash("error", "Current password incorrect.");
            return res.redirect("/account");
        }

        const hashed = await bcrypt.hash(newPassword, 12);

        await User.findByIdAndUpdate(req.session.userId, {
            password: hashed
        });

        req.flash("success", "Password updated.");
        res.redirect("/account");

    } catch (err) {
        console.log(err);
        req.flash("error", "Password change failed.");
        res.redirect("/account");
    }
});

// DELETE ACCOUNT
router.post("/account/delete", isLoggedIn, async (req, res) => {
    await User.findByIdAndDelete(req.session.userId);

    req.session.destroy();
    res.clearCookie("connect.sid");

    req.flash("success", "Account deleted.");
    res.redirect("/listings");
});


// ==========================================
// FEATURE 6: LOGOUT
// ==========================================
router.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect("/listings");
        }

        res.clearCookie("connect.sid");
        res.redirect("/listings");
    });
});


// ==========================================
module.exports = router;