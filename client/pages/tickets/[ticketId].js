import { useRef, useState } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import useRequest from '../../hooks/useRequest';
import { ArrowLeft, Bolt, ArrowRight, Check } from '../../components/icons';
import {
	formatPrice,
	formatDateLong,
	serialFromId,
	barcodeNumber,
} from '../../utils/ticket';

const TicketShow = ({ ticket, currentUser }) => {
	const [torn, setTorn] = useState(false);
	const succeeded = useRef(false);
	const date = formatDateLong(ticket.eventDate);
	const serial = serialFromId(ticket.id);
	const isOwner = currentUser && ticket.userId && currentUser.id === ticket.userId;

	const { doRequest, generalErrors } = useRequest({
		url: '/api/orders',
		method: 'post',
		body: { ticketId: ticket.id },
		onSuccess: (order) => {
			succeeded.current = true;
			Router.push('/orders/[orderId]', `/orders/${order.id}`);
		},
	});

	// Tearing the perforated strip reserves the order. If the request fails we
	// "un-tear" so the buyer can read the error and try again.
	const onTear = async () => {
		if (torn) return;
		setTorn(true);
		await doRequest();
		if (!succeeded.current) {
			setTorn(false);
		}
	};

	return (
		<div className="container">
			<Link href="/" className="backlink">
				<ArrowLeft /> Back to all tickets
			</Link>

			<div className="detail stocked bordered">
				<div className="detail__face">
					<div className="detail__top">
						<div className="detail__admit">Admit One</div>
						<div className="detail__no">
							No.<span className="big">{serial}</span>
							{(ticket.category || 'EVENT').toUpperCase()}
						</div>
					</div>

					<h1>{ticket.title}</h1>

					{ticket.imageUrl && (
						<div className="printed detail__photo">
							<img src={ticket.imageUrl} alt={ticket.title} />
						</div>
					)}

					<div className="detail__rows">
						{date && (
							<div>
								<div className="k">Date</div>
								<div className="v">{date}</div>
							</div>
						)}
						{ticket.venue && (
							<div>
								<div className="k">Venue</div>
								<div className="v">{ticket.venue}</div>
							</div>
						)}
						{ticket.category && (
							<div>
								<div className="k">Category</div>
								<div className="v">{ticket.category}</div>
							</div>
						)}
						<div>
							<div className="k">Admission</div>
							<div className="v">One (1) Person</div>
						</div>
					</div>

					{ticket.description && (
						<p className="detail__desc">{ticket.description}</p>
					)}

					<p className="fineprint">
						★ This ticket is a revocable license and admits one (1) person only.
						Not redeemable for cash. Order reserved for 15:00 from checkout.
						Resale at or below face value. TicketHub © 2026.
					</p>
				</div>

				<div className="detail__buy">
					<div>
						<div className="lbl">Counterfoil · Retain</div>
						<div className="price">
							{formatPrice(ticket.price)}
							<small>per ticket · admit one</small>
						</div>
					</div>

					<div className="qrline">
						<div className="qr" aria-hidden="true" />
						<small>
							Scan at
							<br />the gate to
							<br />enter venue
						</small>
					</div>

					{isOwner ? (
						<div className="owner-note">
							<div className="owner-note__tag">Your listing</div>
							This is your own ticket — you can&apos;t buy it. Share the link
							with a buyer instead.
						</div>
					) : (
						<div className={`tear${torn ? ' torn' : ''}`} id="tear">
							<button type="button" className="tear__strip" onClick={onTear}>
								<Bolt />
								Tear here to purchase
								<ArrowRight />
							</button>
							<div className="tear__done">
								<Check />
								{succeeded.current ? 'Admitted · reserving…' : 'Reserving…'}
							</div>
						</div>
					)}

					<div className="barcode barcode--sm" aria-hidden="true" />
					<div className="barcode__num">{barcodeNumber(ticket.id)}</div>

					{generalErrors()}
				</div>
			</div>
		</div>
	);
};

TicketShow.getInitialProps = async (context, client) => {
	const { ticketId } = context.query;
	const { data } = await client.get(`/api/tickets/${ticketId}`);

	return { ticket: data };
};

export default TicketShow;
