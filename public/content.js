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

// Cumulative stats across prompts
const totalStats = {
  cost: 0,
  energyConsumption: 0,
  waterUsage: 0,
  carbonEmissions: 0,
  promptCount: 0
};

// Variables to track state
let currentSite = '';
let observingTextarea = false;
let lastPromptTime = 0;
let lastPromptText = '';
let lastResponseText = '';
let livePreviewElement = null;

// Update the message listener to properly respond to pings
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    debugLog("Ping received, responding with pong");
    sendResponse({status: "pong"});
  } else if (message.action === "aiSiteDetected") {
    debugLog(`AI site detected: ${message.site}`);
    currentSite = message.site;
    
    // Set up different detection methods based on the specific AI site
    if (currentSite.includes("chat.openai.com") || currentSite.includes("chatgpt.com")) {
      detectChatGPT();
    } else if (currentSite.includes("claude.ai") || currentSite.includes("anthropic.com")) {
      detectClaude();
    } else if (currentSite.includes("perplexity.ai")) {
      detectPerplexity();
    } else if (currentSite.includes("bard.google.com") || currentSite.includes("gemini.google.com")) {
      detectGoogleAI();
    } else {
      // Generic detection for other AI sites
      detectGenericAI();
    }
    
    // Always inject the preview
    injectLivePreview();
    
    sendResponse({status: "Detection configured for: " + message.site});
  } else if (message.action === "showPopup") {
    // Extension icon was clicked
    debugLog("Extension icon clicked - showing popup");
    showLivePreview();
    sendResponse({status: "Popup displayed"});
  } else if (message.action === "resetStats") {
    // Reset request received
    debugLog("Resetting statistics");
    resetStats();
    sendResponse({status: "Statistics reset"});
  }
  return true; // Keep the message channel open for async responses
});

// Set up prompt detection based on the current site
function setupPromptDetection() {
  debugLog("Setting up prompt detection");
  
  if (observingTextarea) return;
  
  // Configure site-specific detection
  if (window.location.hostname.includes("chat.openai.com") || 
      window.location.hostname.includes("chatgpt.com")) {
    detectChatGPT();
  } else if (window.location.hostname.includes("claude.ai") || 
            window.location.hostname.includes("anthropic.com")) {
    detectClaude();
  } else if (window.location.hostname.includes("perplexity.ai")) {
    detectPerplexity();
  } else if (window.location.hostname.includes("bard.google.com") || 
            window.location.hostname.includes("gemini.google.com")) {
    detectGoogleAI();
  } else {
    detectGenericAI();
  }
  
  observingTextarea = true;
  
  // Also set up MutationObserver to detect new elements
  observePageChanges();
}

