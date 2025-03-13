import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys the MonadRunnerGame contract
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployMonadRunnerGame: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Deploy the MonadRunnerGame contract
  const monadRunnerGameDeployment = await deploy("MonadRunnerGame", {
    from: deployer,
    // No constructor arguments
    args: [],
    log: true,
    // Auto-mine: Wait for the deployment transaction to complete
    autoMine: true,
  });

  // Get the deployed contract
  const monadRunnerGame = await hre.ethers.getContract<Contract>("MonadRunnerGame", deployer);
  console.log("💡 MonadRunnerGame deployed at:", monadRunnerGame.target);
};

export default deployMonadRunnerGame;

// Tags help to organize and selectively deploy contracts
deployMonadRunnerGame.tags = ["MonadRunnerGame"];