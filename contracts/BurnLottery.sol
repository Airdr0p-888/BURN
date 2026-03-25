// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title BurnLottery
 * @dev BSC代币燃烧抽奖合约
 */
contract BurnLottery is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // 代币合约地址
    IERC20 public immutable token;

    // 黑洞地址（BSC标准）
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // 分红池合约地址
    address public dividendPool;

    // 最小燃烧金额（100U的等值代币，部署时设置）
    uint256 public minBurnAmount;

    // 每次抽奖的价格（100U）
    uint256 public constant LOTTERY_PRICE = 100 * 10**18; // 假设价格稳定在1U=1代币

    // 抽奖号码范围
    uint256 public constant MIN_LOTTERY_NUMBER = 100000;
    uint256 public constant MAX_LOTTERY_NUMBER = 999999;

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
        bool claimed;
    }

    // 用户抽奖记录
    mapping(address => LotteryEntry[]) public userLotteries;

    // 所有抽奖记录（用于验证）
    LotteryEntry[] public allLotteries;

    // 排行榜数据
    address[] public leaderboardAddresses;

    // 分红池总代币数量
    uint256 public dividendPoolBalance;

    // 累计燃烧总量
    uint256 public totalBurned;

    // 累计黑洞转入量
    uint256 public totalToDead;

    // 事件
    event BurnAndLottery(
        address indexed user,
        uint256 burnAmount,
        uint256 lotteryNumber,
        uint256 timestamp
    );

    event DividendPoolUpdate(
        uint256 amount,
        uint256 newBalance,
        uint256 timestamp
    );

    event MinBurnAmountUpdated(uint256 oldAmount, uint256 newAmount);

    event DividendPoolChanged(address oldPool, address newPool);

    /**
     * @dev 构造函数
     * @param _token 代币合约地址
     * @param _dividendPool 分红池地址
     * @param _minBurnAmount 最小燃烧金额
     */
    constructor(
        address _token,
        address _dividendPool,
        uint256 _minBurnAmount
    ) Ownable(msg.sender) {
        require(_token != address(0), "Invalid token address");
        require(_dividendPool != address(0), "Invalid dividend pool address");

        token = IERC20(_token);
        dividendPool = _dividendPool;
        minBurnAmount = _minBurnAmount;
    }

    /**
     * @dev 燃烧代币并抽奖
     * @param _amount 燃烧代币数量
     */
    function burnAndLottery(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount >= minBurnAmount, "Amount below minimum");
        require(_amount >= LOTTERY_PRICE, "Amount below lottery price");

        // 计算抽奖次数
        uint256 lotteryTimes = _amount / LOTTERY_PRICE;
        require(lotteryTimes > 0, "No lottery times");

        // 更新用户燃烧总量
        userTotalBurned[msg.sender] += _amount;
        totalBurned += _amount;

        // 更新排行榜（如果不在排行榜中则添加）
        _updateLeaderboard(msg.sender);

        // 执行多次抽奖
        for (uint256 i = 0; i < lotteryTimes; i++) {
            _executeLottery(msg.sender, LOTTERY_PRICE);
        }

        // 处理剩余代币（如果有）
        uint256 remaining = _amount % LOTTERY_PRICE;
        if (remaining > 0) {
            _distributeTokens(remaining);
            userTotalBurned[msg.sender] += remaining;
            totalBurned += remaining;
        }

        // 更新用户抽奖次数
        userLotteryCount[msg.sender] += lotteryTimes;
    }

    /**
     * @dev 执行单次抽奖
     * @param _user 用户地址
     * @param _amount 燃烧金额
     */
    function _executeLottery(address _user, uint256 _amount) private {
        // 生成随机抽奖号码
        uint256 lotteryNumber = _generateLotteryNumber();

        // 创建抽奖记录
        LotteryEntry memory entry = LotteryEntry({
            user: _user,
            lotteryNumber: lotteryNumber,
            burnAmount: _amount,
            timestamp: block.timestamp,
            claimed: false
        });

        // 存储抽奖记录
        userLotteries[_user].push(entry);
        allLotteries.push(entry);

        // 分配代币（70%到黑洞，30%到分红池）
        _distributeTokens(_amount);

        // 触发事件
        emit BurnAndLottery(_user, _amount, lotteryNumber, block.timestamp);
    }

    /**
     * @dev 分配代币到黑洞和分红池
     * @param _amount 总金额
     */
    function _distributeTokens(uint256 _amount) private {
        // 70% 转入黑洞
        uint256 toDead = (_amount * 70) / 100;
        // 30% 转入分红池
        uint256 toDividend = (_amount * 30) / 100;

        // 转账到黑洞
        token.safeTransferFrom(msg.sender, DEAD_ADDRESS, toDead);
        totalToDead += toDead;

        // 转账到分红池
        token.safeTransferFrom(msg.sender, dividendPool, toDividend);
        dividendPoolBalance += toDividend;

        // 更新分红池余额事件
        emit DividendPoolUpdate(toDividend, dividendPoolBalance, block.timestamp);
    }

    /**
     * @dev 生成随机抽奖号码
     * @return 随机号码
     */
    function _generateLotteryNumber() private view returns (uint256) {
        uint256 randomHash = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    msg.sender,
                    allLotteries.length
                )
            )
        );

        return MIN_LOTTERY_NUMBER + (randomHash % (MAX_LOTTERY_NUMBER - MIN_LOTTERY_NUMBER + 1));
    }

    /**
     * @dev 更新排行榜
     * @param _user 用户地址
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
     * @dev 获取排行榜（按燃烧量排序）
     * @param _limit 返回数量限制
     * @return addresses 地址数组
     * @return amounts 燃烧量数组
     */
    function getLeaderboard(uint256 _limit)
        external
        view
        returns (address[] memory addresses, uint256[] memory amounts)
    {
        uint256 length = _limit > leaderboardAddresses.length
            ? leaderboardAddresses.length
            : _limit;

        addresses = new address[](length);
        amounts = new uint256[](length);

        // 复制并排序
        address[] memory tempAddresses = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            tempAddresses[i] = leaderboardAddresses[i];
        }

        // 冒泡排序（简单实现）
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
     * @param _user 用户地址
     * @return lotteries 抽奖记录数组
     */
    function getUserLotteries(address _user)
        external
        view
        returns (LotteryEntry[] memory)
    {
        return userLotteries[_user];
    }

    /**
     * @dev 获取所有抽奖记录（用于验证）
     * @param _startIndex 起始索引
     * @param _limit 数量限制
     * @return lotteries 抽奖记录数组
     */
    function getAllLotteries(uint256 _startIndex, uint256 _limit)
        external
        view
        returns (LotteryEntry[] memory)
    {
        uint256 endIndex = _startIndex + _limit;
        if (endIndex > allLotteries.length) {
            endIndex = allLotteries.length;
        }

        LotteryEntry[] memory result = new LotteryEntry[](endIndex - _startIndex);
        for (uint256 i = _startIndex; i < endIndex; i++) {
            result[i - _startIndex] = allLotteries[i];
        }

        return result;
    }

    /**
     * @dev 验证抽奖号码
     * @param _lotteryNumber 抽奖号码
     * @return entry 抽奖记录
     */
    function verifyLotteryNumber(uint256 _lotteryNumber)
        external
        view
        returns (LotteryEntry memory)
    {
        for (uint256 i = 0; i < allLotteries.length; i++) {
            if (allLotteries[i].lotteryNumber == _lotteryNumber) {
                return allLotteries[i];
            }
        }
        revert("Lottery number not found");
    }

    /**
     * @dev 设置最小燃烧金额
     * @param _minBurnAmount 最小燃烧金额
     */
    function setMinBurnAmount(uint256 _minBurnAmount) external onlyOwner {
        uint256 oldAmount = minBurnAmount;
        minBurnAmount = _minBurnAmount;
        emit MinBurnAmountUpdated(oldAmount, _minBurnAmount);
    }

    /**
     * @dev 设置分红池地址
     * @param _dividendPool 分红池地址
     */
    function setDividendPool(address _dividendPool) external onlyOwner {
        address oldPool = dividendPool;
        dividendPool = _dividendPool;
        emit DividendPoolChanged(oldPool, _dividendPool);
    }

    /**
     * @dev 更新分红池余额（如果代币被外部转移）
     */
    function updateDividendPoolBalance() external {
        dividendPoolBalance = token.balanceOf(dividendPool);
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

    /**
     * @dev 获取合约统计信息
     */
    function getContractStats()
        external
        view
        returns (
            uint256 _totalBurned,
            uint256 _totalToDead,
            uint256 _dividendPoolBalance,
            uint256 _totalLotteries
        )
    {
        return (
            totalBurned,
            totalToDead,
            dividendPoolBalance,
            allLotteries.length
        );
    }
}
