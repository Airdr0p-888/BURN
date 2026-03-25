// 合约配置（部署后需要更新这些地址）
const CONFIG = {
    // 主网配置
    MAINNET: {
        TOKEN_ADDRESS: '0xbc55777b3e260ecd0c13c33d2c72767c34a7ffff', // 代币合约地址
        CONTRACT_ADDRESS: '0x937a489ed42E81D7F625F6EaFc94E9986483E2F9', // 燃烧系统合约地址
        CHAIN_ID: 56,
        WBNB_ADDRESS: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB地址
        PANCAKE_ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap路由地址
        USDT_ADDRESS: '0x55d398326f99059fF7D5480595aC247870f72', // USDT地址
        LOTTERY_PRICE_USDT: 100 // 抽奖价格（USDT）
    },
    // 测试网配置
    TESTNET: {
        TOKEN_ADDRESS: '0x0000000000000000000000000000000000000000', // 代币合约地址（请填入实际的代币地址）
        CONTRACT_ADDRESS: '0x937a489ed42E81D7F625F6EaFc94E9986483E2F9',
        CHAIN_ID: 97,
        WBNB_ADDRESS: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
        PANCAKE_ROUTER: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
        USDT_ADDRESS: '0x337610d27c682E347C9cD60BD4b3b1078c6D42',
        LOTTERY_PRICE_USDT: 100
    },
    // 当前使用网络
    CURRENT_NETWORK: 'MAINNET'
};

// 全局变量
let web3;
let accounts = [];
let currentAccount = null;
let contract;
let tokenContract;
let lotteryRefreshInterval;
let leaderboardRefreshInterval;
let currentTokenPrice = 0; // 当前代币价格

// 初始化Web3
async function initWeb3() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            web3 = new Web3(window.ethereum);
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            return true;
        } catch (error) {
            console.error('User denied account access');
            return false;
        }
    } else if (typeof window.web3 !== 'undefined') {
        web3 = new Web3(window.web3.currentProvider);
        return true;
    } else {
        showNotification('请安装MetaMask钱包', 'error');
        return false;
    }
}

// 获取合约实例
function getContractInstance() {
    const network = CONFIG[CONFIG.CURRENT_NETWORK];
    const contractABI = getBurnLotteryABI();

    if (!contract) {
        contract = new web3.eth.Contract(
            contractABI,
            network.CONTRACT_ADDRESS
        );
    }

    // 始终尝试创建 tokenContract，即使地址看起来像零地址
    if (!tokenContract) {
        try {
            const tokenABI = getTokenABI();
            tokenContract = new web3.eth.Contract(tokenABI, network.TOKEN_ADDRESS);
            console.log('Token Contract initialized:', network.TOKEN_ADDRESS);
        } catch (error) {
            console.error('Failed to initialize token contract:', error);
        }
    }

    return { contract, tokenContract };
}

// 获取代币价格（从PancakeSwap）
async function getTokenPrice() {
    const network = CONFIG[CONFIG.CURRENT_NETWORK];

    try {
        const routerContract = new web3.eth.Contract(getPancakeRouterABI(), network.PANCAKE_ROUTER);

        // 获取1个代币能换多少USDT
        const amountsOut = await routerContract.methods.getAmountsOut(
            web3.utils.toWei('1', 'ether'),
            [network.TOKEN_ADDRESS, network.WBNB_ADDRESS, network.USDT_ADDRESS]
        ).call();

        const tokenPriceInUSDT = web3.utils.fromWei(amountsOut[2], 'mwei'); // USDT是6位小数

        return parseFloat(tokenPriceInUSDT);
    } catch (error) {
        console.error('获取代币价格失败:', error);
        return 0.000001; // 返回默认价格
    }
}

// PancakeSwap Router ABI
function getPancakeRouterABI() {
    return [
        {
            "constant": true,
            "inputs": [
                {"name": "amountIn", "type": "uint256"},
                {"name": "path", "type": "address[]"}
            ],
            "name": "getAmountsOut",
            "outputs": [{"name": "amounts", "type": "uint256[]"}],
            "type": "function"
        }
    ];
}

