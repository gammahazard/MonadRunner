// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MonadRunnerGame
 * @dev Smart contract for storing Monad Runner game data on-chain,
 *      including registration of a smart account for account abstraction.
 *      Optimized for minimal gas usage.
 */
contract MonadRunnerGame {
    // =============== EVENTS ===============
    event PlayerRegistered(address indexed playerAddress, string username);
    event UsernameChanged(address indexed playerAddress, string newUsername);
    event ScoreSubmitted(address indexed playerAddress, uint256 score, uint256 timestamp, bytes32 replayHash);
    event ReplayDataStored(address indexed playerAddress, bytes32 indexed replayHash);
    event SmartAccountRegistered(address indexed eoa, address smartAccount);
    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    event SessionScoreSubmitted(address indexed playerAddress, address indexed relayer, uint256 score, bytes32 replayHash);

    // =============== STRUCTS ===============
    struct Player {
        string username;
        uint256 highScore;
        uint256 timesPlayed;
        uint256 lastPlayed;
        bool exists;
    }

    struct GameScore {
        address playerAddress;
        uint256 score;
        uint256 timestamp;
        bytes32 replayHash;
    }

    // =============== CONSTANTS ===============
    // Using constant for fixed values saves gas
    uint256 private constant MAX_LEADERBOARD_SIZE = 100;
    uint256 private constant MAX_USERNAME_LENGTH = 20;
    uint256 private constant MAX_PLAYER_SCORE_HISTORY = 10;
    

    // =============== STATE VARIABLES ===============
    // Immutable variables cost less gas than regular state variables
    address public immutable owner;
    
    // Pack related data together when possible
    mapping(address => Player) public players;
    mapping(address => address) public smartAccounts;
    mapping(bytes32 => bool) public replayExists;
    mapping(address => bool) public authorizedRelayers;
    
    // Separate mappings for arrays to avoid storage bloat
    mapping(address => GameScore[]) private playerScoreHistory;
    address[] public playerAddresses;
    GameScore[] public topScores;

    // =============== CONSTRUCTOR ===============
    constructor() {
        owner = msg.sender;
        // Add the deployer as the first authorized relayer
        authorizedRelayers[msg.sender] = true;
        emit RelayerAdded(msg.sender);
    }

    // =============== MODIFIERS ===============
    // Use custom errors instead of revert strings to save gas
    error OnlyOwner();
    error OnlyRegisteredPlayer();
    error OnlyAuthorizedRelayer();
    error PlayerAlreadyRegistered();
    error PlayerDoesNotExist();
    error InvalidSmartAccount();
    error UsernameTooLong();
    error UsernameEmpty();
    error ReplayAlreadyExists();
    error InvalidRelayerAddress();
    error NotAnAuthorizedRelayer();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyRegisteredPlayer() {
        if (!players[msg.sender].exists) revert OnlyRegisteredPlayer();
        _;
    }

    modifier onlyAuthorizedRelayer() {
        if (!authorizedRelayers[msg.sender]) revert OnlyAuthorizedRelayer();
        _;
    }

    // =============== ADMIN FUNCTIONS ===============
    function addRelayer(address relayer) external onlyOwner {
        if (relayer == address(0)) revert InvalidRelayerAddress();
        authorizedRelayers[relayer] = true;
        emit RelayerAdded(relayer);
    }

    function removeRelayer(address relayer) external onlyOwner {
        if (!authorizedRelayers[relayer]) revert NotAnAuthorizedRelayer();
        authorizedRelayers[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    // =============== EXTERNAL FUNCTIONS ===============
    function registerPlayer(string calldata username) external {
        // Using calldata for string parameters saves gas when the function doesn't modify the string
        if (players[msg.sender].exists) revert PlayerAlreadyRegistered();
        
        uint256 len = bytes(username).length;
        if (len == 0) revert UsernameEmpty();
        if (len > MAX_USERNAME_LENGTH) revert UsernameTooLong();

        // Initialize all fields directly to save gas
        players[msg.sender] = Player({
            username: username,
            highScore: 0,
            timesPlayed: 0,
            lastPlayed: 0,
            exists: true
        });
        
        playerAddresses.push(msg.sender);
        emit PlayerRegistered(msg.sender, username);
    }

    function updateUsername(string calldata newUsername) external onlyRegisteredPlayer {
        uint256 len = bytes(newUsername).length;
        if (len == 0) revert UsernameEmpty();
        if (len > MAX_USERNAME_LENGTH) revert UsernameTooLong();
        
        players[msg.sender].username = newUsername;
        emit UsernameChanged(msg.sender, newUsername);
    }

    function registerSmartAccount(address smartAccount) external onlyRegisteredPlayer {
        if (smartAccount == address(0)) revert InvalidSmartAccount();
        smartAccounts[msg.sender] = smartAccount;
        emit SmartAccountRegistered(msg.sender, smartAccount);
    }

    /**
     * @dev Register a player on behalf of someone else, requires the caller to be an authorized relayer
     * This function allows session key servers to register new players
     */
    function registerPlayerFor(address playerAddress, string calldata username) external onlyAuthorizedRelayer {
        if (players[playerAddress].exists) revert PlayerAlreadyRegistered();
        
        uint256 len = bytes(username).length;
        if (len == 0) revert UsernameEmpty();
        if (len > MAX_USERNAME_LENGTH) revert UsernameTooLong();

        // Initialize all fields directly to save gas
        players[playerAddress] = Player({
            username: username,
            highScore: 0,
            timesPlayed: 0,
            lastPlayed: 0,
            exists: true
        });
        
        playerAddresses.push(playerAddress);
        emit PlayerRegistered(playerAddress, username);
    }
    
    /**
     * @dev Update a player's username on behalf of someone else, requires the caller to be an authorized relayer
     * This function allows session key servers to update usernames
     */
    function updateUsernameFor(address playerAddress, string calldata newUsername) external onlyAuthorizedRelayer {
        if (!players[playerAddress].exists) revert PlayerDoesNotExist();
        
        uint256 len = bytes(newUsername).length;
        if (len == 0) revert UsernameEmpty();
        if (len > MAX_USERNAME_LENGTH) revert UsernameTooLong();
        
        players[playerAddress].username = newUsername;
        emit UsernameChanged(playerAddress, newUsername);
    }

    function registerSmartAccountFor(address playerAddress, address smartAccount) external onlyAuthorizedRelayer {
        if (smartAccount == address(0)) revert InvalidSmartAccount();
        
        // Require that the player already exists
        if (!players[playerAddress].exists) revert PlayerDoesNotExist();
        
        smartAccounts[playerAddress] = smartAccount;
        emit SmartAccountRegistered(playerAddress, smartAccount);
    }

    function submitScore(uint256 score, bytes32 replayHash) external onlyRegisteredPlayer {
        // Gas optimization: Use storage pointer
        Player storage player = players[msg.sender];
        
        // Unchecked math for gas optimization when overflow is impossible
        unchecked {
            player.timesPlayed++;
        }
        
        player.lastPlayed = block.timestamp;
        
        // Only update highScore if needed
        if (score > player.highScore) {
            player.highScore = score;
        }
        
        GameScore memory newScore = GameScore({
            playerAddress: msg.sender,
            score: score,
            timestamp: block.timestamp,
            replayHash: replayHash
        });
        
        replayExists[replayHash] = true;
        _addToPlayerScoreHistory(msg.sender, newScore);
        _updateLeaderboard(newScore);
        
        emit ScoreSubmitted(msg.sender, score, block.timestamp, replayHash);
        emit ReplayDataStored(msg.sender, replayHash);
    }

    /**
     * @dev Submit a score on behalf of a player, requires the caller to be an authorized relayer
     * This function allows servers with session keys to submit scores for players
     */
    function submitScoreFor(address playerAddress, uint256 score, bytes32 replayHash) external onlyAuthorizedRelayer {
        // Check that the player exists
        if (!players[playerAddress].exists) revert PlayerDoesNotExist();
        
        // Gas optimization: Use storage pointer
        Player storage player = players[playerAddress];
        
        // Unchecked math for gas optimization when overflow is impossible
        unchecked {
            player.timesPlayed++;
        }
        
        player.lastPlayed = block.timestamp;
        
        // Only update highScore if needed
        if (score > player.highScore) {
            player.highScore = score;
        }
        
        GameScore memory newScore = GameScore({
            playerAddress: playerAddress,
            score: score,
            timestamp: block.timestamp,
            replayHash: replayHash
        });
        
        replayExists[replayHash] = true;
        _addToPlayerScoreHistory(playerAddress, newScore);
        _updateLeaderboard(newScore);
        
        emit ScoreSubmitted(playerAddress, score, block.timestamp, replayHash);
        emit ReplayDataStored(playerAddress, replayHash);
        emit SessionScoreSubmitted(playerAddress, msg.sender, score, replayHash);
    }
    
    function storeReplayDataHash(bytes32 replayHash) external onlyRegisteredPlayer {
        if (replayExists[replayHash]) revert ReplayAlreadyExists();
        replayExists[replayHash] = true;
        emit ReplayDataStored(msg.sender, replayHash);
    }

    // =============== VIEW FUNCTIONS ===============
    function getPlayer(address playerAddress) external view returns (Player memory) {
        if (!players[playerAddress].exists) revert PlayerDoesNotExist();
        return players[playerAddress];
    }

    function getTopScores(uint256 count) external view returns (GameScore[] memory) {
        // Gas optimization: Avoid unnecessary copies
        uint256 actualCount = topScores.length;
        if (count > actualCount) {
            count = actualCount;
        }
        
        GameScore[] memory results = new GameScore[](count);
        
        // Use unchecked when overflow is impossible (gas optimization)
        unchecked {
            for (uint256 i = 0; i < count; i++) {
                results[i] = topScores[i];
            }
        }
        
        return results;
    }

    function getPlayerScoreHistory(address playerAddress) external view returns (GameScore[] memory) {
        if (!players[playerAddress].exists) revert PlayerDoesNotExist();
        return playerScoreHistory[playerAddress];
    }

    function getPlayerRank(address playerAddress) external view returns (uint256) {
        if (!players[playerAddress].exists) revert PlayerDoesNotExist();
        
        uint256 length = topScores.length;
        // Use unchecked when overflow is impossible (gas optimization)
        unchecked {
            for (uint256 i = 0; i < length; i++) {
                if (topScores[i].playerAddress == playerAddress) {
                    return i + 1;
                }
            }
        }
        
        return 0;
    }

    function getPlayerCount() external view returns (uint256) {
        return playerAddresses.length;
    }

    function isAuthorizedRelayer(address relayer) external view returns (bool) {
        return authorizedRelayers[relayer];
    }

    // =============== INTERNAL FUNCTIONS ===============
    function _addToPlayerScoreHistory(address playerAddress, GameScore memory score) internal {
        GameScore[] storage history = playerScoreHistory[playerAddress];
        uint256 length = history.length;
        
        if (length >= MAX_PLAYER_SCORE_HISTORY) {
            // Shift items to make room (gas optimization using unchecked)
            unchecked {
                for (uint256 i = 0; i < length - 1; i++) {
                    history[i] = history[i + 1];
                }
            }
            history.pop();
        }
        
        history.push(score);
    }

    function _updateLeaderboard(GameScore memory newScore) internal {
        uint256 length = topScores.length;
        
        if (length < MAX_LEADERBOARD_SIZE) {
            uint256 pos = _findInsertionPosition(newScore.score);
            
            topScores.push(GameScore({
                playerAddress: address(0),
                score: 0,
                timestamp: 0,
                replayHash: bytes32(0)
            }));
            
            // Shift items to make room
            unchecked {
                for (uint256 i = length; i > pos; i--) {
                    topScores[i] = topScores[i - 1];
                }
            }
            
            topScores[pos] = newScore;
        } else if (newScore.score > topScores[length - 1].score) {
            uint256 pos = _findInsertionPosition(newScore.score);
            
            // Shift items to make room
            unchecked {
                for (uint256 i = length - 1; i > pos; i--) {
                    topScores[i] = topScores[i - 1];
                }
            }
            
            topScores[pos] = newScore;
        }
    }

    function _findInsertionPosition(uint256 score) internal view returns (uint256) {
        uint256 left = 0;
        uint256 right = topScores.length;
        
        while (left < right) {
            uint256 mid = (left + right) / 2;
            if (topScores[mid].score > score) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        
        return left;
    }

}