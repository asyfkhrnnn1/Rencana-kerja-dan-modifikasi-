const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (pool) return pool;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL belum diatur di Vercel Environment Variables');
  }

  const dbUrl = new URL(process.env.DATABASE_URL);

  pool = mysql.createPool({
    host: dbUrl.hostname,
    port: Number(dbUrl.port),
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.replace('/', '') || 'defaultdb',

    ssl: {
      // Aiven membutuhkan SSL.
      // Untuk tahap koneksi awal, ini dibuat false agar
      // koneksi tidak gagal karena masalah verifikasi CA.
      rejectUnauthorized: false
    },

    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
  });

  return pool;
}

async function createTable(db) {
  await db.execute(`
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
  `);
}

function formatArchive(row) {
  let checkpoints = row.checkpoints;

  if (typeof checkpoints === 'string') {
    try {
      checkpoints = JSON.parse(checkpoints);
    } catch (error) {
      checkpoints = [];
    }
  }

  return {
    ...row,
    checkpoints: checkpoints || []
  };
}

module.exports = async function handler(req, res) {
  // =========================
  // CORS
  // =========================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  // Preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let db;

  try {
    // =========================
    // DATABASE CONNECTION
    // =========================
    db = getPool();

    // Pastikan tabel tersedia
    await createTable(db);

    // =========================
    // GET
    // Ambil semua arsip
    // =========================
    if (req.method === 'GET') {
      const [rows] = await db.execute(`
        SELECT
          id,
          archive_date,
          mold_name,
          mold_job,
          mold_start_date,
          mold_end_date,
          checkpoints,
          created_at
        FROM mold_archives
        ORDER BY id DESC
      `);

      const formatted = rows.map(formatArchive);

      return res.status(200).json(formatted);
    }

    // =========================
    // POST
    // Simpan arsip baru
    // =========================
    if (req.method === 'POST') {
      const {
        id,
        archiveDate,
        moldName,
        moldJob,
        moldStartDate,
        moldEndDate,
        checkpoints
      } = req.body || {};

      // Validasi minimal
      if (!id || !moldName || !Array.isArray(checkpoints)) {
        return res.status(400).json({
          error: 'Data arsip tidak lengkap.'
        });
      }

      const query = `
        INSERT INTO mold_archives (
          id,
          archive_date,
          mold_name,
          mold_job,
          mold_start_date,
          mold_end_date,
          checkpoints
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        id,
        archiveDate || null,
        moldName,
        moldJob || '-',
        moldStartDate || '-',
        moldEndDate || '-',
        JSON.stringify(checkpoints)
      ];

      await db.execute(query, values);

      return res.status(200).json({
        success: true,
        message: 'Arsip berhasil disimpan.',
        id
      });
    }

    // =========================
    // DELETE
    // Hapus arsip
    // =========================
    if (req.method === 'DELETE') {
      let id = null;

      // Mendukung:
      // DELETE /api/archives?id=123
      if (req.query && req.query.id) {
        id = req.query.id;
      }

      // Fallback jika id datang dari URL
      if (!id && req.url) {
        const pathname = req.url.split('?')[0];
        const parts = pathname.split('/').filter(Boolean);

        if (parts.length > 2) {
          id = parts[parts.length - 1];
        }
      }

      if (!id) {
        return res.status(400).json({
          error: 'ID arsip tidak ditemukan.'
        });
      }

      const [result] = await db.execute(
        'DELETE FROM mold_archives WHERE id = ?',
        [id]
      );

      return res.status(200).json({
        success: true,
        deleted: result.affectedRows > 0,
        message:
          result.affectedRows > 0
            ? 'Arsip berhasil dihapus.'
            : 'Arsip tidak ditemukan.'
      });
    }

    // =========================
    // METHOD TIDAK DIDUKUNG
    // =========================
    return res.status(405).json({
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('DATABASE/API ERROR:', error);

    return res.status(500).json({
      error: 'Terjadi kesalahan pada server.',
      detail: error.message
    });
  }
};
