import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function DailyPlayerCheckIn({ currentUser }) {
  const playerName = currentUser?.name || 'Sagnik Guha';
  const playerId = currentUser?.id || 'PLR-101';

  // Firestore Athlete Terminal Handler
  const handleAthleteCheckIn = async (fullName, mobileNumber, association, coachName) => {
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    const playerIdKey = `player_${cleanMobile}`;
    const userRef = doc(db, 'users', playerIdKey);

    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: playerIdKey,
        name: fullName,
        mobile: cleanMobile,
        association: association,
        assignedCoach: coachName || 'Coach Tamal',
        role: 'player',
        createdAt: serverTimestamp()
      });
    }

    // Save session info to local memory
    localStorage.setItem('activePlayerId', playerIdKey);
    localStorage.setItem('activePlayerName', fullName);
    localStorage.setItem('userRole', 'player');
  };

  // Check-In Form State
  const [sessionGroup, setSessionGroup] = useState('Group A');
  const [kitStatus, setKitStatus] = useState('Complete Kit');
  const [checkInStatus, setCheckInStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Photo & Webcam State
  const [capturedImage, setCapturedImage] = useState(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Telemetry Reports State
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [error, setError] = useState('');

  // 1. Fetch user-specific reports dynamically on mount / ID change
  useEffect(() => {
    const fetchTelemetryReports = async () => {
      setLoadingReports(true);
      setError('');
      try {
        // FIXED: Replaced corrupted escaped string interpolation with valid template literal
        // ✅ Correct:
       const response = await fetch(`\({API_BASE_URL}/api/player-room/\){encodeURIComponent(playerId)}`);
        if (response.ok) {
          const data = await response.json();
          setReports(data.reports || []);
        } else {
          setError('Failed to retrieve daily session telemetry.');
        }
      } catch (err) {
        console.error('Failed to retrieve player match room reports:', err);
        setError('Backend API offline or endpoint unreachable.');
      } finally {
        setLoadingReports(false);
      }
    };

    if (playerId) fetchTelemetryReports();
  }, [playerId]);

  // Clean up media stream on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  // 2. Webcam Controls
  const startWebcam = async () => {
    try {
      setError('');
      setIsWebcamActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera Access Error:', err);
      setError('Unable to access webcam. Please check camera permissions or upload an image.');
      setIsWebcamActive(false);
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsWebcamActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const imageDataUrl = canvas.toDataURL('image/jpeg');
    setCapturedImage(imageDataUrl);
    stopWebcam();
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 3. Submit photo via FormData to fix network errors & calibrate Re-ID engine
  const handleCheckInSubmit = async (e) => {
    e.preventDefault();
    if (!capturedImage) {
      setCheckInStatus('⚠️ Please capture or upload an intake photo first.');
      return;
    }

    setIsSubmitting(true);
    setCheckInStatus('Registering player photo & squad details...');

    try {
      const formData = new FormData();
      formData.append('player_id', playerId);
      formData.append('name', playerName);
      formData.append('group_id', sessionGroup);
      formData.append('kit_status', kitStatus);

      // Convert DataURL / Base64 to Blob File for multipart upload
      if (capturedImage.startsWith('data:')) {
        const res = await fetch(capturedImage);
        const blob = await res.blob();
        formData.append('photo', blob, `${playerId}_kit.jpg`);
      }

      const response = await fetch(`${API_BASE_URL}/api/players/register`, {
        method: 'POST',
        body: formData // Content-Type header auto-set for multipart
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCheckInStatus(`✅ Pre-drill check-in complete! Re-ID feature vectors registered for ${playerName}.`);
      } else {
        setCheckInStatus(`⚠️ Check-in error: ${data.message || 'Registration failed'}`);
      }
    } catch (err) {
      console.error('Check-in Submission Error:', err);
      setCheckInStatus('⚠️ Backend API offline or endpoint unreachable.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return React.createElement('div', { style: { padding: '1.5rem', backgroundColor: '#fff' } },
    React.createElement('h3', null, '📋 Pre-Drill Player Check-In & Intake Photo'),
    React.createElement('p', null, 'Active Roster Profile: ', playerName, ' (', playerId, ')'),
    React.createElement('div', { style: { marginTop: '1rem' } },
      React.createElement('h4', null, '📸 Pre-Drill Photo Intake'),
      isWebcamActive 
        ? React.createElement('div', null,
            React.createElement('video', { ref: videoRef, autoPlay: true, playsInline: true, style: { width: '200px' } }),
            React.createElement('button', { type: 'button', onClick: capturePhoto }, '📸 Snap')
          )
        : React.createElement('button', { type: 'button', onClick: startWebcam }, '📹 Launch Camera'),
      React.createElement('label', { style: { marginLeft: '10px', cursor: 'pointer' } },
        '📁 Upload File',
        React.createElement('input', { type: 'file', accept: 'image/*', onChange: handleFileUpload, style: { display: 'none' } })
      )
    ),
    React.createElement('form', { onSubmit: handleCheckInSubmit, style: { marginTop: '1rem' } },
      React.createElement('label', null, 'Assigned Squad: '),
      React.createElement('select', { value: sessionGroup, onChange: (e) => setSessionGroup(e.target.value) },
        React.createElement('option', { value: 'Group A' }, 'Group A'),
        React.createElement('option', { value: 'Group B' }, 'Group B')
      ),
      React.createElement('br'),
      React.createElement('button', { type: 'submit', disabled: isSubmitting, style: { marginTop: '10px' } },
        isSubmitting ? 'Submitting...' : '✔ Complete Pre-Drill Check-In'
      )
    ),
    checkInStatus && React.createElement('p', null, checkInStatus)
  );
}