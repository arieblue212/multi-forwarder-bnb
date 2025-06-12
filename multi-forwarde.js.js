import dotenv from 'dotenv';
import { ethers } from 'ethers';
import axios from 'axios';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const receiver = process.env.COMMON_RECEIVER;

const INTERVAL_MS = 15000;
const GAS_LIMIT = 21000n;

let lastErrors = {};

// Kirim notifikasi ke Telegram
async function sendTelegram(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message,
    });
  } catch (err) {
    console.error("❌ Gagal kirim Telegram:", err.message);
  }
}

// Kirim notifikasi error sekali
async function sendErrorOnce(wallet, message) {
  if (lastErrors[wallet] !== message) {
    lastErrors[wallet] = message;
    await sendTelegram(`❌ Error dari ${wallet}: ${message}`);
  } else {
    console.log(`⚠️ [${wallet}] Error sama, tidak kirim ulang`);
  }
}

// Fungsi forwarding satu wallet
async function forwardWallet(privateKey) {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = await wallet.getAddress();

    const balance = await provider.getBalance(address);
    const gasPriceHex = await provider.send("eth_gasPrice", []);
    const gasPrice = BigInt(gasPriceHex);

    const fee = gasPrice * GAS_LIMIT;

    if (balance <= fee) {
      console.log(`💤 [${address}] Saldo terlalu kecil (${ethers.formatEther(balance)} BNB)`);
      return;
    }

    const amount = balance - fee;

    const tx = await wallet.sendTransaction({
      to: receiver,
      value: amount,
      gasLimit: GAS_LIMIT,
      gasPrice: gasPrice,
    });

    const message = `✅ [${address}] Forward berhasil: ${ethers.formatEther(amount)} BNB\nTX: https://bscscan.com/tx/${tx.hash}`;
    console.log(message);
    await sendTelegram(message);

    lastErrors[address] = ""; // reset error jika sukses
  } catch (error) {
    const wallet = new ethers.Wallet(privateKey);
    const address = await wallet.getAddress();
    console.error(`❌ [${address}]`, error.message);
    await sendErrorOnce(address, error.message);
  }
}

// Ambil semua PRIVATE_KEY dari .env
function getPrivateKeys() {
  return Object.entries(process.env)
    .filter(([key]) => key.startsWith('PRIVATE_KEY_'))
    .map(([_, value]) => value);
}

console.log("🚀 Auto-forward aktif untuk semua wallet...");

setInterval(async () => {
  const keys = getPrivateKeys();
  for (const key of keys) {
    await forwardWallet(key);
  }
}, INTERVAL_MS);
