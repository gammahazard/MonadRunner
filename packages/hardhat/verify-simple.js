// Direct verification script using the existing tools
const { execSync } = require('child_process');

// Get arguments
const contractAddress = process.argv[2];
if (!contractAddress) {
  console.error('Please provide a contract address as the first argument');
  process.exit(1);
}

// Create a config that only uses Sourcify for verification
console.log(`Attempting to verify contract at ${contractAddress}...`);

try {
  // Attempt verification using the native hardhat verify command with the --no-compile flag
  const result = execSync(`npx hardhat verify --network monadTestnet --no-compile ${contractAddress}`, 
    { stdio: 'inherit' });
  
  console.log('Verification successful!');
} catch (error) {
  console.error('Verification failed through the standard method. Please try:');
  console.log(`1. Check that the contract at ${contractAddress} exists on Monad testnet`);
  console.log('2. Make sure your hardhat.config.ts has the correct network configuration for monadTestnet');
  console.log('3. Try manual verification through the block explorer');
}