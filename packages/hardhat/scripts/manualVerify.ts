import fs from 'fs';
import path from 'path';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task } from 'hardhat/config';
// These dependencies are already installed in the project
import axios from 'axios';
import FormData from 'form-data';

// Define the verification task
task('manual:verify', 'Manually verify a contract on Sourcify')
  .addParam('contract', 'The contract address to verify')
  .addParam('name', 'The contract name')
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { contract, name } = taskArgs;
    const chainId = String(hre.network.config.chainId);

    console.log(`Manually verifying ${name} at ${contract} on chain ${chainId}...`);

    try {
      // Get the compilation artifacts
      const artifactPath = path.join(
        hre.config.paths.artifacts,
        'contracts',
        `${name}.sol`,
        `${name}.json`
      );

      if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found at ${artifactPath}`);
      }

      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

      // Get the metadata
      const metadata = JSON.parse(artifact.metadata);

      // Prepare the verification data
      const data = new FormData();
      data.append('address', contract);
      data.append('chain', chainId);
      data.append('files', JSON.stringify(metadata));

      // Get the source files from metadata
      const sources = metadata.sources;
      for (const filePath in sources) {
        const fullPath = path.join(hre.config.paths.root, filePath);
        if (fs.existsSync(fullPath)) {
          const fileContent = fs.readFileSync(fullPath, 'utf8');
          data.append('files', fileContent, { filename: filePath });
        } else {
          console.warn(`Source file not found: ${fullPath}`);
        }
      }

      // Send verification request to Sourcify
      const sourcifyUrl = 'https://sourcify.dev/server/verify';
      const response = await axios.post(sourcifyUrl, data, {
        headers: {
          ...data.getHeaders(),
        },
      });

      console.log('Verification response:', response.data);
      console.log('✅ Contract verified successfully!');
    } catch (error: any) {
      console.error('❌ Verification failed:');
      if (error.response) {
        console.error(error.response.data);
      } else {
        console.error(error);
      }
    }
  });

// Script to run the task
async function main() {
  const contractAddress = process.argv[2];
  const contractName = process.argv[3] || 'MonadRunnerGame';
  
  if (!contractAddress) {
    console.error('Please provide a contract address');
    process.exit(1);
  }

  process.env.CONTRACT_ADDRESS = contractAddress;
  process.env.CONTRACT_NAME = contractName;

  await require('hardhat').run('manual:verify', {
    contract: contractAddress,
    name: contractName,
  });
}

// Run the script directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}