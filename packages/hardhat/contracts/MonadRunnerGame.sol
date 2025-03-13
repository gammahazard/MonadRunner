// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MonadRunnerGame
 * @dev Smart contract for storing Monad Runner game data on-chain,
 *      including registration of a smart account for account abstraction.
 */
contract MonadRunnerGame {
    // =============== EVENTS ===============
    event PlayerRegistered(address indexed playerAddress, string username);
    event UsernameChanged(address indexed playerAddress, string newUsername);
    event ScoreSubmitted(address indexed playerAddress, uint256 score, uint256 timestamp, bytes32 replayHash);
    event ReplayDataStored(address indexed playerAddress, bytes32 indexed replayHash);
    event SmartAccountRegistered(address indexed eoa, address smartAccount);

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
        bytes32 replayHash; // Hash of replay data, can be used to verify off-chain replay data
    }

    // =============== STATE VARIABLES ===============
    address public owner;
    
    // Mapping from EOA (player) address to Player struct.
    mapping(address => Player) public players;
    
    // Mapping from EOA (player) to their registered smart account address.
    mapping(address => address) public smartAccounts;
    
    // Array of registered EOA addresses (for enumeration).
    address[] public playerAddresses;
    
    // Array of top scores for the leaderboard.
    GameScore[] public topScores;
    
    // Maximum number of top scores to track.
    uint256 public constant MAX_LEADERBOARD_SIZE = 100;
    
    // Maximum username length.
    uint256 public constant MAX_USERNAME_LENGTH = 20;
    
    // Replay data storage (hash => exists).
    mapping(bytes32 => bool) public replayExists;
    
    // Mapping from EOA to their game history (most recent scores).
    mapping(address => GameScore[]) public playerScoreHistory;
    
    // Maximum number of scores to keep per player.
    uint256 public constant MAX_PLAYER_SCORE_HISTORY = 10;

    // =============== CONSTRUCTOR ===============
    constructor() {
        owner = msg.sender;
    }

    // =============== MODIFIERS ===============
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier onlyRegisteredPlayer() {
        require(players[msg.sender].exists, "Player not registered");
        _;
    }

    // =============== EXTERNAL FUNCTIONS ===============
    /**
     * @dev Register a new player with a username.
     * @param username The player's username.
     */
    function registerPlayer(string memory username) external {
        require(!players[msg.sender].exists, "Player already registered");
        require(bytes(username).length > 0, "Username cannot be empty");
        require(bytes(username).length <= MAX_USERNAME_LENGTH, "Username too long");

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

    /**
     * @dev Update player's username.
     * @param newUsername The new username.
     */
    function updateUsername(string memory newUsername) external onlyRegisteredPlayer {
        require(bytes(newUsername).length > 0, "Username cannot be empty");
        require(bytes(newUsername).length <= MAX_USERNAME_LENGTH, "Username too long");
        
        players[msg.sender].username = newUsername;
        emit UsernameChanged(msg.sender, newUsername);
    }

    /**
     * @dev Register the smart account (AA wallet) associated with the player's EOA.
     * @param smartAccount The smart account address.
     */
    function registerSmartAccount(address smartAccount) external onlyRegisteredPlayer {
        require(smartAccount != address(0), "Invalid smart account address");
        smartAccounts[msg.sender] = smartAccount;
        emit SmartAccountRegistered(msg.sender, smartAccount);
    }

    /**
     * @dev Submit a game score.
     * @param score The achieved score.
     * @param replayHash The hash of the replay data.
     */
    function submitScore(uint256 score, bytes32 replayHash) external onlyRegisteredPlayer {
        Player storage player = players[msg.sender];
        player.timesPlayed++;
        player.lastPlayed = block.timestamp;
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
        addToPlayerScoreHistory(msg.sender, newScore);
        updateLeaderboard(newScore);
        
        emit ScoreSubmitted(msg.sender, score, block.timestamp, replayHash);
        emit ReplayDataStored(msg.sender, replayHash);
    }

    /**
     * @dev Store replay data hash for off-chain replay verification.
     * @param replayHash The hash of the replay data.
     */
    function storeReplayDataHash(bytes32 replayHash) external onlyRegisteredPlayer {
        require(!replayExists[replayHash], "Replay hash already exists");
        replayExists[replayHash] = true;
        emit ReplayDataStored(msg.sender, replayHash);
    }

    // =============== VIEW FUNCTIONS ===============
    /**
     * @dev Get player information.
     * @param playerAddress The player's EOA address.
     * @return Player data.
     */
    function getPlayer(address playerAddress) external view returns (Player memory) {
        require(players[playerAddress].exists, "Player does not exist");
        return players[playerAddress];
    }

    /**
     * @dev Get the top scores (leaderboard).
     * @param count Number of top scores to retrieve.
     * @return Array of GameScore structs.
     */
    function getTopScores(uint256 count) external view returns (GameScore[] memory) {
        uint256 actualCount = topScores.length;
        if (count > actualCount) {
            count = actualCount;
        }
        GameScore[] memory results = new GameScore[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = topScores[i];
        }
        return results;
    }

    /**
     * @dev Get a player's score history.
     * @param playerAddress The player's EOA address.
     * @return Array of GameScore structs.
     */
    function getPlayerScoreHistory(address playerAddress) external view returns (GameScore[] memory) {
        require(players[playerAddress].exists, "Player does not exist");
        return playerScoreHistory[playerAddress];
    }

    /**
     * @dev Get a player's rank on the leaderboard.
     * @param playerAddress The player's EOA address.
     * @return The player's rank (1-based) or 0 if not on the leaderboard.
     */
    function getPlayerRank(address playerAddress) external view returns (uint256) {
        require(players[playerAddress].exists, "Player does not exist");
        for (uint256 i = 0; i < topScores.length; i++) {
            if (topScores[i].playerAddress == playerAddress) {
                return i + 1;
            }
        }
        return 0;
    }

    /**
     * @dev Get total number of registered players.
     * @return The count of registered players.
     */
    function getPlayerCount() external view returns (uint256) {
        return playerAddresses.length;
    }

    // =============== INTERNAL FUNCTIONS ===============
    /**
     * @dev Add a score to a player's history, keeping only recent scores.
     * @param playerAddress The player's EOA address.
     * @param score The game score to add.
     */
    function addToPlayerScoreHistory(address playerAddress, GameScore memory score) internal {
        GameScore[] storage history = playerScoreHistory[playerAddress];
        if (history.length >= MAX_PLAYER_SCORE_HISTORY) {
            for (uint256 i = 0; i < history.length - 1; i++) {
                history[i] = history[i + 1];
            }
            history.pop();
        }
        history.push(score);
    }

    /**
     * @dev Update the leaderboard with a new score if it qualifies.
     * @param newScore The new game score.
     */
    function updateLeaderboard(GameScore memory newScore) internal {
        if (topScores.length < MAX_LEADERBOARD_SIZE) {
            uint256 pos = findInsertionPosition(newScore.score);
            topScores.push(GameScore({
                playerAddress: address(0),
                score: 0,
                timestamp: 0,
                replayHash: bytes32(0)
            }));
            for (uint256 i = topScores.length - 1; i > pos; i--) {
                topScores[i] = topScores[i - 1];
            }
            topScores[pos] = newScore;
        } else if (newScore.score > topScores[topScores.length - 1].score) {
            uint256 pos = findInsertionPosition(newScore.score);
            for (uint256 i = topScores.length - 1; i > pos; i--) {
                topScores[i] = topScores[i - 1];
            }
            topScores[pos] = newScore;
        }
    }

    /**
     * @dev Find the position to insert a new score using binary search.
     * @param score The new score.
     * @return The insertion index.
     */
    function findInsertionPosition(uint256 score) internal view returns (uint256) {
        uint256 left = 0;
        uint256 right = topScores.length;
        while (left < right) {
            uint256 mid = left + (right - left) / 2;
            if (topScores[mid].score > score) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        return left;
    }
}
