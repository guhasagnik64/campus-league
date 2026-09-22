import React, { useState } from 'react';

export default function PaymentModal({ isOpen, onClose, user, amount = "499", onPaymentVerified }) {
  const [transactionId, setTransactionId] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasSentWhatsapp, setHasSentWhatsapp] = useState(false);

  if (!isOpen) return null;

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) setScreenshot(URL.createObjectURL(file));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!transactionId && !screenshot) {
      alert("Please upload a payment screenshot or enter the UPI Ref ID.");
      return;
    }
    setIsSubmitted(true);
  };

  const whatsappMessage = encodeURIComponent(
    `Hello Admin, I have completed the subscription payment of ₹${amount} for student: ${user?.name || 'Player'}.\nTransaction Ref ID: ${transactionId || 'Attached Screenshot'}`
  );

  const handleWhatsAppClick = () => {
    setHasSentWhatsapp(true);
    window.open(`https://wa.me/918250367993?text=${whatsappMessage}`, '_blank');
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalCard}>
        <div style={styles.header}>
          <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>🚨 Free Trial Expired</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {!isSubmitted ? (
          <div>
            <div style={styles.paymentInfoBox}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Pro Analytics Plan:</span>
              <span style={{ fontSize: '20px', fontWeight: '800', color: '#16a34a' }}>₹{amount}</span>
            </div>

            <div style={{ textAlign: 'center', margin: '15px 0' }}>
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                Scan to pay ₹{amount} using Google Pay, PhonePe, or Paytm:
              </p>
              <img src="/Gpay_qrcode_2.jpeg" alt="Google Pay QR Code" style={styles.qrImage} />
              <div style={styles.upiBadge}><strong>UPI ID:</strong> guhasagnik64@okicici</div>
            </div>

            <form onSubmit={handleSubmit} style={styles.form}>
              <label style={styles.label}>1. Upload Payment Screenshot *</label>
              <input type="file" accept="image/*" onChange={handleImageUpload} style={styles.fileInput} />

              <label style={styles.label}>2. Enter UPI Ref / UTR ID</label>
              <input type="text" placeholder="e.g. 4231XXXX9821" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} style={styles.textInput} />

              <button type="submit" style={styles.submitBtn}>✅ Submit & Send Proof</button>
            </form>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '15px 0' }}>
            <div style={{ fontSize: '44px', marginBottom: '8px' }}>📲</div>
            <h4 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Send Screenshot via WhatsApp</h4>
            <p style={{ fontSize: '12px', color: '#475569', lineHeight: '1.4' }}>
              Click below to send your payment proof to <strong>+91 82503 67993</strong>. Download will unlock immediately after sending.
            </p>

            <button onClick={handleWhatsAppClick} style={styles.whatsappBtn}>
              💬 Send Proof on WhatsApp (8250367993)
            </button>

            {hasSentWhatsapp && (
              <button 
                onClick={() => {
                  if (onPaymentVerified) onPaymentVerified();
                  onClose();
                }} 
                style={styles.downloadUnlockBtn}
              >
                ✅ Unlock & Download PDF Report
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px' },
  modalCard: { backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '20px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '12px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' },
  paymentInfoBox: { backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  qrImage: { width: '180px', height: 'auto', borderRadius: '8px', border: '1px solid #cbd5e1' },
  upiBadge: { backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '12px', padding: '5px 10px', borderRadius: '6px', display: 'inline-block', marginTop: '8px' },
  form: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '12px', fontWeight: 'bold', color: '#334155', textAlign: 'left' },
  fileInput: { fontSize: '12px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px' },
  textInput: { padding: '8px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' },
  submitBtn: { backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' },
  whatsappBtn: { width: '100%', backgroundColor: '#25D366', color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', marginTop: '12px' },
  downloadUnlockBtn: { width: '100%', backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', marginTop: '10px' }
};