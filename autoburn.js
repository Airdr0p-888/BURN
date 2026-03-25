// 合约配置（部署后需要更新这些地址）
const CONFIG = {
    // 主网配置
    MAINNET: {
        TOKEN_ADDRESS: '0xbc55777b3e260ecd0c13c33d2c72767c34a7ffff', // 代币合约地址
        CONTRACT_ADDRESS: '0x937a489ed42E81D7F625F6EaFc94E9986483E2F9', // AutoBurn合约地址
        DIVIDEND_POOL_ADDRESS: '0x631B4A7c120E3C028fd7190A55f94395d8E21b4C', // 分红池地址
        CHAIN_ID: 56
    },
    // 测试网配置
    TESTNET: {
        TOKEN_ADDRESS: '0xbc55777b3e260ecd0c13c33d2c72767c34a7ffff',
        CONTRACT_ADDRESS: '0x937a489ed42E81D7F625F6EaFc94E9986483E2F9',
        DIVIDEND_POOL_ADDRESS: '0x631B4A7c120E3C028fd7190A55f94395d8E21b4C', // 分红池地址
        CHAIN_ID: 97
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
let statsRefreshInterval;
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
    const contractABI = getAutoBurnABI();

    if (!contract) {
        contract = new web3.eth.Contract(
            contractABI,
            network.CONTRACT_ADDRESS
        );
    }

    if (!tokenContract && network.TOKEN_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        const tokenABI = getTokenABI();
        tokenContract = new web3.eth.Contract(tokenABI, network.TOKEN_ADDRESS);
    }

    return { contract, tokenContract };
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

        // 加载数据
        loadUserData();
        loadContractStats();

        // 启动定时刷新
        startAutoRefresh();

        showNotification('钱包连接成功', 'success');
    }
}

// 设置最大转入数量
function setMaxAmount() {
    const balanceElement = document.getElementById('tokenBalance');
    const balance = parseFloat(balanceElement.textContent);
    document.getElementById('depositAmount').value = balance;
    updateDistributionPreview();
}

// 更新分配预览
function updateDistributionPreview() {
    const amount = parseFloat(document.getElementById('depositAmount').value) || 0;
    const burnAmount = amount * 0.7;
    const poolAmount = amount * 0.3;

    document.getElementById('burnAmount').textContent = burnAmount.toFixed(2);
    document.getElementById('poolAmount').textContent = poolAmount.toFixed(2);

    // 更新进度条
    const totalAmount = burnAmount + poolAmount;
    const burnPercent = totalAmount > 0 ? (burnAmount / totalAmount) * 100 : 70;
    const poolPercent = totalAmount > 0 ? (poolAmount / totalAmount) * 100 : 30;

    document.getElementById('burnFill').style.width = burnPercent + '%';
    document.getElementById('poolFill').style.width = poolPercent + '%';
}

// 转入代币
async function depositTokens() {
    if (!currentAccount) {
        showNotification('请先连接钱包', 'error');
        return;
    }

    const depositAmount = document.getElementById('depositAmount').value;
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
        showNotification('请输入转入数量', 'error');
        return;
    }

    const amountInWei = web3.utils.toWei(depositAmount, 'ether');
    const depositBtn = document.getElementById('depositBtn');
    depositBtn.disabled = true;
    depositBtn.textContent = '处理中...';

    try {
        // 首先授权合约使用代币
        const network = CONFIG[CONFIG.CURRENT_NETWORK];
        if (tokenContract) {
            const allowance = await tokenContract.methods
                .allowance(currentAccount, network.CONTRACT_ADDRESS)
                .call();

            if (parseInt(allowance) < parseInt(amountInWei)) {
                showNotification('请先授权合约使用代币', 'warning');
                await tokenContract.methods
                    .approve(network.CONTRACT_ADDRESS, amountInWei)
                    .send({ from: currentAccount });
                showNotification('授权成功，请再次点击转入', 'success');
                depositBtn.disabled = false;
                depositBtn.textContent = '🔥 立即转入燃烧';
                return;
            }
        }

        // 调用转入函数
        const result = await contract.methods
            .deposit(amountInWei)
            .send({ from: currentAccount });

        showNotification('转入成功！70%已燃烧', 'success');

        // 刷新数据
        loadUserData();
        loadContractStats();

    } catch (error) {
        console.error('Deposit error:', error);
        showNotification('转入失败：' + error.message, 'error');
    } finally {
        depositBtn.disabled = false;
        depositBtn.textContent = '🔥 立即转入燃烧';
    }
}

