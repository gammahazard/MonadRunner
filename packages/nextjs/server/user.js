const mongoose = require("mongoose");

// Session Key Schema - for storing session keys
const sessionKeySchema = new mongoose.Schema({
  publicKey: {
    type: String,
    required: [true, "Public key is required"],
    unique: true,
  },
  signature: {
    type: String,
    required: [true, "Signature is required"],
  },
  validUntil: {
    type: Date,
    required: [true, "Expiration time is required"],
  },
  isRevoked: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// User Schema (minimal version for session handling)
const userSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: [true, "Wallet address is required"],
      unique: true,
      lowercase: true,
    },
    username: {
      type: String,
      trim: true,
      default: "",
    },
    // Session keys array
    sessionKeys: [sessionKeySchema],
  },
  {
    timestamps: true,
  }
);

// Add a method to check if a session key is valid
userSchema.methods.isSessionValid = function(publicKey) {
  if (!this.sessionKeys || this.sessionKeys.length === 0) {
    return false;
  }
  
  const session = this.sessionKeys.find(
    (key) => key.publicKey === publicKey && !key.isRevoked
  );
  
  if (!session) {
    return false;
  }
  
  const now = new Date();
  return session.validUntil > now;
};

// Add a method to revoke a session key
userSchema.methods.revokeSession = function(publicKey) {
  if (!this.sessionKeys || this.sessionKeys.length === 0) {
    return false;
  }
  
  const session = this.sessionKeys.find(
    (key) => key.publicKey === publicKey
  );
  
  if (!session) {
    return false;
  }
  
  session.isRevoked = true;
  return true;
};

// Add a method to clean expired sessions
userSchema.methods.cleanExpiredSessions = function() {
  if (!this.sessionKeys || this.sessionKeys.length === 0) {
    return 0;
  }
  
  const now = new Date();
  let count = 0;
  
  this.sessionKeys = this.sessionKeys.filter(session => {
    const isValid = session.validUntil > now && !session.isRevoked;
    if (!isValid) count++;
    return isValid;
  });
  
  return count;
};

const User = mongoose.model("User", userSchema);

module.exports = User;