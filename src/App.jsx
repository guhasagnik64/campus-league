// src/App.jsx

import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('http://127.0.0.1:8000', {
  autoConnect: false,
  transports: ['websocket', 'polling']
});

import { db } from './firebase';

import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';

// Safely import external child components with graceful fallbacks
import DashboardUploader from './components/DashboardUploader';
import DailyPlayerCheckIn from './components/DailyPlayerCheckIn';
import PlayerSportsCV from './components/PlayerSportsCV';
import CoachPortfolioCV from './components/CoachPortfolioCV';
import DailyReport from './components/DailyReport';
import GlobalCampusLeaderboard from './components/GlobalCampusLeaderboard';
import PlayerProfileScorecard from './components/PlayerProfileScorecard';

// ==========================================
// 1. STUDENT ATTIRE UPLOADER COMPONENT
// ==========================================
function StudentAttireUploader({ user, tenantId = "default_facility", sessionData, onPhotoUpload }) {
  const studentName = user?.name || "Anonymous_Player";
  const schoolName = user?.school || "Global_Campus";

  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(sessionData?.photoUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  useEffect(() => {
    if (sessionData?.photoUrl) {
      setPreviewUrl(sessionData.photoUrl);
    }
  }, [sessionData]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const imageUrl = URL.createObjectURL(file);
      setPreviewUrl(imageUrl);
      setUploadStatus("");
      
      // 💡 Mark calibration active in browser storage
      localStorage.setItem("intake_active_SA", "true");

      // Convert to base64 for persistent memory in parent state / localStorage
      const reader = new FileReader();
      reader.onloadend = () => {
        if (onPhotoUpload) {
          onPhotoUpload(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadAttire = async () => {
    if (!selectedImage && !sessionData?.photoUrl) {
      setUploadStatus("❌ Please select a front kit photo first.");
      return;
    }

    setIsUploading(true);
    setUploadStatus("Uploading kit profile for computer vision engine...");

    const nameToUse = user?.name || "arin";
    const tenantToUse = tenantId || "default_tenant";
    const formattedName = nameToUse.trim().replace(/\s+/g, '_').toLowerCase();

    const formData = new FormData();
    if (selectedImage) {
      formData.append("file", selectedImage, `${formattedName}_attire.jpg`);
    }

    try {
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

      const uploadUrl = `${BASE_URL}/api/upload?tenant_id=${encodeURIComponent(tenantToUse)}`;

      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        setUploadStatus('✅ Kit profile registered');
      } else {
        setUploadStatus(`❌ Server returned code ${response.status}`);
      }
    } catch (error) {
      console.error("Attire Upload Error:", error);
      setUploadStatus('❌ Connection failed to port 8000');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      style={{
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '24px',
        backgroundColor: '#0f172a',
        color: '#ffffff',
        maxWidth: '500px',
        margin: '20px auto',
        fontFamily: 'sans-serif'
      }}
    >
      <div
        style={{
          textAlign: 'center',
          marginBottom: '16px'
        }}
      >
        <h3
          style={{
            margin: '0 0 6px 0',
            color: '#60a5fa'
          }}
        >
          📸 Daily Training Kit Registration
        </h3>

        <p
          style={{
            fontSize: '13px',
            color: '#94a3b8',
            margin: 0
          }}
        >
          Logged in as:{' '}
          <strong>{studentName}</strong> ({schoolName})
        </p>

        <p
          style={{
            fontSize: '12px',
            color: '#64748b',
            marginTop: '6px'
          }}
        >
          Upload a clear front photo of your attire today so
          the AI engine tracks your individual stats in group
          drills.
        </p>
      </div>

      {previewUrl ? (
        <div
          style={{
            marginBottom: '16px',
            textAlign: 'center',
            position: 'relative'
          }}
        >
          <img
            src={previewUrl}
            alt="Attire Preview"
            style={{
              width: '100%',
              maxHeight: '220px',
              objectFit: 'contain',
              borderRadius: '8px',
              border: '2px solid #10b981'
            }}
          />

          <span
            style={{
              display: 'block',
              marginTop: '6px',
              fontSize: '11px',
              color: '#34d399',
              fontWeight: 'bold'
            }}
          >
            ✓ INTAKE PHOTO ACTIVE IN SESSION MEMORY
          </span>
        </div>
      ) : (
        <div
          style={{
            height: '140px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px dashed #475569',
            borderRadius: '8px',
            marginBottom: '16px',
            color: '#64748b',
            fontSize: '13px'
          }}
        >
          No front kit photo selected
        </div>
      )}

      {/* File selector */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          style={{
            color: '#ffffff'
          }}
        />

        <button
          type="button"
          onClick={handleUploadAttire}
          disabled={isUploading}
          style={{
            backgroundColor: isUploading
              ? '#475569'
              : '#2563eb',
            color: '#ffffff',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: isUploading
              ? 'not-allowed'
              : 'pointer'
          }}
        >
          {isUploading
            ? 'Uploading...'
            : 'Register Kit Profile'}
        </button>

        {uploadStatus && (
          <div
            style={{
              fontSize: '12px',
              color: '#cbd5e1',
              textAlign: 'center',
              marginTop: '4px'
            }}
          >
            {uploadStatus}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 2. ACADEMY DASHBOARD COMPONENT
// ==========================================
function AcademyDashboard({ userStreak = 6, requiresSubscription = true, userRole = "Admin Executive" }) {
  return (
    <div style={{ background: '#0f172a', padding: '24px', borderRadius: '12px', color: '#fff', maxWidth: '800px', margin: '0 auto 20px auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#38bdf8' }}>⚽ Academy Performance Portal</h2>
        <span style={{ background: '#10b981', padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '13px' }}>
          🔥 {userStreak}-Day Training Streak
        </span>
      </div>

      <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#38bdf8' }}>📊 Free Daily Drill Overview</h4>
        <p style={{ margin: 0, fontSize: '14px', color: '#cbd5e1' }}>Sprint Velocity: <strong>26.4 km/h</strong> | Pass Accuracy: <strong>84%</strong></p>
      </div>

      {requiresSubscription && userRole !== 'Admin Executive' && (
        <div style={{ border: '1px dashed #f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#f59e0b' }}>🔒 Unlock Academy Pro Growth Pass</h3>
          <p style={{ fontSize: '13px', color: '#cbd5e1' }}>
            Unlock your full biomechanic radar, video highlight clips, and weekly coach PDF for <strong>₹249/month</strong>.
          </p>
          <button 
            onClick={() => alert("Redirecting to Academy Subscription Payment...")} 
            style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '10px 20px', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', marginTop: '10px' }}
          >
            Subscribe Now (₹249/mo)
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. FUTSAL MATCH VIEWER COMPONENT
// ==========================================
function FutsalMatchViewer({ isUnlocked = false }) {
  return (
    <div style={{ background: '#090d16', padding: '24px', borderRadius: '12px', color: '#fff', maxWidth: '800px', margin: '0 auto 20px auto', border: '1px solid #1e293b' }}>
      <div style={{ borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, color: '#38bdf8' }}>🏟️ Neon Arena - 5v5 Match Scouting</h2>
        <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>Red Strikers vs Blue Devils</p>
      </div>

      {!isUnlocked ? (
        <div style={{ background: '#111827', padding: '20px', borderRadius: '8px', fontFamily: 'monospace' }}>
          <h3 style={{ color: '#ef4444', marginTop: 0 }}>🔒 MATCH REPORT LOCKED</h3>
          <p style={{ color: '#9ca3af', fontSize: '13px' }}>Full computer vision tracking & highlight clips are ready for this match.</p>
          <button onClick={() => alert("Opening Payment Gateway for ₹159...")} style={{ width: '100%', background: 'linear-gradient(90deg, #4f46e5, #0284c7)', color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', marginTop: '12px' }}>
            Unlock Complete Pro Report (₹159)
          </button>
        </div>
      ) : (
        <div style={{ background: '#064e3b', padding: '20px', borderRadius: '8px' }}>
          <h3 style={{ margin: 0 }}>🎉 Report Unlocked!</h3>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 4. MAIN APPLICATION COMPONENT
// ==========================================
function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('scorecard');
  const [userStreak] = useState(6);
  const [isAcademySubscribed] = useState(true);
  const [isMatchReportPaid] = useState(false);
  const [reportTimeLeft] = useState('23:59:59');

  // ==========================================
  // 👥 GROUP DRILL STATE HOOKS & HANDLERS
  // ==========================================
const [groupRoster, setGroupRoster] = useState([
    { id: 'P1', name: '', photo: null },
    { id: 'P2', name: '', photo: null },
    { id: 'P3', name: '', photo: null }
  ]);
  
  const [groupId, setGroupId] = useState('Group_Alpha');
  const [videoFile, setVideoFile] = useState(null);

  const addPlayerSlot = () => {
    const newId = `P${groupRoster.length + 1}`;
    setGroupRoster([...groupRoster, { id: newId, name: '', photo: null }]);
  };

  const removePlayerSlot = (index) => {
    if (groupRoster.length > 1) {
      setGroupRoster(groupRoster.filter((_, i) => i !== index));
    }
  };

  const handleGroupDrillSubmit = async () => {
    if (!videoFile) return alert("Please select a drill video file.");

    const formData = new FormData();
    // 1. Updated key from 'video' to 'file' to align with server parsing
    formData.append('file', videoFile);

    const playersMetadata = [];
    groupRoster.forEach((player, index) => {
      if (player.photo) {
        formData.append('player_photos', player.photo);
        playersMetadata.push({
          id: player.id || `P_${index + 1}`,
          name: player.name || `Player ${index + 1}`,
          photo_index: index
        });
      }
    });

    const groupConfig = {
      drill_type: selectedDrill,
      group_id: groupId,
      video_path: `my_cloud_space/${videoFile.name.replace(/\s+/g, '_')}`,
      players: playersMetadata
    };

    formData.append('group_config', JSON.stringify(groupConfig));

    try {
      // 2. Updated port from 8002 to active port 8000 via environment or fallback
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${BASE_URL}/api/upload-drill`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error ${response.status}`);
      }

      const result = await response.json();
      alert("Group analysis started successfully!");
    } catch (error) {
      console.error("Failed to upload group drill:", error);
      alert("Network error processing video.");
    }
  };
  // ==========================================
  // PERSISTENT INTAKE PHOTO MEMORY STATE
  // ==========================================
  const [sessionData, setSessionData] = useState(() => {
    const savedPhoto = localStorage.getItem('active_predrill_photo');
    const savedPlayer = localStorage.getItem('active_predrill_player');
    return {
      photoUrl: savedPhoto || null,
      playerId: savedPlayer || null,
      isCheckInComplete: !!savedPhoto
    };
  });

  const handlePhotoUpload = (imageUrl) => {
    localStorage.setItem('active_predrill_photo', imageUrl);
    if (user?.id) localStorage.setItem('active_predrill_player', user.id);
    setSessionData({
      photoUrl: imageUrl,
      playerId: user?.id || 'anonymous_player',
      isCheckInComplete: true
    });
  };

  const handleDrillVideoUploadComplete = () => {
    localStorage.removeItem('active_predrill_photo');
    localStorage.removeItem('active_predrill_player');
    setSessionData({
      photoUrl: null,
      playerId: null,
      isCheckInComplete: false
    });
  };

  // SHARED PLAYER & SELECTION STATE
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [registeredPlayers, setRegisteredPlayers] = useState([]);
  const [activePlayerData, setActivePlayerData] = useState(null);
  
  // Selected player for Match Room Navigation
  const [selectedPlayerForRoom, setSelectedPlayerForRoom] = useState(null);

  // VIDEO & LAUNCH ANALYSIS STATES
  const [selectedVideoFile, setSelectedVideoFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleOpenPlayerRoom = (player) => {
  setSelectedPlayerForRoom(player);
  setSelectedPlayerId(player.id || player.player_id);
  setActiveTab('daily-reports'); // Or 'Daily Reports' depending on your tab name state key
};

  const handlePlayerRegistered = (playerData) => {
    setRegisteredPlayers((prev) => [...prev, playerData]);
    setSelectedPlayerId(playerData.id);
    setActivePlayerData(playerData);
  };

  const handleSelectPlayer = (player) => {
    setSelectedPlayerId(player.id || player.player_id);
    setActivePlayerData(player);
  };

  const AVAILABLE_DRILLS = [
    { id: 'outside_cut', name: '🎯 Coach Tamal: Outside Cut & Vision', label: '🎯 Coach Sagnik: Outside Cut & Vision' },
    { id: 'cone_dribble', name: '✨ Clean Cone Dribble & Posture', label: '✨ Clean Cone Dribble & Posture' },
    { id: 'left_foot_slalom', name: '🦶 Left Foot Outside Cut Slalom', label: '🦶 Left Foot Outside Cut Slalom' },
    { id: 'weak_foot', name: '💪 Weak Foot Proficiency', label: '💪 Weak Foot Proficiency' },
    { id: 'left_right_combo', name: '🔄 Left-Right Foot Combination', label: '🔄 Left-Right Foot Combination' },
    { id: 'dribble_pass', name: '⚽ Dribbling & Pass Drill', label: '⚽ Dribbling & Pass Drill' },
    { id: 'dribbling', name: '⚽ Dribbling & Close Control', label: '⚽ Dribbling & Close Control' },
    { id: 'pass_support', name: '📐 3-Player Pass & Support Rotation', label: '📐 3-Player Pass & Support Rotation' },
    { id: '3_players_drill_1', name: '🔄 3-Player Side-Swap Drill', label: '🔄 3-Player Side-Swap Drill' },
    { id: 'give_and_go', name: '⚡ Give & Go (Pass & Move)', label: '⚡ Give & Go (Pass & Move)' },
    { id: 'saq', name: '🏃 SAQ (Speed, Agility, Quickness)', label: '🏃 SAQ (Speed, Agility, Quickness)' },
    { id: 'line_breaker', name: '🗡️ Penetration Line-Breaker Pass', label: '🗡️ Penetration Line-Breaker Pass' },
    { id: 'overlapping_run', name: '🔄 Overlapping Run', label: '🔄 Overlapping Run' },
    { id: 'ssg_attacking', name: '⚔️ 1v1 / SSG Attacking', label: '⚔️ 1v1 / SSG Attacking' },
    { id: 'ssg_defending', name: '🛡️ 1v1 / SSG Defending', label: '🛡️ 1v1 / SSG Defending' },
    { id: 'takeover', name: '🥊 Take Over Crossover', label: '🥊 Take Over Crossover' },
    { id: 'shooting', name: '🎯 Shooting Precision', label: '🎯 Shooting Precision' },
    { id: 'relay_dribble_pass', name: '🔄 Relay Dribble & Open-Body Pass', label: '🔄 Relay Dribble & Open-Body Pass' }
  ];

  const [selectedDrill, setSelectedDrill] = useState('outside_cut');
  const [drillAnalyticsData, setDrillAnalyticsData] = useState(null);

  const [newAdText, setNewAdText] = useState("");
  const [newAdUrl, setNewAdUrl] = useState("");
  const [newBannerBg, setNewBannerBg] = useState('#4f46e5');

  const [vendorAuth, setVendorAuth] = useState({ isAdmin: false, isFutsalOwner: false, isShopOwner: false });
  const [passwordInput, setPasswordInput] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    school: '',
    otherSchool: '',
    coachName: ''
  });
  
  const [loginError, setLoginError] = useState('');
  const [posts, setPosts] = useState([]);
  const [newPostText, setNewPostText] = useState('');
  const [ads, setAds] = useState([{ text: "⚽ LOADING J-SPORTS PLATFORM...", bg: '#091702' }]);
  const [adIndex, setAdIndex] = useState(0);
  const [futsalGrounds, setFutsalGrounds] = useState([]);
  const [shopItems, setShopItems] = useState([]);

  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemLink, setNewItemLink] = useState('');
  const [newItemPhoto, setNewItemPhoto] = useState('');

  const [newGroundName, setNewGroundName] = useState('');
  const [newGroundTime, setNewGroundTime] = useState('');
  const [newGroundPrice, setNewGroundPrice] = useState('');
  const [newGroundLink, setNewGroundLink] = useState('');
  const [newGroundPhoto, setNewGroundPhoto] = useState('');

  // -------------------------------------------------------------
  // PASTE HERE (Line 337)
  // -------------------------------------------------------------
  const handleAddGround = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "futsal_grounds"), {
      name: newGroundName,
      time: newGroundTime,
      price: newGroundPrice,
      link: newGroundLink,
      photoUrl: newGroundPhoto || "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=500&q=80"
    });
    setNewGroundName(''); setNewGroundTime(''); setNewGroundPrice(''); setNewGroundLink(''); setNewGroundPhoto('');
  };

  const handleAddStoreItem = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "shop_items"), {
      itemName: newItemName,
      itemPrice: newItemPrice,
      itemDescription: newItemDesc,
      purchaseUrl: newItemLink,
      photoUrl: newItemPhoto || "https://images.unsplash.com/photo-1511886929837-354d827aae26?auto=format&fit=crop&w=500&q=80"
    });
    setNewItemName(''); setNewItemPrice(''); setNewItemDesc(''); setNewItemLink(''); setNewItemPhoto('');
  };

  const NORTH_BENGAL_SCHOOLS = [
    "St. Joseph's School", "North Point", "Goethals Memorial",
    "Mount Hermon", "Siliguri Boys High School", "Don Bosco Siliguri", "Other"
  ];

  const styles = {
    loginContainer: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '20px' },
    adHero: { padding: '30px', borderRadius: '12px 12px 0 0', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' },
    loginCard: { backgroundColor: '#fff', padding: '30px', borderRadius: '0 0 12px 12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: '12px' },
    input: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '14px', marginBottom: '8px' },
    btnPrimary: { width: '100%', backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' },
    topAdBar: { padding: '8px', color: '#fff', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' },
    appHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0' },
    logoutBtn: { border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', padding: 0 },
    navBar: { display: 'flex', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' },
    navTab: { padding: '15px 20px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' },
    mainContent: { padding: '20px', maxWidth: '1200px', margin: '0 auto' },
    catalogGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' },
    productCard: { border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#fff' },
    cardBody: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' },
    postBox: { backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' },
    postArea: { width: '100%', height: '80px', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', marginBottom: '10px' },
    cardItem: { backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' },
    linkBtn: { border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', padding: 0 }
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('jsports_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      if (parsedUser.role === 'admin') setVendorAuth(p => ({ ...p, isAdmin: true }));
    }

    const unsubAds = onSnapshot(collection(db, "ads"), (s) => {
      const fetchedAds = s.docs.map(d => ({ id: d.id, ...d.data() }));
      if (fetchedAds.length > 0) setAds(fetchedAds);
    });

    const unsubGrounds = onSnapshot(collection(db, "futsal_grounds"), (s) => setFutsalGrounds(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubShopItems = onSnapshot(collection(db, "shop_items"), (s) => setShopItems(s.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qPosts = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubPosts = onSnapshot(qPosts, (s) => setPosts(s.docs.map(d => ({ id: d.id, ...d.data() }))));

    socket.on('drill_telemetry_update', (data) => setDrillAnalyticsData(data));

    const timer = setInterval(() => { if (ads.length > 0) setAdIndex((p) => (p + 1) % ads.length); }, 5000);

    return () => {
      unsubAds(); unsubGrounds(); unsubShopItems(); unsubPosts();
      socket.off('drill_telemetry_update');
      clearInterval(timer);
    };
  }, [ads.length]);

  // ==========================================
  // ACTION & EVENT HANDLERS
  // ==========================================
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newPostText.trim()) return;

    try {
      await addDoc(collection(db, "posts"), {
        author: user.name,
        school: user.school,
        text: newPostText,
        likes: [],
        createdAt: serverTimestamp()
      });
      setNewPostText('');
    } catch (err) {
      console.error("Post Creation Error:", err);
    }
  };

  const handleLikePost = async (postId, currentLikes = []) => {
    try {
      const postRef = doc(db, "posts", postId);
      if (currentLikes.includes(user.id)) {
        await updateDoc(postRef, { likes: arrayRemove(user.id) });
      } else {
        await updateDoc(postRef, { likes: arrayUnion(user.id) });
      }
    } catch (err) {
      console.error("Like Post Error:", err);
    }
  };

  const handleCreateAd = async (e) => {
    e.preventDefault();
    if (!newAdText.trim()) return;

    try {
      await addDoc(collection(db, "ads"), {
        text: newAdText,
        url: newAdUrl,
        bg: newBannerBg || '#4f46e5',
        createdAt: serverTimestamp()
      });
      setNewAdText('');
      setNewAdUrl('');
    } catch (err) {
      console.error("Ad Creation Error:", err);
    }
  };

  const handleAddFutsalGround = async (e) => {
    e.preventDefault();
    if (!newGroundName.trim()) return;

    try {
      await addDoc(collection(db, "futsal_grounds"), {
        venueName: newGroundName,
        availableSlots: newGroundTime,
        price: newGroundPrice,
        externalBookingUrl: newGroundLink,
        photoUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=500&q=80",
        createdAt: serverTimestamp()
      });
      setNewGroundName('');
      setNewGroundTime('');
      setNewGroundPrice('');
      setNewGroundLink('');
    } catch (err) {
      console.error("Ground Addition Error:", err);
    }
  };

  const handleAddShopItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      await addDoc(collection(db, "shop_items"), {
        itemName: newItemName,
        itemPrice: newItemPrice,
        itemDescription: newItemDesc,
        purchaseUrl: newItemLink,
        photoUrl: "https://images.unsplash.com/photo-1511886929837-354d827aae26?auto=format&fit=crop&w=500&q=80",
        createdAt: serverTimestamp()
      });
      setNewItemName('');
      setNewItemPrice('');
      setNewItemDesc('');
      setNewItemLink('');
    } catch (err) {
      console.error("Shop Item Addition Error:", err);
    }
  };

  const handleDrillChange = (e) => {
    const newDrill = e.target.value;
    setSelectedDrill(newDrill);
    if (socket) socket.emit('select_active_drill', { drill_id: newDrill });
  };

const handleLaunchAnalysis = async () => {
    if (!selectedVideoFile) {
      alert("Please select a video file first!");
      return;
    }

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append("file", selectedVideoFile);
    formData.append("drillType", selectedDrill);
    formData.append("playerName", user?.name || "Arin");
    formData.append("coachId", user?.coachName || "Coach Tamal");

    if (sessionData?.photoUrl) {
      formData.append("intakePhotoUrl", sessionData.photoUrl);
    }

    try {
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${BASE_URL}/api/upload-drill`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();

        // 1. Update UI analytics state first
        setDrillAnalyticsData(data);

        // 2. Clear frontend calibration memory
        localStorage.removeItem("intake_active_profile");

        // 3. Trigger completion callback & navigate
        if (typeof handleDrillVideoUploadComplete === 'function') {
          handleDrillVideoUploadComplete();
        }

        if (data.success) {
          setActiveTab('Daily Reports');
        } else {
          alert("Server failed to process video.");
        }
      } else {
        alert("Server returned an HTTP error during upload.");
      }
    } catch (err) {
      console.error("Video Upload Processing Error:", err);
      alert("Network error processing video.");
    } finally {
      setIsAnalyzing(false);
    }
  };
  const handleLogin = async (role = 'student') => {
    // 1. ADMIN LOGIN PATH: Immediate entry without requiring athlete form details
    if (role === 'admin') {
      const adminUser = { 
        id: `admin_${Date.now()}`,
        name: formData.name?.trim() || 'Admin User', 
        phone: formData.phone?.trim() || 'N/A',
        school: formData.school || 'Central Admin', 
        coachName: formData.coachName || 'System Admin',
        role: 'admin',
        loginTimestamp: Date.now()
      };

      localStorage.setItem('jsports_user', JSON.stringify(adminUser));
      setUser(adminUser);
      setVendorAuth((p) => ({ ...p, isAdmin: true }));
      setLoginError('');
      return;
    }

    // 2. ATHLETE/STUDENT LOGIN PATH: Enforce full validation
    const isOtherSelected = formData.school === 'Other';

    if (!formData.name?.trim() || !formData.phone?.trim() || !formData.school?.trim() || !formData.coachName?.trim()) {
      setLoginError("❌ Name, Phone, Campus, and Assigned Coach Name are required.");
      return;
    }

    if (isOtherSelected && !formData.otherSchool?.trim()) {
      setLoginError("❌ Please specify your Organization / Campus details.");
      return;
    }

    setLoginError('');

    const schoolToUse = isOtherSelected ? formData.otherSchool.trim() : formData.school;

    const realUser = { 
      id: `user_${Date.now()}`,
      name: formData.name.trim(), 
      phone: formData.phone.trim(),
      school: schoolToUse, 
      coachName: formData.coachName.trim(),
      role: 'student',
      loginTimestamp: Date.now()
    };

    localStorage.setItem('jsports_user', JSON.stringify(realUser));
    setUser(realUser);
  };
  const handleLogout = () => {
    localStorage.removeItem('jsports_user');
    setUser(null);
    setVendorAuth({ isAdmin: false, isFutsalOwner: false, isShopOwner: false });
  };

  if (!user) {
    const isOtherSelected = formData.school === 'Other';

    return (
      <div style={styles.loginContainer}>
        <div style={{ maxWidth: '420px', width: '100%' }}>
          <div style={{ ...styles.adHero, background: ads[adIndex]?.bg || '#4f46e5', color: '#fff' }}>
            <h1 style={{ margin: 0, fontSize: '32px', fontStyle: 'italic', fontWeight: '900' }}>J-SPORTS</h1>
            <p style={{ fontSize: '13px', margin: '5px 0 0 0', opacity: 0.9 }}>{ads[adIndex]?.text}</p>
          </div>
          <div style={styles.loginCard}>
            <input 
              placeholder="Full Name *" 
              style={styles.input} 
              value={formData.name} 
              onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
            />
            <input 
              placeholder="Mobile Number *" 
              style={styles.input} 
              value={formData.phone} 
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })} 
            />
            <select 
              style={styles.input} 
              value={formData.school} 
              onChange={(e) => setFormData({ ...formData, school: e.target.value })}
            >
              <option value="">Select Campus Association *</option>
              {NORTH_BENGAL_SCHOOLS.map((sch) => (
                <option key={sch} value={sch}>{sch}</option>
              ))}
            </select>

            {isOtherSelected && (
              <div style={{ marginBottom: '8px' }}>
                <input 
                  placeholder="Specify Organization / Campus Name *" 
                  style={{
                    ...styles.input,
                    borderColor: !formData.otherSchool?.trim() ? '#ef4444' : '#cbd5e1',
                    backgroundColor: '#fef2f2'
                  }} 
                  value={formData.otherSchool || ''} 
                  onChange={(e) => setFormData({ ...formData, otherSchool: e.target.value })} 
                />
              </div>
            )}

            <input 
              placeholder="Assigned Coach Name * (e.g. Coach Tamal)" 
              style={styles.input} 
              value={formData.coachName} 
              onChange={(e) => setFormData({ ...formData, coachName: e.target.value })} 
            />

            {loginError && (
              <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px' }}>
                {loginError}
              </div>
            )}

            <button style={styles.btnPrimary} onClick={() => handleLogin('student')}>
              Enter Athlete Terminal
            </button>
            <button style={{ ...styles.btnPrimary, background: '#0284c7' }} onClick={() => handleLogin('admin')}>
              Enter Admin Terminal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ ...styles.topAdBar, backgroundColor: ads[adIndex]?.bg || '#4f46e5' }}>
        📢 {ads[adIndex]?.text || "⚽ J-SPORTS ATHLETIC PLATFORM"}
      </div>

      <header style={styles.appHeader}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontStyle: 'italic', fontWeight: '900' }}>J-SPORTS</h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Logged in as: <strong>{user.name}</strong> ({user.school})</span>
        </div>
        <button style={styles.logoutBtn} onClick={handleLogout}>Sign Out 🚪</button>
      </header>

      <nav style={styles.navBar}>
        <button style={{ ...styles.navTab, borderBottom: activeTab === 'scorecard' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('scorecard')}>📊 Live Drills</button>
        <button style={{ ...styles.navTab, borderBottom: activeTab === 'attire' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('attire')}>📸 Attire Check-In</button>
        <button style={{ ...styles.navTab, borderBottom: activeTab === 'leaderboard' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('leaderboard')}>🏆 Leaderboard</button>
        <button style={{ ...styles.navTab, borderBottom: activeTab === 'daily' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('daily')}>📅 Daily Reports</button>
        <button style={{ ...styles.navTab, borderBottom: activeTab === 'cv' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('cv')}>👤 Sports CV</button>
        <button style={{ ...styles.navTab, borderBottom: activeTab === 'coach' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('coach')}>🎓 Coach Portfolio</button>
        <button style={{ ...styles.navTab, borderBottom: activeTab === 'futsal' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('futsal')}>🏟️ Futsal Booking</button>
        <button style={{ ...styles.navTab, borderBottom: activeTab === 'feed' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('feed')}>💬 Feed</button>
        <button style={{ ...styles.navTab, borderBottom: activeTab === 'shop' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('shop')}>🛍️ Vega Store</button>
        {user.role === 'admin' && (
          <button style={{ ...styles.navTab, borderBottom: activeTab === 'admin' ? '3px solid #4f46e5' : 'none' }} onClick={() => setActiveTab('admin')}>⚙️ Admin</button>
        )}
      </nav>

      <main style={styles.mainContent}>

  {/* ================================================================
      LIVE DRILLS / SCORECARD TAB
  ================================================================ */}

  {activeTab === 'scorecard' && (
    <div>
      <AcademyDashboard
        userStreak={userStreak}
        requiresSubscription={isAcademySubscribed}
      />

      <div
        style={{
          backgroundColor: '#0f172a',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #1e293b',
          marginBottom: '20px',
          color: '#fff'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}
        >
          <h3
            style={{
              margin: 0,
              color: '#38bdf8'
            }}
          >
            🎯 Drill Selector & AI Evaluation
          </h3>

          <select
            value={selectedDrill}
            onChange={handleDrillChange}
            style={{
              backgroundColor: '#1e293b',
              color: '#34d399',
              border: '1px solid #334155',
              padding: '8px 14px',
              borderRadius: '8px'
            }}
          >
            {AVAILABLE_DRILLS.map((drill) => (
              <option
                key={drill.id}
                value={drill.id}
              >
                {drill.name}
              </option>
            ))}
          </select>
        </div>

        {sessionData?.photoUrl ? (
          <div
            style={{
              backgroundColor: '#064e3b',
              border: '1px solid #10b981',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#34d399',
              marginBottom: '12px'
            }}
          >
            ✓ Intake photo locked in session memory. Ready to process drill video!
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#451a03',
              border: '1px solid #f59e0b',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#fbbf24',
              marginBottom: '12px'
            }}
          >
            ⚠️ No intake photo selected. Visit "Attire Check-In" first for face/kit calibration.
          </div>
        )}

        <div
          style={{
            padding: '15px',
            border: '1px dashed #3b82f6',
            borderRadius: '8px',
            margin: '15px 0',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <input
            type="file"
            accept="video/*"
            onChange={(e) =>
              setSelectedVideoFile(e.target.files?.[0] || null)
            }
          />

          <button
            onClick={handleLaunchAnalysis}
            disabled={isAnalyzing}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              opacity: isAnalyzing ? 0.7 : 1
            }}
          >
            {isAnalyzing
              ? 'Processing Video...'
              : 'Upload & Analyze Drill Video'}
          </button>
        </div>
      </div>

      <PlayerProfileScorecard
        playerId={user.id}
        studentData={user}
        user={user}
      />
    </div>
  )}


  {/* ================================================================
      ATTIRE CHECK-IN TAB
  ================================================================ */}

  {activeTab === 'attire' && (
    <div>
      <StudentAttireUploader
        user={user}
        sessionData={sessionData}
        onPhotoUpload={handlePhotoUpload}
      />

      <DailyPlayerCheckIn
        currentUser={{
          id: user.id || 'PLR-101',
          name: user.name
        }}
      />
    </div>
  )}


  {/* ================================================================
      🏆 LEADERBOARD TAB
  ================================================================ */}

  {activeTab === 'leaderboard' && (
    <div
      style={{
        width: '100%',
        minHeight: '600px'
      }}
    >
      <GlobalCampusLeaderboard
        onSelectPlayer={handleOpenPlayerRoom}
      />
    </div>
  )}


  {/* ================================================================
      DAILY REPORTS TAB
  ================================================================ */}

  {activeTab === 'daily' && (
    <DailyReport />
  )}


  {/* ================================================================
      SPORTS CV TAB
  ================================================================ */}

  {activeTab === 'cv' && (
    <PlayerSportsCV user={user} />
  )}

  {/* ================================================================
      COACH PORTFOLIO TAB
  ================================================================ */}

  {activeTab === 'coach' && (
  <CoachPortfolioCV 
    user={user} 
    loggedInUser={user} 
    coachProfile={user} 
  />
)}

  {/* ================================================================
      FUTSAL BOOKING TAB
  ================================================================ */}

  {activeTab === 'futsal' && (
    <div>
      <FutsalMatchViewer isUnlocked={isMatchReportPaid} />

      <div style={{ marginTop: '20px' }}>
        <h3>Available Grounds</h3>

        <div style={styles.catalogGrid}>
          {futsalGrounds.map((ground) => (
            <div
              key={ground.id}
              style={styles.productCard}
            >
              <img
                src={ground.photoUrl}
                alt={ground.venueName}
                style={{
                  width: '100%',
                  height: '140px',
                  objectFit: 'cover'
                }}
              />

              <div style={styles.cardBody}>
                <h4 style={{ margin: 0 }}>
                  {ground.venueName}
                </h4>

                <p
                  style={{
                    fontSize: '12px',
                    color: '#64748b',
                    margin: 0
                  }}
                >
                  Slot: {ground.availableSlots}
                </p>

                <strong
                  style={{
                    color: '#059669',
                    fontSize: '14px'
                  }}
                >
                  ₹{ground.price} / hr
                </strong>

                <a
                  href={ground.externalBookingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    textDecoration: 'none',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                >
                  Book Slot
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )}


  {/* ================================================================
      COMMUNITY FEED TAB
  ================================================================ */}

  {activeTab === 'feed' && (
    <div>
      <form
        onSubmit={handleCreatePost}
        style={styles.postBox}
      >
        <textarea
          style={styles.postArea}
          placeholder="Share your drill progress or match updates..."
          value={newPostText}
          onChange={(e) => setNewPostText(e.target.value)}
        />

        <button
          style={styles.btnPrimary}
          type="submit"
        >
          Post Update
        </button>
      </form>

      <div>
        {posts.map((post) => (
          <div
            key={post.id}
            style={styles.cardItem}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px'
              }}
            >
              <strong>
                {post.author} ({post.school || 'Campus'})
              </strong>
            </div>

            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '14px',
                color: '#334155'
              }}
            >
              {post.text}
            </p>

            <button
              style={styles.linkBtn}
              onClick={() =>
                handleLikePost(post.id, post.likes)
              }
            >
              ❤️ {post.likes?.length || 0} Likes
            </button>
          </div>
        ))}
      </div>
    </div>
  )} 


  {/* ================================================================
      STORE TAB
  ================================================================ */}

  {activeTab === 'shop' && (
    <div>
      {shopItems.length === 0 ? (
        <div style={styles.catalogGrid}>

          {/* Store Item 1 Placeholder */}
          <div style={styles.productCard}>
            <img
              src="https://images.unsplash.com/photo-1511886929837-354d827aae26?auto=format&fit=crop&w=500&q=80"
              alt="Store Item 1"
              style={{
                width: '100%',
                height: '140px',
                objectFit: 'cover'
              }}
            />

            <div style={styles.cardBody}>
              <h4 style={{ margin: 0 }}>
                Store Item 1
              </h4>

              <p
                style={{
                  fontSize: '12px',
                  color: '#64748b',
                  margin: 0
                }}
              >
                Pro Match Football (Placeholder)
              </p>

              <strong
                style={{
                  color: '#4f46e5',
                  fontSize: '14px'
                }}
              >
                ₹1,499
              </strong>

              <button
                style={{
                  width: '100%',
                  border: 'none',
                  backgroundColor: '#4f46e5',
                  color: '#fff',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Buy Gear
              </button>
            </div>
          </div>


          {/* Store Item 2 Placeholder */}
          <div style={styles.productCard}>
            <img
              src="https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=500&q=80"
              alt="Store Item 2"
              style={{
                width: '100%',
                height: '140px',
                objectFit: 'cover'
              }}
            />

            <div style={styles.cardBody}>
              <h4 style={{ margin: 0 }}>
                Store Item 2
              </h4>

              <p
                style={{
                  fontSize: '12px',
                  color: '#64748b',
                  margin: 0
                }}
              >
                Agility Marker Cones Set (Placeholder)
              </p>

              <strong
                style={{
                  color: '#4f46e5',
                  fontSize: '14px'
                }}
              >
                ₹499
              </strong>

              <button
                style={{
                  width: '100%',
                  border: 'none',
                  backgroundColor: '#4f46e5',
                  color: '#fff',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Buy Gear
              </button>
            </div>
          </div>

        </div>
      ) : (
        <div style={styles.catalogGrid}>
          {shopItems.map((item) => (
            <div
              key={item.id}
              style={styles.productCard}
            >
              <img
                src={
                  item.photoUrl ||
                  'https://images.unsplash.com/photo-1511886929837-354d827aae26?auto=format&fit=crop&w=500&q=80'
                }
                alt={item.itemName}
                style={{
                  width: '100%',
                  height: '140px',
                  objectFit: 'cover'
                }}
              />

              <div style={styles.cardBody}>
                <h4 style={{ margin: 0 }}>
                  {item.itemName}
                </h4>

                <p
                  style={{
                    fontSize: '12px',
                    color: '#64748b',
                    margin: 0
                  }}
                >
                  {item.itemDescription}
                </p>

                <strong
                  style={{
                    color: '#4f46e5',
                    fontSize: '14px'
                  }}
                >
                  ₹{item.itemPrice}
                </strong>

                <a
                  href={item.purchaseUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    backgroundColor: '#4f46e5',
                    color: '#fff',
                    textDecoration: 'none',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                >
                  Buy Gear
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )}


  {/* ================================================================
      ADMIN MANAGEMENT TAB
  ================================================================ */}

  {activeTab === 'admin' && user.role === 'admin' && (
    <div
      style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0'
      }}
    >
      <h3>
        ⚙️ Platform Administration & Control
      </h3>

      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          border: '1px solid #e2e8f0',
          borderRadius: '8px'
        }}
      >
        <h4>
          📢 Post Platform Announcement / Ad Banner
        </h4>

        <form
          onSubmit={handleCreateAd}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <input
            style={styles.input}
            placeholder="Ad Banner Headline"
            value={newAdText}
            onChange={(e) => setNewAdText(e.target.value)}
          />

          <input
            style={styles.input}
            placeholder="Target Link URL (optional)"
            value={newAdUrl}
            onChange={(e) => setNewAdUrl(e.target.value)}
          />

          <input
            style={styles.input}
            placeholder="Background Hex Color (e.g. #4f46e5)"
            value={newBannerBg}
            onChange={(e) => setNewBannerBg(e.target.value)}
          />

          <button
            style={styles.btnPrimary}
            type="submit"
          >
            Publish Ad Banner
          </button>
        </form>
      </div>


      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px'
        }}
      >

        <div
          style={{
            padding: '16px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px'
          }}
        >
          <h4>
            🏟️ Add Futsal Arena
          </h4>

          <form
            onSubmit={handleAddFutsalGround}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <input
              style={styles.input}
              placeholder="Venue Name"
              value={newGroundName}
              onChange={(e) => setNewGroundName(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Available Hours"
              value={newGroundTime}
              onChange={(e) => setNewGroundTime(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Price per Hour (₹)"
              value={newGroundPrice}
              onChange={(e) => setNewGroundPrice(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Booking Link"
              value={newGroundLink}
              onChange={(e) => setNewGroundLink(e.target.value)}
            />

            <button
              style={styles.btnPrimary}
              type="submit"
            >
              Add Venue
            </button>
          </form>
        </div>


        <div
          style={{
            padding: '16px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px'
          }}
        >
          <h4>
            🛍️ Add Vega Store Product
          </h4>

          <form
            onSubmit={handleAddShopItem}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <input
              style={styles.input}
              placeholder="Item Name"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Price (₹)"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Description"
              value={newItemDesc}
              onChange={(e) => setNewItemDesc(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Store / Payment Link"
              value={newItemLink}
              onChange={(e) => setNewItemLink(e.target.value)}
            />

            <button
              style={styles.btnPrimary}
              type="submit"
            >
              Add Product
            </button>
          </form>
        </div>

      </div>
    </div>
  )}


  {/* ================================================================
      SELECTED PLAYER MATCH ROOM TAB
  ================================================================ */}

  {activeTab === 'playerRoom' && selectedPlayerForRoom && (
    <div>
      <button
        onClick={() => setActiveTab('leaderboard')}
        style={{
          marginBottom: '1rem',
          padding: '0.5rem 1rem',
          cursor: 'pointer',
          backgroundColor: '#1e293b',
          color: '#fff',
          border: '1px solid #334155',
          borderRadius: '6px',
          fontWeight: 'bold'
        }}
      >
        ← Back to Leaderboard
      </button>

      <DailyPlayerCheckIn
        currentUser={{
          id:
            selectedPlayerForRoom.player_id ||
            selectedPlayerForRoom.id,
          name:
            selectedPlayerForRoom.player_name ||
            selectedPlayerForRoom.name
        }}
      />
    </div>
  )}

</main>
</div>
);

// no extra token
}

export default App;