// 连接钱包
async function connectWallet() {
    const success = await initWeb3();
    if (!success) return;

    accounts = await web3.eth.getAccounts();
    currentAccount = accounts[0];

    if (currentAccount) {
        document.getElementById('connectWalletBtn').textContent =
            `${currentAccount.substring(0, 6)}...${currentAccount.substring(currentAccount.length - 4)}`;
        document.getElementById('connectWalletBtn').classList.add('connected');

        // 初始化合约
        getContractInstance();

        // 获取代币价格
        currentTokenPrice = await getTokenPrice();

        // 加载数据
        loadUserData();
        loadContractStats();
        loadLeaderboard();
        loadAllLotteries();

        // 启动定时刷新
        startAutoRefresh();

        showNotification('钱包连接成功', 'success');
    }
}

// 设置最大燃烧数量
function setMaxAmount() {
    const balanceElement = document.getElementById('tokenBalance');
    const balance = parseFloat(balanceElement.textContent);
    document.getElementById('burnAmount').value = balance;
    updateLotteryTimes();
}

// 更新抽奖次数（根据代币价格计算）
function updateLotteryTimes() {
    const amount = parseFloat(document.getElementById('burnAmount').value) || 0;
    const price = currentTokenPrice || 0.000001;
    const valueInUSDT = amount * price;
    const times = Math.floor(valueInUSDT / CONFIG[CONFIG.CURRENT_NETWORK].LOTTERY_PRICE_USDT);

    document.getElementById('lotteryTimes').textContent = times;
    document.getElementById('lotteryTimes').dataset.value = times;

    // 更新提示信息
    const hint = document.getElementById('lotteryHint');
    if (hint) {
        hint.textContent = `${valueInUSDT.toFixed(4)} USDT`;
    }
}

// 燃烧代币并抽奖
async function burnAndLottery() {
    if (!currentAccount) {
        showNotification('请先连接钱包', 'error');
        return;
    }

    const burnAmount = document.getElementById('burnAmount').value;
    const network = CONFIG[CONFIG.CURRENT_NETWORK];
    const price = currentTokenPrice || 0.000001;
    const valueInUSDT = parseFloat(burnAmount) * price;
    const minRequiredTokens = network.LOTTERY_PRICE_USDT / price;

    if (!burnAmount || parseFloat(burnAmount) < minRequiredTokens) {
        showNotification(`最小燃烧价值为${network.LOTTERY_PRICE_USDT} USDT（约${minRequiredTokens.toFixed(2)}个代币）`, 'error');
        return;
    }

    const amountInWei = web3.utils.toWei(burnAmount, 'ether');
    const burnBtn = document.getElementById('burnBtn');
    burnBtn.disabled = true;
    burnBtn.textContent = '处理中...';

    try {
        // 首先授权合约使用代币
        if (tokenContract) {
            const allowance = await tokenContract.methods
                .allowance(currentAccount, network.CONTRACT_ADDRESS)
                .call();

            if (parseInt(allowance) < parseInt(amountInWei)) {
                showNotification('请先授权合约使用代币', 'warning');
                await tokenContract.methods
                    .approve(network.CONTRACT_ADDRESS, amountInWei)
                    .send({ from: currentAccount });
                showNotification('授权成功，请再次点击燃烧', 'success');
                burnBtn.disabled = false;
                burnBtn.textContent = '立即燃烧抽奖';
                return;
            }
        }

        // 调用燃烧抽奖函数
        const result = await contract.methods
            .burnAndLottery(amountInWei)
            .send({ from: currentAccount });

        const lotteryTimes = Math.floor(valueInUSDT / network.LOTTERY_PRICE_USDT);
        showNotification(`燃烧成功！获得${lotteryTimes}次抽奖机会`, 'success');

        // 刷新数据
        loadUserData();
        loadContractStats();

    } catch (error) {
        console.error('Burn error:', error);
        showNotification('燃烧失败：' + error.message, 'error');
    } finally {
        burnBtn.disabled = false;
        burnBtn.textContent = '立即燃烧抽奖';
    }
}

