// Main entry point of the LifeBeyond system.
// This file starts the Express server, connects MongoDB,
// configures middleware, sessions, flash messages,
// EJS views, and links all route files together.

// Load environment variables such as MongoDB URL and secret keys
require("dotenv").config();

//AI - imports the assistant route file
const assistantRoutes = require("./routes/assistant");

// Import external libraries
const express = require("express"); // Creates the Express web server
const path = require("path"); // Handles file and folder paths across operating systems
const ejsMate = require("ejs-mate"); // Supports reusable EJS layouts/templates
const mongoose = require("mongoose"); // Connects Node.js application to MongoDB database

const methodOverride = require("method-override"); // Allows PUT and DELETE requests from forms
const session = require("express-session"); // Handles user login sessions
const MongoStore = require("connect-mongo").default; // Stores sessions inside MongoDB
const flash = require("connect-flash"); // Displays success and error messages
const adminRoutes = require("./routes/admin"); // Imports admin dashboard routes

// Import route files
const indexRoutes = require("./routes/index");
const listingRoutes = require("./routes/listings");
const userRoutes = require("./routes/users");
const wishlistRoutes = require("./routes/wishlist");
const reviewRoutes = require("./routes/reviews");
const bookingRoutes = require("./routes/bookings");

// Import user model
const User = require("./models/user");

// Create Express application
const app = express();

// MongoDB connection URL and session secret
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/lifebeyond";
const SESSION_SECRET = process.env.SESSION_SECRET || "mysecretkey";

// Connect application to MongoDB database
mongoose.connect(MONGO_URL)
    .then(() => console.log("Connected to DB"))
    .catch((err) => console.log(err));

// Store session data securely inside MongoDB
const store = MongoStore.create({
    mongoUrl: MONGO_URL,
    crypto: { secret: SESSION_SECRET },
    touchAfter: 24 * 3600
});

// Session configuration
const sessionOptions = {
    store,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true
    }
};

// Middleware configuration
app.use(express.urlencoded({ extended: true })); // Handles form data
app.use(express.json()); // Handles JSON data
app.use(methodOverride("_method")); // Enables PUT and DELETE methods
app.use(express.static(path.join(__dirname, "public"))); // Serves static files
app.use(session(sessionOptions)); // Enables session handling
app.use(flash()); // Enables flash messages

// Configure EJS template engine
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Global variables middleware
app.use(async (req, res, next) => {
    try {
        // Check if user is logged in
        if (req.session.userId) {
            const user = await User.findById(req.session.userId);

            // Make logged in user available in all EJS views
            res.locals.currentUser = user;
            res.locals.loggedInUser = user;
        } else {
            res.locals.currentUser = null;
            res.locals.loggedInUser = null;
        }

        // Store flash messages globally
        res.locals.success = req.flash("success");
        res.locals.error = req.flash("error");

        next();
    } catch (err) {
        next(err);
    }
});

// Connect route files to URL paths
app.use("/", indexRoutes);
app.use("/", userRoutes);
//Ai 
app.use("/", assistantRoutes);
app.use("/", wishlistRoutes);
app.use("/", bookingRoutes);
app.use("/listings", listingRoutes);
app.use("/listings/:id/reviews", reviewRoutes);
app.use("/", adminRoutes);

// Default route redirects users to listings page
app.get("/", (req, res) => {
    res.redirect("/listings");
});

// Start the server
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});