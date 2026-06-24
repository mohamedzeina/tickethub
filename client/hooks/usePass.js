import { useEffect, useState } from 'react';
import axios from 'axios';

// Fetch the buyer's admission passes for an order. Multi-seat (#10): an order can
// have several passes (one per seat), returned as an array. They're minted off the
// payment:created event, so they can briefly lag a freshly-paid order — poll a few
// times on 404 before settling. Returns { passes, status } where status is
// 'loading' | 'ready' | 'pending' (not minted yet) | 'error'.
const usePass = (orderId) => {
	const [passes, setPasses] = useState([]);
	const [status, setStatus] = useState('loading');

	useEffect(() => {
		if (!orderId) return;
		let active = true;
		let tries = 0;

		const poll = async () => {
			try {
				const { data } = await axios.get(`/api/passes/order/${orderId}`);
				if (!active) return;
				setPasses(data.passes || []);
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

	return { passes, status };
};

export default usePass;
