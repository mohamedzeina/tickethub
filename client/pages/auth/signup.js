import AuthForm from '../../components/AuthForm';

const SignUp = () => (
	<AuthForm
		title="Create your account"
		subtitle="Join TicketHub to buy and sell tickets in seconds."
		url="/api/users/signup"
		submitLabel="Sign Up"
		footer={{
			text: 'Already have an account?',
			href: '/auth/signin',
			linkLabel: 'Sign in',
		}}
	/>
);

export default SignUp;
