const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const ethers = require('ethers');

// Load environment variables
dotenv.config();

// Import User model
const User = require('./user');

// Create Express app
const app = express();
app.set('trust proxy', 1);

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

connectDB();

// Middleware
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Setup CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) :
  ['http://localhost:3000', 'https://monadrunner.com'];

console.log("Allowed origins:", allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    console.log("Incoming request origin:", origin);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Session Routes
const sessionRoutes = express.Router();

// Register a new session
sessionRoutes.post('/register', async (req, res) => {
  try {
    const { userAddress, publicKey, signature, validUntil } = req.body;
    
    // Validate required fields
    if (!userAddress || !publicKey || !signature || !validUntil) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields'
      });
    }
    
    // Validate expiration time
    const now = Math.floor(Date.now() / 1000);
    if (validUntil <= now) {
      return res.status(400).json({
        status: 'error',
        message: 'Session expiry time must be in the future'
      });
    }
    
    // Verify signature
    const message = `I authorize this session key for Monad Runner:
Public Key: ${publicKey.substring(0, 20)}...
Valid Until: ${new Date(validUntil * 1000).toISOString()}
Address: ${userAddress}`;
    
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      if (recoveredAddress.toLowerCase() !== userAddress.toLowerCase()) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid signature'
        });
      }
    } catch (error) {
      console.error("Signature verification error:", error);
      return res.status(401).json({
        status: 'error',
        message: 'Failed to verify signature'
      });
    }
    
    // Find or create user
    let user = await User.findOne({ walletAddress: userAddress.toLowerCase() });
    if (!user) {
      user = new User({ walletAddress: userAddress.toLowerCase() });
    }
    
    // Clean expired sessions
    user.cleanExpiredSessions();
    
    // Add new session key
    user.sessionKeys.push({
      publicKey,
      signature,
      validUntil: new Date(validUntil * 1000),
      isRevoked: false,
      createdAt: new Date()
    });
    
    await user.save();
    
    return res.status(200).json({
      status: 'success',
      message: 'Session registered successfully',
      validUntil
    });
  } catch (error) {
    console.error("Session registration error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Check session status
sessionRoutes.post('/status', async (req, res) => {
  try {
    const { userAddress } = req.body;
    
    // Validate required fields
    if (!userAddress) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields'
      });
    }
    
    // Find user
    const user = await User.findOne({ walletAddress: userAddress.toLowerCase() });
    if (!user) {
      return res.status(200).json({
        status: 'success',
        hasSession: false
      });
    }
    
    // Check for valid session keys
    user.cleanExpiredSessions(); // Clean expired sessions first
    
    // Find the most recent valid session
    const validSession = user.sessionKeys.find(key => !key.isRevoked);
    
    if (!validSession) {
      return res.status(200).json({
        status: 'success',
        hasSession: false
      });
    }
    
    // Return session status with minimal session data (careful not to expose private key)
    return res.status(200).json({
      status: 'success',
      hasSession: true,
      sessionData: {
        publicKey: validSession.publicKey,
        validUntil: validSession.validUntil,
        signature: validSession.signature,
        createdAt: validSession.createdAt
      }
    });
  } catch (error) {
    console.error("Session status check error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Revoke a session
sessionRoutes.post('/revoke', async (req, res) => {
  try {
    const { userAddress, publicKey } = req.body;
    
    // Validate required fields
    if (!userAddress || !publicKey) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields'
      });
    }
    
    // Find user
    const user = await User.findOne({ walletAddress: userAddress.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Revoke session
    const revoked = user.revokeSession(publicKey);
    if (!revoked) {
      return res.status(404).json({
        status: 'error',
        message: 'Session key not found'
      });
    }
    
    await user.save();
    
    return res.status(200).json({
      status: 'success',
      message: 'Session revoked successfully'
    });
  } catch (error) {
    console.error("Session revocation error:", error);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Import the contract utilities
const { executeContractTransaction } = require('./contractUtils');

// Transaction with session key
sessionRoutes.post('/transaction', async (req, res) => {
  try {
    const {
      userAddress,
      publicKey,
      signature,
      contractAddress,
      functionName,
      args
    } = req.body;
    
    // Log the received request with detailed arg info for debugging
    console.log("Transaction request received:", {
      userAddress,
      publicKey: publicKey?.substring(0, 20) + '...',
      contractAddress,
      functionName,
      args: JSON.stringify(args),
      argsType: typeof args,
      argsIsArray: Array.isArray(args),
      argsLength: Array.isArray(args) ? args.length : (typeof args === 'string' ? 'string length: ' + args.length : 'not an array')
    });
    
    // Create a local variable for the contract address instead of modifying the parameter
    const finalContractAddress = contractAddress || "0x775dc8Be07165261E1ef6371854F600bb01B24E6";
    if (!contractAddress) {
      console.log("WARNING: No contract address provided, using default address:", finalContractAddress);
    }
    
    // Validate required fields
    if (!userAddress || !publicKey || !signature || !functionName) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields'
      });
    }
    
    // Find user
    const user = await User.findOne({ walletAddress: userAddress.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Check if session is valid
    const isValid = user.isSessionValid(publicKey);
    if (!isValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired session'
      });
    }
    
    // IMPLEMENTATION CHOICE: Comment/uncomment the appropriate section
    
    // // MOCK IMPLEMENTATION - For testing without actually sending transactions
    // // Comment this out when you're ready to use real transactions
    // const mockTxHash = `0x${Math.random().toString(16).substring(2)}${Math.random().toString(16).substring(2)}`;
    // console.log(`Returning mock transaction hash: ${mockTxHash}`);
    
    // return res.status(200).json({
    //   status: 'success',
    //   txHash: mockTxHash,
    //   info: "Mock transaction - not sent to blockchain"
    // });
    
    // REAL IMPLEMENTATION - Uncomment when you're ready to send real transactions
    // Don't forget to set up the environment variables in your .env file:
    // - MONAD_RPC_URL: Your Monad node URL
    // - SERVER_WALLET_KEY: Your server wallet private key
    
    try {
      console.log(`Submitting transaction to Monad for user ${userAddress}`);
      
      // Check if we have the required environment variables
      if (!process.env.SERVER_WALLET_KEY || !process.env.MONAD_RPC_URL) {
        console.error("Missing required environment variables: SERVER_WALLET_KEY and/or MONAD_RPC_URL");
        throw new Error("Server configuration error - contact administrator");
      }
      
      // Parse the args if they're in string format
      let parsedArgs = args;
      if (typeof args === 'string') {
        try {
          parsedArgs = JSON.parse(args);
        } catch (e) {
          console.error("Failed to parse args as JSON:", e);
          console.log("Using args as-is");
        }
      }
      
      console.log("Parsed arguments:", parsedArgs);
      
      // Execute the transaction using the contract utilities with the final contract address
      const result = await executeContractTransaction(
        finalContractAddress,
        functionName,
        parsedArgs,
        process.env.SERVER_WALLET_KEY,
        process.env.MONAD_RPC_URL
      );
      
      console.log(`Transaction successful! Hash: ${result.txHash}`);
      
      return res.status(200).json({
        status: 'success',
        txHash: result.txHash
      });
    } catch (error) {
      console.error("Blockchain transaction error:", error);
      return res.status(500).json({
        status: 'error',
        message: error.message || "Blockchain transaction failed"
      });
    }
    
  } catch (error) {
    console.error("Transaction processing error:", error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error'
    });
  }
});

// Mount session routes
app.use('/runnerapi/session', sessionRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Monad Runner Session API is running'
  });
});

// Handle 404s
app.all('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Start server
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(`Session server running on port ${PORT}`);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app;