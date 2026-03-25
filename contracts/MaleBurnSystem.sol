// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title MaleBurnSystem
 * @dev 麻了燃烧系统 - 支持抽奖和自动燃烧两种模式
 *      70%转入黑洞，30%转入分红池
 */
contract MaleBurnSystem is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // 代币合约
    IERC20 public token;

    // 黑洞地址
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // 分红池地址
    address public dividendPool;

    // 最小燃烧金额（抽奖用）
    uint256 public minBurnAmount = 100 * 10**18;

    // 每次抽奖的价格（100U）
    uint256 public constant LOTTERY_PRICE = 100 * 10**18;

    // 抽奖号码范围
    uint256 public constant MIN_LOTTERY_NUMBER = 100000;
    uint256 public constant MAX_LOTTERY_NUMBER = 999999;

    // 最小转入数量（自动燃烧用）
    uint256 public minDepositAmount = 1 * 10**18;

    // 累计统计
    uint256 public totalBurned;
    uint256 public totalToDead;
    uint256 public totalToPool;
    uint256 public totalLotteries;

    // 用户燃烧总量
    mapping(address => uint256) public userTotalBurned;

    // 用户抽奖次数
    mapping(address => uint256) public userLotteryCount;

    // 抽奖记录
    struct LotteryEntry {
        address user;
        uint256 lotteryNumber;
        uint256 burnAmount;
        uint256 timestamp;
    }

    mapping(address => LotteryEntry[]) public userLotteries;
    LotteryEntry[] public allLotteries;

    // 自动燃烧存款记录
    struct Deposit {
        uint256 amount;
        uint256 burned;
        uint256 timestamp;
    }

    mapping(address => Deposit[]) public userDeposits;

    // 排行榜数据
    address[] public leaderboardAddresses;

    // 事件
    event BurnAndLottery(
        address indexed user,
        uint256 burnAmount,
        uint256 lotteryNumber,
        uint256 timestamp
    );

    event AutoDeposit(
        address indexed user,
        uint256 amount,
        uint256 burned,
        uint256 toPool,
        uint256 timestamp
    );

    event TokensWithdrawn(
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    event TokenUpdated(address oldToken, address newToken);
    event DividendPoolUpdated(address oldPool, address newPool);

    /**
     * @dev 构造函数
     */
    constructor() Ownable(msg.sender) {
        // 初始化，代币和分红池地址后续设置
    }

    /**
     * @dev 设置代币合约地址
     */
    function setToken(address _token) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        address oldToken = address(token);
        token = IERC20(_token);
        emit TokenUpdated(oldToken, _token);
    }

    /**
     * @dev 设置分红池地址
     */
    function setDividendPool(address _dividendPool) external onlyOwner {
        require(_dividendPool != address(0), "Invalid dividend pool address");
        address oldPool = dividendPool;
        dividendPool = _dividendPool;
        emit DividendPoolUpdated(oldPool, _dividendPool);
    }

    /**
     * @dev 燃烧代币并抽奖
     */
    function burnAndLottery(uint256 _amount) external nonReentrant whenNotPaused {
        require(address(token) != address(0), "Token not set");
        require(address(dividendPool) != address(0), "Dividend pool not set");
        require(_amount >= minBurnAmount, "Amount below minimum");
        require(_amount >= LOTTERY_PRICE, "Amount below lottery price");

        uint256 lotteryTimes = _amount / LOTTERY_PRICE;
        require(lotteryTimes > 0, "No lottery times");

        // 更新统计
        userTotalBurned[msg.sender] += _amount;
        totalBurned += _amount;
        _updateLeaderboard(msg.sender);

        // 执行抽奖
        for (uint256 i = 0; i < lotteryTimes; i++) {
            _executeLottery(msg.sender, LOTTERY_PRICE);
        }

        // 处理剩余代币
        uint256 remaining = _amount % LOTTERY_PRICE;
        if (remaining > 0) {
            _distributeTokens(remaining);
            userTotalBurned[msg.sender] += remaining;
            totalBurned += remaining;
        }

        userLotteryCount[msg.sender] += lotteryTimes;
    }

    /**
     * @dev 自动转入燃烧（不抽奖）
     */
    function autoDeposit(uint256 _amount) external nonReentrant whenNotPaused {
        require(address(token) != address(0), "Token not set");
        require(_amount >= minDepositAmount, "Amount below minimum");

        // 计算分配
        uint256 toDead = (_amount * 70) / 100;
        uint256 toPool = (_amount * 30) / 100;

        // 更新统计
        totalBurned += _amount;
        totalToDead += toDead;
        totalToPool += toPool;

        // 记录存款
        userDeposits[msg.sender].push(Deposit({
            amount: _amount,
            burned: toDead,
            timestamp: block.timestamp
        }));

        // 转到黑洞
        if (toDead > 0) {
            token.safeTransferFrom(msg.sender, DEAD_ADDRESS, toDead);
        }

        // 转到分红池
        if (toPool > 0) {
            token.safeTransferFrom(msg.sender, dividendPool, toPool);
        }

        emit AutoDeposit(msg.sender, _amount, toDead, toPool, block.timestamp);
    }

    /**
     * @dev 执行单次抽奖
     */
    function _executeLottery(address _user, uint256 _amount) private {
        uint256 lotteryNumber = _generateLotteryNumber();

        LotteryEntry memory entry = LotteryEntry({
            user: _user,
            lotteryNumber: lotteryNumber,
            burnAmount: _amount,
            timestamp: block.timestamp
        });

        userLotteries[_user].push(entry);
        allLotteries.push(entry);
        totalLotteries++;

        _distributeTokens(_amount);

        emit BurnAndLottery(_user, _amount, lotteryNumber, block.timestamp);
    }

    /**
     * @dev 分配代币到黑洞和分红池
     */
    function _distributeTokens(uint256 _amount) private {
        uint256 toDead = (_amount * 70) / 100;
        uint256 toPool = (_amount * 30) / 100;

        token.safeTransferFrom(msg.sender, DEAD_ADDRESS, toDead);
        totalToDead += toDead;

        token.safeTransferFrom(msg.sender, dividendPool, toPool);
        totalToPool += toPool;
    }

    /**
     * @dev 生成随机抽奖号码
     */
    function _generateLotteryNumber() private view returns (uint256) {
        uint256 randomHash = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            allLotteries.length
        )));
        return MIN_LOTTERY_NUMBER + (randomHash % (MAX_LOTTERY_NUMBER - MIN_LOTTERY_NUMBER + 1));
    }

    /**
     * @dev 更新排行榜
     */
    function _updateLeaderboard(address _user) private {
        bool exists = false;
        for (uint256 i = 0; i < leaderboardAddresses.length; i++) {
            if (leaderboardAddresses[i] == _user) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            leaderboardAddresses.push(_user);
        }
    }

    /**
     * @dev 获取排行榜
     */
    function getLeaderboard(uint256 _limit) external view returns (address[] memory addresses, uint256[] memory amounts) {
        uint256 length = _limit > leaderboardAddresses.length ? leaderboardAddresses.length : _limit;
        addresses = new address[](length);
        amounts = new uint256[](length);

        address[] memory tempAddresses = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            tempAddresses[i] = leaderboardAddresses[i];
        }

        for (uint256 i = 0; i < length; i++) {
            for (uint256 j = i + 1; j < length; j++) {
                if (userTotalBurned[tempAddresses[i]] < userTotalBurned[tempAddresses[j]]) {
                    address temp = tempAddresses[i];
                    tempAddresses[i] = tempAddresses[j];
                    tempAddresses[j] = temp;
                }
            }
        }

        for (uint256 i = 0; i < length; i++) {
            addresses[i] = tempAddresses[i];
            amounts[i] = userTotalBurned[tempAddresses[i]];
        }
        return (addresses, amounts);
    }

    /**
     * @dev 获取用户抽奖记录
     */
    function getUserLotteries(address _user) external view returns (LotteryEntry[] memory) {
        return userLotteries[_user];
    }

    /**
     * @dev 获取用户自动燃烧记录
     */
    function getUserDeposits(address _user) external view returns (Deposit[] memory) {
        return userDeposits[_user];
    }

    /**
     * @dev 验证抽奖号码
     */
    function verifyLotteryNumber(uint256 _lotteryNumber) external view returns (LotteryEntry memory) {
        for (uint256 i = 0; i < allLotteries.length; i++) {
            if (allLotteries[i].lotteryNumber == _lotteryNumber) {
                return allLotteries[i];
            }
        }
        revert("Lottery number not found");
    }

    /**
     * @dev 获取分红池余额
     */
    function getDividendPoolBalance() external view returns (uint256) {
        return token.balanceOf(dividendPool);
    }

    /**
     * @dev 获取合约统计信息
     */
    function getContractStats() external view returns (
        uint256 _totalBurned,
        uint256 _totalToDead,
        uint256 _totalToPool,
        uint256 _dividendPoolBalance,
        uint256 _totalLotteries
    ) {
        return (
            totalBurned,
            totalToDead,
            totalToPool,
            token.balanceOf(dividendPool),
            totalLotteries
        );
    }

    /**
     * @dev 设置最小燃烧金额
     */
    function setMinBurnAmount(uint256 _minBurnAmount) external onlyOwner {
        minBurnAmount = _minBurnAmount;
    }

    /**
     * @dev 设置最小转入数量
     */
    function setMinDepositAmount(uint256 _minDepositAmount) external onlyOwner {
        minDepositAmount = _minDepositAmount;
    }

    /**
     * @dev 暂停合约
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev 恢复合约
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
