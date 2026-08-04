import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { IconCamera, IconCheck, IconX, IconBack } from '../components/icons';

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

// Operator gate scanner (admission #delivery). Admit a guest by scanning their
// pass QR with the camera, opening their QR deep-link (prefills the code), or
// pasting the code. The gate key (GATE_API_KEY) authorizes the scan and is
// remembered per device.
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
				{ fps: 10, qrbox: 220 },
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
		<div className="container container--narrow gatescan">
			<Link href="/" className="backlink">
				<IconBack width="14" height="14" />
				Back to TicketHub
			</Link>

			<div className="gatescan__card stocked bordered">
				<div className="gatescan__head">
					<div>
						<div className="eyebrow">Admit One · Gate</div>
						<h1 className="gatescan__title display">Gate Scanner</h1>
					</div>
					<div className="gatescan__barcode" aria-hidden="true" />
				</div>
				<p className="gatescan__sub">
					Operator console — scan a guest&rsquo;s pass to admit them.
				</p>

				<div className="gatescan__perf" />

				<div className="gatescan__seclabel">Camera</div>
				<div className={`gatescan__viewport${scanning ? ' is-live' : ''}`}>
					<div id="reader" />
					{!scanning && (
						<div className="gatescan__viewport-idle">
							<IconCamera width="26" height="26" />
							<span>Camera off</span>
						</div>
					)}
					<div className="gatescan__reticle" aria-hidden="true" />
				</div>

				{!scanning ? (
					<button
						className="btn btn--red btn--block gatescan__btn"
						onClick={startCamera}
						disabled={busy}
					>
						<IconCamera />
						Scan a pass
					</button>
				) : (
					<button className="btn btn--line btn--block gatescan__btn" onClick={stopCamera}>
						Stop camera
					</button>
				)}
				{camError && (
					<p className="gatescan__camerr" role="alert">
						{camError}
					</p>
				)}

				<div className="gatescan__or">
					<span>or enter manually</span>
				</div>

				<label className="gatescan__seclabel" htmlFor="passCode">
					Pass code
				</label>
				<input
					id="passCode"
					className="gatescan__input"
					placeholder="6a22df…"
					value={manualCode}
					onChange={(e) => setManualCode(e.target.value)}
				/>
				<button
					className="btn btn--ink btn--block gatescan__btn"
					onClick={() => redeem(manualCode)}
					disabled={busy || !manualCode}
				>
					{busy ? 'Checking…' : 'Admit'}
				</button>

				{result && (
					<div
						className={`gatescan__verdict ${
							result.valid ? 'gatescan__verdict--ok' : 'gatescan__verdict--no'
						}`}
						role="status"
						aria-live="polite"
					>
						<div className="gatescan__verdict-big">
							{result.valid ? <IconCheck /> : <IconX />}
							{result.valid ? 'Admit' : 'Deny'}
						</div>
						<div className="gatescan__verdict-sub">
							{result.valid ? result.eventTitle || 'valid pass' : result.reason || 'invalid'}
						</div>
					</div>
				)}

				<div className="gatescan__perf" />
				<div className="gatescan__op">
					<label className="gatescan__seclabel" htmlFor="gateKey">
						Operator key
						<span className="gatescan__hint">remembered on this device</span>
					</label>
					<input
						id="gateKey"
						className="gatescan__input"
						type="password"
						placeholder="venue gate key"
						value={gateKey}
						onChange={(e) => setKey(e.target.value)}
						autoComplete="off"
					/>
				</div>
			</div>
		</div>
	);
};

export default GatePage;
