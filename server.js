require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*'
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Helper function to load skill content
async function loadSkill(skillName) {
  try {
    const skillPath = path.join(__dirname, 'skills', skillName, 'SKILL.md');
    const skillContent = await fs.readFile(skillPath, 'utf-8');
    return skillContent;
  } catch (error) {
    console.error(`Error loading skill ${skillName}:`, error.message);
    return null;
  }
}

// Helper function to list available skills
async function listSkills() {
  try {
    const skillsDir = path.join(__dirname, 'skills');
    const dirs = await fs.readdir(skillsDir);
    const skills = [];

    for (const dir of dirs) {
      const skillPath = path.join(skillsDir, dir, 'SKILL.md');
      try {
        await fs.access(skillPath);
        // Extract skill metadata from SKILL.md
        const content = await fs.readFile(skillPath, 'utf-8');
        const nameMatch = content.match(/name:\s*(.+)/);
        const descMatch = content.match(/description:\s*(.+)/);

        skills.push({
          name: nameMatch ? nameMatch[1].trim() : dir,
          description: descMatch ? descMatch[1].trim() : 'No description available',
          path: dir
        });
      } catch (err) {
        // Skip directories without SKILL.md
        continue;
      }
    }

    return skills;
  } catch (error) {
    console.error('Error listing skills:', error.message);
    return [];
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'N8N Custom Skills API is running' });
});

// List all available skills
app.get('/api/skills', async (req, res) => {
  try {
    const skills = await listSkills();
    res.json({
      success: true,
      count: skills.length,
      skills: skills
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific skill details
app.get('/api/skills/:skillName', async (req, res) => {
  try {
    const { skillName } = req.params;
    const skillContent = await loadSkill(skillName);

    if (!skillContent) {
      return res.status(404).json({
        success: false,
        error: `Skill '${skillName}' not found`
      });
    }

    res.json({
      success: true,
      skill: skillName,
      content: skillContent
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Execute skill with Claude API
app.post('/api/execute', async (req, res) => {
  try {
    const {
      skillName,
      userMessage,
      model = 'claude-3-5-sonnet-20241022',
      maxTokens = 4096,
      temperature = 1.0
    } = req.body;

    // Validate required fields
    if (!skillName || !userMessage) {
      return res.status(400).json({
        success: false,
        error: 'skillName and userMessage are required'
      });
    }

    // Load skill content
    const skillContent = await loadSkill(skillName);
    if (!skillContent) {
      return res.status(404).json({
        success: false,
        error: `Skill '${skillName}' not found`
      });
    }

    // Prepare system prompt with skill instructions
    const systemPrompt = `You are Claude with the ${skillName} skill enabled.

${skillContent}

Follow the skill instructions above carefully when responding to user requests.`;

    // Call Anthropic API
    const message = await anthropic.messages.create({
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    // Extract response
    const response = message.content[0].text;

    res.json({
      success: true,
      skill: skillName,
      model: model,
      response: response,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens
      }
    });

  } catch (error) {
    console.error('Error executing skill:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Execute skill with conversation history (for multi-turn conversations)
app.post('/api/execute/conversation', async (req, res) => {
  try {
    const {
      skillName,
      messages,
      model = 'claude-3-5-sonnet-20241022',
      maxTokens = 4096,
      temperature = 1.0
    } = req.body;

    // Validate required fields
    if (!skillName || !messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'skillName and messages array are required'
      });
    }

    // Load skill content
    const skillContent = await loadSkill(skillName);
    if (!skillContent) {
      return res.status(404).json({
        success: false,
        error: `Skill '${skillName}' not found`
      });
    }

    // Prepare system prompt with skill instructions
    const systemPrompt = `You are Claude with the ${skillName} skill enabled.

${skillContent}

Follow the skill instructions above carefully when responding to user requests.`;

    // Call Anthropic API
    const message = await anthropic.messages.create({
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      system: systemPrompt,
      messages: messages
    });

    // Extract response
    const response = message.content[0].text;

    res.json({
      success: true,
      skill: skillName,
      model: model,
      response: response,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens
      }
    });

  } catch (error) {
    console.error('Error executing skill:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Execute nanobanana-prompt skill specifically (convenience endpoint)
app.post('/api/nanobanana', async (req, res) => {
  try {
    const {
      intent,
      theme,
      style,
      referenceImageUrl,
      additionalInstructions,
      model = 'claude-3-5-sonnet-20241022',
      maxTokens = 8192
    } = req.body;

    // Validate required fields
    if (!intent || !theme || !style) {
      return res.status(400).json({
        success: false,
        error: 'intent, theme, and style are required'
      });
    }

    // Load skill content
    const skillContent = await loadSkill('nanobanana-prompt');
    if (!skillContent) {
      return res.status(404).json({
        success: false,
        error: 'nanobanana-prompt skill not found'
      });
    }

    // Prepare system prompt with skill instructions
    const systemPrompt = `You are Claude with the nanobanana-prompt skill enabled.

${skillContent}

Follow the skill instructions above carefully when generating design prompts.`;

    // Build user message
    let userMessage = `Generate a design prompt with the following parameters:

Intent: ${intent}
Theme: ${theme}
Style: ${style}`;

    if (referenceImageUrl) {
      userMessage += `\nReference Image: ${referenceImageUrl}`;
    }

    if (additionalInstructions) {
      userMessage += `\n\nAdditional Instructions:\n${additionalInstructions}`;
    }

    // Call Anthropic API
    const message = await anthropic.messages.create({
      model: model,
      max_tokens: maxTokens,
      temperature: 1.0,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    // Extract response
    const response = message.content[0].text;

    res.json({
      success: true,
      skill: 'nanobanana-prompt',
      parameters: {
        intent,
        theme,
        style
      },
      prompt: response,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens
      }
    });

  } catch (error) {
    console.error('Error executing nanobanana skill:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 N8N Custom Skills API Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Anthropic API Key: ${process.env.ANTHROPIC_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`\n📚 Available endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /api/skills - List all skills`);
  console.log(`   GET  /api/skills/:skillName - Get skill details`);
  console.log(`   POST /api/execute - Execute any skill`);
  console.log(`   POST /api/execute/conversation - Execute with conversation history`);
  console.log(`   POST /api/nanobanana - Execute nanobanana-prompt skill (convenience)`);
});

module.exports = app;
