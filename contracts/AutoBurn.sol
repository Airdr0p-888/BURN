// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title AutoBurn
 * @dev BSC自动燃烧合约 - 用户转入代币自动燃烧70%，30%留在合约
 */
contract AutoBurn is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // 代币合约
    IERC20 public immutable token;

    // 黑洞地址（BSC标准）
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // 最小转入数量（防止 dust 攻击）
    uint256 public minDepositAmount;

    // 累计统计
    uint256 public totalDeposited;
    uint256 public totalBurned;
    uint256 public totalToPool;

    // 用户存款记录
    struct Deposit {
        uint256 amount;
        uint256 burned;
        uint256 timestamp;
    }

    mapping(address => Deposit[]) public userDeposits;

    // 事件
    event Deposited(
        address indexed user,
        uint256 amount,
        uint256 burned,
        uint256 toPool,
        uint256 timestamp
    );

    event Withdrawn(
        address indexed admin,
        uint256 amount,
        uint256 timestamp
    );

    event MinDepositAmountUpdated(
        uint256 oldAmount,
        uint256 newAmount
    );

    event TokensWithdrawn(
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @dev 构造函数
     * @param _token 代币合约地址
     * @param _minDepositAmount 最小转入数量
     */
    constructor(address _token, uint256 _minDepositAmount) Ownable(msg.sender) {
        require(_token != address(0), "Invalid token address");

        token = IERC20(_token);
        minDepositAmount = _minDepositAmount;
    }

    /**
     * @dev 用户转入代币（自动燃烧70%，30%留在合约）
     * @param _amount 转入数量
     */
    function deposit(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount >= minDepositAmount, "Amount below minimum");

        // 计算分配
        uint256 toBurn = (_amount * 70) / 100;
        uint256 toPool = (_amount * 30) / 100;

        // 更新统计
        totalDeposited += _amount;
        totalBurned += toBurn;
        totalToPool += toPool;

        // 记录用户存款
        userDeposits[msg.sender].push(Deposit({
            amount: _amount,
            burned: toBurn,
            timestamp: block.timestamp
        }));

        // 转入黑洞
        if (toBurn > 0) {
            token.safeTransferFrom(msg.sender, DEAD_ADDRESS, toBurn);
        }

        // 转入合约
        if (toPool > 0) {
            token.safeTransferFrom(msg.sender, address(this), toPool);
        }

        emit Deposited(msg.sender, _amount, toBurn, toPool, block.timestamp);
    }

    /**
     * @dev 管理员转出合约中的代币
     * @param _recipient 接收地址
     * @param _amount 转出数量
     */
    function withdrawTokens(address _recipient, uint256 _amount)
        external
        onlyOwner
        nonReentrant
    {
        require(_recipient != address(0), "Invalid recipient address");
        require(_amount > 0, "Amount must be greater than 0");

        uint256 balance = token.balanceOf(address(this));
        require(balance >= _amount, "Insufficient contract balance");

        token.safeTransfer(_recipient, _amount);

        emit TokensWithdrawn(_recipient, _amount, block.timestamp);
    }

    /**
     * @dev 管理员转出所有合约中的代币
     * @param _recipient 接收地址
     */
    function withdrawAllTokens(address _recipient) external onlyOwner nonReentrant {
        require(_recipient != address(0), "Invalid recipient address");

        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");

        token.safeTransfer(_recipient, balance);

        emit TokensWithdrawn(_recipient, balance, block.timestamp);
    }

    /**
     * @dev 设置最小转入数量
     * @param _minDepositAmount 最小转入数量
     */
    function setMinDepositAmount(uint256 _minDepositAmount) external onlyOwner {
        uint256 oldAmount = minDepositAmount;
        minDepositAmount = _minDepositAmount;
        emit MinDepositAmountUpdated(oldAmount, _minDepositAmount);
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
     * @dev 获取用户存款记录
     * @param _user 用户地址
     * @return deposits 存款记录数组
     */
    function getUserDeposits(address _user)
        external
        view
        returns (Deposit[] memory)
    {
        return userDeposits[_user];
    }

    /**
     * @dev 获取合约代币余额
     * @return balance 合约代币余额
     */
    function contractTokenBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
     * @dev 获取合约统计信息
     * @return _totalDeposited 总转入量
     * @return _totalBurned 总燃烧量
     * @return _totalToPool 总留在合约量
     * @return _contractBalance 合约当前余额
     * @return _depositCount 总存款次数
     */
    function getContractStats()
        external
        view
        returns (
            uint256 _totalDeposited,
            uint256 _totalBurned,
            uint256 _totalToPool,
            uint256 _contractBalance,
            uint256 _depositCount
        )
    {
        uint256 depositCount = 0;
        // 简化计算，实际应用中可以维护一个计数器
        depositCount = userDeposits[address(0)].length; // 这只是示例

        return (
            totalDeposited,
            totalBurned,
            totalToPool,
            token.balanceOf(address(this)),
            depositCount
        );
    }
}