// 加载用户数据
async function loadUserData() {
    if (!currentAccount || !contract) return;

    try {
        const network = CONFIG[CONFIG.CURRENT_NETWORK];
        const price = currentTokenPrice || 0.000001;

        // 显示代币价格
        document.getElementById('tokenPrice').textContent = price.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 10
        });

        // 获取代币余额
        if (tokenContract) {
            const balance = await tokenContract.methods
                .balanceOf(currentAccount)
                .call();
            document.getElementById('tokenBalance').textContent =
                web3.utils.fromWei(balance, 'ether');
        }

        // 获取用户抽奖记录
        const lotteries = await contract.methods
            .getUserLotteries(currentAccount)
            .call();

        displayMyLotteries(lotteries);

    } catch (error) {
        console.error('Load user data error:', error);
    }
}

// 显示我的抽奖记录
function displayMyLotteries(lotteries) {
    const container = document.getElementById('myLotteriesList');

    if (!lotteries || lotteries.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无抽奖记录</div>';
        return;
    }

    const html = lotteries.reverse().map(lottery => `
        <div class="lottery-item">
            <div class="lottery-number">🎲 ${lottery.lotteryNumber}</div>
            <div class="lottery-amount">燃烧：${web3.utils.fromWei(lottery.burnAmount, 'ether')} U</div>
            <div class="lottery-time">${new Date(parseInt(lottery.timestamp) * 1000).toLocaleString()}</div>
        </div>
    `).join('');

    container.innerHTML = html;
}

// 加载合约统计数据
async function loadContractStats() {
    if (!contract) return;

    try {
        const stats = await contract.methods.getContractStats().call();

        // 格式化数字
        const formatNumber = (num) => {
            return parseFloat(web3.utils.fromWei(num, 'ether')).toLocaleString('zh-CN', {
                maximumFractionDigits: 2
            });
        };

        document.getElementById('totalBurned').textContent = formatNumber(stats._totalBurned) + ' U';
        document.getElementById('dividendPool').textContent = formatNumber(stats._dividendPoolBalance) + ' U';
        document.getElementById('totalLotteries').textContent = stats._totalLotteries;

    } catch (error) {
        console.error('Load contract stats error:', error);
    }
}

