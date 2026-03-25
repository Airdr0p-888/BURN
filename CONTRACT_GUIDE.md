# BSC燃烧抽奖系统 - 完整指南

## 📋 目录
1. [项目概述](#项目概述)
2. [功能说明](#功能说明)
3. [合约部署](#合约部署)
4. [前端配置](#前端配置)
5. [使用说明](#使用说明)
6. [API文档](#api文档)
7. [安全说明](#安全说明)

## 项目概述

这是一个基于币安智能链（BSC）的去中心化燃烧抽奖系统，具有以下特点：

### 核心特性
- ✅ **透明燃烧**：所有燃烧记录公开可查
- ✅ **随机抽奖**：基于链上随机数生成抽奖号码
- ✅ **自动分配**：70%转入黑洞，30%进入分红池
- ✅ **实时排行**：燃烧贡献排行榜实时更新
- ✅ **数据验证**：通过抽奖号码验证真实性

## 功能说明

### 🔥 燃烧机制

1. **燃烧规则**
   - 最小燃烧量：100U代币
   - 每燃烧100U获得1次抽奖机会
   - 支持多次燃烧累积抽奖次数

2. **资金分配**
   - 70% → 转入黑洞地址永久销毁
   - 30% → 转入分红池用于分红

3. **抽奖号码**
   - 范围：100000 - 999999
   - 生成方式：基于区块信息哈希
   - 格式：6位数字

### 🏆 排行榜

- 显示前20名燃烧贡献者
- 实时更新燃烧数量
- 自动计算抽奖次数
- 按燃烧量降序排列

### 💰 分红池

- 实时显示分红池余额
- 所有燃烧的30%自动进入
- 可用于后续分红机制

## 合约部署

### 前置要求

1. 安装Node.js (v16+)
2. 安装MetaMask钱包
3. 准备BSC主网或测试网BNB

### 安装依赖

```bash
npm init -y
npm install --save-dev hardhat
npm install @openzeppelin/contracts
npm install @nomiclabs/hardhat-etherscan
npm install dotenv
npm install ethers
```

### 创建项目结构

```
project/
├── contracts/
│   ├── BurnLottery.sol
│   └── README.md
├── scripts/
│   └── deploy.js
├── hardhat.config.js
├── .env
└── package.json
```

### 配置Hardhat

创建 `hardhat.config.js`:

```javascript
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      gasPrice: 20000000000,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    bsc: {
      url: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      gasPrice: 5000000000,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_API_KEY,
      bsc: process.env.BSCSCAN_API_KEY
    }
  }
};
```

### 环境变量配置

创建 `.env` 文件：

```env
# 私钥（不要提交到Git）
PRIVATE_KEY=0x你的私钥

# RPC URL
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/

# BscScan API Key
BSCSCAN_API_KEY=你的API密钥

# 合约配置
TOKEN_ADDRESS=0x你的代币合约地址
DIVIDEND_POOL=0x你的分红池地址
MIN_BURN_AMOUNT=100000000000000000000
```

### 部署步骤

#### 1. 编译合约
```bash
npx hardhat compile
```

#### 2. 测试网部署（推荐先测试）
```bash
npx hardhat run scripts/deploy.js --network bscTestnet
```

#### 3. 主网部署
```bash
npx hardhat run scripts/deploy.js --network bsc
```

#### 4. 验证合约（主网）
```bash
npx hardhat verify --network bsc <合约地址> <参数1> <参数2> <参数3>
```

## 前端配置

### 更新配置文件

在 `lottery.js` 中更新以下配置：

```javascript
const CONFIG = {
    // 主网配置
    MAINNET: {
        TOKEN_ADDRESS: '0x...',           // 你的代币合约地址
        CONTRACT_ADDRESS: '0x...',        // 燃烧抽奖合约地址
        CHAIN_ID: 56
    },
    // 测试网配置
    TESTNET: {
        TOKEN_ADDRESS: '0x...',
        CONTRACT_ADDRESS: '0x...',
        CHAIN_ID: 97
    },
    // 当前使用的网络
    CURRENT_NETWORK: 'MAINNET'  // 或 'TESTNET'
};
```

### 添加合约ABI

选择以下方式之一：

#### 方式1：使用完整ABI
```javascript
async function getContractInstance() {
    const response = await fetch('./contracts/BurnLottery.json');
    const artifact = await response.json();
    const contractABI = artifact.abi;

    contract = new web3.eth.Contract(
        contractABI,
        network.CONTRACT_ADDRESS
    );

    return contract;
}
```

#### 方式2：使用内嵌ABI（当前方式）
合约ABI已内置在 `lottery.js` 中

## 使用说明

### 用户操作流程

1. **连接钱包**
   - 点击"连接钱包"按钮
   - 授权MetaMask访问
   - 确保切换到BSC网络

2. **授权代币**
   - 首次使用需要授权合约使用代币
   - 等待授权交易确认

3. **燃烧抽奖**
   - 输入燃烧数量（最小100U）
   - 查看预计抽奖次数
   - 点击"立即燃烧抽奖"
   - 确认交易

4. **查看结果**
   - 在"我的抽奖记录"中查看抽奖号码
   - 查看排行榜排名变化
   - 统计数据自动更新

### 管理员操作

#### 设置最小燃烧量
```solidity
function setMinBurnAmount(uint256 _minBurnAmount) external onlyOwner
```

#### 更新分红池地址
```solidity
function setDividendPool(address _dividendPool) external onlyOwner
```

#### 暂停/恢复合约
```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```

#### 更新分红池余额
```solidity
function updateDividendPoolBalance() external
```

## API文档

### 合约接口

#### burnAndLottery
燃烧代币并抽奖

**参数：**
- `_amount` (uint256): 燃烧的代币数量

**要求：**
- 数量 >= 最小燃烧量
- 已授权合约使用代币

#### getLeaderboard
获取排行榜

**参数：**
- `_limit` (uint256): 返回数量限制

**返回：**
- `addresses` (address[]): 用户地址数组
- `amounts` (uint256[]): 燃烧数量数组

#### getUserLotteries
获取用户抽奖记录

**参数：**
- `_user` (address): 用户地址

**返回：**
- `lotteries` (LotteryEntry[]): 抽奖记录数组

#### verifyLotteryNumber
验证抽奖号码

**参数：**
- `_lotteryNumber` (uint256): 抽奖号码

**返回：**
- `entry` (LotteryEntry): 抽奖记录

#### getContractStats
获取合约统计

**返回：**
- `_totalBurned` (uint256): 总燃烧量
- `_totalToDead` (uint256): 转入黑洞总量
- `_dividendPoolBalance` (uint256): 分红池余额
- `_totalLotteries` (uint256): 总抽奖次数

### 数据结构

#### LotteryEntry
```solidity
struct LotteryEntry {
    address user;          // 用户地址
    uint256 lotteryNumber; // 抽奖号码
    uint256 burnAmount;    // 燃烧数量
    uint256 timestamp;     // 时间戳
    bool claimed;          // 是否已领取
}
```

## 安全说明

### 智能合约安全

1. **重入攻击防护**
   - 使用 `ReentrancyGuard` 保护

2. **暂停机制**
   - 支持紧急暂停
   - 仅管理员可操作

3. **权限控制**
   - 关键函数使用 `onlyOwner`
   - 防止未授权访问

4. **溢出防护**
   - Solidity 0.8+ 内置溢出检查

### 用户安全

1. **私钥保护**
   - 永远不要泄露私钥
   - 使用硬件钱包存储大额资产

2. **授权管理**
   - 只授权需要的金额
   - 定期检查授权情况

3. **交易确认**
   - 仔细检查交易详情
   - 确认合约地址正确

4. **网络选择**
   - 使用主网前先在测试网测试
   - 切换网络时注意资产安全

### 开发者安全

1. **代码审计**
   - 部署前进行专业审计
   - 检查常见漏洞

2. **测试覆盖**
   - 编写完整测试用例
   - 覆盖所有功能

3. **Gas优化**
   - 合理优化Gas消耗
   - 考虑用户体验

## 常见问题

### Q1: 如何获取测试BNB？
访问 [BSC测试网水龙头](https://testnet.bnbchain.org/faucet-smart)

### Q2: 合约部署失败怎么办？
检查：
- 私钥格式是否正确
- 网络配置是否正确
- Gas费用是否充足
- 账户是否有足够BNB

### Q3: 如何验证合约？
使用BscScan验证或：
```bash
npx hardhat verify --network bsc <合约地址> <参数>
```

### Q4: 如何更新分红池余额？
调用 `updateDividendPoolBalance()` 函数

### Q5: 排行榜多久更新一次？
前端每30秒自动更新一次，用户也可手动刷新

## 技术支持

如有问题请联系：
- 官方QQ群：10849696988
- 麻了官方Q群：1084969699

## 许可证

© 2024 麻了项目组. 保留所有权利.

---

**免责声明**：本系统仅供学习参考，使用前请充分了解相关风险，并遵守当地法律法规。
