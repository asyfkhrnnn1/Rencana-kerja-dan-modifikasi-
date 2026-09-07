const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Konfigurasi Koneksi MySQL Aiven dengan SSL REQUIRED
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect((err) => {
  if (err) {
    console.error('Koneksi database MySQL gagal:', err);
    return;
  }
  console.log('Berhasil terhubung ke database Aiven MySQL!');
  initDatabase();
});

// Buat tabel otomatis jika belum ada
function initDatabase() {
  const createArchivesTable = `
    CREATE TABLE IF NOT EXISTS archives (
      id BIGINT PRIMARY KEY,
      archive_date VARCHAR(100),
      mold_name VARCHAR(255),
      mold_job VARCHAR(255),
      mold_start_date VARCHAR(50),
      mold_end_date VARCHAR(50),
      checkpoints JSON
    );
  `;
  db.query(createArchivesTable, (err) => {
    if (err) console.error('Gagal membuat tabel archives:', err);
    else console.log('Tabel archives siap.');
  });
}

// ENDPOINT: Ambil semua data arsip
app.api = app.get('/api/archives', (req, res) => {
  db.query('SELECT * FROM archives ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Parse kembali JSON checkpoints
    const formatted = results.map(row => ({
      ...row,
      checkpoints: typeof row.checkpoints === 'string' ? JSON.parse(row.checkpoints) : row.checkpoints
    }));
    res.json(formatted);
  });
});

// ENDPOINT: Simpan arsip baru
app.post('/api/archives', (req, res) => {
  const { id, archiveDate, moldName, moldJob, moldStartDate, moldEndDate, checkpoints } = req.body;
  
  const query = 'INSERT INTO archives (id, archive_date, mold_name, mold_job, mold_start_date, mold_end_date, checkpoints) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const values = [id, archiveDate, moldName, moldJob, moldStartDate, moldEndDate, JSON.stringify(checkpoints)];

  db.query(query, values, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Arsip berhasil disimpan ke database online!' });
  });
});

// ENDPOINT: Hapus arsip
app.delete('/api/archives/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM archives WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Arsip berhasil dihapus.' });
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
