# MonadRunner Project Guidelines

## Build Commands
- **Start nextjs app**: `yarn start`
- **Run tests**: `yarn hardhat:test`
- **Run a single test**: `yarn hardhat:test --grep "test name"`
- **Lint all code**: `yarn lint`
- **Lint nextjs code**: `yarn next:lint`
- **Lint hardhat code**: `yarn hardhat:lint`
- **Type check**: `yarn next:check-types` or `yarn hardhat:check-types`
- **Format code**: `yarn format`
- **Compile contracts**: `yarn compile`
- **Deploy contracts**: `yarn deploy`

## Code Style Guidelines
- **TypeScript**: Use types for all variables and function parameters
- **Naming**: Use camelCase for variables/functions, PascalCase for classes/interfaces/components
- **Imports**: Sorted using @trivago/prettier-plugin-sort-imports with prioritized React imports
- **Components**: Use functional components with hooks
- **Formatting**: 120 characters line length, 2 spaces indentation (4 for Solidity)
- **Error Handling**: Use try/catch blocks with specific error messages and notifications
- **Comments**: Use JSDoc style comments for functions/classes; Solidity uses NatSpec
- **Solidity**: Optimize for gas usage with appropriate patterns, use custom errors instead of strings

## Project Structure
- **packages/hardhat**: Smart contracts, tests, deployment scripts 
- **packages/nextjs**: Next.js frontend application with React components