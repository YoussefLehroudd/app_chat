import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
	{
		senderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		receiverId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		message: {
			type: String,
			required: function() {
				return !this.audio;
			},
		},
		audio: {
			type: String, // URL to audio file
		},
		repliedMessageId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Message",
			default: null,
		},
		isSeen: {
			type: Boolean,
			default: false,
		},
		deletedFor: [{
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		}],
	},
	{ timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;
