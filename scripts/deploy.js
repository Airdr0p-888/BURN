const hre = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("=".repeat(70));
  console.log("🚀 开始部署 BurnLottery 合约");
  console.log("=".repeat(70));

  // 部署参数配置
  const config = {
    TOKEN_ADDRESS: process.env.TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
    DIVIDEND_POOL: process.env.DIVIDEND_POOL || "0x0000000000000000000000000000000000000000",
    MIN_BURN_AMOUNT: process.env.MIN_BURN_AMOUNT || "100000000000000000000" // 100U
  };

  console.log("\n📋 部署配置:");
  console.log("   代币地址:", config.TOKEN_ADDRESS);
  console.log("   分红池地址:", config.DIVIDEND_POOL);
  console.log("   最小燃烧量:", config.MIN_BURN_AMOUNT, "(wei)");
  console.log("   网络:", hre.network.name);
  console.log("   Chain ID:", hre.network.config.chainId);

  // 验证配置
  if (config.TOKEN_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.log("\n⚠️  警告: 代币地址为空，请确保这是正确的！");
  }

  if (config.DIVIDEND_POOL === "0x0000000000000000000000000000000000000000") {
    console.log("\n⚠️  警告: 分红池地址为空，请确保这是正确的！");
  }

  console.log("\n🔄 部署中...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("   部署地址:", deployer.address);
  console.log("   余额:", hre.ethers.utils.formatEther(await deployer.getBalance()), "BNB");

  // 部署合约
  const BurnLottery = await hre.ethers.getContractFactory("BurnLottery");
  const burnLottery = await BurnLottery.deploy(
    config.TOKEN_ADDRESS,
    config.DIVIDEND_POOL,
    config.MIN_BURN_AMOUNT
  );

  await burnLottery.deployed();

  console.log("\n✅ 合约部署成功！");
  console.log("   合约地址:", burnLottery.address);
  console.log("   交易哈希:", burnLottery.deployTransaction.hash);

  // 获取合约信息
  const minBurnAmount = await burnLottery.minBurnAmount();
  const dividendPool = await burnLottery.dividendPool();

  console.log("\n📊 合约初始状态:");
  console.log("   最小燃烧量:", hre.ethers.utils.formatEther(minBurnAmount), "代币");
  console.log("   分红池地址:", dividendPool);
  console.log("   黑洞地址: 0x000000000000000000000000000000000000dEaD");

  // 保存部署信息
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    contractAddress: burnLottery.address,
    tokenAddress: config.TOKEN_ADDRESS,
    dividendPool: config.DIVIDEND_POOL,
    minBurnAmount: config.MIN_BURN_AMOUNT,
    deployer: deployer.address,
    deploymentTx: burnLottery.deployTransaction.hash,
    timestamp: new Date().toISOString()
  };

  const fs = require("fs");
  const deploymentFile = `deployment-${hre.network.name}.json`;
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 部署信息已保存到:", deploymentFile);

  // 生成前端配置
  const frontendConfig = `// 自动生成的前端配置
const DEPLOYMENT_CONFIG = {
  ${hre.network.name.toUpperCase()}: {
    TOKEN_ADDRESS: '${config.TOKEN_ADDRESS}',
    CONTRACT_ADDRESS: '${burnLottery.address}',
    CHAIN_ID: ${hre.network.config.chainId}
  }
};

// 请将此配置复制到 lottery.js 的 CONFIG 对象中
`;

  fs.writeFileSync(`frontend-config-${hre.network.name}.js`, frontendConfig);
  console.log("💾 前端配置已保存到:", `frontend-config-${hre.network.name}.js`);

  // 主网验证
  if (hre.network.name === "bsc") {
    console.log("\n🔍 准备验证合约...");
    console.log("   等待5个区块确认...");

    try {
      await burnLottery.deployTransaction.wait(5);

      console.log("\n📝 验证合约...");

      await hre.run("verify:verify", {
        address: burnLottery.address,
        constructorArguments: [
          config.TOKEN_ADDRESS,
          config.DIVIDEND_POOL,
          config.MIN_BURN_AMOUNT
        ]
      });

      console.log("✅ 合约已验证！可在 BscScan 查看");
      console.log(`   https://bscscan.com/address/${burnLottery.address}`);

    } catch (error) {
      if (error.message.includes("Already Verified")) {
        console.log("✅ 合约已验证");
      } else {
        console.log("⚠️  验证失败，可以稍后手动验证");
        console.log("   错误:", error.message);
      }
    }
  } else if (hre.network.name === "bscTestnet") {
    console.log("\n📝 测试网验证...");
    console.log(`   https://testnet.bscscan.com/address/${burnLottery.address}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("🎉 部署完成！");
  console.log("=".repeat(70));
  console.log("\n📝 下一步:");
  console.log("   1. 更新 lottery.js 中的配置");
  console.log("   2. 在 BscScan 上验证合约");
  console.log("   3. 测试合约功能");
  console.log("   4. 更新前端界面");
  console.log("\n📚 详细文档请参阅:");
  console.log("   - CONTRACT_GUIDE.md (完整指南)");
  console.log("   - contracts/README.md (合约文档)");
  console.log("=" + "=".repeat(70) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 部署失败:", error.message);
    console.error(error);
    process.exit(1);
  });
