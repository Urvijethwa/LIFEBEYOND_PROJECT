require("dotenv").config();

const express = require("express");
const path = require("path");
const ejsMate = require("ejs-mate");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const flash = require("connect-flash");

const listingRoutes = require("./routes/listings");
const userRoutes = require("./routes/users");
const wishlistRoutes = require("./routes/wishlist");
const reviewRoutes = require("./routes/reviews");
const bookingRoutes = require("./routes/bookings");
const User = require("./models/user");

const app = express();

const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/lifebeyond";
const SESSION_SECRET = process.env.SESSION_SECRET || "mysecretkey";

// Connect to MongoDB
mongoose.connect(MONGO_URL)
    .then(() => {
        console.log("Connected to DB");
    })
    .catch((err) => {
        console.log(err);
    });

// Session store
const store = MongoStore.create({
    mongoUrl: MONGO_URL,
    crypto: {
        secret: SESSION_SECRET
    },
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

// Basic middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(session(sessionOptions));
app.use(flash());

// EJS setup
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Global locals
app.use(async (req, res, next) => {
    if (req.session.userId) {
        const user = await User.findById(req.session.userId);
        res.locals.currentUser = user;
        res.locals.loggedInUser = user;
    } else {
        res.locals.currentUser = null;
        res.locals.loggedInUser = null;
    }

    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");

    next();
});

// Routes
app.use("/", userRoutes);
app.use("/", wishlistRoutes);
app.use("/", bookingRoutes);
app.use("/listings", listingRoutes);
app.use("/listings/:id/reviews", reviewRoutes);

// Default home redirect
app.get("/", (req, res) => {
    res.redirect("/listings");
});

// Start server
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});