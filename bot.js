
require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const sqlite3 = require("sqlite3").verbose();
const { parseDuroodMessage } = require("./parser");

const db = new sqlite3.Database("durood.db");
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS counts (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, groupId TEXT, groupName TEXT, sender TEXT, personName TEXT, count INTEGER, raw TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)");
});

function todayStr() { return new Date().toISOString().split('T')[0]; }

async function getTotal(date, groupId = null) {
  return new Promise((resolve) => {
    let q = groupId ? "SELECT SUM(count) as total FROM counts WHERE date=? AND groupId=?" : "SELECT SUM(count) as total FROM counts WHERE date=?";
    let params = groupId ? [date, groupId] : [date];
    db.get(q, params, (err, row) => resolve(row?.total || 0));
  });
}
async function getMonthTotal(groupId = null) {
  return new Promise((resolve) => {
    const month = todayStr().slice(0,7);
    let q = groupId ? "SELECT SUM(count) as total FROM counts WHERE date LIKE ? AND groupId=?" : "SELECT SUM(count) as total FROM counts WHERE date LIKE ?";
    let params = groupId ? [month+'%', groupId] : [month+'%'];
    db.get(q, params, (err, row) => resolve(row?.total || 0));
  });
}
async function getAllTimeTotal() {
  return new Promise((resolve) => {
    db.get("SELECT SUM(count) as total FROM counts", (err, row) => resolve(row?.total || 0));
  });
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    browser: ["DuroodBot", "Chrome", "1.0"]
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Bot Connected! Ready to count Durood Pak');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue;
        const remoteJid = m.key.remoteJid;
        if (!remoteJid.endsWith('@g.us')) continue;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";
        if (!text || text.length < 2) continue;

        const lower = text.toLowerCase().trim();
        if (['total','hisab','hisaab','count','result','حساب'].includes(lower) || lower.includes('total btao')) {
            const todayTotal = await getTotal(todayStr(), remoteJid);
            const monthTotal = await getMonthTotal(remoteJid);
            const allTotal = await getAllTimeTotal();
            const reply = `📿 *Durood Pak Hisab*\n\n*Aaj ka Total (is group):* ${todayTotal.toLocaleString()}\n*Is Mahine ka (is group):* ${monthTotal.toLocaleString()}\n*All Groups Grand Total:* ${allTotal.toLocaleString()} / 20,000,000\n\nAllah qabool farmaye 🤲`;
            await sock.sendMessage(remoteJid, { text: reply });
            continue;
        }

        const parsed = await parseDuroodMessage(text);
        if (parsed.length === 0) continue;

        const groupName = (await sock.groupMetadata(remoteJid).catch(()=>({subject: remoteJid}))).subject || remoteJid;
        const sender = m.pushName || "Unknown";

        for (const item of parsed) {
          if (!item.count || item.count < 10) continue;
          db.run("INSERT INTO counts (date, groupId, groupName, sender, personName, count, raw) VALUES (?,?,?,?,?,?,?)",
            [todayStr(), remoteJid, groupName, sender, item.name, item.count, text.slice(0,500)]);
          console.log(`[${todayStr()}] ${groupName} | ${item.name}: ${item.count}`);
        }
      } catch (e) { console.log("msg error", e.message); }
    }
  });
}

startBot();
