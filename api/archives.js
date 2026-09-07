const mysql = require('mysql2');

// Buat koneksi pool ke Aiven MySQL
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Buat tabel otomatis jika belum ada di database Aiven
  await new Promise((resolve) => {
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
    `, () => resolve());
  });

  // METHOD GET: Ambil semua arsip
  if (req.method === 'GET') {
    return new Promise((resolve) => {
      pool.query('SELECT * FROM mold_archives ORDER BY id DESC', (err, results) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return resolve();
        }
        const formatted = results.map(row => ({
          ...row,
          checkpoints: typeof row.checkpoints === 'string' ? JSON.parse(row.checkpoints) : row.checkpoints
        }));
        res.status(200).json(formatted);
        resolve();
      });
    });
  }

  // METHOD POST: Simpan arsip baru
  if (req.method === 'POST') {
    const { id, archiveDate, moldName, moldJob, moldStartDate, moldEndDate, checkpoints } = req.body;
    return new Promise((resolve) => {
      const query = `
        INSERT INTO mold_archives (id, archive_date, mold_name, mold_job, mold_start_date, mold_end_date, checkpoints) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [id, archiveDate, moldName, moldJob, moldStartDate, moldEndDate, JSON.stringify(checkpoints)];

      pool.query(query, values, (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return resolve();
        }
        res.status(200).json({ success: true });
        resolve();
      });
    });
  }

  // METHOD DELETE: Hapus arsip berdasarkan ID
  if (req.method === 'DELETE') {
    const id = req.query.id || req.url.split('/').pop();
    return new Promise((resolve) => {
      pool.query('DELETE FROM mold_archives WHERE id = ?', [id], (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return resolve();
        }
        res.status(200).json({ success: true });
        resolve();
      });
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