// Inject live preview element for real-time stats
function injectLivePreview() {
  if (livePreviewElement) {
    // If it exists but is hidden, show it
    if (livePreviewElement.style.display === 'none') {
      livePreviewElement.style.display = 'block';
    }
    return;
  }
  
  livePreviewElement = document.createElement('div');
  livePreviewElement.className = 'ai-waste-watcher-preview';
  livePreviewElement.style.cssText = `
    position: fixed;
    background: rgba(33, 33, 33, 0.95);
    color: white;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 12px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    max-width: 300px;
    backdrop-filter: blur(5px);
  `;
  
  livePreviewElement.innerHTML = `
    <div style="margin-bottom: 8px; font-weight: bold; display: flex; align-items: center; border-bottom: 1px solid #444; padding-bottom: 8px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 6px;">
        <path d="M13 16.9V17.9C13 18.4 13.4 18.9 13.9 18.9H16.9C17.4 18.9 17.9 18.5 17.9 17.9V16.9C17.9 16.4 17.5 15.9 16.9 15.9H14.9C14.4 15.9 13.9 16.4 13.9 16.9H13Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16.9 9H14C13.4 9 13 9.4 13 10V14.9H13.9H16.9C17.5 14.9 17.9 14.5 17.9 13.9V10C18 9.4 17.5 9 16.9 9Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16.9 8.9V7.9C16.9 7.4 16.5 6.9 15.9 6.9H13.9C13.4 6.9 12.9 7.3 12.9 7.9V12.9H13.9H15.9C16.4 12.9 16.9 12.5 16.9 11.9V8.9Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M13 5V7.9C13 8.5 12.6 8.9 12 8.9H8C7.4 8.9 7 8.5 7 7.9V5C7 4.4 7.4 4 8 4H12C12.6 4 13 4.4 13 5Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 9V11.9C7 12.5 7.4 12.9 8 12.9H12C12.6 12.9 13 12.5 13 11.9V9H8C7.4 9 7 9.4 7 9Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7.1 13H6.1C5.5 13 5.1 13.4 5.1 14V16C5.1 16.6 5.5 17 6.1 17H10.1C10.7 17 11.1 16.6 11.1 16V14C11.1 13.4 10.7 13 10.1 13H8.1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 19.2V5C5 4.4 4.6 4 4 4C3.4 4 3 4.4 3 5V19.2C3 19.7 3.3 20 3.7 20H20.2C20.6 20 21 19.7 21 19.2C21 18.8 20.7 18.4 20.2 18.4H5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      AI Waste Watcher
      <span style="margin-left: auto; cursor: pointer; color: #aaa;" id="ai-waste-close">×</span>
    </div>
    <div id="ai-waste-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
      <div>
        <div style="font-weight: bold; color: #d8b4fe;">Total Cost:</div>
        <div>$0.00</div>
      </div>
      <div>
        <div style="font-weight: bold; color: #fcd34d;">Total Energy:</div>
        <div>0.00 Wh</div>
      </div>
      <div>
        <div style="font-weight: bold; color: #93c5fd;">Total Water:</div>
        <div>0 mL</div>
      </div>
      <div>
        <div style="font-weight: bold; color: #86efac;">Total Carbon:</div>
        <div>0 g</div>
      </div>
    </div>
    <div id="ai-waste-debug" style="margin-top: 8px; font-size: 10px; color: #aaa; display: none;">
      Status: Waiting for input...
    </div>
  `;
  
  // Add a test button
  const testButton = document.createElement('div');
  testButton.style.cssText = `
    margin-top: 8px;
    padding: 6px 0;
    text-align: center;
    background: #444;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  `;
  testButton.textContent = "Test Impact Calculation";
  testButton.onclick = () => {
    debugLog("Manual test triggered");
    processPrompt("This is a test prompt to verify impact calculations are working correctly.", "gpt-4o");
  };
  
  livePreviewElement.appendChild(testButton);
  
  document.body.appendChild(livePreviewElement);
  
  // Add close button functionality
  document.getElementById('ai-waste-close').addEventListener('click', () => {
    livePreviewElement.style.display = 'none';
    // Store state in session storage
    sessionStorage.setItem('aiWasteWatcherHidden', 'true');
  });
  
  // Make it draggable
  livePreviewElement.style.cursor = 'move';
  livePreviewElement.style.left = '20px';
  livePreviewElement.style.top = '20px';
  
  let isDragging = false;
  let offsetX = 0, offsetY = 0;
  
  // Handle mousedown to start dragging
  livePreviewElement.addEventListener('mousedown', e => {
    // Only handle dragging when clicking on the header area
    const target = e.target;
    const isHeader = target.closest('div') === livePreviewElement.firstElementChild;
    
    if (!isHeader) return;
    
    isDragging = true;
    // Calculate where inside the box we clicked
    offsetX = e.clientX - livePreviewElement.offsetLeft;
    offsetY = e.clientY - livePreviewElement.offsetTop;
    e.preventDefault();
  });
  
  // Handle mousemove to perform dragging
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    
    // Calculate new position ensuring it stays within viewport
    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;
    
    // Keep within viewport boundaries
    const maxX = window.innerWidth - livePreviewElement.offsetWidth;
    const maxY = window.innerHeight - livePreviewElement.offsetHeight;
    
    newLeft = Math.max(0, Math.min(maxX, newLeft));
    newTop = Math.max(0, Math.min(maxY, newTop));
    
    livePreviewElement.style.left = `${newLeft}px`;
    livePreviewElement.style.top = `${newTop}px`;
  });
  
  // Handle mouseup to stop dragging
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      
      // Save position in session storage
      sessionStorage.setItem('aiWasteWatcherPositionX', livePreviewElement.style.left);
      sessionStorage.setItem('aiWasteWatcherPositionY', livePreviewElement.style.top);
    }
  });
  
  // Restore previous position if available
  const savedX = sessionStorage.getItem('aiWasteWatcherPositionX');
  const savedY = sessionStorage.getItem('aiWasteWatcherPositionY');
  
  if (savedX && savedY) {
    livePreviewElement.style.left = savedX;
    livePreviewElement.style.top = savedY;
  }
}

