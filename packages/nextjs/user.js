// monad-app/models/user.js

const mongoose = require("mongoose");

//
// 1) Define the "replaySchema"
//
const replaySchema = new mongoose.Schema({
  score: {
    type: Number,
    required: [true, "Score is required"],
  },
  replayData: {
    type: Array, // or more detailed sub-schema if needed
    default: [],
  },
  playedAt: {
    type: Date,
    default: Date.now,
  },
  username: {
    type: String,
    default: "", // You can store the user's username at time-of-play if you want
  },
});

//
// 2) Define the "userSchema"
//
const userSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: [true, "Wallet address is required"],
      unique: true,
      trim: true,
      validate: {
        validator: function (val) {
          return /^0x[a-fA-F0-9]{40}$/.test(val);
        },
        message: "Please provide a valid Ethereum wallet address",
      },
    },
    username: {
      type: String,
      trim: true,
      maxlength: [20, "Username cannot be more than 20 characters"],
    },
    highScore: {
      type: Number,
      default: 0,
    },
    timesPlayed: {
      type: Number,
      default: 0,
    },

    // 3) The "replays" field is an array of "replaySchema"
    replays: {
      type: [replaySchema],
      default: [],
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

//
// 4) Static method for top players
//
userSchema.statics.getTopPlayers = function (limit = 10) {
  return this.find()
    .sort({ highScore: -1 })
    .limit(limit)
    .select("walletAddress username highScore timesPlayed");
};

const User = mongoose.model("User", userSchema);
module.exports = User;
