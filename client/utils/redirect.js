import Router from 'next/router';

// A redirect that works from inside getInitialProps on BOTH the server and the
// client. On the server we write a 302; on the client we push through the
// router. Centralized so pages don't each re-implement the res-vs-Router dance.
const redirect = (context, dest) => {
	if (context && context.res) {
		context.res.writeHead(302, { Location: dest });
		context.res.end();
		return;
	}
	Router.push(dest);
};

export default redirect;