// Add a function to restore the popup when extension is clicked
function showLivePreview() {
  if (livePreviewElement) {
    livePreviewElement.style.display = 'block';
    sessionStorage.removeItem('aiWasteWatcherHidden');
  } else {
    injectLivePreview();
  }
}

// Add a function to reset statistics
function resetStats() {
  // Reset the cumulative stats object
  totalStats.cost = 0;
  totalStats.energyConsumption = 0;
  totalStats.waterUsage = 0;
  totalStats.carbonEmissions = 0;
  totalStats.promptCount = 0;
  
  // Update the UI
  const statsContainer = document.getElementById('ai-waste-stats');
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div>
        <div style="font-weight: bold; color: #d8b4fe;">Total Cost:</div>
        <div>$0.00</div>
      </div>
      <div>
        <div style="font-weight: bold; color: #fcd34d;">Total Energy:</div>
        <div>0.00 Wh</div>
      </div>
      <div>
        <div style="font-weight: bold; color: #93c5fd;">Total Water:</div>
        <div>0 mL</div>
      </div>
      <div>
        <div style="font-weight: bold; color: #86efac;">Total Carbon:</div>
        <div>0 g</div>
      </div>
      <div style="grid-column: span 2; margin-top: 4px; font-size: 10px; text-align: center; color: #aaa;">
        Prompts analyzed: 0
      </div>
    `;
  }
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
      <div style="font-weight: bold; color: #9333ea;">Total Cost:</div>
      <div>$${stats.cost.toFixed(4)}</div>
    </div>
    <div>
      <div style="font-weight: bold; color: #ca8a04;">Total Energy:</div>
      <div>${energyInWattHours.toFixed(3)} Wh</div>
    </div>
    <div>
      <div style="font-weight: bold; color: #3b82f6;">Total Water:</div>
      <div>${stats.waterUsage.toFixed(1)} mL</div>
    </div>
    <div>
      <div style="font-weight: bold; color: #22c55e;">Total Carbon:</div>
      <div>${stats.carbonEmissions.toFixed(2)} g</div>
    </div>
    <div style="grid-column: span 2; margin-top: 4px; font-size: 10px; text-align: center; color: #aaa;">
      Prompts analyzed: ${stats.promptCount}
    </div>
  `;
}

// Improve the ChatGPT detection
function detectChatGPT() {
  debugLog("Setting up ChatGPT detection");
  
  // Listen for form submissions
  document.addEventListener('submit', function(e) {
    debugLog("Form submitted in ChatGPT");
    setTimeout(() => capturePrompt('gpt-4o'), 100);
  }, true);
  
  // Listen for send button clicks
  document.addEventListener('click', function(e) {
    const sendButton = e.target.closest('button[data-testid="send-button"]') || 
                     e.target.closest('button[aria-label="Send message"]') ||
                     e.target.closest('button svg[data-icon="paper-airplane"]');
    
    if (sendButton) {
      debugLog("ChatGPT send button clicked");
      setTimeout(() => capturePrompt('gpt-4o'), 100);
    }
  }, true);
  
  // Also listen for Enter key in textareas
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.target.tagName === 'TEXTAREA' || 
          e.target.getAttribute('role') === 'textbox' ||
          e.target.classList.contains('chatgpt-textarea')) {
        debugLog("ChatGPT Enter key pressed");
        setTimeout(() => capturePrompt('gpt-4o'), 100);
      }
    }
  }, true);
  
  // Add a mutation observer specifically for ChatGPT's dynamic interface
  const chatObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && 
          mutation.addedNodes.length && 
          document.querySelector('[data-list-id="chat-messages"]')) {
        
        // Check if this looks like a new message being added
        const messageAdded = Array.from(mutation.addedNodes).some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node.classList?.contains('group') || 
           node.querySelector?.('.markdown'))
        );
        
        if (messageAdded) {
          debugLog("ChatGPT message added to DOM");
          capturePrompt('gpt-4o');
        }
      }
    }
  });
  
  // Start observing the chat container
  setTimeout(() => {
    const chatContainer = document.querySelector('[data-list-id="chat-messages"]') || 
                         document.querySelector('#__next main');
    if (chatContainer) {
      chatObserver.observe(chatContainer, { 
        childList: true, 
        subtree: true 
      });
      debugLog("ChatGPT message observer attached");
    }
  }, 2000);
}

