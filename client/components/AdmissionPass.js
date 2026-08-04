import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check } from './icons';
import usePass from '../hooks/usePass';

// One seat's pass body: a live QR (+ copy code), a checked-in note, or a revoked
// note. Shared by the single-seat view and the multi-seat tab panel (#10). Each
// seat is scanned independently, so each carries its own single-use code.
const PassBody = ({ pass }) => {
	const [copied, setCopied] = useState(false);

	const copyCode = async () => {
		try {
			await navigator.clipboard.writeText(pass.code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard blocked — the QR still works */
		}
	};

	if (pass.status === 'redeemed') {
		return (
			<div className="pass__state pass__state--used">
				<Check /> Checked in
				{pass.redeemedAt ? ` · ${new Date(pass.redeemedAt).toLocaleString()}` : ''}
			</div>
		);
	}
	if (pass.status === 'revoked') {
		return (
			<div className="pass__state pass__state--void">
				Pass revoked — this order was refunded.
			</div>
		);
	}
	if (pass.status === 'issued' && pass.code) {
		return (
			<>
				<div className="pass__qr">
					<QRCodeSVG
						value={`${
							typeof window !== 'undefined' ? window.location.origin : ''
						}/gate?code=${encodeURIComponent(pass.code)}`}
						size={172}
						bgColor="#f3ecd8"
						fgColor="#211b16"
						level="M"
					/>
				</div>
				<div className="pass__hint">Scan at the gate. Single use.</div>
				<button type="button" className="btn pass__copy" onClick={copyCode}>
					{copied ? 'Copied' : 'Copy gate code'}
				</button>
			</>
		);
	}
	return null;
};

// Maps a pass status to the coloured dot shown on its seat tab.
const seatDot = (status) =>
	status === 'redeemed' ? 'used' : status === 'revoked' ? 'void' : 'live';

// The admission passes (#delivery / #10). For a multi-seat order the seats are a
// compact tab strip showing one QR at a time — the receipt stays short no matter
// how many seats, and each tab carries that seat's status at a glance. Minted off
// payment:created, so they can briefly lag; usePass polls while pending.
const AdmissionPass = ({ orderId }) => {
	const { passes, status } = usePass(orderId);
	const [active, setActive] = useState(0);

	// Sort by seat so tabs read 1, 2, 3… regardless of the fetch order.
	const seats = [...passes].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
	const multi = seats.length > 1;
	const activeIndex = Math.min(active, Math.max(seats.length - 1, 0));

	let body;
	if (status === 'ready' && seats.length > 0) {
		body = (
			<>
				{multi && (
					<div className="pass__tabs" role="tablist" aria-label="Seat passes">
						{seats.map((p, i) => (
							<button
								key={p.id}
								type="button"
								role="tab"
								aria-selected={i === activeIndex}
								className={`pass__tab${i === activeIndex ? ' is-active' : ''}`}
								onClick={() => setActive(i)}
							>
								Seat {p.seat}
								<span
									className={`pass__dot pass__dot--${seatDot(p.status)}`}
									aria-hidden="true"
								/>
							</button>
						))}
					</div>
				)}
				<div className="pass__panel" role="tabpanel">
					<PassBody pass={seats[activeIndex]} />
				</div>
			</>
		);
	} else if (status === 'error') {
		body = <div className="pass__hint">Couldn’t load your pass.</div>;
	} else {
		// loading / pending — skeleton of the QR so the slot doesn't sit empty
		// while the pass is minted (it can lag the paid order by a moment).
		body = (
			<div className="pass__panel">
				<div className="pass__qr sk" style={{ width: 172, height: 172 }} />
				<div className="pass__hint">Generating your pass…</div>
			</div>
		);
	}

	return (
		<div className="pass">
			<div className="pass__head">
				{multi ? `Admission Passes · ${seats.length} seats` : 'Admission Pass'}
			</div>
			{body}
		</div>
	);
};

export default AdmissionPass;
