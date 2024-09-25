const { Client, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const xlsx = require('xlsx');
const db = require('./database'); // Import database

const client = new Client();

let saldoAdmin = 0; // Inisialisasi saldo admin
let categories = {}; // Menyimpan kategori dan anggota yang terdaftar

client.on('ready', async () => {
    console.log('Client sudah siap!');
    await loadCategories();
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('message_create', async message => {
    if (message.body === 'Ping') {
        message.reply('Tes Bot aja bro!');
    }

    // Format Job untuk rekap uang masuk
    const jobRegex = /Job:\s*(.*)\nHunter:\s*(.*)\nWorker:\s*(.*)\nFee:\s*(\d+)\nstatus:\s*selesai/i;

    if (jobRegex.test(message.body)) {
        const matches = message.body.match(jobRegex);
        const job = matches[1].trim();
        const hunter = matches[2].trim();
        const worker = matches[3].trim();
        const fee = parseInt(matches[4].trim());

        // Hitung pembagian fee
        const hunterFee = fee * 0.20;
        const workerFee = fee * 0.75;
        const adminFee = fee * 0.05;

        // Update saldo admin
        saldoAdmin += adminFee;

        // Simpan data transaksi ke database
        db.run(`INSERT INTO transactions (job, hunter, worker, fee, hunterFee, workerFee, adminFee, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [job, hunter, worker, fee, hunterFee, workerFee, adminFee, 'Selesai']);

        // Balas pesan
        message.reply(`Otw proses ya. Total fee: ${fee}\nHunter: ${hunterFee}\nWorker: ${workerFee}\nAdmin: ${adminFee}`);

        // Simpan data ke file Excel
        saveToExcel();
    } else if (message.body === '!download') {
        // Kirim file Excel jika ada file yang sudah dibuat
        if (fs.existsSync('rekap_transaksi.xlsx')) {
            const media = MessageMedia.fromFilePath('rekap_transaksi.xlsx');
            await client.sendMessage(message.from, media, { caption: 'Nih file yang kamu minta bro!' });
        } else {
            message.reply('Belum ada file rekap transaksi bro.');
        }
    } else if (message.body === '!saldo') {
        // Balas pesan dengan saldo admin saat ini
        message.reply(`Saldo Admin sekarang: ${saldoAdmin}`);
    } else if (message.body.startsWith('!tambahSaldo')) {
        // Tambah saldo admin
        const amount = parseFloat(message.body.split(' ')[1]);
        if (!isNaN(amount) && amount > 0) {
            saldoAdmin += amount;
            message.reply(`Saldo Admin nambah ${amount}. Sekarang saldo Admin: ${saldoAdmin}`);
        } else {
            message.reply('Masukin jumlah yang valid buat nambah saldo.');
        }
    } else if (message.body === '!resetSaldo') {
        // Reset saldo admin
        saldoAdmin = 0;
        message.reply('Saldo Admin berhasil di-reset ke 0 bro.');
    } else if (message.body === '!menu') {
        // Menampilkan daftar command yang tersedia
        const menu = `
Daftar Command yang Tersedia:
1. Ping - Tes bot
2. !download - Mendownload file Excel rekap transaksi
3. !saldo - Menampilkan saldo Admin saat ini
4. !tambahSaldo [jumlah] - Menambahkan saldo admin
5. !resetSaldo - Mereset saldo admin jadi 0
6. !format - Memberikan template format transaksi
7. !tagall - Men-tag seluruh anggota grup
8. !tag [kategori] - Men-tag anggota yang terdaftar di kategori tertentu
9. !daftar [kategori] - Mendaftar ke kategori tertentu
10. !keluarKategori [kategori] - Keluar dari kategori tertentu
11. !tambahKategori [kategori] - Menambahkan kategori baru
12. !hapusKategori [kategori] - Menghapus kategori
13. !listKategori - Menampilkan daftar kategori yang tersedia
14. !pengumuman [pesan] - Mengirim pengumuman ke semua anggota grup
15. !menu - Menampilkan menu ini
        `;
        message.reply(menu);
    } else if (message.body === '!format') {
        // Menampilkan template format yang bisa dideteksi oleh bot
        const formatTemplate = `
Gunakan format berikut untuk memasukkan data transaksi:

Job: [Nama Pekerjaan]
Hunter: [Nama Hunter]
Worker: [Nama Worker]
Fee: [Total Fee]
status: selesai

        `;
        message.reply(formatTemplate);
    } else if (message.body === '!tagall') {
        // Tag seluruh anggota grup menggunakan nomor telepon
        const chat = await message.getChat();
        if (chat.isGroup) {
            let mentions = [];

            for (let participant of chat.participants) {
                mentions.push(participant.id._serialized); // Menggunakan ID WhatsApp langsung
            }

            let tagMessage = mentions.map(id => `@${id.split('@')[0]}`).join(' '); // Format @number

            await chat.sendMessage(tagMessage, { mentions });
        } else {
            message.reply('Command ini cuma bisa dipake di grup bro.');
        }
    } else if (message.body.startsWith('!tag ')) {
        // Tag anggota grup berdasarkan kategori
        const category = message.body.split(' ')[1];
        if (category && categories[category]) {
            const chat = await message.getChat();
            if (chat.isGroup) {
                let mentions = [];

                for (let contactId of categories[category]) {
                    mentions.push(contactId); // Gunakan ID WhatsApp langsung
                }

                let tagMessage = `Yang udah daftar kategori ${category}: ` + mentions.map(id => `@${id.split('@')[0]}`).join(' ');

                await chat.sendMessage(tagMessage, { mentions });
            } else {
                message.reply('Command ini cuma bisa dipake di grup.');
            }
        } else {
            message.reply(`Kategori ${category} ga ada bro.`);
        }
    } else if (message.body.startsWith('!daftar ')) {
        // Mendaftar ke kategori
        const category = message.body.split(' ')[1];
        if (category) {
            const chat = await message.getChat();
            if (chat.isGroup) {
                const contactId = chat.participants.find(participant => participant.id._serialized === message.author).id._serialized;

                if (!categories[category]) {
                    categories[category] = [];
                }

                if (!categories[category].includes(contactId)) {
                    categories[category].push(contactId);
                    db.run(`INSERT INTO category_members (category, contactId) VALUES (?, ?)`, [category, contactId]);
                    message.reply(`Kamu udah terdaftar di kategori ${category}.`);
                } else {
                    message.reply('Kamu udah daftar dikategori ini, daftar di kategori lain bro!');
                }
            } else {
                message.reply('Command ini cuma bisa dipake di grup.');
            }
        } else {
            message.reply('Sebutkan kategori yang pengen kamu daftar.');
        }
    } else if (message.body.startsWith('!keluarKategori ')) {
        // Keluar dari kategori
        const category = message.body.split(' ')[1];
        if (category && categories[category]) {
            const chat = await message.getChat();
            if (chat.isGroup) {
                const contactId = chat.participants.find(participant => participant.id._serialized === message.author).id._serialized;

                if (categories[category].includes(contactId)) {
                    categories[category] = categories[category].filter(id => id !== contactId);
                    db.run(`DELETE FROM category_members WHERE category = ? AND contactId = ?`, [category, contactId]);
                    message.reply(`Kamu udah keluar dari kategori ${category}.`);
                } else {
                    message.reply(`Kamu belum terdaftar di kategori ${category}.`);
                }
            } else {
                message.reply('Command ini cuma bisa dipake di grup.');
            }
        } else {
            message.reply(`Kategori ${category} ga ada bro.`);
        }
    } else if (message.body.startsWith('!tambahKategori ')) {
        // Menambahkan kategori baru
        const category = message.body.split(' ')[1];
        if (category) {
            db.run(`INSERT OR IGNORE INTO categories (name) VALUES (?)`, [category], function (err) {
                if (err) {
                    message.reply('Kategori ini udah ada bro, coba nama lain.');
                } else {
                    categories[category] = [];
                    message.reply(`Kategori ${category} udah ditambah.`);
                }
            });
        } else {
            message.reply('Sebutkan nama kategori yang pengen ditambah.');
        }
    } else if (message.body.startsWith('!hapusKategori ')) {
        // Menghapus kategori
        const category = message.body.split(' ')[1];
        if (category && categories[category]) {
            db.run(`DELETE FROM categories WHERE name = ?`, [category], function (err) {
                if (err) {
                    message.reply('Gagal menghapus kategori.');
                } else {
                    delete categories[category];
                    db.run(`DELETE FROM category_members WHERE category = ?`, [category]);
                    message.reply(`Kategori ${category} udah dihapus.`);
                }
            });
        } else {
            message.reply(`Kategori ${category} ga ada bro.`);
        }
    } else if (message.body.startsWith('!pengumuman ')) {
        // Mengirim pengumuman ke semua anggota grup
        const announcement = message.body.replace('!pengumuman ', '').trim();
        const chat = await message.getChat();
        if (chat.isGroup) {
            let mentions = [];

            for (let participant of chat.participants) {
                mentions.push(participant.id._serialized);
            }

            let tagMessage = `📢 Pengumuman: ${announcement}\n` + mentions.map(id => `@${id.split('@')[0]}`).join(' ');

            await chat.sendMessage(tagMessage, { mentions });
        } else {
            message.reply('Command ini cuma bisa dipake di grup bro.');
        }
    }
});

// Fungsi untuk menyimpan data transaksi ke Excel
function saveToExcel() {
    db.all(`SELECT * FROM transactions`, (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }

        const ws = xlsx.utils.json_to_sheet(rows);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'Transaksi');
        xlsx.writeFile(wb, 'rekap_transaksi.xlsx');
    });
}

// Fungsi untuk memuat kategori dan anggotanya dari database
async function loadCategories() {
    const rows = await new Promise((resolve, reject) => {
        db.all(`SELECT name FROM categories`, (err, rows) => {
            if (err) {
                reject(err);
            }
            resolve(rows);
        });
    });

    for (let row of rows) {
        const category = row.name;
        const members = await new Promise((resolve, reject) => {
            db.all(`SELECT contactId FROM category_members WHERE category = ?`, [category], (err, rows) => {
                if (err) {
                    reject(err);
                }
                resolve(rows.map(row => row.contactId));
            });
        });
        categories[category] = members;
    }
}

// Jalankan client
client.initialize();