// Helper function to capture the prompt from any textarea
function capturePrompt(model) {
  const textareas = document.querySelectorAll('textarea');
  const inputFields = document.querySelectorAll('[role="textbox"]');
  
  debugLog(`Looking for input elements (found ${textareas.length} textareas, ${inputFields.length} textboxes)`);
  
  let promptText = '';
  
  // Try textareas first
  if (textareas.length > 0) {
    for (const textarea of textareas) {
      if (textarea.value && textarea.value.trim().length > 0) {
        promptText = textarea.value;
        debugLog(`Found prompt in textarea: ${promptText.substring(0, 30)}...`);
        break;
      }
    }
  }
  
  // If no prompt found, try contentEditable fields
  if (!promptText && inputFields.length > 0) {
    for (const field of inputFields) {
      if (field.textContent && field.textContent.trim().length > 0) {
        promptText = field.textContent;
        debugLog(`Found prompt in contentEditable: ${promptText.substring(0, 30)}...`);
        break;
      }
    }
  }
  
  // If still no prompt, try making one for testing
  if (!promptText && currentSite) {
    debugLog("No prompt found, creating test prompt");
    promptText = "This is a test prompt to ensure the extension is working correctly.";
  }
  
  if (promptText) {
    debugLog(`Processing prompt (length: ${promptText.length})`);
    processPrompt(promptText, model);
    lastPromptText = promptText;
    lastPromptTime = Date.now();
  } else {
    debugLog("No prompt text found");
  }
}

// Add this new function to ensure message handling is working
function checkConnectionWithBackground() {
  console.log("Checking connection with background script...");
  chrome.runtime.sendMessage({action: "ping"}, function(response) {
    if (response && response.status === "pong") {
      console.log("Connection with background script confirmed!");
    } else {
      console.log("Connection test completed, response:", response);
    }
  });
}

// Detect Claude prompts
function detectClaude() {
  debugLog("Setting up Claude detection");
  
  // Listen for clicks on send button
  document.addEventListener('click', function(e) {
    const sendButton = e.target.closest('button[aria-label="Send message"]') || 
                      e.target.closest('button svg[data-icon="paper-airplane"]');
    
    if (sendButton) {
      debugLog("Claude send button clicked");
      setTimeout(() => capturePrompt('claude'), 100);
    }
  }, true);
  
  // Listen for Enter key in contenteditable divs
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.target.getAttribute('role') === 'textbox' || 
          e.target.getAttribute('contenteditable') === 'true') {
        debugLog("Claude Enter key pressed");
        setTimeout(() => capturePrompt('claude'), 100);
      }
    }
  }, true);
  
  // Watch for new messages in Claude's conversation
  const claudeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        const messageAdded = Array.from(mutation.addedNodes).some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node.classList?.contains('claude-message') || 
           node.querySelector?.('.message-content'))
        );
        
        if (messageAdded) {
          debugLog("Claude message added to DOM");
          capturePrompt('claude');
        }
      }
    }
  });
  
  // Start observing the conversation container
  setTimeout(() => {
    const conversationContainer = document.querySelector('.conversations-container') || 
                                 document.querySelector('.chat-messages');
    if (conversationContainer) {
      claudeObserver.observe(conversationContainer, { 
        childList: true, 
        subtree: true 
      });
      debugLog("Claude message observer attached");
    }
  }, 2000);
}

