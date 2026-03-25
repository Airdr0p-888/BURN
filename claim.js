// 合约配置（部署后需要更新这些地址）
const CONFIG = {
    // 主网配置
    MAINNET: {
        TOKEN_ADDRESS: '0x6f369e560602abbd6429e5d99dc8c17ed060ffff', // 代币合约地址
        CONTRACT_ADDRESS: '0x937a489ed42E81D7F625F6EaFc94E9986483E2F9', // 领取合约地址
        DIVIDEND_POOL_ADDRESS: '0x631B4A7c120E3C028fd7190A55f94395d8E21b4C', // 分红池地址
        CHAIN_ID: 56
    },
    // 测试网配置
    TESTNET: {
        TOKEN_ADDRESS: '0x6f369e560602abbd6429e5d99dc8c17ed060ffff',
        CONTRACT_ADDRESS: '0x937a489ed42E81D7F625F6EaFc94E9986483E2F9',
        DIVIDEND_POOL_ADDRESS: '0x631B4A7c120E3C028fd7190A55f94395d8E21b4C',
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
    const contractABI = getClaimABI();

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

        showNotification('钱包连接成功', 'success');
    }
}

// 领取代币
async function claimTokens() {
    if (!currentAccount) {
        showNotification('请先连接钱包', 'error');
        return;
    }

    const verifyCode = document.getElementById('verifyCode').value.trim();

    // 验证验证码格式
    if (!verifyCode) {
        showNotification('请输入验证码', 'error');
        return;
    }

    if (verifyCode.length !== 6) {
        showNotification('验证码长度必须为6位', 'error');
        return;
    }

    if (!/^[A-Z0-9]{6}$/.test(verifyCode.toUpperCase())) {
        showNotification('验证码格式不正确，请输入6位大写字母或数字', 'error');
        return;
    }

    const claimBtn = document.getElementById('claimBtn');
    claimBtn.disabled = true;
    claimBtn.textContent = '处理中...';

    try {
        // 调用合约的claimWithCode函数
        const result = await contract.methods
            .claimWithCode(verifyCode.toUpperCase())
            .send({ from: currentAccount });

        showNotification('领取成功！代币已到账', 'success');

        // 清空验证码输入
        document.getElementById('verifyCode').value = '';

        // 刷新数据
        loadUserData();

    } catch (error) {
        console.error('Claim error:', error);
        if (error.message.includes('already used')) {
            showNotification('验证码已使用', 'error');
        } else if (error.message.includes('expired')) {
            showNotification('验证码已过期', 'error');
        } else if (error.message.includes('invalid code')) {
            showNotification('验证码无效', 'error');
        } else {
            showNotification('领取失败：' + error.message, 'error');
        }
    } finally {
        claimBtn.disabled = false;
        claimBtn.textContent = '🎁 立即领取';
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

        // 获取用户领取记录
        const claims = await contract.methods
            .getUserClaims(currentAccount)
            .call();

        displayClaimHistory(claims);

    } catch (error) {
        console.error('Load user data error:', error);
    }
}

// 显示领取历史
function displayClaimHistory(claims) {
    const container = document.getElementById('claimHistory');

    if (!claims || claims.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无领取记录</div>';
        return;
    }

    const html = claims.reverse().map(claim => `
        <div class="history-item">
            <div class="history-header">
                <span class="history-amount">领取：${web3.utils.fromWei(claim.amount, 'ether')}</span>
                <span class="history-timestamp">${new Date(parseInt(claim.timestamp) * 1000).toLocaleString()}</span>
            </div>
            <div class="history-detail">
                <span>验证码：${claim.code}</span>
                <span>状态：已领取</span>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
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

// Claim合约ABI
function getClaimABI() {
    return [
        {
            "inputs": [
                {"internalType": "address", "name": "_token", "type": "address"},
                {"internalType": "address", "name": "_dividendPool", "type": "address"}
            ],
            "stateMutability": "nonpayable",
            "type": "constructor"
        },
        {
            "inputs": [{"internalType": "string", "name": "_code", "type": "string"}],
            "name": "claimWithCode",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "address", "name": "_user", "type": "address"},
                {"internalType": "uint256", "name": "_amount", "type": "uint256"},
                {"internalType": "string", "name": "_code", "type": "string"}
            ],
            "name": "generateClaimCode",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "address", "name": "_user", "type": "address"}
            ],
            "name": "getUserClaims",
            "outputs": [
                {
                    "components": [
                        {"internalType": "address", "name": "user", "type": "address"},
                        {"internalType": "uint256", "name": "amount", "type": "uint256"},
                        {"internalType": "string", "name": "code", "type": "string"},
                        {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
                        {"internalType": "bool", "name": "claimed", "type": "bool"}
                    ],
                    "internalType": "struct ClaimContract.Claim[]",
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
                {"internalType": "uint256", "name": "_totalClaims", "type": "uint256"},
                {"internalType": "uint256", "name": "_totalClaimed", "type": "uint256"}
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
            "anonymous": false,
            "inputs": [
                {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
                {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
                {"indexed": false, "internalType": "string", "name": "code", "type": "string"},
                {"indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256"}
            ],
            "name": "Claimed",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
                {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
                {"indexed": false, "internalType": "string", "name": "code", "type": "string"}
            ],
            "name": "ClaimCodeGenerated",
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
            "type": "function"}
    ];
}

// 事件监听
document.getElementById('connectWalletBtn').addEventListener('click', connectWallet);

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
            document.getElementById('connectWalletBtn').textContent = '连接钱包';
            document.getElementById('connectWalletBtn').classList.remove('connected');
        }
    });

    window.ethereum.on('chainChanged', () => {
        location.reload();
    });
}