// 加载排行榜
async function loadLeaderboard() {
    if (!contract) return;

    try {
        const network = CONFIG[CONFIG.CURRENT_NETWORK];
        const price = currentTokenPrice || 0.000001;
        const [addresses, amounts] = await contract.methods.getLeaderboard(20).call();

        const tbody = document.getElementById('leaderboardBody');

        if (!addresses || addresses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">暂无数据</td></tr>';
            return;
        }

        const html = addresses.map((addr, index) => {
            const amountInUSDT = parseFloat(web3.utils.fromWei(amounts[index], 'ether')) * price;
            const lotteryCount = Math.floor(amountInUSDT / network.LOTTERY_PRICE_USDT);
            return `
                <tr>
                    <td class="rank rank-${index + 1}">${index + 1}</td>
                    <td class="address">${formatAddress(addr)}</td>
                    <td class="amount">${parseFloat(web3.utils.fromWei(amounts[index], 'ether')).toLocaleString()} U</td>
                    <td class="lottery-count">${lotteryCount} 次</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = html;

    } catch (error) {
        console.error('Load leaderboard error:', error);
    }
}

// 加载所有抽奖记录
let lotteryOffset = 0;
const LOTTERY_PAGE_SIZE = 10;

async function loadAllLotteries() {
    if (!contract) return;

    try {
        const lotteries = await contract.methods
            .getAllLotteries(lotteryOffset, LOTTERY_PAGE_SIZE)
            .call();

        displayAllLotteries(lotteries);

    } catch (error) {
        console.error('Load all lotteries error:', error);
    }
}

// 显示所有抽奖记录
function displayAllLotteries(lotteries) {
    const tbody = document.getElementById('allLotteriesBody');

    if (!lotteries || lotteries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">暂无数据</td></tr>';
        return;
    }

    const html = lotteries.map(lottery => `
        <tr>
            <td class="lottery-number">${lottery.lotteryNumber}</td>
            <td class="lottery-amount">${parseFloat(web3.utils.fromWei(lottery.burnAmount, 'ether')).toLocaleString()} U</td>
            <td class="lottery-time">${new Date(parseInt(lottery.timestamp) * 1000).toLocaleString()}</td>
            <td class="lottery-status ${lottery.claimed ? 'claimed' : 'pending'}">
                ${lottery.claimed ? '已领取' : '待领取'}
            </td>
        </tr>
    `).join('');

    tbody.innerHTML = html;
}

// 加载更多抽奖记录
function loadMoreLotteries() {
    lotteryOffset += LOTTERY_PAGE_SIZE;
    loadAllLotteries();
}

// 验证抽奖号码
async function verifyLotteryNumber() {
    const lotteryNumber = document.getElementById('verifyLotteryNumber').value;
    if (!lotteryNumber) {
        showNotification('请输入抽奖号码', 'warning');
        return;
    }

    try {
        const entry = await contract.methods.verifyLotteryNumber(lotteryNumber).call();

        const resultDiv = document.getElementById('verifyResult');
        resultDiv.innerHTML = `
            <div class="verify-success">
                <h4>✅ 验证成功</h4>
                <p><strong>用户地址：</strong>${formatAddress(entry.user)}</p>
                <p><strong>燃烧数量：</strong>${web3.utils.fromWei(entry.burnAmount, 'ether')} U</p>
                <p><strong>时间：</strong>${new Date(parseInt(entry.timestamp) * 1000).toLocaleString()}</p>
                <p><strong>状态：</strong>${entry.claimed ? '已领取' : '待领取'}</p>
            </div>
        `;

    } catch (error) {
        document.getElementById('verifyResult').innerHTML = `
            <div class="verify-error">
                <h4>❌ 验证失败</h4>
                <p>该抽奖号码不存在</p>
            </div>
        `;
    }
}

// 格式化地址
function formatAddress(address) {
    if (!address || address === '0x0000000000000000000000000000000000000000') {
        return '黑洞地址';
    }
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// 启动自动刷新
function startAutoRefresh() {
    // 每10秒刷新统计数据
    if (lotteryRefreshInterval) clearInterval(lotteryRefreshInterval);
    lotteryRefreshInterval = setInterval(loadContractStats, 10000);

    // 每30秒刷新排行榜
    if (leaderboardRefreshInterval) clearInterval(leaderboardRefreshInterval);
    leaderboardRefreshInterval = setInterval(loadLeaderboard, 30000);
}

// 停止自动刷新
function stopAutoRefresh() {
    if (lotteryRefreshInterval) {
        clearInterval(lotteryRefreshInterval);
        lotteryRefreshInterval = null;
    }
    if (leaderboardRefreshInterval) {
        clearInterval(leaderboardRefreshInterval);
        leaderboardRefreshInterval = null;
    }
}

// 合约ABI
function getBurnLotteryABI() {
    return [
        {
            "inputs": [
                {"internalType": "address", "name": "_token", "type": "address"},
                {"internalType": "address", "name": "_dividendPool", "type": "address"},
                {"internalType": "uint256", "name": "_minBurnAmount", "type": "uint256"}
            ],
            "stateMutability": "nonpayable",
            "type": "constructor"
        },
        {
            "inputs": [{"internalType": "uint256", "name": "_amount", "type": "uint256"}],
            "name": "burnAndLottery",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [{"internalType": "uint256", "name": "_limit", "type": "uint256"}],
            "name": "getLeaderboard",
            "outputs": [
                {"internalType": "address[]", "name": "addresses", "type": "address[]"},
                {"internalType": "uint256[]", "name": "amounts", "type": "uint256[]"}
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [{"internalType": "address", "name": "_user", "type": "address"}],
            "name": "getUserLotteries",
            "outputs": [
                {
                    "components": [
                        {"internalType": "address", "name": "user", "type": "address"},
                        {"internalType": "uint256", "name": "lotteryNumber", "type": "uint256"},
                        {"internalType": "uint256", "name": "burnAmount", "type": "uint256"},
                        {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
                        {"internalType": "bool", "name": "claimed", "type": "bool"}
                    ],
                    "internalType": "struct BurnLottery.LotteryEntry[]",
                    "name": "lotteries",
                    "type": "tuple[]"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "uint256", "name": "_startIndex", "type": "uint256"},
                {"internalType": "uint256", "name": "_limit", "type": "uint256"}
            ],
            "name": "getAllLotteries",
            "outputs": [
                {
                    "components": [
                        {"internalType": "address", "name": "user", "type": "address"},
                        {"internalType": "uint256", "name": "lotteryNumber", "type": "uint256"},
                        {"internalType": "uint256", "name": "burnAmount", "type": "uint256"},
                        {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
                        {"internalType": "bool", "name": "claimed", "type": "bool"}
                    ],
                    "internalType": "struct BurnLottery.LotteryEntry[]",
                    "name": "lotteries",
                    "type": "tuple[]"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [{"internalType": "uint256", "name": "_lotteryNumber", "type": "uint256"}],
            "name": "verifyLotteryNumber",
            "outputs": [
                {
                    "components": [
                        {"internalType": "address", "name": "user", "type": "address"},
                        {"internalType": "uint256", "name": "lotteryNumber", "type": "uint256"},
                        {"internalType": "uint256", "name": "burnAmount", "type": "uint256"},
                        {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
                        {"internalType": "bool", "name": "claimed", "type": "bool"}
                    ],
                    "internalType": "struct BurnLottery.LotteryEntry",
                    "name": "entry",
                    "type": "tuple"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "getContractStats",
            "outputs": [
                {"internalType": "uint256", "name": "_totalBurned", "type": "uint256"},
                {"internalType": "uint256", "name": "_totalToDead", "type": "uint256"},
                {"internalType": "uint256", "name": "_dividendPoolBalance", "type": "uint256"},
                {"internalType": "uint256", "name": "_totalLotteries", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "anonymous": false,
            "inputs": [
                {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
                {"indexed": false, "internalType": "uint256", "name": "burnAmount", "type": "uint256"},
                {"indexed": false, "internalType": "uint256", "name": "lotteryNumber", "type": "uint256"},
                {"indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256"}
            ],
            "name": "BurnAndLottery",
            "type": "event"
        }
    ];
}

// ERC20代币ABI
function getTokenABI() {
    return [
        {
            "constant": true,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "balance", "type": "uint256"}],
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {"name": "_spender", "type": "address"},
                {"name": "_value", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {"name": "_owner", "type": "address"},
                {"name": "_spender", "type": "address"}
            ],
            "name": "allowance",
            "outputs": [{"name": "", "type": "uint256"}],
            "type": "function"
        }
    ];
}

// 事件监听
document.getElementById('connectWalletBtn').addEventListener('click', connectWallet);

// 输入监听
document.getElementById('burnAmount').addEventListener('input', updateLotteryTimes);

// 页面加载完成
window.addEventListener('load', () => {
    // 检查是否已连接钱包
    if (typeof window.ethereum !== 'undefined') {
        window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
            if (accounts.length > 0) {
                connectWallet();
            }
        });
    }
});

// 网络切换监听
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
            location.reload();
        } else {
            currentAccount = null;
            stopAutoRefresh();
            document.getElementById('connectWalletBtn').textContent = '连接钱包';
            document.getElementById('connectWalletBtn').classList.remove('connected');
        }
    });

    window.ethereum.on('chainChanged', () => {
        location.reload();
    });
}