// Detect Perplexity prompts
function detectPerplexity() {
  debugLog("Setting up Perplexity detection");
  
  // Listen for clicks on search button
  document.addEventListener('click', function(e) {
    const searchButton = e.target.closest('button[aria-label="Search"]') || 
                       e.target.closest('button.search-button');
    
    if (searchButton) {
      debugLog("Perplexity search button clicked");
      setTimeout(() => capturePrompt('perplexity'), 100);
    }
  }, true);
  
  // Listen for Enter key in search input
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.target.tagName === 'TEXTAREA' || 
          e.target.tagName === 'INPUT' || 
          e.target.getAttribute('role') === 'textbox') {
        debugLog("Perplexity Enter key pressed");
        setTimeout(() => capturePrompt('perplexity'), 100);
      }
    }
  }, true);
  
  // Watch for search results
  const perplexityObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        const resultAdded = Array.from(mutation.addedNodes).some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node.classList?.contains('result') || 
           node.querySelector?.('.answer-content'))
        );
        
        if (resultAdded) {
          debugLog("Perplexity answer added to DOM");
          capturePrompt('perplexity');
        }
      }
    }
  });
  
  // Start observing results container
  setTimeout(() => {
    const resultsContainer = document.querySelector('.results-container') || 
                            document.querySelector('.search-results');
    if (resultsContainer) {
      perplexityObserver.observe(resultsContainer, { 
        childList: true, 
        subtree: true 
      });
      debugLog("Perplexity results observer attached");
    }
  }, 2000);
}

// Add Google AI detection (Bard/Gemini)
function detectGoogleAI() {
  debugLog("Setting up Google AI detection");
  
  // Listen for send button clicks
  document.addEventListener('click', function(e) {
    const sendButton = e.target.closest('button[aria-label="Send"]') || 
                     e.target.closest('button[aria-label="Submit"]');
    
    if (sendButton) {
      debugLog("Google AI send button clicked");
      setTimeout(() => capturePrompt('gemini'), 100);
    }
  }, true);
  
  // Listen for Enter key in prompts
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.target.tagName === 'TEXTAREA' || 
          e.target.getAttribute('contenteditable') === 'true') {
        debugLog("Google AI Enter key pressed");
        setTimeout(() => capturePrompt('gemini'), 100);
      }
    }
  }, true);
  
  // Watch for responses from Google AI
  const googleAIObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        const responseAdded = Array.from(mutation.addedNodes).some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node.classList?.contains('response-container') || 
           node.querySelector?.('.response-content'))
        );
        
        if (responseAdded) {
          debugLog("Google AI response added to DOM");
          capturePrompt('gemini');
        }
      }
    }
  });
  
  // Start observing the conversation area
  setTimeout(() => {
    const conversationArea = document.querySelector('.conversation-container') || 
                           document.querySelector('main');
    if (conversationArea) {
      googleAIObserver.observe(conversationArea, { 
        childList: true, 
        subtree: true 
      });
      debugLog("Google AI response observer attached");
    }
  }, 2000);
}

// Generic AI site prompt detection (fallback)
function detectGenericAI() {
  debugLog("Setting up generic AI detection");
  
  // Listen for button clicks that might submit prompts
  document.addEventListener('click', function(e) {
    // Target common buttons that might be used to submit prompts
    const genericButtons = e.target.closest('button');
    if (genericButtons) {
      const buttonText = genericButtons.textContent.toLowerCase();
      if (buttonText.includes('send') || 
          buttonText.includes('submit') || 
          buttonText.includes('ask') || 
          buttonText.includes('generate')) {
          
        debugLog("Generic AI submit button clicked");
        setTimeout(() => capturePrompt('default'), 100);
      }
    }
  }, true);
  
  // Listen for Enter key in any input field
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.target.tagName === 'TEXTAREA' || 
          e.target.tagName === 'INPUT' || 
          e.target.getAttribute('contenteditable') === 'true' ||
          e.target.getAttribute('role') === 'textbox') {
          
        debugLog("Generic AI Enter key pressed in input field");
        setTimeout(() => capturePrompt('default'), 100);
      }
    }
  }, true);
  
  // Set up a more generic mutation observer to detect changes
  const genericObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        // Look for patterns that might indicate a response
        const possibleResponse = Array.from(mutation.addedNodes).some(node => 
          node.nodeType === Node.ELEMENT_NODE && (
            // Common chat UI patterns
            node.classList?.contains('message') || 
            node.classList?.contains('response') || 
            node.classList?.contains('answer') ||
            node.classList?.contains('ai-response') ||
            // Look for markdown or code blocks (common in AI responses)
            node.querySelector?.('pre code') ||
            node.querySelector?.('.markdown') ||
            // Check for newly added paragraphs that might be responses
            node.tagName === 'P' && node.textContent.length > 50
          )
        );
        
        if (possibleResponse) {
          debugLog("Possible AI response detected in DOM");
          capturePrompt('default');
        }
      }
    }
  });
  
  // Start observing the main content area
  setTimeout(() => {
    // Try to find the main content area - prioritize chat containers
    const mainContent = 
      document.querySelector('.chat-container') || 
      document.querySelector('.conversation') ||
      document.querySelector('.messages') ||
      document.querySelector('main') ||
      document.querySelector('.main-content') ||
      document.body; // Fall back to body if nothing else found
      
    if (mainContent) {
      genericObserver.observe(mainContent, { 
        childList: true, 
        subtree: true,
        characterData: true
      });
      debugLog("Generic AI observer attached");
    }
  }, 2000);
}

