import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize Google GenAI if key available
let genAI: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.error('Failed to initialize GoogleGenAI', err);
  }
}

// Ask Northfield AI Endpoint
app.post('/api/chat', async (req, res) => {
  const { message, history, knowledgeBase } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Format verified knowledge base context
  let kbContext = '';
  if (Array.isArray(knowledgeBase) && knowledgeBase.length > 0) {
    kbContext = knowledgeBase
      .map((k: { title: string; category: string; content: string }) => `[${k.category}] ${k.title}:\n${k.content}`)
      .join('\n\n');
  }

  const systemInstruction = `You are "Ask Northfield AI", the official intelligent ambassador and assistant for Northfield School.
Northfield School is a prestigious, co-educational college-preparatory academy founded in 1984 serving Early Years through Grade 12. Motto: "Learn • Grow • Achieve".

IMPORTANT GUIDELINES:
1. You must answer questions specifically and accurately using the official Northfield School knowledge base provided below.
2. Ground all answers in verified school policies, academic programs, grade levels (Early Years, Primary, Middle School, High School), admissions process (/apply), timings (8:00 AM - 3:15 PM), tuition, campus facilities, and extracurriculars.
3. Keep answers warm, professional, articulate, and concise (2-4 paragraphs maximum).
4. If a user asks for something not in the knowledge base, state politely: "I don't have that specific information in my Northfield School knowledge base. Please contact our Admissions Office at admissions@northfieldschool.edu or call (555) 234-8800."
5. Never invent or hallucinate tuition figures, disciplinary policies, or faculty credentials not in the knowledge base.
6. When relevant, reference pages on the website: /apply for applications, /visit-campus for tours, /academics for curriculum, /news for announcements, and /contact for direct inquiries.

OFFICIAL NORTHFIELD KNOWLEDGE BASE:
${kbContext}`;

  if (genAI) {
    try {
      // Build conversation contents
      const conversationContents: any[] = [];
      if (Array.isArray(history)) {
        for (const item of history.slice(-6)) {
          conversationContents.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }],
          });
        }
      }
      conversationContents.push({
        role: 'user',
        parts: [{ text: message }],
      });

      const response = await genAI.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: conversationContents,
        config: {
          systemInstruction,
          temperature: 0.3, // low temperature for high fidelity to knowledge base
        },
      });

      const replyText = response.text || "Hello! How may I assist you with Northfield School admissions, programs, or campus visits?";

      // Determine suggested links based on query
      const suggestedLinks: { label: string; url: string }[] = [];
      const lower = message.toLowerCase();
      if (lower.includes('apply') || lower.includes('admission') || lower.includes('enroll')) {
        suggestedLinks.push({ label: 'Online Application', url: '/apply' });
        suggestedLinks.push({ label: 'Admissions Guide', url: '/admissions' });
      }
      if (lower.includes('visit') || lower.includes('tour') || lower.includes('open day')) {
        suggestedLinks.push({ label: 'Schedule Campus Visit', url: '/visit-campus' });
      }
      if (lower.includes('program') || lower.includes('grade') || lower.includes('curriculum')) {
        suggestedLinks.push({ label: 'Academic Programs', url: '/academics' });
      }
      if (lower.includes('contact') || lower.includes('phone') || lower.includes('email') || lower.includes('address')) {
        suggestedLinks.push({ label: 'Contact Directory', url: '/contact' });
      }

      return res.json({
        reply: replyText,
        suggestedLinks: suggestedLinks.length > 0 ? suggestedLinks : undefined,
      });
    } catch (err: any) {
      console.error('Gemini API call failed, falling back to knowledge base', err);
    }
  }

  // Graceful server fallback using knowledge base keyword matching
  const qLower = message.toLowerCase();
  if (Array.isArray(knowledgeBase)) {
    const match = knowledgeBase.find((k: any) =>
      k.title.toLowerCase().includes(qLower) ||
      k.content.toLowerCase().includes(qLower) ||
      (Array.isArray(k.keywords) && k.keywords.some((w: string) => qLower.includes(w.toLowerCase())))
    );

    if (match) {
      return res.json({
        reply: `${match.content}\n\nWould you like more information on this or any other aspect of Northfield School?`,
        suggestedLinks: [{ label: 'Explore Academics', url: '/academics' }, { label: 'Admissions Portal', url: '/apply' }]
      });
    }
  }

  return res.json({
    reply: "Welcome to Northfield School! We offer rigorous academic programs from Early Years to High School, supportive faculty, and state-of-the-art facilities. How can I assist your family today with admissions, programs, or scheduling a visit?",
    suggestedLinks: [
      { label: 'Apply Now', url: '/apply' },
      { label: 'Visit Campus', url: '/visit-campus' },
      { label: 'Academic Programs', url: '/academics' }
    ]
  });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', school: 'Northfield School', timestamp: new Date().toISOString() });
});

// Setup Vite or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Northfield School server running on port ${PORT}`);
  });
}

startServer();
