import express from 'express';
import { sendChatMessage } from '../../services/chatService.js';

const router = express.Router();

router.post('/chat', sendChatMessage);

export default router;