// Helper function to capture the prompt from any textarea
function capturePrompt(model) {
  const textareas = document.querySelectorAll('textarea');
  const inputFields = document.querySelectorAll('[role="textbox"], [contenteditable="true"]');
  const inputs = document.querySelectorAll('input[type="text"]');
  
  debugLog(`Looking for input elements (found ${textareas.length} textareas, ${inputFields.length} textboxes, ${inputs.length} text inputs)`);
  
  let promptText = '';
  let sourceElement = null;
  
  // Try textareas first
  if (textareas.length > 0) {
    for (const textarea of textareas) {
      if (textarea.value && textarea.value.trim().length > 0) {
        promptText = textarea.value;
        sourceElement = textarea;
        debugLog(`Found prompt in textarea: ${promptText.substring(0, 30)}...`);
        break;
      }
    }
  }
  
  // If no prompt found, try contentEditable fields
  if (!promptText && inputFields.length > 0) {
    for (const field of inputFields) {
      if (field.textContent && field.textContent.trim().length > 0) {
        promptText = field.textContent;
        sourceElement = field;
        debugLog(`Found prompt in contentEditable: ${promptText.substring(0, 30)}...`);
        break;
      }
    }
  }
  
  // If still no prompt found, try text inputs
  if (!promptText && inputs.length > 0) {
    for (const input of inputs) {
      if (input.value && input.value.trim().length > 0) {
        promptText = input.value;
        sourceElement = input;
        debugLog(`Found prompt in input: ${promptText.substring(0, 30)}...`);
        break;
      }
    }
  }
  
  // If still no prompt found, try last recorded prompt
  if (!promptText && lastPromptText) {
    promptText = lastPromptText;
    debugLog(`Using last recorded prompt: ${promptText.substring(0, 30)}...`);
  }
  
  // If still no prompt, check for fixed elements where prompts might be stored
  if (!promptText) {
    // Look for message containers that might contain the last sent message
    const messageElements = document.querySelectorAll('.user-message, .human-message, .prompt-message');
    if (messageElements.length > 0) {
      const lastMessage = messageElements[messageElements.length - 1];
      if (lastMessage && lastMessage.textContent) {
        promptText = lastMessage.textContent;
        debugLog(`Found prompt in message element: ${promptText.substring(0, 30)}...`);
      }
    }
  }
  
  // If still no prompt, fallback to a test prompt in development
  if (!promptText && currentSite) {
    debugLog("No prompt found, creating test prompt");
    promptText = "Test prompt: please process this AI query as if it were typed by a user.";
  }
  
  if (promptText) {
    debugLog(`Processing prompt (length: ${promptText.length})`);
    processPrompt(promptText, model);
    lastPromptText = promptText;
    lastPromptTime = Date.now();
    
    // Clear the input if we found a source element
    if (sourceElement && false) { // Disabled for now to prevent interfering with user experience
      if (sourceElement.value !== undefined) {
        sourceElement.value = '';
      } else if (sourceElement.textContent !== undefined) {
        sourceElement.textContent = '';
      }
    }
  } else {
    debugLog("No prompt text found");
  }
}

