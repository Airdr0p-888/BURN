# AutoBurn 合约使用指南

## 📋 目录
1. [合约概述](#合约概述)
2. [功能说明](#功能说明)
3. [部署步骤](#部署步骤)
4. [使用方法](#使用方法)
5. [API文档](#api文档)
6. [安全说明](#安全说明)

## 合约概述

AutoBurn 是一个自动燃烧合约，部署在币安智能链（BSC）上。

### 核心特性
- ✅ **自动燃烧**：用户转入代币自动燃烧70%
- ✅ **自动分配**：30%自动留在合约中
- ✅ **管理功能**：管理员可转出合约代币
- ✅ **安全防护**：重入攻击防护、暂停机制
- ✅ **透明公开**：所有操作链上可查

### 资金分配
```
用户转入 100 代币
    ↓
├── 70% (70 代币) → 转入黑洞地址 (0x0000...dEaD)
└── 30% (30 代币) → 留在合约中（管理员可转出）
```

## 功能说明

### 🔥 自动燃烧机制

1. **用户转入代币**
   - 调用 `deposit(amount)` 函数
   - 最小转入量：可配置（默认100代币）

2. **自动分配**
   - 70% 转入黑洞地址永久销毁
   - 30% 转入合约地址

3. **记录统计**
   - 累计转入量
   - 累计燃烧量
   - 累计留在合约量
   - 用户存款历史

### 👨‍💼 管理员功能

#### 转出代币
- `withdrawTokens(recipient, amount)` - 转出指定数量
- `withdrawAllTokens(recipient)` - 转出所有代币

#### 配置管理
- `setMinDepositAmount(amount)` - 设置最小转入量

#### 紧急控制
- `pause()` - 暂停合约
- `unpause()` - 恢复合约

## 部署步骤

### 1. 环境准备

#### 安装依赖
```bash
npm install
```

#### 配置环境变量
复制 `.env.example` 为 `.env` 并填写：

```env
# AutoBurn 配置
AUTOBURN_TOKEN_ADDRESS=0x你的代币合约地址
AUTOBURN_MIN_DEPOSIT=100000000000000000000  # 100代币

# 其他配置
PRIVATE_KEY=你的私钥
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSCSCAN_API_KEY=你的API密钥
```

### 2. 编译合约
```bash
npm run compile
```

### 3. 部署合约

#### 测试网部署
```bash
npm run deploy:autoburn:testnet
```

#### 主网部署
```bash
npm run deploy:autoburn:mainnet
```

### 4. 验证合约
部署脚本会自动验证合约。如需手动验证：

```bash
npx hardhat verify --network bsc <合约地址> <代币地址> <最小转入量>
```

## 使用方法

### 🔄 用户操作

#### 转入代币
```javascript
// 授权合约使用代币
await tokenContract.approve(contractAddress, amount);

// 转入代币（自动燃烧70%，30%留在合约）
await autoBurnContract.deposit(amount);
```

### 👨‍💼 管理员操作

#### 转出指定数量
```javascript
// 转出1000代币到指定地址
await autoBurnContract.withdrawTokens(recipient, 1000);
```

#### 转出所有代币
```javascript
// 转出合约中所有代币
await autoBurnContract.withdrawAllTokens(recipient);
```

#### 设置最小转入量
```javascript
// 设置最小转入量为50代币
await autoBurnContract.setMinDepositAmount(50 * 10**18);
```

#### 暂停/恢复合约
```javascript
// 暂停合约（暂停转入）
await autoBurnContract.pause();

// 恢复合约
await autoBurnContract.unpause();
```

### 📊 查询操作

#### 获取用户存款记录
```javascript
const deposits = await autoBurnContract.getUserDeposits(userAddress);
deposits.forEach(deposit => {
    console.log("转入数量:", deposit.amount);
    console.log("燃烧数量:", deposit.burned);
    console.log("时间:", deposit.timestamp);
});
```

#### 获取合约统计
```javascript
const stats = await autoBurnContract.getContractStats();
console.log("总转入:", stats._totalDeposited);
console.log("总燃烧:", stats._totalBurned);
console.log("总留在合约:", stats._totalToPool);
console.log("合约余额:", stats._contractBalance);
```

#### 获取合约代币余额
```javascript
const balance = await autoBurnContract.contractTokenBalance();
```

## API文档

### 公开函数

#### deposit
用户转入代币（自动燃烧70%，30%留在合约）

**参数：**
- `amount` (uint256): 转入数量

**要求：**
- `amount >= minDepositAmount`
- 合约未暂停
- 已授权合约使用代币

**事件：**
```solidity
event Deposited(
    address indexed user,
    uint256 amount,
    uint256 burned,
    uint256 toPool,
    uint256 timestamp
);
```

#### getUserDeposits
获取用户存款记录

**参数：**
- `user` (address): 用户地址

**返回：**
- `Deposit[]` - 存款记录数组

#### getContractStats
获取合约统计信息

**返回：**
- `_totalDeposited` (uint256): 总转入量
- `_totalBurned` (uint256): 总燃烧量
- `_totalToPool` (uint256): 总留在合约量
- `_contractBalance` (uint256): 合约当前余额
- `_depositCount` (uint256): 总存款次数

#### contractTokenBalance
获取合约代币余额

**返回：**
- `uint256` - 合约代币余额

### 管理员函数 (仅Owner)

#### withdrawTokens
转出指定数量的代币

**参数：**
- `recipient` (address): 接收地址
- `amount` (uint256): 转出数量

**要求：**
- 仅管理员可调用
- `recipient != address(0)`
- `amount > 0`
- 合约余额 >= amount

**事件：**
```solidity
event TokensWithdrawn(
    address indexed recipient,
    uint256 amount,
    uint256 timestamp
);
```

#### withdrawAllTokens
转出所有合约中的代币

**参数：**
- `recipient` (address): 接收地址

**要求：**
- 仅管理员可调用
- `recipient != address(0)`
- 合约余额 > 0

#### setMinDepositAmount
设置最小转入数量

**参数：**
- `minDepositAmount` (uint256): 最小转入数量

**要求：**
- 仅管理员可调用

**事件：**
```solidity
event MinDepositAmountUpdated(
    uint256 oldAmount,
    uint256 newAmount
);
```

#### pause
暂停合约

**要求：**
- 仅管理员可调用

**效果：**
- 暂停 `deposit()` 函数

#### unpause
恢复合约

**要求：**
- 仅管理员可调用

**效果：**
- 恢复 `deposit()` 函数

### 只读变量

- `token` (address): 代币合约地址
- `DEAD_ADDRESS` (address): 黑洞地址（常量）
- `minDepositAmount` (uint256): 最小转入数量
- `totalDeposited` (uint256): 累计总转入量
- `totalBurned` (uint256): 累计总燃烧量
- `totalToPool` (uint256): 累计总留在合约量

### 数据结构

#### Deposit
```solidity
struct Deposit {
    uint256 amount;      // 转入数量
    uint256 burned;      // 燃烧数量
    uint256 timestamp;   // 时间戳
}
```

## 安全说明

### 🔒 安全特性

1. **重入攻击防护**
   - 使用 `ReentrancyGuard` 保护关键函数
   - 防止恶意重入攻击

2. **暂停机制**
   - 管理员可暂停合约
   - 应对紧急情况

3. **权限控制**
   - 使用 `Ownable` 模式
   - 仅管理员可调用管理函数

4. **防尘攻击**
   - 设置最小转入量
   - 防止大量小额转账攻击

### ⚠️ 安全注意事项

#### 对于用户

1. **授权管理**
   - 只授权需要的金额
   - 定期检查授权情况

2. **交易确认**
   - 仔细检查交易详情
   - 确认合约地址正确

3. **网络选择**
   - 使用主网前先在测试网测试
   - 切换网络时注意资产安全

#### 对于管理员

1. **私钥安全**
   - 永远不要泄露私钥
   - 使用硬件钱包管理

2. **权限管理**
   - 谨慎设置管理权限
   - 考虑使用多签钱包

3. **转出代币**
   - 转出前仔细核对地址
   - 保留操作记录

4. **暂停使用**
   - 仅在紧急情况下使用
   - 暂停后及时通知用户

### 🛡️ 审计建议

部署前建议进行以下审计：

1. **代码审计**
   - 专业安全公司审计
   - 检查常见漏洞

2. **测试覆盖**
   - 编写完整测试用例
   - 覆盖所有场景

3. **Gas优化**
   - 合理优化Gas消耗
   - 考虑用户体验

## 常见问题

### Q1: 如何获取BSC测试币？
访问 [BSC测试网水龙头](https://testnet.bnbchain.org/faucet-smart)

### Q2: 合约部署失败怎么办？
检查：
- 私钥格式是否正确
- 网络配置是否正确
- Gas费用是否充足
- 账户是否有足够BNB

### Q3: 如何验证合约？
```bash
npx hardhat verify --network bsc <合约地址> <代币地址> <最小转入量>
```

### Q4: 管理员如何转出代币？
```javascript
// 转出指定数量
await autoBurnContract.withdrawTokens(recipient, amount);

// 转出所有
await autoBurnContract.withdrawAllTokens(recipient);
```

### Q5: 可以修改燃烧比例吗？
不行，燃烧比例（70%/30%）是固定的。如需修改比例，需要重新部署合约。

### Q6: 管理员可以转入代币吗？
管理员不能直接转入代币到合约。如需充值，使用普通地址转入即可，但不会有燃烧效果。

## 技术支持

如有问题请联系：
- 官方QQ群：10849696988
- 麻了官方Q群：1084969699

## 许可证

© 2024 麻了项目组. 保留所有权利.

---

**免责声明**：本合约仅供学习参考，使用前请充分了解相关风险，并进行专业审计。使用本合约所产生的任何损失，开发团队不承担责任。
