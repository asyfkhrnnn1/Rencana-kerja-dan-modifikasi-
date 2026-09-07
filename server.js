const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Melayani file statis dari folder public atau root
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Koneksi ke Aiven MySQL menggunakan Environment Variable (DATABASE_URL)
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Buat tabel otomatis jika belum ada di database Aiven MySQL
pool.query(`
  CREATE TABLE IF NOT EXISTS mold_archives (
    id BIGINT PRIMARY KEY,
    archive_date VARCHAR(100),
    mold_name VARCHAR(255),
    mold_job VARCHAR(255),
    mold_start_date VARCHAR(100),
    mold_end_date VARCHAR(100),
    checkpoints JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) console.error("Gagal membuat tabel mold_archives:", err);
  else console.log("Tabel database Aiven siap digunakan!");
});

// API Endpoint: Ambil semua data arsip
app.get('/api/archives', (req, res) => {
  pool.query('SELECT * FROM mold_archives ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    // Parsing JSON checkpoints dari database
    const formatted = results.map(row => ({
      ...row,
      checkpoints: typeof row.checkpoints === 'string' ? JSON.parse(row.checkpoints) : row.checkpoints
    }));
    res.json(formatted);
  });
});

// API Endpoint: Simpan arsip baru
app.post('/api/archives', (req, res) => {
  const { id, archiveDate, moldName, moldJob, moldStartDate, moldEndDate, checkpoints } = req.body;
  const query = `
    INSERT INTO mold_archives (id, archive_date, mold_name, mold_job, mold_start_date, mold_end_date, checkpoints) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    id, 
    archiveDate, 
    moldName, 
    moldJob, 
    moldStartDate, 
    moldEndDate, 
    JSON.stringify(checkpoints)
  ];

  pool.query(query, values, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API Endpoint: Hapus arsip berdasarkan ID
app.delete('/api/archives/:id', (req, res) => {
  const { id } = req.params;
  pool.query('DELETE FROM mold_archives WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
