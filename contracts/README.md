# BSC燃烧抽奖合约部署指南

## 项目概述

这是一个基于BSC（币安智能链）的代币燃烧抽奖系统，包含智能合约和前端界面。

## 功能特性

### 🔥 智能合约功能
- **代币燃烧**：用户燃烧代币参与抽奖
- **抽奖系统**：燃烧100U代币获得1次抽奖机会
- **随机号码**：生成6位随机抽奖号码
- **黑洞销毁**：70%自动转入黑洞地址
- **分红池**：30%自动转入分红池
- **排行榜**：实时显示用户燃烧贡献排名
- **数据验证**：所有抽奖记录公开可验证

### 🎨 前端界面
- **Web3集成**：使用MetaMask连接钱包
- **实时统计**：显示累计燃烧、分红池余额、抽奖次数
- **排行榜**：实时更新的燃烧贡献排行榜
- **抽奖记录**：查看个人和历史抽奖记录
- **号码验证**：通过抽奖号码验证真实性

## 文件结构

```
project/
├── contracts/
│   ├── BurnLottery.sol          # 主合约
│   └── README.md                # 部署指南（本文件）
├── lottery.html                 # 抽奖系统页面
├── lottery.js                   # Web3交互逻辑
├── lottery-styles.css           # 抽奖系统样式
├── index.html                   # 介绍页面
├── styles.css                   # 介绍页面样式
├── script.js                    # 介绍页面交互
└── README.md                    # 项目说明
```

## 智能合约部署步骤

### 1. 准备工作

#### 安装依赖
```bash
npm install --save-dev hardhat
npm install @openzeppelin/contracts
npm install @nomiclabs/hardhat-etherscan
npm install dotenv
```

#### 创建Hardhat配置
创建文件 `hardhat.config.js`:

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
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    bsc: {
      url: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
      chainId: 56,
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

#### 创建环境变量文件
创建文件 `.env`:

```env
PRIVATE_KEY=你的私钥
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
BSCSCAN_API_KEY=你的BscScan API密钥
```

### 2. 部署合约

#### 编译合约
```bash
npx hardhat compile
```

#### 部署到测试网
```bash
npx hardhat run scripts/deploy.js --network bscTestnet
```

#### 部署到主网
```bash
npx hardhat run scripts/deploy.js --network bsc
```

### 3. 部署脚本

创建文件 `scripts/deploy.js`:

```javascript
const hre = require("hardhat");

async function main() {
  // 部署参数配置
  const TOKEN_ADDRESS = "0x..."; // 代币合约地址
  const DIVIDEND_POOL = "0x..."; // 分红池地址
  const MIN_BURN_AMOUNT = "100000000000000000000"; // 100U (假设1代币=1U)

  console.log("Deploying BurnLottery contract...");

  const BurnLottery = await hre.ethers.getContractFactory("BurnLottery");
  const burnLottery = await BurnLottery.deploy(
    TOKEN_ADDRESS,
    DIVIDEND_POOL,
    MIN_BURN_AMOUNT
  );

  await burnLottery.deployed();

  console.log("BurnLottery deployed to:", burnLottery.address);

  // 验证合约（主网）
  if (hre.network.name === "bsc") {
    console.log("Waiting for block confirmations...");
    await burnLottery.deployTransaction.wait(5);

    await hre.run("verify:verify", {
      address: burnLottery.address,
      constructorArguments: [
        TOKEN_ADDRESS,
        DIVIDEND_POOL,
        MIN_BURN_AMOUNT
      ]
    });
    console.log("Contract verified on BscScan");
  }

  // 保存部署信息
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: burnLottery.address,
    tokenAddress: TOKEN_ADDRESS,
    dividendPool: DIVIDEND_POOL,
    minBurnAmount: MIN_BURN_AMOUNT,
    deployer: await (await hre.ethers.getSigner()).getAddress(),
    timestamp: new Date().toISOString()
  };

  const fs = require("fs");
  fs.writeFileSync(
    `deployment-${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("Deployment info saved!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

## 前端配置

### 更新合约地址

在 `lottery.js` 中更新以下地址：

```javascript
const CONFIG = {
    MAINNET: {
        TOKEN_ADDRESS: '0x...你的代币合约地址',  // 替换为实际地址
        CONTRACT_ADDRESS: '0x...你的抽奖合约地址', // 替换为实际地址
        CHAIN_ID: 56
    },
    TESTNET: {
        TOKEN_ADDRESS: '0x...你的测试网代币地址',
        CONTRACT_ADDRESS: '0x...你的测试网抽奖合约地址',
        CHAIN_ID: 97
    },
    CURRENT_NETWORK: 'MAINNET' // 或 'TESTNET'
};
```

### 添加样式引用

在 `lottery.html` 的 `<head>` 中添加：

```html
<link rel="stylesheet" href="lottery-styles.css">
```

## 合约ABI导出

编译后，ABI文件位于 `artifacts/contracts/BurnLottery.sol/BurnLottery.json`

### 完整ABI使用

如果需要使用完整ABI，可以修改 `lottery.js`：

```javascript
async function getContractInstance() {
    // 导入完整ABI
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

## 合约主要函数

### 燃烧抽奖
```solidity
function burnAndLottery(uint256 _amount) external
```
- `_amount`: 燃烧的代币数量
- 最小燃烧量：100U

### 获取排行榜
```solidity
function getLeaderboard(uint256 _limit) external view returns (address[] memory, uint256[] memory)
```
- `_limit`: 返回数量限制

### 获取用户抽奖记录
```solidity
function getUserLotteries(address _user) external view returns (LotteryEntry[] memory)
```

### 验证抽奖号码
```solidity
function verifyLotteryNumber(uint256 _lotteryNumber) external view returns (LotteryEntry memory)
```

### 获取合约统计
```solidity
function getContractStats() external view returns (uint256, uint256, uint256, uint256)
```
返回：总燃烧量、转入黑洞量、分红池余额、总抽奖次数

## 安全注意事项

1. **私钥安全**：永远不要将私钥提交到Git
2. **测试先行**：先在测试网部署测试
3. **代码审计**：部署前进行代码审计
4. **权限管理**：谨慎设置合约管理员权限
5. **Gas费用**：确保有足够的BNB支付Gas费用

## 常见问题

### Q: 如何获取BSC测试币？
A: 访问 https://testnet.bnbchain.org/faucet-smart 获取测试BNB

### Q: 如何验证合约？
A: 使用 `npx hardhat verify` 命令，确保已配置BscScan API Key

### Q: 如何更新分红池地址？
A: 调用 `setDividendPool(address)` 函数（仅管理员）

### Q: 如何暂停合约？
A: 调用 `pause()` 函数（仅管理员）

## 联系支持

如有问题，请联系：
- 官方QQ群：10849696988
- 麻了官方Q群：1084969699

---

© 2024 麻了项目组. 保留所有权利.
