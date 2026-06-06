import { useRouter } from 'next/router';
import { Heart } from './icons';
import { signInHref } from '../utils/returnTo';

// Wishlist heart toggle (#16). Controlled: the parent owns saved-state (via
// useWishlist) and passes `saved` + `onToggle`. Logged-out users see the heart
// too but a click routes them to sign-in (return-to the listing) rather than
// 401ing. Stops click propagation so it works inside a card that's itself a link.
const SaveButton = ({
	ticketId,
	saved,
	onToggle,
	currentUser,
	returnTo,
	size = 18,
	withLabel = false,
}) => {
	const router = useRouter();

	const onClick = (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (!currentUser) {
			router.push(signInHref(returnTo || `/tickets/${ticketId}`));
			return;
		}
		onToggle(ticketId);
	};

	return (
		<button
			type="button"
			className={`savebtn${saved ? ' is-saved' : ''}${withLabel ? ' savebtn--label' : ''}`}
			onClick={onClick}
			aria-pressed={saved}
			aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
			title={saved ? 'Saved — remove from wishlist' : 'Save to wishlist'}
		>
			<Heart filled={saved} style={{ width: size, height: size }} />
			{withLabel && <span>{saved ? 'Saved' : 'Save to wishlist'}</span>}
		</button>
	);
};

export default SaveButton;
