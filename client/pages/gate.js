import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

// Pull the signed pass code out of a scanned value — it may be a raw code, or a
// `/gate?code=...` deep-link URL (what the receipt QR encodes, so a plain phone
// camera can just open the gate prefilled with no scanner app).
const extractCode = (text) => {
	if (!text) return '';
	try {
		const u = new URL(text, window.location.origin);
		const c = u.searchParams.get('code');
		if (c) return c;
	} catch {
		/* not a URL — fall through to raw */
	}
	return String(text).trim();
};

// Operator gate scanner (admission #delivery). Admit a guest by (1) scanning
// their pass QR with the camera, (2) opening their QR deep-link which prefills
// the code, or (3) pasting the code. The gate key (GATE_API_KEY) authorizes the
// scan and is remembered per device.
const GatePage = () => {
	const [gateKey, setGateKey] = useState('');
	const [manualCode, setManualCode] = useState('');
	const [result, setResult] = useState(null);
	const [busy, setBusy] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [camError, setCamError] = useState('');
	const scannerRef = useRef(null);
	const keyRef = useRef(''); // latest key, for the camera callback's stale closure

	const setKey = (v) => {
		setGateKey(v);
		keyRef.current = v;
	};

	// Restore the saved gate key + prefill a code from a scanned deep link.
	useEffect(() => {
		const saved = window.localStorage.getItem('gateKey');
		if (saved) setKey(saved);
		const fromUrl = new URLSearchParams(window.location.search).get('code');
		if (fromUrl) setManualCode(fromUrl);
	}, []);

	// Stop the camera if we leave the page.
	useEffect(
		() => () => {
			if (scannerRef.current) {
				scannerRef.current.stop().catch(() => {});
				scannerRef.current = null;
			}
		},
		[],
	);

	const redeem = async (raw) => {
		const code = extractCode(raw);
		const key = (keyRef.current || '').trim();
		if (!key) {
			setResult({ valid: false, reason: 'enter the gate key first' });
			return;
		}
		if (!code) {
			setResult({ valid: false, reason: 'no code' });
			return;
		}
		window.localStorage.setItem('gateKey', key);
		setBusy(true);
		setResult(null);
		try {
			const { data } = await axios.post(
				'/api/passes/redeem',
				{ code },
				{ headers: { 'x-gate-key': key } },
			);
			setResult(data);
		} catch (err) {
			setResult({
				valid: false,
				reason: err.response?.status === 401 ? 'unauthorized (bad gate key)' : 'error',
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
				async (decoded) => {
					await stopCamera();
					setManualCode(extractCode(decoded));
					redeem(decoded);
				},
				() => {}, // per-frame decode failures are normal; ignore
			);
		} catch {
			setScanning(false);
			scannerRef.current = null;
			setCamError(
				"Couldn't open the camera (a self-signed cert can block it). Paste the code below instead.",
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
				onChange={(e) => setKey(e.target.value)}
			/>

			{!scanning ? (
				<button
					className="btn btn--red btn--block"
					onClick={startCamera}
					disabled={busy}
					style={{ marginTop: 8 }}
				>
					Scan QR with camera
				</button>
			) : (
				<button className="btn btn--block" onClick={stopCamera} style={{ marginTop: 8 }}>
					Stop camera
				</button>
			)}

			{/* html5-qrcode renders the camera preview into this element. */}
			<div id="reader" style={{ marginTop: 12, width: '100%' }} />
			{camError && (
				<p style={{ color: '#c4291b', fontSize: 13, marginTop: 8 }}>{camError}</p>
			)}

			<div
				style={{
					marginTop: 16,
					color: '#6f6244',
					fontSize: 12,
					fontFamily: 'var(--f-mono)',
				}}
			>
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
				disabled={busy || !manualCode}
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
