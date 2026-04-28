// ==========================================
// SETUP & IMPORTS
// ==========================================
const express = require("express");
const router = express.Router();

// bcrypt → used for hashing passwords securely
const bcrypt = require("bcryptjs");

// User model (MongoDB collection)
const User = require("../models/user");

// Validation middleware (checks input structure)
const { validateUser } = require("../middleware");


// ==========================================
// FEATURE 1: SHOW REGISTER FORM
// ==========================================
router.get("/register", (req, res) => {
    // Render registration page
    res.render("users/register");
});


// ==========================================
// FEATURE 2: USER REGISTRATION (SECURE)
// ==========================================
router.post("/register", validateUser, async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        // ----------------------------------
        // PASSWORD SECURITY VALIDATION
        // ----------------------------------
        // Must:
        // - be at least 6 characters
        // - contain at least 1 number
        // - contain at least 1 special character
        const passwordRegex = /^(?=.*[0-9])(?=.*[^A-Za-z0-9]).{6,}$/;

        if (!passwordRegex.test(password)) {
            req.flash("error", "Password must be at least 6 characters and include a number and special character.");
            return res.redirect("/register");
        }

        // ----------------------------------
        // CHECK IF USER ALREADY EXISTS
        // ----------------------------------
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            req.flash("error", "Email already registered.");
            return res.redirect("/register");
        }

        // ----------------------------------
        // PASSWORD HASHING (VERY IMPORTANT)
        // ----------------------------------
        // bcrypt automatically:
        // - generates a SALT
        // - hashes the password with that salt
        // 12 = salt rounds (higher = more secure but slower)
        const hashedPassword = await bcrypt.hash(password, 12);

        // ----------------------------------
        // CREATE USER
        // ----------------------------------
        const newUser = new User({
            username,
            email,
            password: hashedPassword, // NEVER store raw password
            role
        });

        await newUser.save();

        // ----------------------------------
        // SESSION MANAGEMENT (LOGIN AFTER REGISTER)
        // ----------------------------------
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
// FEATURE 4: USER LOGIN (AUTHENTICATION)
// ==========================================
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // ----------------------------------
        // FIND USER BY EMAIL
        // ----------------------------------
        const user = await User.findOne({ email });

        // If user does not exist → error
        if (!user) {
            req.flash("error", "Invalid email or password.");
            return res.redirect("/login");
        }

        // ----------------------------------
        // PASSWORD COMPARISON
        // ----------------------------------
        // bcrypt.compare:
        // compares entered password with hashed password
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            req.flash("error", "Invalid email or password.");
            return res.redirect("/login");
        }

        // ----------------------------------
        // SESSION CREATION (LOGIN SUCCESS)
        // ----------------------------------
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
// FEATURE 5: LOGOUT (SESSION DESTROY)
// ==========================================
router.get("/logout", (req, res) => {

    // Destroy session (log user out)
    req.session.destroy((err) => {

        if (err) {
            return res.redirect("/listings");
        }

        // Clear session cookie from browser
        res.clearCookie("connect.sid");

        res.redirect("/listings");
    });
});


// ==========================================
module.exports = router;