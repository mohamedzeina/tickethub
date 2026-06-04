import { Star } from './icons';

// Read-only star rating (#9). Renders five stars with `Math.round(value)`
// filled; the numeric average alongside is the authoritative figure. Size is in
// px so it scales for cards vs. the seller profile header.
const Stars = ({ value = 0, size = 15 }) => {
	const filled = Math.round(value);
	return (
		<span
			className="stars"
			role="img"
			aria-label={`${value} out of 5 stars`}
		>
			{[1, 2, 3, 4, 5].map((i) => (
				<Star
					key={i}
					filled={i <= filled}
					className="star"
					style={{ width: size, height: size }}
				/>
			))}
		</span>
	);
};

export default Stars;
