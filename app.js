//jshint esversion:6

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const _ = require("lodash");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const nodemailer = require("nodemailer");
const passportLocalMongoose = require("passport-local-mongoose");
const LocalStrategy = require("passport-local").Strategy;

const homeStartingContent = "Lacus vel facilisis volutpat est velit egestas dui id ornare. Semper auctor neque vitae tempus quam. Sit amet cursus sit amet dictum sit amet justo. Viverra tellus in hac habitasse. Imperdiet proin fermentum leo vel orci porta. Donec ultrices tincidunt arcu non sodales neque sodales ut. Mattis molestie a iaculis at erat pellentesque adipiscing. Magnis dis parturient montes nascetur ridiculus mus mauris vitae ultricies. Adipiscing elit ut aliquam purus sit amet luctus venenatis lectus. Ultrices vitae auctor eu augue ut lectus arcu bibendum at. Odio euismod lacinia at quis risus sed vulputate odio ut. Cursus mattis molestie a iaculis at erat pellentesque adipiscing.";
const aboutContent = "Hac habitasse platea dictumst vestibulum rhoncus est pellentesque. Dictumst vestibulum rhoncus est pellentesque elit ullamcorper. Non diam phasellus vestibulum lorem sed. Platea dictumst quisque sagittis purus sit. Egestas sed sed risus pretium quam vulputate dignissim suspendisse. Mauris in aliquam sem fringilla. Semper risus in hendrerit gravida rutrum quisque non tellus orci. Amet massa vitae tortor condimentum lacinia quis vel eros. Enim ut tellus elementum sagittis vitae. Mauris ultrices eros in cursus turpis massa tincidunt dui.";
const contactContent = "Scelerisque eleifend donec pretium vulputate sapien. Rhoncus urna neque viverra justo nec ultrices. Arcu dui vivamus arcu felis bibendum. Consectetur adipiscing elit duis tristique. Risus viverra adipiscing at in tellus integer feugiat. Sapien nec sagittis aliquam malesuada bibendum arcu vitae. Consequat interdum varius sit amet mattis. Iaculis nunc sed augue lacus. Interdum posuere lorem ipsum dolor sit amet consectetur adipiscing elit. Pulvinar elementum integer enim neque. Ultrices gravida dictum fusce ut placerat orci nulla. Mauris in aliquam sem fringilla ut morbi tincidunt. Tortor posuere ac ut consequat semper viverra nam libero.";

const app = express();

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use(session({
  secret: "secret-key",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true });

const postsSchema = new mongoose.Schema({
  title : String,
  content : String,
  images: [String]
});

const Post = mongoose.model("Post",postsSchema);

const usersSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: {
    type: String,
    default: "user"
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],
  googleId: String,
  googleDisplayName: String
});

usersSchema.plugin(passportLocalMongoose);

const User = mongoose.model("User", usersSchema);

// Configure passport
passport.use(User.createStrategy());
passport.serializeUser(function(user, done){
  done(null, user.id);
});
passport.deserializeUser(function(id, done){
  User.findById(id)
.then(user => {
  done(null, user);
})
.catch(err => {
  done(err);
});

});

passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "http://localhost:3000/auth/google/secrets",
  userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
},
function(accessToken, refreshToken, profile, cb) {
  User.findOne({ googleId: profile.id })
    .exec()
    .then((user) => {
      if (!user) {
        const newUser = new User({
          googleId: profile.id,
          googleDisplayName: profile.displayName,
          favorites: []
        });
        return newUser.save();
      } else {
        return user;
      }
    })
    .then((user) => {
      return cb(null, user);
    })
    .catch((err) => {
      return cb(err);
    });
}
));


app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get("/auth/google/secrets",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function(req, res) {
    res.redirect("/");
  }
);

app.get("/", function(req, res) {
  Post.find({})
    .sort({ title: 1 })
    .exec()
    .then((foundPosts) => {
      res.render("home", {
        startingContent: homeStartingContent,
        posts: foundPosts,
        user: req.user
      });
    })
    .catch((err) => {
      console.log(err);
    });
});


// User Sign Up
app.get("/signup", function(req, res) {
  res.render("signup", { user: req.user });
});

