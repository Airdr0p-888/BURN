const hre = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("=".repeat(70));
  console.log("🚀 开始部署 AutoBurn 合约");
  console.log("=".repeat(70));

  // 部署参数配置
  const config = {
    TOKEN_ADDRESS: process.env.AUTOBURN_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
    MIN_DEPOSIT_AMOUNT: process.env.AUTOBURN_MIN_DEPOSIT || "100000000000000000000" // 100U
  };

  console.log("\n📋 部署配置:");
  console.log("   代币地址:", config.TOKEN_ADDRESS);
  console.log("   最小转入量:", config.MIN_DEPOSIT_AMOUNT, "(wei)");
  console.log("   网络:", hre.network.name);
  console.log("   Chain ID:", hre.network.config.chainId);

  // 验证配置
  if (config.TOKEN_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.log("\n⚠️  警告: 代币地址为空，请确保这是正确的！");
  }

  console.log("\n🔄 部署中...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("   部署地址:", deployer.address);
  console.log("   余额:", hre.ethers.utils.formatEther(await deployer.getBalance()), "BNB");

  // 部署合约
  const AutoBurn = await hre.ethers.getContractFactory("AutoBurn");
  const autoBurn = await AutoBurn.deploy(
    config.TOKEN_ADDRESS,
    config.MIN_DEPOSIT_AMOUNT
  );

  await autoBurn.deployed();

  console.log("\n✅ 合约部署成功！");
  console.log("   合约地址:", autoBurn.address);
  console.log("   交易哈希:", autoBurn.deployTransaction.hash);

  // 获取合约信息
  const minDepositAmount = await autoBurn.minDepositAmount();
  const totalDeposited = await autoBurn.totalDeposited();
  const totalBurned = await autoBurn.totalBurned();
  const totalToPool = await autoBurn.totalToPool();
  const contractBalance = await autoBurn.contractTokenBalance();

  console.log("\n📊 合约初始状态:");
  console.log("   最小转入量:", hre.ethers.utils.formatEther(minDepositAmount), "代币");
  console.log("   总转入量:", hre.ethers.utils.formatEther(totalDeposited), "代币");
  console.log("   总燃烧量:", hre.ethers.utils.formatEther(totalBurned), "代币");
  console.log("   总留在合约量:", hre.ethers.utils.formatEther(totalToPool), "代币");
  console.log("   合约当前余额:", hre.ethers.utils.formatEther(contractBalance), "代币");

  // 保存部署信息
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    contractAddress: autoBurn.address,
    tokenAddress: config.TOKEN_ADDRESS,
    minDepositAmount: config.MIN_DEPOSIT_AMOUNT,
    deployer: deployer.address,
    deploymentTx: autoBurn.deployTransaction.hash,
    timestamp: new Date().toISOString(),
    contractType: "AutoBurn"
  };

  const fs = require("fs");
  const deploymentFile = `deployment-autoburn-${hre.network.name}.json`;
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 部署信息已保存到:", deploymentFile);

  // 生成前端配置
  const frontendConfig = `// 自动生成的前端配置
const AUTOBURN_CONFIG = {
  ${hre.network.name.toUpperCase()}: {
    TOKEN_ADDRESS: '${config.TOKEN_ADDRESS}',
    CONTRACT_ADDRESS: '${autoBurn.address}',
    CHAIN_ID: ${hre.network.config.chainId},
    MIN_DEPOSIT: '${config.MIN_DEPOSIT_AMOUNT}'
  }
};

// 请将此配置复制到前端配置文件中
`;

  fs.writeFileSync(`frontend-autoburn-${hre.network.name}.js`, frontendConfig);
  console.log("💾 前端配置已保存到:", `frontend-autoburn-${hre.network.name}.js`);

  // 主网验证
  if (hre.network.name === "bsc") {
    console.log("\n🔍 准备验证合约...");
    console.log("   等待5个区块确认...");

    try {
      await autoBurn.deployTransaction.wait(5);

      console.log("\n📝 验证合约...");

      await hre.run("verify:verify", {
        address: autoBurn.address,
        constructorArguments: [
          config.TOKEN_ADDRESS,
          config.MIN_DEPOSIT_AMOUNT
        ]
      });

      console.log("✅ 合约已验证！可在 BscScan 查看");
      console.log(`   https://bscscan.com/address/${autoBurn.address}`);

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
    console.log(`   https://testnet.bscscan.com/address/${autoBurn.address}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("🎉 部署完成！");
  console.log("=".repeat(70));
  console.log("\n📝 使用说明:");
  console.log("   1. 用户调用 deposit() 函数转入代币");
  console.log("   2. 自动燃烧70%到黑洞地址");
  console.log("   3. 30%留在合约中");
  console.log("   4. 管理员可调用 withdrawTokens() 转出合约代币");
  console.log("\n📚 管理员函数:");
  console.log("   - withdrawTokens(recipient, amount): 转出指定数量");
  console.log("   - withdrawAllTokens(recipient): 转出所有代币");
  console.log("   - setMinDepositAmount(amount): 设置最小转入量");
  console.log("   - pause(): 暂停合约");
  console.log("   - unpause(): 恢复合约");
  console.log("\n" + "=".repeat(70) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 部署失败:", error.message);
    console.error(error);
    process.exit(1);
  });
