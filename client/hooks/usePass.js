import { useEffect, useState } from 'react';
import axios from 'axios';

// Fetch the buyer's admission pass for an order. The pass is minted off the
// payment:created event, so it can briefly lag a freshly-paid order — poll a few
// times on 404 before settling. Returns { pass, status } where status is
// 'loading' | 'ready' | 'pending' (not minted yet) | 'error'.
const usePass = (orderId) => {
	const [pass, setPass] = useState(null);
	const [status, setStatus] = useState('loading');

	useEffect(() => {
		if (!orderId) return;
		let active = true;
		let tries = 0;

		const poll = async () => {
			try {
				const { data } = await axios.get(`/api/passes/order/${orderId}`);
				if (!active) return;
				setPass(data);
				setStatus('ready');
			} catch (err) {
				if (!active) return;
				const code = err.response?.status;
				if (code === 404 && tries < 8) {
					tries += 1;
					setStatus('pending');
					setTimeout(poll, 1500);
				} else {
					setStatus(code === 404 ? 'pending' : 'error');
				}
			}
		};

		poll();
		return () => {
			active = false;
		};
	}, [orderId]);

	return { pass, status };
};

export default usePass;