app.post("/signup", function(req, res) {
  User.register({ username: req.body.username }, req.body.password, function(err, user) {
    if (err) {
      console.log(err);
      res.redirect("/signup");
    } else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/");
      });
    }
  });
});

// User Sign In
app.get("/login", function(req, res) {
  res.render("login", { user:req.user });
});

app.post("/login", function(req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function(err) {
    if (err) {
      console.log(err);
      res.redirect("/login");
    } else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/");
      });
    }
  });
});

// User Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

// Logout
app.get("/logout", isAuthenticated, function(req, res) {
  req.logOut(function(err){
    if(err){
        console.log(err);
        res.redirect("/");
    }
    else{
        res.redirect("/login");
    }
});
});

app.get("/createadmin", async function(req, res) {
  try {
    const existingAdmin = await User.findOne({ username: process.env.ADMIN_USERNAME });

    if (!existingAdmin) {
      User.register(new User({
        username: process.env.ADMIN_USERNAME,
        role: "admin"
      }), process.env.ADMIN_PASSWORD, function(err, admin) {
        if (err) {
          console.log(err);
          res.redirect("/");
        } else {
          console.log("Admin account created");
          res.redirect("/");
        }
      });
    } else {
      console.log("Admin account already exists");
      res.redirect("/");
    }
  } catch (err) {
    console.log(err);
    res.redirect("/");
  }
});



app.get("/favorites", isAuthenticated, function(req, res) {
  const userId = req.user._id; // Use req.user._id instead of req.session.user._id
  User.findById(userId)
    .populate("favorites")
    .exec()
    .then((user) => {
      res.render("favorites", { favorites: user.favorites, user: req.user }); // Use req.user instead of req.session.user
    })
    .catch((err) => {
      console.log(err);
    });
});


app.post("/addtofavorites", isAuthenticated, function(req, res) {
  const postId = req.body.postId;
  const user = req.user;

  User.findByIdAndUpdate(user._id, { $addToSet: { favorites: postId } })
    .then(() => {
      res.redirect("/favorites");
    })
    .catch((err) => {
      console.log(err);
      res.redirect("/");
    });
});

app.post("/removefromfavorites", isAuthenticated, function(req, res) {
  const favoriteId = req.body.favoriteId;
  const user = req.user;

  User.findByIdAndUpdate(user._id, { $pull: { favorites: favoriteId } })
    .then(() => {
      res.redirect("/favorites");
    })
    .catch((err) => {
      console.log(err);
      res.redirect("/favorites");
    });
});

app.get("/about", function(req, res){
  res.render("about", {aboutContent: aboutContent, user: req.user});
});

app.get("/contact", function(req, res){
  res.render("contact", {user: req.user});
});


app.post("/contact", function(req, res) {
  const title = req.body.title;
  const content = req.body.content;
  const email = req.body.email;
  const password = req.body.password;

  // Create a Nodemailer transporter
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: email, // Use the provided email as the 'from' address
      pass: password // Replace with your email password
    }
  });

  // Compose the email message
  const mailOptions = {
    from: email, // Use the provided email as the 'from' address
    to: process.env.EMAIL, // Replace with your email address
    subject: `Title: ${title}`,
    text: `Content: ${content}`
  };

  // Send the email
  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.log(error);
      res.redirect("/contact"); // Handle error
    } else {
      console.log("Email sent: " + info.response);
      res.redirect("/"); // Redirect to homepage after successful submission
    }
  });
});

app.get("/compose", function(req, res){
  res.render("compose", { user: req.user });
});

app.post("/compose", function (req, res) {
  const post = {
    title: req.body.postTitle,
    content: req.body.postBody,
  };

  // Check if image link is provided
  if (req.body.imageLink) {
    post.images = [req.body.imageLink];
  }

  const post1 = new Post(post);

  post1.save()
    .then(() => {
      res.redirect("/");
    })
    .catch((err) => {
      console.log(err);
      res.redirect("/compose");
    });
});


// GET route for searching
// GET route for searching
app.get("/search/:title", function(req, res) {
  const searchedTitle = req.params.title;
  const lowercaseSearchTitle = _.lowerCase(searchedTitle);

  Post.find({ title: { $regex: `.*${searchedTitle}.*`, $options: 'i' } })
    .then((posts) => {
      if (posts.length > 0) {
        res.render("search", { searchResults: posts, user: req.user });
      } else {
        res.render("search", { searchResults: [], user: req.user });
      }
    })
    .catch((err) => {
      console.error('Something went wrong', err);
      res.render("search", { searchResults: [], user: req.user });
    });
});





