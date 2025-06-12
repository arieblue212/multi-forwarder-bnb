require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const COMMON_RECEIVER = process.env.COMMON_RECEIVER;

// Ambil semua PRIVATE_KEY_* dari process.env
const PRIVATE_KEYS = Object.entries(process.env)
  .filter(([key]) => key.startsWith('PRIVATE_KEY_'))
  .map(([_, value]) => value.trim())
  .filter(key => !!key && key.startsWith('0x') && key.length === 66);

// Inisialisasi wallet
const wallets = PRIVATE_KEYS.map(key => new ethers.Wallet(key, provider));

// Fungsi kirim notifikasi Telegram
async function sendTelegramMessage(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: message,
    });
  } catch (error) {
    console.error('❌ Gagal kirim ke Telegram:', error.message);
  }
}

// Fungsi forward BNB jika saldo cukup
async function forwardBNB(wallet) {
  const address = await wallet.getAddress();
  const balance = await provider.getBalance(address);

  if (balance.gt(ethers.utils.parseEther("0.001"))) {
    const gasLimit = 21000;
    const gasPrice = await provider.getGasPrice();
    const gasCost = gasLimit * gasPrice.toNumber();
    const value = balance.sub(gasCost);

    if (value.lte(0)) return;

    try {
      const tx = await wallet.sendTransaction({
        to: COMMON_RECEIVER,
        value,
        gasLimit,
        gasPrice
      });

      console.log(`✅ ${address} → ${COMMON_RECEIVER}\nTX: ${tx.hash}`);
      await sendTelegramMessage(`✅ ${address} → ${COMMON_RECEIVER}\nTX: ${tx.hash}`);
    } catch (error) {
      console.error(`❌ Error transfer dari ${address}: ${error.message}`);
      await sendTelegramMessage(`❌ Error dari ${address}: ${error.message}`);
    }
  } else {
    console.log(`ℹ️ Saldo ${address} terlalu kecil.`);
  }
}

// Loop setiap 20 detik
async function monitor() {
  console.log("🚀 Memulai monitoring semua wallet...");
  while (true) {
    for (const wallet of wallets) {
      await forwardBNB(wallet);
    }
    await new Promise(res => setTimeout(res, 20000)); // 20 detik
  }
}

monitor();