// Estimate token count from text - improved version
function estimateTokenCount(text) {
  if (!text) return 0;
  
  // More accurate token estimation:
  // 1. Count words (closer to GPT tokenization)
  const words = text.trim().split(/\s+/).length;
  
  // 2. Count special characters that often get their own tokens
  const specialChars = (text.match(/[.,!?;:(){}\[\]"'`~@#$%^&*_\-+=|\\/<>]/g) || []).length;
  
  // 3. Count numbers separately (often tokenized differently)
  const numbers = (text.match(/\d+/g) || []).join('').length * 0.5;
  
  // 4. Count code blocks (often have different tokenization)
  const codeBlocks = (text.match(/```[\s\S]*?```/g) || []);
  const codeLength = codeBlocks.reduce((acc, block) => acc + block.length, 0) * 0.5;
  
  // Combine factors with weights
  const estimatedTokens = (words * 1.3) + (specialChars * 0.5) + numbers + codeLength;
  
  return Math.ceil(estimatedTokens);
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

// Add this function to help debug
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString().substring(11, 19);
  if (data) {
    console.log(`[AI WASTE WATCHER ${timestamp}]`, message, data);
  } else {
    console.log(`[AI WASTE WATCHER ${timestamp}]`, message);
  }
  
  // Also update debug panel if it exists
  const debugPanel = document.getElementById('ai-waste-debug');
  if (debugPanel) {
    debugPanel.style.display = 'block';
    debugPanel.textContent = `Status: ${message} (${timestamp})`;
  }
}

// Update the processPrompt function to sync data with the popup
function processPrompt(text, model) {
  debugLog("Prompt detected in processPrompt function:", text.substring(0, 30) + "...");
  
  // Calculate input tokens with improved estimation
  const inputTokens = estimateTokenCount(text);
  
  // Estimate response tokens based on input length
  // LLMs typically generate responses proportional to the input
  let responseTokens = Math.min(Math.max(inputTokens * 2, 100), 2000);
  
  // Model-specific adjustments
  if (model === 'gpt-4o' || model === 'gpt-4') {
    // GPT-4 models tend to be more verbose
    responseTokens = responseTokens * 1.2;
  } else if (model === 'claude') {
    // Claude can also be verbose
    responseTokens = responseTokens * 1.3;
  }
  
  debugLog(`Token estimation - Input: ${inputTokens}, Expected response: ${Math.round(responseTokens)}`);
  
  // Calculate environmental impact
  const impact = calculateImpact(Math.round(responseTokens), inputTokens, model);
  
  // Add to running totals
  totalStats.cost += impact.cost;
  totalStats.energyConsumption += impact.energyConsumption;
  totalStats.waterUsage += impact.waterUsage;
  totalStats.carbonEmissions += impact.carbonEmissions;
  totalStats.promptCount += 1;
  
  debugLog("Calculated impact:", impact);
  debugLog("Running totals:", totalStats);
  
  // Show live preview with cumulative stats
  updateLivePreview(totalStats);
  
  // Send the impact data to the background script
  chrome.runtime.sendMessage({
    action: "promptDetected", 
    data: impact
  }, response => {
    debugLog("Background script response:", response);
    
    // Update the popup if it's open by broadcasting the updated stats
    if (response && response.data) {
      chrome.runtime.sendMessage({
        action: "statsUpdated",
        data: response.data
      }).catch(e => {
        // This is expected to fail if popup isn't open, so we'll silently catch the error
      });
    }
  });
}

// Observe page changes to detect newly added elements
function observePageChanges() {
  const observer = new MutationObserver((mutations) => {
    const newPromptArea = 
      mutations.some(mutation => 
        Array.from(mutation.addedNodes).some(node => 
          node.nodeType === Node.ELEMENT_NODE && (
            node.tagName === 'TEXTAREA' || 
            node.getAttribute('role') === 'textbox' ||
            node.getAttribute('contenteditable') === 'true' ||
            node.querySelector?.('textarea') ||
            node.querySelector?.('[role="textbox"]')
          )
        )
      );
    
    if (newPromptArea) {
      debugLog("New prompt input area detected");
      setupPromptDetection();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
  });
  
  debugLog("Page change observer started");
}

// Initialize on page load
window.addEventListener('load', () => {
  // Check connection with background script
  debugLog("Content script loaded, sending ping to background script");
  chrome.runtime.sendMessage({action: "ping"}, function(response) {
    if (response && response.status === "pong") {
      debugLog("Connection with background script confirmed!");
    } else {
      debugLog("No response from background script, may need to reload extension");
    }
  });
  
  // Check if we're on an AI site
  chrome.runtime.sendMessage({action: "checkCurrentSite"});
  
  // Set up a fallback detection mechanism
  setTimeout(() => {
    if (!observingTextarea) {
      console.log("Fallback detection initialized");
      setupPromptDetection();
      injectLivePreview();
    }
  }, 3000);
});