// 加载用户数据
async function loadUserData() {
    if (!currentAccount || !contract) return;

    try {
        // 获取代币余额
        if (tokenContract) {
            const balance = await tokenContract.methods
                .balanceOf(currentAccount)
                .call();
            document.getElementById('tokenBalance').textContent =
                web3.utils.fromWei(balance, 'ether');
        }

        // 获取用户转入记录
        const deposits = await contract.methods
            .getUserDeposits(currentAccount)
            .call();

        displayDepositHistory(deposits);

    } catch (error) {
        console.error('Load user data error:', error);
    }
}

// 显示转入历史
function displayDepositHistory(deposits) {
    const container = document.getElementById('depositHistory');

    if (!deposits || deposits.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无转入记录</div>';
        return;
    }

    const html = deposits.reverse().map(deposit => `
        <div class="history-item">
            <div class="history-header">
                <span class="history-amount">转入：${web3.utils.fromWei(deposit.amount, 'ether')}</span>
                <span class="history-timestamp">${new Date(parseInt(deposit.timestamp) * 1000).toLocaleString()}</span>
            </div>
            <div class="history-detail">
                <span class="history-burn">🔥 燃烧：${web3.utils.fromWei(deposit.burned, 'ether')}</span>
                <span class="history-pool">💰 留在合约：${(web3.utils.fromWei(deposit.amount, 'ether') - web3.utils.fromWei(deposit.burned, 'ether')).toFixed(2)}</span>
            </div>
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

        document.getElementById('totalDeposited').textContent = formatNumber(stats._totalDeposited);
        document.getElementById('totalBurned').textContent = formatNumber(stats._totalBurned);
        document.getElementById('totalToPool').textContent = formatNumber(stats._totalToPool);
        document.getElementById('contractBalance').textContent = formatNumber(stats._contractBalance);

    } catch (error) {
        console.error('Load contract stats error:', error);
    }
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
    if (statsRefreshInterval) clearInterval(statsRefreshInterval);
    statsRefreshInterval = setInterval(loadContractStats, 10000);
}

// 停止自动刷新
function stopAutoRefresh() {
    if (statsRefreshInterval) {
        clearInterval(statsRefreshInterval);
        statsRefreshInterval = null;
    }
}

// MaleBurnSystem合约ABI
function getAutoBurnABI() {
    return [
        {
            "inputs": [],
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
            "inputs": [{"internalType": "uint256", "name": "_amount", "type": "uint256"}],
            "name": "autoDeposit",
            "outputs": [],
            "stateMutability": "nonpayable",
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
                        {"internalType": "uint256", "name": "timestamp", "type": "uint256"}
                    ],
                    "internalType": "struct MaleBurnSystem.LotteryEntry[]",
                    "name": "",
                    "type": "tuple[]"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [{"internalType": "address", "name": "_user", "type": "address"}],
            "name": "getUserDeposits",
            "outputs": [
                {
                    "components": [
                        {"internalType": "uint256", "name": "amount", "type": "uint256"},
                        {"internalType": "uint256", "name": "burned", "type": "uint256"},
                        {"internalType": "uint256", "name": "timestamp", "type": "uint256"}
                    ],
                    "internalType": "struct MaleBurnSystem.Deposit[]",
                    "name": "",
                    "type": "tuple[]"
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
                {"internalType": "uint256", "name": "_totalToPool", "type": "uint256"},
                {"internalType": "uint256", "name": "_dividendPoolBalance", "type": "uint256"},
                {"internalType": "uint256", "name": "_totalLotteries", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "token",
            "outputs": [{"internalType": "contract IERC20", "name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "dividendPool",
            "outputs": [{"internalType": "address", "name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "totalBurned",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "totalToDead",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "totalToPool",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "totalLotteries",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "anonymous": false,
            "inputs": [
                {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
                {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
                {"indexed": false, "internalType": "uint256", "name": "burned", "type": "uint256"},
                {"indexed": false, "internalType": "uint256", "name": "toPool", "type": "uint256"},
                {"indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256"}
            ],
            "name": "AutoDeposit",
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
document.getElementById('depositAmount').addEventListener('input', updateDistributionPreview);

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
