import axios from 'axios';

const buildClient = ({ req }) => {
	if (typeof window === 'undefined') {
		// We are on the server, make request to
		// http://ingress-nginx-controller.ingress-nginx.svc.cluster.local
		return axios.create({
			baseURL:
				'http://ingress-nginx-controller.ingress-nginx.svc.cluster.local',
			headers: req.headers, // Forward the headers from the incoming request to the API request
		});
	} else {
		// We are on the browser, make request to /api/users/currentuser
		return axios.create({
			baseURL: '/',
		});
	}
};

export default buildClient;
