import mongoose from 'mongoose';
import { PasswordManager } from '../services/password';
import { normalizeEmail } from '../services/normalize-email';

// Interface that describes properties that are required to create a new User
interface UserAttrs {
	email: string;
	password: string;
	emailVerified?: boolean;
	displayName?: string;
}

// Interface that describes properties that the User model
interface UserModel extends mongoose.Model<UserDoc> {
	build(attrs: UserAttrs): UserDoc;
}

// Interface that describes the properties that a User document has
interface UserDoc extends mongoose.Document {
	email: string;
	password: string;
	emailVerified: boolean;
	// Public, user-editable display name (#18). Nullable — accounts that never
	// set one fall back to an opaque handle on the client. Never in the JWT
	// (it's mutable; would go stale until re-login).
	displayName?: string;
	// Account-hardening tokens (#7). We store only a sha256 *hash* of the raw
	// token (the raw value lives only in the email link) plus an expiry.
	verificationToken?: string;
	verificationTokenExpires?: Date;
	passwordResetToken?: string;
	passwordResetExpires?: Date;
}

// Interface for the JSON representation after transformation. Only the members
// the transform below actually adds or removes — everything else passes through
// untouched and doesn't need naming here.
interface UserJson {
	_id?: mongoose.Types.ObjectId; // Optional for deletion
	password?: string; // Optional for deletion
	__v?: number; // Optional for deletion
	id?: string; // Added during transformation
	verificationToken?: string | null;
	verificationTokenExpires?: Date | null;
	passwordResetToken?: string | null;
	passwordResetExpires?: Date | null;
}

const userSchema = new mongoose.Schema(
	{
		email: {
			type: String,
			required: true,
			// Backstop for the route-level sanitizer: anything written through
			// this model is stored lowercase, so a caller that skips the
			// validator chain can't reintroduce a case-variant account.
			// NOTE: mongoose does not apply setters to query filters, so reads
			// must normalize too — the routes do it via emailRule().
			set: normalizeEmail,
		},
		password: {
			type: String,
			required: true,
		},
		emailVerified: {
			type: Boolean,
			default: false,
		},
		displayName: String,
		verificationToken: String,
		verificationTokenExpires: Date,
		passwordResetToken: String,
		passwordResetExpires: Date,
	},
	{
		toJSON: {
			transform(doc: UserDoc, ret: UserJson) {
				ret.id = ret._id?.toString();
				delete ret._id;
				delete ret.password;
				delete ret.__v;
				// Never leak token material or its expiry to clients.
				delete ret.verificationToken;
				delete ret.verificationTokenExpires;
				delete ret.passwordResetToken;
				delete ret.passwordResetExpires;
			},
		},
	},
);

// One account per email address. The signup route also does a findOne() first —
// that's what produces the friendly "Email already in use" message — but a
// check-then-insert has a race window, so two concurrent signups for the same
// address could both pass it. This index is the actual guard; the route turns
// the loser's E11000 back into the same 400. Same pattern as every other
// identity collection in the repo (payment.stripeId, wishlist user+ticket, ...).
//
// Safe to enforce only because emails are normalized to lowercase on the way in
// (services/normalize-email.ts) — otherwise case variants would slip past it.
userSchema.index({ email: 1 }, { unique: true });

userSchema.pre('save', async function (done) {
	if (this.isModified('password')) {
		const hashed = await PasswordManager.toHash(this.get('password'));
		this.set('password', hashed);
	}
	done();
});

userSchema.statics.build = (attrs: UserAttrs) => {
	return new User(attrs);
};

const User = mongoose.model<UserDoc, UserModel>('User', userSchema);

export { User, UserDoc };
