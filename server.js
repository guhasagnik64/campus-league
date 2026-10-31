import cron from 'node-cron';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let admin = null;

try {
  admin = require('firebase-admin');
  if (admin && admin.default) {
    admin = admin.default;
  }
} catch (e) {
  console.warn("⚠️ [FIREBASE WARNING] firebase-admin module not found or failed to load. Running in local fallback mode.");
}

// Safe Firebase Admin SDK Setup
// firebase-admin v14 moved the API surface: apps -> getApps(), credential.cert -> cert(),
// firestore() -> require('firebase-admin/firestore').getFirestore(). The old names no
// longer exist on the CJS export, so this block silently skipped init and every
// Firestore write fell into the no-op stub below.
const getAppsFn = admin && (admin.getApps || (() => admin.apps || []));
const certFn = admin && (admin.cert || (admin.credential && admin.credential.cert));

if (admin && getAppsFn && getAppsFn().length === 0) {
  let serviceAccount = null;
  if (process.env.FIREBASE_CREDENTIALS) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    } catch (err) {
      console.error("⚠️ Failed to parse FIREBASE_CREDENTIALS:", err.message);
    }
  } else {
    const credPath = path.join(process.cwd(), 'firebase_credentials.json');
    if (fs.existsSync(credPath)) {
      try {
        serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      } catch (err) {
        console.error("⚠️ Failed to parse firebase_credentials.json:", err.message);
      }
    }
  }
  try {
    if (serviceAccount && certFn) {
      admin.initializeApp({ credential: certFn(serviceAccount) });
    } else if (!serviceAccount) {
      admin.initializeApp();
    }
  } catch (err) {
    console.error("⚠️ Failed to initialize Firebase app:", err.message);
  }
}

// Safe Firestore & Admin exports fallback
let firestoreDb = null;
let firestoreFieldValue = null;
try {
  if (admin && getAppsFn && getAppsFn().length > 0) {
    const firestoreModule = require('firebase-admin/firestore');
    firestoreDb = firestoreModule.getFirestore ? firestoreModule.getFirestore() : admin.firestore();
    firestoreFieldValue = firestoreModule.FieldValue || (admin.firestore && admin.firestore.FieldValue);
  }
} catch (err) {
  console.error("⚠️ Failed to initialize Firestore client:", err.message);
}
if (!firestoreDb) {
  console.warn("⚠️ [FIREBASE WARNING] Firestore unavailable — persistence routes will serve empty stubs.");
  firestoreDb = {
    collection: () => ({
      doc: () => ({ set: async () => {}, get: async () => ({ exists: false }), update: async () => {} }),
      add: async () => {},
      get: async () => ({ docs: [] }),
      where: () => ({ get: async () => ({ docs: [] }) })
    })
  };
}
const firebaseAdmin = { firestore: { FieldValue: firestoreFieldValue || { serverTimestamp: () => new Date() } } };
// Resolve directory configurations for ES Modules syntax stability
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const STORAGE_CHAT_ID = process.env.STORAGE_CHAT_ID || "";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ========================================================================
// STATIC ASSET ROUTING
// ========================================================================

app.use(
  '/stream',
  express.static(path.join(__dirname, 'public'))
);

app.use(
  '/videos',
  express.static(path.join(__dirname, 'my_cloud_space'))
);

app.use(
  '/uploads',
  express.static(path.join(__dirname, 'public'))
);

// ========================================================================
// REQUIRED WORKING DIRECTORIES
// ========================================================================

const uploadDir = path.join(
  __dirname,
  'my_cloud_space'
);

const publicDir = path.join(
  __dirname,
  'public'
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true
  });
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, {
    recursive: true
  });
}

// ========================================================================
// VIDEO UPLOAD STORAGE
// ========================================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const cleanName =
      file.originalname.replace(
        /\s+/g,
        '_'
      );

    cb(null, cleanName);
  }
});

const upload = multer({
  storage
});

// ========================================================================
// PLAYER REFERENCE PHOTO STORAGE
// ========================================================================

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, publicDir);
  },

  filename: (req, file, cb) => {
    const ext =
      path.extname(
        file.originalname
      );

    const playerId =
      req.body.player_id ||
      req.body.playerName ||
      req.body.player ||
      'player';

    const cleanId =
      String(playerId).replace(
        /[^a-zA-Z0-9_-]/g,
        ''
      );

    const cleanName =
      `ref_${cleanId}_${Date.now()}${ext}`;

    cb(null, cleanName);
  }
});

