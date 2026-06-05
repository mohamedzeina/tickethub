import { useState } from 'react';
import axios from 'axios';

// Operator-only gate scanner (admission #delivery). Paste a pass code (from the
// buyer's QR) + the venue's gate key → POST /api/passes/redeem. The server flips
// the pass to redeemed atomically and tells us whether to admit. A stand-in for
// a real handheld scanner; the gate key gates the action (GATE_API_KEY).
const GatePage = () => {
	const [code, setCode] = useState('');
	const [gateKey, setGateKey] = useState('');
	const [result, setResult] = useState(null);
	const [busy, setBusy] = useState(false);

	const scan = async (e) => {
		e.preventDefault();
		setBusy(true);
		setResult(null);
		try {
			const { data } = await axios.post(
				'/api/passes/redeem',
				{ code: code.trim() },
				{ headers: { 'x-gate-key': gateKey.trim() } },
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

	return (
		<div className="container gatepage">
			<h1>Gate Scanner</h1>
			<p style={{ color: '#6f6244', fontSize: 14, marginTop: 4 }}>
				Operator-only. Paste a pass code and your gate key to admit a guest.
			</p>
			<form onSubmit={scan}>
				<input
					className="gatepage__field"
					placeholder="Pass code (from the buyer's QR)"
					value={code}
					onChange={(e) => setCode(e.target.value)}
				/>
				<input
					className="gatepage__field"
					placeholder="Gate key"
					type="password"
					value={gateKey}
					onChange={(e) => setGateKey(e.target.value)}
				/>
				<button
					className="btn btn--red btn--block"
					disabled={busy || !code || !gateKey}
				>
					{busy ? 'Scanning…' : 'Scan & admit'}
				</button>
			</form>

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
