
// Content script for AI Waste Watcher - Monitors AI sites for prompts

// Default impact estimates per prompt (these would ideally be based on research)
const IMPACT_FACTORS = {
  // Water usage in ml per token
  waterPerToken: 0.5,
  // Carbon in grams of CO2 per token
  carbonPerToken: 0.2,
  // Energy in joules per token (updated based on research)
  energyPerToken: 0.3,
  // Cost in cents per token
  costPerToken: 0.0001
};

// Different models have different impacts
const MODEL_FACTORS = {
  'gpt-4o': 3.5,
  'gpt-4': 3.0,
  'gpt-3.5': 1.0,
  'claude': 2.0,
  'perplexity': 1.5,
  'gemini': 2.0,
  'default': 1.0
};

// Model parameter estimates (in billions)
const MODEL_PARAMETERS = {
  'gpt-4o': 100, // ~100B active parameters
  'gpt-4': 80,
  'gpt-3.5': 20,
  'claude': 70,
  'perplexity': 40,
  'gemini': 60,
  'default': 50
};

// Variables to track state
let currentSite = '';
let observingTextarea = false;
let lastPromptTime = 0;
let lastPromptText = '';
let lastResponseText = '';
let livePreviewElement = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "aiSiteDetected") {
    currentSite = message.site;
    console.log("Content script activated for:", currentSite);
    setupPromptDetection();
    injectLivePreview();
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

// Inject live preview element for real-time stats
function injectLivePreview() {
  if (livePreviewElement) return;
  
  livePreviewElement = document.createElement('div');
  livePreviewElement.className = 'ai-waste-watcher-preview';
  livePreviewElement.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 12px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    z-index: 10000;
    max-width: 300px;
    backdrop-filter: blur(5px);
  `;
  
  livePreviewElement.innerHTML = `
    <div style="margin-bottom: 8px; font-weight: bold; display: flex; align-items: center;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 6px;">
        <path d="M13 16.9V17.9C13 18.4 13.4 18.9 13.9 18.9H16.9C17.4 18.9 17.9 18.5 17.9 17.9V16.9C17.9 16.4 17.5 15.9 16.9 15.9H14.9C14.4 15.9 13.9 16.4 13.9 16.9H13Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16.9 9H14C13.4 9 13 9.4 13 10V14.9H13.9H16.9C17.5 14.9 17.9 14.5 17.9 13.9V10C18 9.4 17.5 9 16.9 9Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16.9 8.9V7.9C16.9 7.4 16.5 6.9 15.9 6.9H13.9C13.4 6.9 12.9 7.3 12.9 7.9V12.9H13.9H15.9C16.4 12.9 16.9 12.5 16.9 11.9V8.9Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M13 5V7.9C13 8.5 12.6 8.9 12 8.9H8C7.4 8.9 7 8.5 7 7.9V5C7 4.4 7.4 4 8 4H12C12.6 4 13 4.4 13 5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 9V11.9C7 12.5 7.4 12.9 8 12.9H12C12.6 12.9 13 12.5 13 11.9V9H8C7.4 9 7 9.4 7 9Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7.1 13H6.1C5.5 13 5.1 13.4 5.1 14V16C5.1 16.6 5.5 17 6.1 17H10.1C10.7 17 11.1 16.6 11.1 16V14C11.1 13.4 10.7 13 10.1 13H8.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 19.2V5C5 4.4 4.6 4 4 4C3.4 4 3 4.4 3 5V19.2C3 19.7 3.3 20 3.7 20H20.2C20.6 20 21 19.7 21 19.2C21 18.8 20.7 18.4 20.2 18.4H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      AI Waste Watcher
      <span style="margin-left: auto; cursor: pointer;" id="ai-waste-close">×</span>
    </div>
    <div id="ai-waste-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
      <div>
        <div style="font-weight: bold; color: #9333ea;">Cost:</div>
        <div>$0.00</div>
      </div>
      <div>
        <div style="font-weight: bold; color: #ca8a04;">Energy:</div>
        <div>0.00 Wh</div>
      </div>
      <div>
        <div style="font-weight: bold; color: #3b82f6;">Water:</div>
        <div>0 mL</div>
      </div>
      <div>
        <div style="font-weight: bold; color: #22c55e;">Carbon:</div>
        <div>0 g</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(livePreviewElement);
  
  // Add close button functionality
  document.getElementById('ai-waste-close').addEventListener('click', () => {
    livePreviewElement.style.display = 'none';
  });
}

// Update the live preview with stats
function updateLivePreview(stats) {
  if (!livePreviewElement) return;
  
  const statsContainer = document.getElementById('ai-waste-stats');
  if (!statsContainer) return;
  
  // Calculate watt-hours
  const energyInWattHours = stats.energyConsumption / 3600000;
  
  statsContainer.innerHTML = `
    <div>
      <div style="font-weight: bold; color: #9333ea;">Cost:</div>
      <div>$${stats.cost.toFixed(4)}</div>
    </div>
    <div>
      <div style="font-weight: bold; color: #ca8a04;">Energy:</div>
      <div>${energyInWattHours.toFixed(3)} Wh</div>
    </div>
    <div>
      <div style="font-weight: bold; color: #3b82f6;">Water:</div>
      <div>${stats.waterUsage.toFixed(1)} mL</div>
    </div>
    <div>
      <div style="font-weight: bold; color: #22c55e;">Carbon:</div>
      <div>${stats.carbonEmissions.toFixed(2)} g</div>
    </div>
  `;
}

// Detect ChatGPT prompts
function detectChatGPT() {
  // Watch for send button clicks
  document.addEventListener('click', (e) => {
    if (e.target.closest('button[data-testid="send-button"]') || 
       (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA')) {
      const textareas = document.querySelectorAll('textarea');
      if (textareas.length > 0) {
        const textarea = textareas[textareas.length - 1];
        const promptText = textarea.value;
        
        // Only process if the prompt is new and not empty
        if (promptText && promptText !== lastPromptText && Date.now() - lastPromptTime > 1000) {
          processPrompt(promptText, 'gpt-4o'); // Assuming GPT-4o for ChatGPT
          lastPromptText = promptText;
          lastPromptTime = Date.now();
          
          // Start monitoring for response
          monitorChatGPTResponse();
        }
      }
    }
  }, true);
}

// Monitor for ChatGPT response
function monitorChatGPTResponse() {
  // Set up mutation observer to detect changes to the response
  const responseObserver = new MutationObserver((mutations) => {
    // Look for response container
    const responseContainers = document.querySelectorAll('[data-testid="conversation-turn-2"]');
    if (responseContainers.length > 0) {
      const latestResponse = responseContainers[responseContainers.length - 1];
      const responseText = latestResponse.textContent;
      
      if (responseText && responseText !== lastResponseText) {
        lastResponseText = responseText;
        
        // Estimate response tokens and update live preview
        const responseTokens = estimateTokenCount(responseText);
        const inputTokens = estimateTokenCount(lastPromptText);
        
        // Calculate impact based on the response length
        const impact = calculateImpact(responseTokens, inputTokens, 'gpt-4o');
        updateLivePreview(impact);
      }
    }
  });
  
  // Start observing with a delay to allow the UI to update
  setTimeout(() => {
    responseObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Stop observing after a reasonable time (30 seconds)
    setTimeout(() => responseObserver.disconnect(), 30000);
  }, 500);
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

// Estimate token count from text
function estimateTokenCount(text) {
  if (!text) return 0;
  
  // Rough estimate: 0.75 words per token (as mentioned in research)
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words / 0.75);
}

// Calculate impact based on the new research
function calculateImpact(responseTokens, inputTokens, model) {
  // Get model factor
  const modelFactor = MODEL_FACTORS[model] || MODEL_FACTORS.default;
  const modelParams = MODEL_PARAMETERS[model] || MODEL_PARAMETERS.default;
  
  // Based on research: 2 FLOP per active parameter per token
  const responseFlop = responseTokens * 2 * modelParams * 1e9;
  
  // Calculate energy consumption based on research
  // H100 can do ~989 trillion FLOP/s but at ~10% real utilization
  // H100 consumes ~1500W at ~70% average power utilization
  const h100FlopPerSecond = 9.89e14;
  const utilizationFactor = 0.1;
  const powerUtilization = 0.7;
  const gpuPower = 1500; // Watts
  
  // Calculate H100 time needed in seconds
  const h100Time = (responseFlop / h100FlopPerSecond) / utilizationFactor;
  
  // Calculate energy in joules (watt-seconds)
  const energyJoules = h100Time * gpuPower * powerUtilization;
  
  // Additional energy for input processing
  let inputEnergyJoules = 0;
  if (inputTokens > 0) {
    if (inputTokens <= 10000) {
      // For inputs up to 10k tokens, scale linearly
      inputEnergyJoules = (2.5 * 3600) * (inputTokens / 10000);
    } else {
      // For very large inputs, scale non-linearly
      inputEnergyJoules = ((40 * 3600) * (inputTokens / 100000));
    }
  }
  
  const totalEnergyJoules = energyJoules + inputEnergyJoules;
  
  // Calculate other impacts
  const waterUsage = responseTokens * IMPACT_FACTORS.waterPerToken * modelFactor;
  const carbonEmissions = responseTokens * IMPACT_FACTORS.carbonPerToken * modelFactor;
  const cost = responseTokens * IMPACT_FACTORS.costPerToken * modelFactor;
  
  // Create impact object
  const impact = {
    waterUsage: waterUsage,
    carbonEmissions: carbonEmissions,
    energyConsumption: totalEnergyJoules,
    cost: cost,
    tokenCount: responseTokens,
    model: model,
    site: currentSite
  };
  
  return impact;
}

// Process a detected prompt
function processPrompt(text, model) {
  console.log("Prompt detected:", text.substring(0, 30) + "...");
  
  // Calculate tokens (rough estimate: ~4 chars per token)
  const inputTokens = estimateTokenCount(text);
  
  // Estimate response tokens (typical response length from research: 500 tokens)
  const responseTokens = 500;
  
  // Calculate environmental impact using the new research data
  const impact = calculateImpact(responseTokens, inputTokens, model);
  
  // Show live preview
  updateLivePreview(impact);
  
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
