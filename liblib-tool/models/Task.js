import mongoose from 'mongoose';

const TaskSchema = new mongoose.Schema({
  originalText: {
    type: String,
    required: [true, 'Please provide the original text'],
  },
  doubaoPrompt: {
    type: String,
    required: false,
  },
  imageUrl: {
    type: String,
    required: false,
  },
  status: {
    type: String,
    enum: ['pending', 'processing_doubao', 'processing_liblib', 'completed', 'failed'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.Task || mongoose.model('Task', TaskSchema);