// POST route for form submission
app.post("/search", function(req, res) {
  const searchQuery = req.body.searchTerm;
  res.redirect("/search/"+searchQuery);
});

app.get("/posts/:postId", function(req, res) {
  const postId = req.params.postId;

  Post.findOne({ _id: postId })
    .exec()
    .then((foundPost) => {
      if (foundPost) {
        res.render("post", { title : foundPost.title, content : foundPost.content, user: req.user, post: foundPost });
      } else {
        console.log("Post not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occured : ${err}`);
      res.redirect("/");
    });
});

// Edit Post
app.get("/posts/:postId/edit", isAuthenticated, function(req, res) {
  const postId = req.params.postId;

  Post.findOne({ _id: postId })
    .exec()
    .then((foundPost) => {
      if (foundPost) {
        res.render("edit", { post: foundPost, user: req.user });
      } else {
        console.log("Post not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});

app.post("/posts/:postId/edit", isAuthenticated, function(req, res) {
  const postId = req.params.postId;
  const updatedTitle = req.body.updatedTitle;
  const updatedContent = req.body.updatedContent;
  const imageURL = req.body.imageURL;

  const update = { title: updatedTitle, content: updatedContent };
  if (imageURL) {
    update.$addToSet = { images: imageURL }; // Add the imageURL to the images array
  }

  Post.findByIdAndUpdate(postId, update, { new: true })
    .then((updatedPost) => {
      if (updatedPost) {
        res.redirect(`/posts/${postId}`);
      } else {
        console.log("Post not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});


// Delete Post
app.post("/posts/:postId/delete", isAuthenticated, function(req, res) {
  const postId = req.params.postId;

  Post.findByIdAndRemove(postId)
    .then(() => {
      res.redirect("/");
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});




// Remove Image from Post
app.post("/posts/:postId/delete-image", isAuthenticated, function(req, res) {
  const postId = req.params.postId;
  const imageURL = req.body.imageURL;

  Post.findByIdAndUpdate(
    postId,
    { $pull: { images: imageURL } }, // Remove the imageURL from the images array
    { new: true }
  )
    .then((updatedPost) => {
      if (updatedPost) {
        res.redirect(`/posts/${postId}/edit`);
      } else {
        console.log("Post not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});


const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", function () {
  console.log("Server stared on port 3000");
});




/*

mongo "mongodb+srv://cluster1.vnazxxp.mongodb.net/" --username tushartirthraj

Password : Tirthraj1604

rds endpoint : lab-db.cpuqg5qhjxn2.us-east-1.rds.amazonaws.com

imp : https://console.aws.amazon.com/ec2
AMI id : ami-04a4b7f077dcd6e86



Best part for searching

// GET route for searching
app.get("/search/:title", function(req, res) {
  const searchedTitle = req.params.title;

  Post.findOne({title : searchedTitle})
  .then((postItem)=>{
    if(postItem){
        res.render("search",{searchTitle : postItem.title, searchContent : postItem.content});
      }
      else{
        res.render("search",{searchTitle : "No items mathced your search", searchContent : ""});
      }
  })
  .catch((err)=>{
    console.error('Something went wrong', err);
  });
});


// POST route for form submission
app.post("/search", function(req, res) {
  const searchQuery = req.body.searchTerm;
  res.redirect("/search/"+searchQuery);
});



LAtest full code : 

//jshint esversion:6

const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const _ = require("lodash");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");

const homeStartingContent = "Lacus vel facilisis volutpat est velit egestas dui id ornare. Semper auctor neque vitae tempus quam. Sit amet cursus sit amet dictum sit amet justo. Viverra tellus in hac habitasse. Imperdiet proin fermentum leo vel orci porta. Donec ultrices tincidunt arcu non sodales neque sodales ut. Mattis molestie a iaculis at erat pellentesque adipiscing. Magnis dis parturient montes nascetur ridiculus mus mauris vitae ultricies. Adipiscing elit ut aliquam purus sit amet luctus venenatis lectus. Ultrices vitae auctor eu augue ut lectus arcu bibendum at. Odio euismod lacinia at quis risus sed vulputate odio ut. Cursus mattis molestie a iaculis at erat pellentesque adipiscing.";
const aboutContent = "Hac habitasse platea dictumst vestibulum rhoncus est pellentesque. Dictumst vestibulum rhoncus est pellentesque elit ullamcorper. Non diam phasellus vestibulum lorem sed. Platea dictumst quisque sagittis purus sit. Egestas sed sed risus pretium quam vulputate dignissim suspendisse. Mauris in aliquam sem fringilla. Semper risus in hendrerit gravida rutrum quisque non tellus orci. Amet massa vitae tortor condimentum lacinia quis vel eros. Enim ut tellus elementum sagittis vitae. Mauris ultrices eros in cursus turpis massa tincidunt dui.";
const contactContent = "Scelerisque eleifend donec pretium vulputate sapien. Rhoncus urna neque viverra justo nec ultrices. Arcu dui vivamus arcu felis bibendum. Consectetur adipiscing elit duis tristique. Risus viverra adipiscing at in tellus integer feugiat. Sapien nec sagittis aliquam malesuada bibendum arcu vitae. Consequat interdum varius sit amet mattis. Iaculis nunc sed augue lacus. Interdum posuere lorem ipsum dolor sit amet consectetur adipiscing elit. Pulvinar elementum integer enim neque. Ultrices gravida dictum fusce ut placerat orci nulla. Mauris in aliquam sem fringilla ut morbi tincidunt. Tortor posuere ac ut consequat semper viverra nam libero.";

const app = express();

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use(
  session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: false
  })
);

mongoose.connect("mongodb+srv://tushartirthraj:Tirthraj1604@cluster1.vnazxxp.mongodb.net/blogDB");

var posts = [];
let favorites = [];


const postsSchema = new mongoose.Schema({
  title : String,
  content : String
});

const Post = mongoose.model("Post",postsSchema);

const favoritesSchema = new mongoose.Schema({
  title: String,
  content: String
});

const Favorite = mongoose.model("Favorite", favoritesSchema);

const usersSchema = new mongoose.Schema({
  username: String,
  password: String,
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Favorite'
  }]
});

const User = mongoose.model("User", usersSchema);
module.exports = app;

app.get("/", function(req, res){

  Post.find({})
  .exec()
  .then((foundPosts) => {
    res.render("home", {
      startingContent: homeStartingContent,
      posts: foundPosts,
      id : foundPosts._id,
      });
  })
  .catch((err) => {
    console.log(`Error Occured : ${err}`);
  });
  
  
});

// User Sign Up
app.get("/signup", function(req, res) {
  res.render("signup");
});

app.post("/signup", function(req, res) {
  const username = req.body.username;
  const password = req.body.password;

  bcrypt.hash(password, 10, function(err, hashedPassword) {
    if (err) {
      console.log(err);
      res.redirect("/signup");
    } else {
      const user = new User({
        username: username,
        password: hashedPassword,
        isAdmin: false
      });
      user.save();
      res.redirect("/login");
    }
  });
});

// User Sign In
app.get("/login", function(req, res) {
  res.render("login");
});

app.post("/login", function(req, res) {
  const username = req.body.username;
  const password = req.body.password;

  User.findOne({ username: username })
    .then((user) => {
      if (user) {
        bcrypt.compare(password, user.password, function(err, result) {
          if (result === true) {
            req.session.user = user;
            res.redirect("/");
          } else {
            console.log("Incorrect password");
            res.redirect("/login");
          }
        });
      } else {
        console.log("User not found");
        res.redirect("/login");
      }
    })
    .catch((err) => {
      console.log(err);
      res.redirect("/login");
    });
});

// User Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
}

// Logout
app.get("/logout", isAuthenticated, function(req, res) {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/createadmin", async function(req, res) {
  try {
    const existingAdmin = await User.findOne({ email: "admin@245.com" });

    if (!existingAdmin) {
      const admin = new User({
        name: "Admin",
        email: "admin@245.com",
        password: "University@245",
        role: "admin"
      });
      await admin.save();
      console.log("Admin account created");
    } else {
      console.log("Admin account already exists");
    }

    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.redirect("/");
  }
});


// Method for adding favourites.

app.get("/favorites", function(req, res) {
  Favorite.find({})
    .then((favorites) => {
      res.render("favorites", { favorites: favorites });
    })
    .catch((err) => {
      console.log(err);
    });
});



app.post("/addtofavorites", function(req, res) {
  const postId = req.body.postId;

  Post.findById(postId)
    .then((post) => {
      if (post) {
        const favoritePost = new Favorite({
          title: post.title,
          content: post.content
        });
        favoritePost.save();
        res.redirect("/favorites");
      } else {
        console.log("Post not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(err);
      res.redirect("/");
    });
});


app.post("/removefromfavorites", function(req, res) {
  const favoriteId = req.body.favoriteId;

  Favorite.findByIdAndRemove(favoriteId)
    .then(() => {
      res.redirect("/favorites");
    })
    .catch((err) => {
      console.log(err);
      res.redirect("/favorites");
    });
});



app.post("/favourites", function(req, res){
  const postTitle = req.body.postTitle;

  Post.findOne({ title: postTitle })
    .exec()
    .then((foundPost) => {
      if (foundPost) {
        // Handle adding to favourites here (e.g., store in database or session)
        res.locals.addedToFavourites = true;
        res.redirect("/");
      } else {
        console.log("Post not found");
        res.redirect("/");
      }
    })
    .catch((err) => {
      console.log(`Error Occurred: ${err}`);
      res.redirect("/");
    });
});

app.get("/favourites/:postId", function(req, res){
  const postId = req.params.postId;
  
  Post.findOne({ _id: postId })
    .exec()
    .then((foundPost) => {
      if (foundPost) {
        res.render("favourite-post", { post: foundPost });
      } else {
        console.log("Post not found");
        res.redirect("/favourites");
      }
    })
    .catch((err) => {
      console.log(`Error Occured : ${err}`);
      res.redirect("/favourites");
    });
});


app.get("/about", function(req, res){
  res.render("about", {aboutContent: aboutContent});
});

app.get("/contact", function(req, res){
  res.render("contact", {contactContent: contactContent});
});

app.get("/compose", function(req, res){
  res.render("compose");
});

app.post("/compose", function(req, res){
  const post = {
    title: req.body.postTitle,
    content: req.body.postBody
  };

  posts.push(post);

  const post1 = new Post({
    title : req.body.postTitle,
    content : req.body.postBody
  });
  
  post1.save();
  res.redirect("/");

});

app.get("/posts/:postId", function(req, res){
  const requestedTitle = _.lowerCase(req.params.postName);
  const requestedPostId = req.params.postId;  
    Post.findOne({_id : requestedPostId})
    .then((post)=>{
      res.render("post", {

        title: post.title,
   
        content: post.content
   
      });
    })
    .catch((err)=>{
      console.log(`Error Occured : ${err}`);
    });

});

// GET route for searching
// GET route for searching
app.get("/search/:title", function(req, res) {
  let searchedTitle = req.params.title;
  const lowercaseSearchTitle = _.lowerCase(searchedTitle);
  searchedTitle = searchedTitle.replace(/\s/g, ''); // Remove spaces from the searched title

  Post.findOne({ title: { $regex: searchedTitle, $options: 'i' } })
    .then((post) => {
      if (post) {
        res.render("search", { searchTitle: post.title, searchContent: post.content });
      } else {
        Post.find({ title: { $regex: lowercaseSearchTitle, $options: 'i' } })
          .then((posts) => {
            if (posts.length > 0) {
              const matchedPost = posts.find((post) => _.lowerCase(post.title) === lowercaseSearchTitle);
              if (matchedPost) {
                res.render("search", { searchTitle: matchedPost.title, searchContent: matchedPost.content });
              } else {
                res.render("search", { searchTitle: lowercaseSearchTitle, searchContent: posts[0].content });
              }
            } else {
              res.render("search", { searchTitle: "No items matched your search", searchContent: "" });
            }
          })
          .catch((err) => {
            console.error('Something went wrong', err);
          });
      }
    })
    .catch((err) => {
      console.error('Something went wrong', err);
    });
});




// POST route for form submission
app.post("/search", function(req, res) {
  const searchQuery = req.body.searchTerm;
  res.redirect("/search/"+searchQuery);
});


app.listen(5000, function() {
  console.log("Server started on port 5000");
});

*/
