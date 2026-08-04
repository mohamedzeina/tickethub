import { useEffect } from 'react';

// Close-on-outside-click (mousedown) or Escape for a popover — the navbar bell,
// the account menu, the sort dropdown. `ref` wraps the whole popover including
// its trigger, so clicking the trigger doesn't count as "outside" and fight the
// toggle. Listeners are only attached while it's open.
//
//   useDismiss(wrapRef, open, () => setOpen(false));
const useDismiss = (ref, open, onClose) => {
	useEffect(() => {
		if (!open) return;
		const onDown = (e) => {
			if (ref.current && !ref.current.contains(e.target)) onClose();
		};
		const onKey = (e) => e.key === 'Escape' && onClose();
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);
};

export default useDismiss;
