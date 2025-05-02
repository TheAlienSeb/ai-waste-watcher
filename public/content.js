
// Content script for AI Waste Watcher - Monitors AI sites for prompts

// Default impact estimates per prompt (these would ideally be based on research)
const IMPACT_FACTORS = {
  // Default values - these would be replaced with more accurate data
  // Water usage in ml per token
  waterPerToken: 0.5,
  // Carbon in grams of CO2 per token
  carbonPerToken: 0.2,
  // Energy in joules per token
  energyPerToken: 0.3,
  // Cost in cents per token
  costPerToken: 0.0001
};

// Different models have different impacts
const MODEL_FACTORS = {
  'gpt-4': 3.5,
  'gpt-3.5': 1.0,
  'claude': 2.0,
  'perplexity': 1.5,
  'gemini': 2.0,
  'default': 1.0
};

// Variables to track state
let currentSite = '';
let observingTextarea = false;
let lastPromptTime = 0;
let lastPromptText = '';

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "aiSiteDetected") {
    currentSite = message.site;
    console.log("Content script activated for:", currentSite);
    setupPromptDetection();
    sendResponse({status: "Detection initialized"});
  }
  return true;
});

// Set up prompt detection based on the current site
function setupPromptDetection() {
  if (observingTextarea) return; // Don't set up again if already observing
  
  switch (true) {
    case currentSite.includes('chat.openai'):
      detectChatGPT();
      break;
    case currentSite.includes('claude.ai'):
      detectClaude();
      break;
    case currentSite.includes('perplexity'):
      detectPerplexity();
      break;
    default:
      detectGenericAI();
      break;
  }
  
  observingTextarea = true;
  
  // Also set up MutationObserver to detect new elements
  observePageChanges();
}

// Detect ChatGPT prompts
function detectChatGPT() {
  document.addEventListener('click', (e) => {
    // ChatGPT send button or Enter key in textarea
    if (e.target.closest('button[data-testid="send-button"]') || 
       (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA')) {
      const textareas = document.querySelectorAll('textarea');
      if (textareas.length > 0) {
        const textarea = textareas[textareas.length - 1];
        const promptText = textarea.value;
        
        // Only process if the prompt is new and not empty
        if (promptText && promptText !== lastPromptText && Date.now() - lastPromptTime > 1000) {
          processPrompt(promptText, 'gpt');
          lastPromptText = promptText;
          lastPromptTime = Date.now();
        }
      }
    }
  }, true);
}

// Detect Claude prompts
function detectClaude() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('button[aria-label="Send message"]') || 
       (e.key === 'Enter' && !e.shiftKey && e.target.getAttribute('role') === 'textbox')) {
      const textbox = document.querySelector('[role="textbox"]');
      if (textbox) {
        const promptText = textbox.textContent;
        
        if (promptText && promptText !== lastPromptText && Date.now() - lastPromptTime > 1000) {
          processPrompt(promptText, 'claude');
          lastPromptText = promptText;
          lastPromptTime = Date.now();
        }
      }
    }
  }, true);
}

// Detect Perplexity prompts
function detectPerplexity() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('button[aria-label="Search"]') || 
       (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA')) {
      const textareas = document.querySelectorAll('textarea');
      if (textareas.length > 0) {
        const textarea = textareas[0];
        const promptText = textarea.value;
        
        if (promptText && promptText !== lastPromptText && Date.now() - lastPromptTime > 1000) {
          processPrompt(promptText, 'perplexity');
          lastPromptText = promptText;
          lastPromptTime = Date.now();
        }
      }
    }
  }, true);
}

// Generic AI site prompt detection (fallback)
function detectGenericAI() {
  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' || 
       (e.key === 'Enter' && !e.shiftKey && 
        (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT'))) {
      
      // Try to find text input
      const inputs = [
        ...document.querySelectorAll('textarea'), 
        ...document.querySelectorAll('input[type="text"]'),
        ...document.querySelectorAll('[role="textbox"]')
      ];
      
      if (inputs.length > 0) {
        // Get the most recently active input
        const input = inputs[inputs.length - 1];
        const promptText = input.value || input.textContent;
        
        if (promptText && promptText !== lastPromptText && Date.now() - lastPromptTime > 1000) {
          processPrompt(promptText, 'default');
          lastPromptText = promptText;
          lastPromptTime = Date.now();
        }
      }
    }
  }, true);
}

// Process a detected prompt
function processPrompt(text, model) {
  console.log("Prompt detected:", text.substring(0, 30) + "...");
  
  // Calculate tokens (very rough estimate: ~4 chars per token)
  const tokenCount = Math.ceil(text.length / 4);
  
  // Apply model-specific factors
  const modelFactor = MODEL_FACTORS[model] || MODEL_FACTORS.default;
  
  // Calculate environmental impact
  const impact = {
    waterUsage: tokenCount * IMPACT_FACTORS.waterPerToken * modelFactor, // ml
    carbonEmissions: tokenCount * IMPACT_FACTORS.carbonPerToken * modelFactor, // g
    energyConsumption: tokenCount * IMPACT_FACTORS.energyPerToken * modelFactor, // J
    cost: tokenCount * IMPACT_FACTORS.costPerToken * modelFactor, // $
    tokenCount: tokenCount,
    model: model,
    site: currentSite
  };
  
  // Send the impact data to the background script
  chrome.runtime.sendMessage({
    action: "promptDetected", 
    data: impact
  });
}

// Observe page changes to detect newly added elements
function observePageChanges() {
  const observer = new MutationObserver((mutations) => {
    if (!observingTextarea) {
      setupPromptDetection();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize on page load
window.addEventListener('load', () => {
  // Check if we're on an AI site by messaging the background script
  chrome.runtime.sendMessage({action: "checkCurrentSite"});
});
