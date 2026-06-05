import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

// Operator gate scanner (admission #delivery). Two ways to admit a guest:
//  1. Point the camera at the buyer's QR — it decodes the code and redeems it.
//  2. Paste the code manually (fallback when there's no camera, e.g. scanning
//     your own screen locally).
// The gate key (GATE_API_KEY) authorizes the scan; we remember it in
// localStorage so an operator types it once per device.
const GatePage = () => {
	const [gateKey, setGateKey] = useState('');
	const [manualCode, setManualCode] = useState('');
	const [result, setResult] = useState(null);
	const [busy, setBusy] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [camError, setCamError] = useState('');
	const scannerRef = useRef(null);

	// Restore the saved gate key on mount.
	useEffect(() => {
		const saved = window.localStorage.getItem('gateKey');
		if (saved) setGateKey(saved);
	}, []);

	// Stop the camera if we leave the page.
	useEffect(() => {
		return () => {
			if (scannerRef.current) {
				scannerRef.current.stop().catch(() => {});
				scannerRef.current = null;
			}
		};
	}, []);

	const redeem = async (code) => {
		const key = gateKey.trim();
		if (!key) {
			setResult({ valid: false, reason: 'enter the gate key first' });
			return;
		}
		window.localStorage.setItem('gateKey', key);
		setBusy(true);
		setResult(null);
		try {
			const { data } = await axios.post(
				'/api/passes/redeem',
				{ code: (code || '').trim() },
				{ headers: { 'x-gate-key': key } },
			);
			setResult(data);
		} catch (err) {
			setResult({
				valid: false,
				reason:
					err.response?.status === 401
						? 'unauthorized (bad gate key)'
						: 'error',
			});
		} finally {
			setBusy(false);
		}
	};

	const stopCamera = async () => {
		if (scannerRef.current) {
			try {
				await scannerRef.current.stop();
			} catch {}
			scannerRef.current = null;
		}
		setScanning(false);
	};

	const startCamera = async () => {
		setCamError('');
		setResult(null);
		setScanning(true);
		try {
			const { Html5Qrcode } = await import('html5-qrcode');
			const scanner = new Html5Qrcode('reader');
			scannerRef.current = scanner;
			await scanner.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: 240 },
				async (decodedText) => {
					await stopCamera();
					redeem(decodedText);
				},
				() => {}, // per-frame decode failures are normal; ignore
			);
		} catch (err) {
			setScanning(false);
			scannerRef.current = null;
			setCamError(
				"Couldn't open the camera. Allow camera access for this site, or paste the code below.",
			);
		}
	};

	return (
		<div className="container gatepage">
			<h1>Gate Scanner</h1>
			<p style={{ color: '#6f6244', fontSize: 14, marginTop: 4 }}>
				Operator-only. Scan a guest's pass QR, or paste the code, to admit.
			</p>

			<input
				className="gatepage__field"
				placeholder="Gate key"
				type="password"
				value={gateKey}
				onChange={(e) => setGateKey(e.target.value)}
			/>

			{!scanning ? (
				<button
					className="btn btn--red btn--block"
					onClick={startCamera}
					disabled={busy || !gateKey}
					style={{ marginTop: 8 }}
				>
					Scan QR with camera
				</button>
			) : (
				<button
					className="btn btn--block"
					onClick={stopCamera}
					style={{ marginTop: 8 }}
				>
					Stop camera
				</button>
			)}

			{/* html5-qrcode renders the camera preview into this element. */}
			<div id="reader" style={{ marginTop: 12, width: '100%' }} />
			{camError && (
				<p style={{ color: '#c4291b', fontSize: 13, marginTop: 8 }}>{camError}</p>
			)}

			<div style={{ marginTop: 16, color: '#6f6244', fontSize: 12, fontFamily: 'var(--f-mono)' }}>
				— or paste the code —
			</div>
			<input
				className="gatepage__field"
				placeholder="Pass code (from the buyer's QR)"
				value={manualCode}
				onChange={(e) => setManualCode(e.target.value)}
			/>
			<button
				className="btn btn--red btn--block"
				onClick={() => redeem(manualCode)}
				disabled={busy || !manualCode || !gateKey}
			>
				{busy ? 'Checking…' : 'Admit'}
			</button>

			{result && (
				<div
					className={`gatepage__result ${
						result.valid ? 'gatepage__result--ok' : 'gatepage__result--no'
					}`}
				>
					{result.valid
						? `✓ ADMIT — ${result.eventTitle || 'valid pass'}`
						: `✗ DENY — ${result.reason || 'invalid'}`}
				</div>
			)}
		</div>
	);
};

export default GatePage;