const uploadPhoto = multer({
  storage: photoStorage
});

// ========================================================================
// HTTP + SOCKET.IO SERVER
// ========================================================================

const server =
  http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5177',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5177'
    ],

    methods: [
      'GET',
      'POST'
    ],

    credentials: true
  }
});

// ========================================================================
// REAL-TIME WEBSOCKETS DATA SYNC CHANNEL
// ========================================================================

io.on(
  'connection',
  (socket) => {
    console.log(
      `[SOCKET CONNECTED] Active Data Client Pipeline Established: ${socket.id}`
    );

    socket.on(
      'telemetry_stream',
      (data) => {
        io.emit(
          'ui_telemetry_broadcast',
          data
        );
      }
    );

    socket.on(
      'disconnect',
      () => {
        console.log(
          `[SOCKET DISCONNECTED] Client detached: ${socket.id}`
        );
      }
    );
  }
);

// ========================================================================
// 🎯 DYNAMIC DRILL CONFIGURATION ENDPOINTS
// ========================================================================

app.get(
  '/api/drills',
  async (req, res) => {
    try {
      const snapshot = await firestoreDb.collection('drills').get();
      const drills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({
        success: true,
        drills: drills || []
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
);

app.post(
  '/api/drills/configure',
  async (req, res) => {
    const {
      id,
      name,
      category,
      rules
    } = req.body;

    if (
      !id ||
      !name ||
      !rules
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Missing required drill configuration fields.'
      });
    }

    const rulesJsonString =
      typeof rules === 'string'
        ? rules
        : JSON.stringify(rules);

    try {
      await firestoreDb.collection('drills').doc(String(id)).set({
        id: String(id),
        name,
        category: category || 'custom',
        rules_json: rulesJsonString,
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      res.json({
        success: true,
        message:
          `Dynamic drill rule '${name}' configured successfully!`
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
);

// ========================================================================
// 📸 INTAKE & SINGLE PHOTO UPLOAD ENDPOINT
// ========================================================================

app.post(
  '/api/upload',
  uploadPhoto.any(),
  (req, res) => {
    if (
      !req.files ||
      req.files.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const uploadedFile =
      req.files[0];

    const fileUrl =
      `/uploads/${uploadedFile.filename}`;

    const playerName =
      req.body.playerName ||
      req.body.player ||
      'SA';

    try {
      const knownPlayersDir =
        path.join(
          __dirname,
          'Known_players'
        );

      if (
        !fs.existsSync(
          knownPlayersDir
        )
      ) {
        fs.mkdirSync(
          knownPlayersDir,
          {
            recursive: true
          }
        );
      }

      const cleanPlayerName =
        String(playerName).replace(
          /\s+/g,
          '_'
        );

      const targetPath =
        path.join(
          knownPlayersDir,
          `${cleanPlayerName}.jpg`
        );

      fs.copyFileSync(
        uploadedFile.path,
        targetPath
      );

      console.log(
        `📁 [INTAKE PERSISTED]: Saved profile photo to ${targetPath}`
      );

    } catch (copyErr) {
      console.error(
        '⚠️ [INTAKE COPY WARNING]: Failed to sync photo to Known_players:',
        copyErr
      );
    }

    return res.json({
      success: true,
      message:
        'Intake photo uploaded and synced to persistent player memory',
      url: fileUrl,
      filePath: fileUrl,
      filename:
        uploadedFile.filename
    });
  }
);

// ========================================================================
// 👕 ATTIRE CHECK-IN UPLOAD ROUTE
// ========================================================================

app.post(
  [
    '/api/upload-attire',
    '/api/attire-checkin'
  ],
  uploadPhoto.any(),
  (req, res) => {
    if (
      !req.files ||
      req.files.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'No attire photo uploaded.'
      });
    }

    const uploadedFile =
      req.files[0];

    const fileUrl =
      `/uploads/${uploadedFile.filename}`;

    const playerName =
      req.body.playerName ||
      req.body.player ||
      'Arin';

    try {
      const cleanPlayer =
        String(playerName)
          .toLowerCase()
          .replace(
            /\s+/g,
            '_'
          );

      const uploadsDir =
        path.join(
          publicDir,
          'uploads'
        );

      if (
        !fs.existsSync(
          uploadsDir
        )
      ) {
        fs.mkdirSync(
          uploadsDir,
          {
            recursive: true
          }
        );
      }

      const targetPath =
        path.join(
          uploadsDir,
          `${cleanPlayer}_attire.jpg`
        );

      fs.copyFileSync(
        uploadedFile.path,
        targetPath
      );

      console.log(
        `👕 [ATTIRE CHECK-IN PERSISTED]: Saved to ${targetPath}`
      );

    } catch (e) {
      console.error(
        '⚠️ [ATTIRE COPY WARNING]:',
        e.message
      );
    }

    return res.json({
      success: true,
      message:
        'Attire intake photo saved successfully!',
      imageUrl:
        fileUrl,
      url:
        fileUrl,
      filename:
        uploadedFile.filename
    });
  }
);

// ========================================================================
// 📸 PLAYER REFERENCE PHOTOS & RE-ID CACHE
// ========================================================================

app.post(
  '/api/players/register',
  uploadPhoto.single('photo'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message:
          'No image file uploaded.'
      });
    }

    const playerId =
      req.body.player_id ||
      'PLR-101';

    const name =
      req.body.name ||
      playerId;

    const groupId =
      req.body.group_id ||
      'Group A';

    const photoUrl =
      `/uploads/${req.file.filename}`;

    const absolutePhotoPath =
      req.file.path;

    const cachePath =
      path.join(
        publicDir,
        'coach_intel_cache.json'
      );

    let cacheData = {};

    if (
      fs.existsSync(cachePath)
    ) {
      try {
        cacheData =
          JSON.parse(
            fs.readFileSync(
              cachePath,
              'utf8'
            )
          );
      } catch (e) {
        cacheData = {};
      }
    }

    cacheData.trackedFaceUrl =
      photoUrl;

    cacheData.activePlayer =
      name;

    cacheData.activePlayerId =
      playerId;

    fs.writeFileSync(
      cachePath,
      JSON.stringify(
        cacheData,
        null,
        2
      )
    );

    try {
      await firestoreDb.collection('leaderboard').doc(playerId).set({
        player_id: playerId,
        player_name: name,
        photo_url: photoUrl,
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error('[FIRESTORE LEADERBOARD ERROR]:', e.message);
    }

    const pythonExtractor =
      spawn(
        'python3',
        [
          'live_scouting_engine.py',
          '--extract_features',
          absolutePhotoPath,
          '--player_id',
          playerId,
          '--player_name',
          name,
          '--group_id',
          groupId
        ]
      );

    pythonExtractor.stdout.on(
      'data',
      (data) =>
        console.log(
          `[RE-ID EXTRACTOR OUTPUT]: ${data.toString()}`
        )
    );

    pythonExtractor.stderr.on(
      'data',
      (data) =>
        console.error(
          `[RE-ID EXTRACTOR ERROR]: ${data.toString()}`
        )
    );

    return res.json({
      success: true,
      message:
        'Player reference image saved successfully in public directory and cache updated.',
      player: {
        player_id:
          playerId,
        name:
          name,
        group_id:
          groupId,
        photo_url:
          photoUrl,
        local_path:
          absolutePhotoPath
      }
    });
  }
);

// ========================================================================
// 📋 FETCH PLAYER DAILY REPORTS
// ========================================================================

app.get(
  '/api/player-reports',
  async (req, res) => {
    const playerName =
      req.query.player_name ||
      req.query.player_id ||
      'SA';

    try {
      const snapshot = await firestoreDb.collection('daily_reports')
        .where('player_name', '==', playerName)
        .get();

      const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      return res.json(reports || []);
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
);

// ========================================================================
// 🎯 FETCH PLAYER SCORECARD
// ========================================================================

app.get(
  [
    '/api/v1/players/:userId/scorecard',
    '/api/v1/:userId/scorecard'
  ],
  async (req, res) => {
    const userId =
      req.params.userId ||
      'default_user';

    try {
      const doc = await firestoreDb.collection('leaderboard').doc(userId).get();

      if (!doc.exists) {
        return res.json({
          success: true,
          player_id:
            userId,
          overallRating:
            85,
          sprintVelocity:
            '26.4 km/h',
          passAccuracy:
            '84%',
          drillsCompleted:
            10,
          radarStats: {
            pace: 82,
            passing: 84,
            dribbling: 88,
            vision: 80
          }
        });
      }

      return res.json({
        success: true,
        ...doc.data()
      });
    } catch (err) {
      return res.json({
        success: true,
        player_id:
          userId,
        overallRating:
          85,
        sprintVelocity:
          '26.4 km/h',
        passAccuracy:
          '84%',
        drillsCompleted:
          10,
        radarStats: {
          pace: 82,
          passing: 84,
          dribbling: 88,
          vision: 80
        }
      });
    }
  }
);

// ========================================================================
// 📈 PROCESS CV DRILL RESULTS & UPDATE LEADERBOARD (Dual Format Support)
// ========================================================================

app.post(
  '/api/process-drill-results',
  async (req, res) => {
    try {
      const payload = req.body;
      console.log("🏆 [PROCESS DRILL RESULTS] Received payload:", payload);

      // Format 1: Array of player leaderboard entries
      if (Array.isArray(payload)) {
        for (const playerEntry of payload) {
          const playerId = playerEntry.player_id || playerEntry.id;
          if (playerId) {
            await firestoreDb.collection('leaderboard').doc(String(playerId)).set(playerEntry, { merge: true });
          }
        }
      } 
      // Format 2: Single object with playerId and metrics
      else if (payload && payload.playerId && payload.metrics) {
        const { playerId, playerName, drillName, metrics } = payload;
        const nameToSave = playerName || playerId;
        const ovrScore = metrics.ovr_score || 0;
        const sprintSpeed = metrics.sprint_accel || 0;
        const passAccuracy = metrics.pass_accuracy || 0;
        const currentDate = new Date().toLocaleDateString('en-GB');

        await firestoreDb.collection('daily_reports').add({
          player_id: playerId,
          player_name: nameToSave,
          drill_name: drillName,
          ovr_score: ovrScore,
          sprint_speed: `${sprintSpeed} km/h`,
          pass_accuracy: `${passAccuracy}%`,
          date_created: currentDate,
          updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });

        const leaderboardRef = firestoreDb.collection('leaderboard').doc(playerId);
        const doc = await leaderboardRef.get();

        if (doc.exists) {
          const data = doc.data();
          const existingTopSpeed = data.top_speed || 0;
          const existingAvgPass = data.avg_pass_acc || 0;
          const existingHighestOvr = data.highest_ovr || 0;
          const existingTotalDrills = data.total_drills || 0;

          await leaderboardRef.update({
            player_name: nameToSave,
            total_drills: existingTotalDrills + 1,
            top_speed: Math.max(existingTopSpeed, sprintSpeed),
            avg_pass_acc: Math.round((existingAvgPass + passAccuracy) / 2),
            highest_ovr: Math.max(existingHighestOvr, ovrScore),
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          await leaderboardRef.set({
            player_id: playerId,
            player_name: nameToSave,
            total_drills: 1,
            top_speed: sprintSpeed,
            avg_pass_acc: passAccuracy,
            highest_ovr: ovrScore,
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
          });
        }

        if (typeof io !== 'undefined' && io) {
          io.emit(
            'leaderboard_updated',
            {
              playerId,
              playerName: nameToSave,
              drillName,
              metrics
            }
          );
        }
      }

      return res.status(200).json({
        status: 'success',
        message: 'Leaderboard updated successfully'
      });
    } catch (err) {
      console.error("⚠️ [LEADERBOARD SYNC ERROR]:", err.message);
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
);

// ========================================================================
// 🎬 PROCESS VIDEO ANALYSIS
// ========================================================================

app.post(
  [
    '/api/process-video',
    '/api/run-analysis',
    '/api/upload-analysis',
    '/api/upload-drill'
  ],
  upload.any(),
  (req, res) => {
    const uploadedFile =
      (
        req.files &&
        req.files.length > 0
      )
        ? req.files[0]
        : null;

    const uploadedFilePath =
      uploadedFile
        ? uploadedFile.path
        : req.body.videoPath;

    const drillFormat =
      req.body.drillFormat ||
      req.body.drillType ||
      '3_players_drill';

    const playerName =
      req.body.playerName ||
      'SA';

    res.json({
      success: true,
      message:
        'Video received successfully. Processing telemetry.',
      videoPath:
        uploadedFilePath || '',
      videoUrl:
        uploadedFile
          ? `/videos/${uploadedFile.filename}`
          : ''
    });

    if (uploadedFilePath) {
      const pythonProcess =
        spawn(
          'python3',
          [
            'live_scouting_engine.py',
            '--video',
            uploadedFilePath,
            '--drill',
            drillFormat,
            '--player',
            playerName
          ]
        );

      pythonProcess.stdout.on(
        'data',
        (data) =>
          console.log(
            `[CV STDOUT]: ${data.toString()}`
          )
      );

      pythonProcess.stderr.on(
        'data',
        (data) =>
          console.error(
            `[CV STDERR]: ${data.toString()}`
          )
      );
    }
  }
);

// ========================================================================
// 👥 PROCESS DYNAMIC GROUP DRILL ANALYSIS
// ========================================================================

app.post(
  '/api/process-group-drill',
  uploadPhoto.array('player_photos'),
  (req, res) => {
    try {
      if (
        !req.files ||
        req.files.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            'No player reference photos uploaded.'
        });
      }

      const groupConfig =
        typeof req.body.group_config ===
        'string'
          ? JSON.parse(
              req.body.group_config
            )
          : req.body.group_config;

      const {
        video_path,
        drill_type,
        group_id,
        players
      } = groupConfig;

      const registeredPlayersDb = {};

      players.forEach(
        (player) => {
          const file =
            req.files[
              player.photo_index
            ];

          if (file) {
            registeredPlayersDb[
              player.id
            ] = {
              player_id:
                player.id,
              player_name:
                player.name,
              group_id:
                group_id ||
                'Group_Alpha',
              image_path:
                file.path
            };
          }
        }
      );

      res.json({
        success: true,
        message:
          `Group analysis initialized for ${players.length} players.`,
        group_id:
          group_id
      });

      const pythonProcess =
        spawn(
          'python3',
          [
            'analytics_engine.py',
            '--video',
            video_path,
            '--drill',
            drill_type ||
              'group_drill',
            '--group_id',
            group_id ||
              'Group_Alpha',
            '--roster_json',
            JSON.stringify(
              registeredPlayersDb
            )
          ]
        );

      pythonProcess.stdout.on(
        'data',
        (data) =>
          console.log(
            `[GROUP CV STDOUT]: ${data.toString()}`
          )
      );

      pythonProcess.stderr.on(
        'data',
        (data) =>
          console.error(
            `[GROUP CV STDERR]: ${data.toString()}`
          )
      );

    } catch (err) {
      console.error(
        `❌ [GROUP DRILL ERROR]: ${err.message}`
      );

      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
);

// ========================================================================
// 🏆 FETCH GLOBAL LEADERBOARD DATA
// ========================================================================

app.get(
  '/api/leaderboard',
  async (req, res) => {
    try {
      const snapshot = await firestoreDb.collection('leaderboards').get();
      const leaderboard = snapshot.docs.map(doc => doc.data());

      res.json({
        success: true,
        leaderboard: leaderboard || []
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
);

// ========================================================================
// 🚪 FETCH SELECTED PLAYER'S MATCH ROOM HISTORY
// ========================================================================

app.get(
  '/api/player-room/:playerId',
  async (req, res) => {
    const {
      playerId
    } = req.params;

    try {
      const snapshot = await firestoreDb.collection('daily_reports')
        .where('player_id', '==', playerId)
        .get();

      const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      res.json({
        success: true,
        reports: reports || []
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }
  }
);

// ========================================================================
// 🛡️ DYNAMIC SQUADS CONFIGURATION ENDPOINT
// ========================================================================

app.get('/api/squads', async (req, res) => {
  try {
    const snapshot = await firestoreDb.collection('squads').get();
    let squads = snapshot.docs.map(doc => doc.data().name || doc.id);

    if (squads.length === 0) {
      const leaderSnapshot = await firestoreDb.collection('leaderboard').get();
      const groupSet = new Set();
      leaderSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.group_id) groupSet.add(data.group_id);
      });
      squads = Array.from(groupSet);
    }

    if (squads.length === 0) {
      squads = ["Group A", "Group B", "Group C", "Group D"];
    }

    res.json({
      success: true,
      squads: squads
    });
  } catch (err) {
    console.error('Error fetching dynamic squads:', err);
    res.json({
      success: true,
      squads: ["Group A", "Group B", "Group C", "Group D"]
    });
  }
});

// ========================================================================
// SERVER LISTEN STARTUP
// ========================================================================

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`🚀 [EXPRESS SERVER RUNNING] Listening on port ${PORT}`);
});