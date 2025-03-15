#!/bin/bash
# Script for verifying a Monad contract

# Check if contract address is provided
if [ -z "$1" ]; then
  echo "Please provide a contract address as the first argument"
  echo "Usage: ./verify-monad.sh <contract-address>"
  exit 1
fi

CONTRACT_ADDRESS=$1
CONTRACT_NAME=${2:-"MonadRunnerGame"}  # Default to MonadRunnerGame if not specified
NETWORK=${3:-"monadTestnet"}  # Default to monadTestnet if not specified

echo "Verifying $CONTRACT_NAME at $CONTRACT_ADDRESS on $NETWORK..."

# Try first verification method
echo "Method 1: Using sourcify verification..."
yarn hardhat verify --network $NETWORK $CONTRACT_ADDRESS

# If the first method fails, try the second method
if [ $? -ne 0 ]; then
  echo "Method 2: Using manual verification..."
  yarn hardhat run scripts/manualVerify.ts $CONTRACT_ADDRESS $CONTRACT_NAME
fi

echo "Verification attempt completed."