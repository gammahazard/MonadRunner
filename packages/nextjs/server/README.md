# Monad Runner Session Key Server

This is a specialized server to handle session keys for the Monad Runner game. It provides endpoints for creating, revoking, and using session keys for transactions.

## Features

- Session key registration and signature verification
- Session key revocation
- Transaction execution with session keys
- MongoDB integration for session storage

## Setup

1. Copy `.env.example` to `.env` and update the values
2. Install dependencies: `npm install`
3. Start the server: `npm start`

## API Endpoints

### Register a Session Key
- POST `/runnerapi/session/register`
- Body: 
  ```json
  {
    "userAddress": "0x...",
    "publicKey": "0x...",
    "signature": "0x...",
    "validUntil": 1234567890
  }
  ```

### Revoke a Session Key
- POST `/runnerapi/session/revoke`
- Body:
  ```json
  {
    "userAddress": "0x...",
    "publicKey": "0x..."
  }
  ```

### Execute a Transaction
- POST `/runnerapi/session/transaction`
- Body:
  ```json
  {
    "userAddress": "0x...",
    "publicKey": "0x...",
    "signature": "0x...",
    "contractAddress": "0x...",
    "functionName": "submitScore",
    "args": [123, "0x..."]
  }
  ```

## Integration with Monad Runner Frontend

The server is designed to work with the session key functionality in the Monad Runner game. The frontend communicates with this server to handle session management.