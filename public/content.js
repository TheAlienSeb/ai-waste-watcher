// Content script for AI Waste Watcher - Monitors AI sites for prompts

// ======= Configuration Constants =======

// Updated impact factors based on empirical research
const IMPACT_FACTORS = {
  // Base WUE (Water Usage Effectiveness) from research
  waterUsageEffectiveness: 1.8, // L/kWh (industry average)
  // Base carbon intensity from research
  carbonIntensity: 475, // g CO2/kWh (global average grid)
};

// Model-specific configuration with updated empirical values
const AI_MODELS = {
  'gpt-4o': {
    parameters: 100,
    verbosity: 1.2,
    inputCost: 0.005,   // $0.005 per 1K input tokens
    outputCost: 0.015,  // $0.015 per 1K output tokens
    // Environmental metrics
    energyPerToken: 0.00029, // kWh per token (0.29 Wh)
    waterPerToken: 0.5,      // ml per token (empirical: ~500ml per query)
    carbonPerToken: 4.32/1000 // g CO2 per token (empirical: ~4.32g per query)
  },
  'gpt-4': {
    parameters: 80,
    verbosity: 1.2,
    inputCost: 0.03,    // $0.03 per 1K input tokens
    outputCost: 0.06,   // $0.06 per 1K output tokens
    // Environmental metrics
    energyPerToken: 0.00028, // kWh per token (0.28 Wh)
    waterPerToken: 0.5,      // ml per token (empirical: ~500ml per query)
    carbonPerToken: 4.0/1000  // g CO2 per token (empirical: ~4.0g per query)
  },
  'gpt-3.5': {
    parameters: 20,
    verbosity: 1.0,
    inputCost: 0.0005,  // $0.0005 per 1K input tokens
    outputCost: 0.0015, // $0.0015 per 1K output tokens
    // Environmental metrics
    energyPerToken: 0.00010, // kWh per token (lower than GPT-4)
    waterPerToken: 0.2,      // ml per token (lower than GPT-4)
    carbonPerToken: 1.8/1000  // g CO2 per token (lower than GPT-4)
  },
  'claude': {
    parameters: 70,
    verbosity: 1.3,
    inputCost: 0.008,   // $0.008 per 1K input tokens (Claude 3 Opus average)
    outputCost: 0.024,  // $0.024 per 1K output tokens
    // Environmental metrics
    energyPerToken: 0.00025, // kWh per token (0.25 Wh)
    waterPerToken: 0.45,     // ml per token (empirical: ~400-600ml per query)
    carbonPerToken: 3.5/1000  // g CO2 per token (empirical: ~3.5g per query)
  },
  'gemini': {
    parameters: 60,
    verbosity: 1.0,
    inputCost: 0.0005,  // $0.0005 per 1K input tokens (Gemini Pro)
    outputCost: 0.0015, // $0.0015 per 1K output tokens
    // Environmental metrics
    energyPerToken: 0.00020, // kWh per token (0.20 Wh)
    waterPerToken: 0.35,     // ml per token (empirical: ~300-500ml per query)
    carbonPerToken: 1.6/1000  // g CO2 per token (empirical: ~1.6g per query)
  },
  'perplexity': {
    parameters: 40,
    verbosity: 1.0,
    inputCost: 0.002,   // Estimated, as Perplexity uses various models
    outputCost: 0.008,  // Estimated
    // Environmental metrics
    energyPerToken: 0.00022, // kWh per token (estimated)
    waterPerToken: 0.4,      // ml per token (estimated)
    carbonPerToken: 2.5/1000  // g CO2 per token (estimated)
  },
  'default': {
    parameters: 50,
    verbosity: 1.0,
    inputCost: 0.001,   // Default fallback pricing
    outputCost: 0.002,  // Default fallback pricing
    // Environmental metrics
    energyPerToken: 0.00020, // kWh per token (average estimate)
    waterPerToken: 0.3,      // ml per token (average estimate)
    carbonPerToken: 2.0/1000  // g CO2 per token (average estimate)
  }
};


// AI site detection configuration
const AI_SITES = [
  { domain: ["chat.openai.com", "chatgpt.com"], model: 'gpt-4o', detector: 'detectChatGPT' },
  { domain: ["claude.ai", "anthropic.com"], model: 'claude', detector: 'detectClaude' },
  { domain: ["perplexity.ai"], model: 'perplexity', detector: 'detectPerplexity' },
  { domain: ["bard.google.com", "gemini.google.com"], model: 'gemini', detector: 'detectGoogleAI' },
  { domain: ["huggingface.co"], model: 'default', detector: 'detectHuggingFace' }
];

// Common DOM selectors
const SELECTORS = {
  inputs: 'textarea, input[type="text"], [contenteditable="true"], [role="textbox"]',
  buttons: {
    chatgpt: 'button[data-testid="send-button"], button[aria-label="Send message"], button svg[data-icon="paper-airplane"]',
    claude: 'button.claude-submit, button[aria-label="Send message"]',
    perplexity: '.send-button, button[aria-label="Send"]',
    gemini: 'button.send-button, button.send-message-button',
    huggingface: 'button.svelte-1ugu6u7, button[aria-label="Send"]',
    generic: 'button[type="submit"], button.send, button.submit'
  },
  responses: [
    '.markdown-content', '.message-content', '.assistant', 
    '[data-message-author-role="assistant"]', '.ai-response', '.response-content', 
    '.answer-content', '.bot-message', '.claude-message', '.model-response'
  ],
  userMessages: '.user-message, .human-message, .prompt-message, .query'
};

// ======= State Management =======
const state = {
  currentSite: '',
  observingTextarea: false,
  lastPromptTime: 0,
  lastPromptText: '',
  lastResponseText: '',
  livePreviewElement: null,
  processingPrompt: false,
  promptDebounceTimeout: null,
  attachedElements: new WeakSet(),
  lastCapturedText: '',
  lastCaptureTime: 0,
  syncIntervalId: null, // Add this property to store the interval ID
  hooks: {
    installed: false
  },
  totalStats: {
    cost: 0,
    energyConsumption: 0,
    waterUsage: 0,
    carbonEmissions: 0,
    promptCount: 0
  },
  processedResponses: {},
  lastProcessedResponseCleanup: 0,
  lastPageLoadTime: Date.now(),
  hasRegisteredPrompt: false, // Flag to prevent multiple registrations on refresh
  expectingResponse: false, // Flag to indicate we're expecting a response
  lastPromptInputTokens: 0,
  lastPromptInitialImpact: {},
  lastPromptModel: '',
  syncIntervalId: null,
  currentConversation: {
    id: null,
    startTime: null,
    lastUpdateTime: null,
    responses: {}
  },
  lastResponseProcessTime: 0,
  responseProcessCooldown: 3000, // 3 seconds cooldown
};

const DEBOUNCE_DELAY = 1000; // 1 second debounce

// ======= Message Handling =======
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    ping: () => {
      debugLog("Ping received, responding with pong");
      sendResponse({status: "pong"});
    },
    
    aiSiteDetected: () => {
      debugLog(`AI site detected: ${message.site}`);
      state.currentSite = message.site;
      
      // Dynamically call the appropriate detector
      const site = findSiteConfig(message.site);
      if (site && detectors[site.detector]) {
        detectors[site.detector]();
      } else {
        detectors.detectGenericAI();
      }
      
      injectLivePreview();
      updateLivePreviewTitle(); // Update title with new site
      sendResponse({status: `Detection configured for: ${message.site}`});
    },
    
    showPopup: () => {
      debugLog("Extension icon clicked - showing popup");
      showLivePreview();
      sendResponse({status: "Popup displayed"});
    },
    
    resetStats: () => {
      debugLog("Resetting statistics");
      resetStats();
      // Force update the live preview immediately
      updateLivePreview(state.totalStats);
      sendResponse({status: "Statistics reset"});
    },
    completeStatsReset: () => {
      debugLog("Received complete stats reset signal");
      performFullReset();
      sendResponse({status: "Stats reset in content script"});
    },
    statsResetConfirmed: () => {
      debugLog("Received stats reset confirmation from background");
      
      // Make sure our UI is showing zeros
      updateLivePreview(state.totalStats);
      
      sendResponse({status: "Reset confirmation received"});
    }
  };
  
  if (handlers[message.action]) {
    handlers[message.action]();
  }
  
  return true; // Keep the message channel open for async responses
});

// Make sure to add a ping handler in your content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // For ping requests, just respond immediately
  if (message.action === "ping") {
    sendResponse({status: "pong"});
    return true;
  }
  
  // ... rest of your message handlers
});

// ======= Core Functions =======

// Define a detector registry object to store all detector functions
const detectors = {
  detectChatGPT: null,
  detectClaude: null,
  detectPerplexity: null,
  detectGoogleAI: null, 
  detectHuggingFace: null,
  detectGenericAI: null
};

function findSiteConfig(url) {
  return AI_SITES.find(site => 
    site.domain.some(domain => url.includes(domain))
  );
}

// Set up prompt detection based on the current site
function setupPromptDetection() {
  debugLog("Setting up prompt detection");
  
  if (state.observingTextarea) return;
  
  const hostname = window.location.hostname;
  const site = AI_SITES.find(site => 
    site.domain.some(domain => hostname.includes(domain))
  );
  
  if (site && detectors[site.detector]) {
    detectors[site.detector]();
  } else {
    detectors.detectGenericAI();
  }
  
  state.observingTextarea = true;
  observePageChanges();
}

// Unified function to enable proper prompt capture across all platforms
function setupPromptHooks(model) {
  debugLog(`Setting up comprehensive prompt hooks for model: ${model}`);
  
  if (state.hooks.installed) return;
  state.hooks.installed = true;
  
  // 1. Attach to existing input elements
  document.querySelectorAll(SELECTORS.inputs)
    .forEach(el => attachPromptListener(el, model));
  
  // 2. Watch for dynamically added input elements
  observeForNewInputs(model);
  
  // 3. Start polling as a fallback
  startInputPolling(model);
  
  debugLog("Comprehensive prompt hooks installed successfully");
  
  // Store the last value of inputs before they're cleared (one-time setup)
  if (!window._inputListenerInstalled) {
    window._inputListenerInstalled = true;
    document.addEventListener('input', storeLastValue, true);
  }
}

// ======= Event Listeners & Observers =======

function storeLastValue(e) {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
    e.target._lastValue = e.target.value;
  } else if (e.target.getAttribute('contenteditable') === 'true') {
    e.target._lastValue = e.target.textContent;
  }
}

function attachPromptListener(el, model) {
  if (state.attachedElements.has(el)) return;
  state.attachedElements.add(el);
  
  debugLog(`Attaching prompt listeners to element: ${el.tagName}${el.id ? '#' + el.id : ''}`);
  
  const handleInput = () => captureFromElement(el, model);
  
  el.addEventListener('input', handleInput, true);
  el.addEventListener('beforeinput', handleInput, true);
  el.addEventListener('change', handleInput, true);
  
  captureFromElement(el, model);
}

function captureFromElement(el, model) {
  if (state.processingPrompt) return;
  
  const text = el.value !== undefined ? el.value : el.textContent;
  if (!text || !text.trim()) return;
  
  const trimmedText = text.trim();
  const now = Date.now();
  
  if (trimmedText === state.lastCapturedText && now - state.lastCaptureTime < 5000) {
    return;
  }
  
  debugLog(`Captured text from element: ${trimmedText.substring(0, 30)}...`);
  state.lastCapturedText = trimmedText;
  state.lastCaptureTime = now;
  
  capturePrompt(model);
}

function observeForNewInputs(model) {
  debugLog(`Setting up DOM observer for new input elements (model: ${model})`);
  
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        
        if (node.matches && node.matches(SELECTORS.inputs)) {
          attachPromptListener(node, model);
        }
        
        if (node.querySelectorAll) {
          const inputElements = node.querySelectorAll(SELECTORS.inputs);
          inputElements.forEach(el => attachPromptListener(el, model));
        }
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  return observer;
}

function startInputPolling(model) {
  debugLog(`Starting input polling for model: ${model}`);
  
  const pollingInterval = setInterval(() => {
    const elements = document.querySelectorAll(SELECTORS.inputs);
    
    for (const el of elements) {
      const text = el.value !== undefined ? el.value : el.textContent;
      if (!text || !text.trim()) continue;
      
      if (text.trim() !== state.lastCapturedText) {
        attachPromptListener(el, model);
      }
    }
    
    if (!state.lastCapturedText || state.lastCapturedText.length === 0) {
      attemptPromptInference(model);
    }
  }, 500);
  
  return pollingInterval;
}

function attemptPromptInference(model) {
  if (state.lastCapturedText && state.lastCapturedText.length > 0) return;
  
  const responses = document.querySelectorAll(SELECTORS.responses.join(', '));
  if (!responses || responses.length === 0) return;
  
  const latestResponse = responses[responses.length - 1];
  const responseText = latestResponse.textContent?.trim();
  if (!responseText || responseText.length < 10) return;
  
  if (responseText !== state.lastResponseText) {
    debugLog("Inferring prompt from AI response");
    state.lastResponseText = responseText;
    
    const inferredLength = Math.max(Math.floor(responseText.length / 3), 20);
    
    processPrompt(
      `[INFERRED PROMPT] Based on AI response length of ${responseText.length} characters`,
      model
    );
  }
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

// ======= Prompt Processing =======

function capturePrompt(model) {
  if (state.processingPrompt) {
    debugLog("Already processing a prompt, skipping duplicate");
    return;
  }
  
  if (state.promptDebounceTimeout) {
    clearTimeout(state.promptDebounceTimeout);
  }
  
  state.promptDebounceTimeout = setTimeout(() => {
    capturePromptImpl(model);
    setTimeout(() => {
      state.processingPrompt = false;
    }, 2000);
  }, DEBOUNCE_DELAY);
}

function capturePromptImpl(model) {
  state.processingPrompt = true;
  
  const textareas = document.querySelectorAll('textarea');
  const inputFields = document.querySelectorAll('[role="textbox"], [contenteditable="true"]');
  const inputs = document.querySelectorAll('input[type="text"]');
  
  let promptText = '';
  let sourceElement = null;
  
  // Check multiple input sources in order of priority
  const inputSources = [
    { elements: textareas, accessor: 'value', label: 'textarea' },
    { elements: inputFields, accessor: 'textContent', label: 'contentEditable' },
    { elements: inputs, accessor: 'value', label: 'input' }
  ];
  
  // Try each input source until we find content
  for (const source of inputSources) {
    if (promptText) break;
    
    for (const el of source.elements) {
      const content = el[source.accessor];
      if (content && content.trim().length > 0) {
        promptText = content;
        sourceElement = el;
        debugLog(`Found prompt in ${source.label}: ${promptText.substring(0, 30)}...`);
        break;
      }
    }
  }
  
  // If still no prompt, try fallback methods
  if (!promptText) {
    const fallbackMethods = [
      // Use last prompt if recent
      () => {
        if (state.lastPromptText && Date.now() - state.lastPromptTime < 5000) {
          promptText = state.lastPromptText;
          debugLog(`Using last recorded prompt: ${promptText.substring(0, 30)}...`);
          return true;
        }
        return false;
      },
      // Look for user message elements
      () => {
        const messageElements = document.querySelectorAll(SELECTORS.userMessages);
        if (messageElements.length > 0) {
          const lastMessage = messageElements[messageElements.length - 1];
          if (lastMessage && lastMessage.textContent) {
            promptText = lastMessage.textContent;
            debugLog(`Found prompt in message element: ${promptText.substring(0, 30)}...`);
            return true;
          }
        }
        return false;
      },
      // Default test prompt in development
      () => {
        if (state.currentSite) {
          debugLog("No prompt found, creating test prompt");
          promptText = "Test prompt: please process this AI query as if it were typed by a user.";
          return true;
        }
        return false;
      }
    ];
    
    for (const method of fallbackMethods) {
      if (method()) break;
    }
  }
  
  if (promptText) {
    const isDuplicate = promptText === state.lastPromptText && (Date.now() - state.lastPromptTime < 5000);
    
    if (!isDuplicate) {
      debugLog(`Processing prompt (length: ${promptText.length})`);
      processPrompt(promptText, model);
      state.lastPromptText = promptText;
      state.lastPromptTime = Date.now();
    } else {
      debugLog("Skipping duplicate prompt (same text processed recently)");
    }
  } else {
    debugLog("No prompt text found");
  }
}

function processPrompt(text, model) {
  debugLog("Prompt detected in processPrompt function:", text.substring(0, 30) + "...");
  
  // Check if this is likely a duplicate from page refresh
  const timeSincePageLoad = Date.now() - state.lastPageLoadTime;
  if (timeSincePageLoad < 2000 && state.hasRegisteredPrompt) { // Within 2 seconds of page load
    debugLog("Skipping likely duplicate prompt from page refresh");
    return;
  }
  
  // Start a new conversation if needed
  if (!state.currentConversation.id || 
      (Date.now() - state.currentConversation.lastUpdateTime > 300000)) { // 5 minutes
    startNewConversation();
  }
  
  // Update the conversation last activity time
  state.currentConversation.lastUpdateTime = Date.now();
  
  // Mark that we've registered a prompt
  state.hasRegisteredPrompt = true;
  
  // Continue with normal processing...
  const inputTokens = estimateTokenCount(text);
  const initialImpact = calculatePartialImpact(0, inputTokens, model);
  updateStatsWithPrompt(initialImpact);
  captureResponse(model, inputTokens, initialImpact);
  
  debugLog(`Token calculation - Input tokens: ${inputTokens}, waiting for response...`);
}

// Handle just the prompt portion initially
function updateStatsWithPrompt(impact) {
  // Update totals for input processing only
  Object.keys(impact).forEach(key => {
    if (typeof impact[key] === 'number' && state.totalStats.hasOwnProperty(key)) {
      state.totalStats[key] += impact[key];
    }
  });
  state.totalStats.promptCount += 1;
  
  // Update UI
  updateLivePreview(state.totalStats);
  
  // Send initial impact data
  safeSendMessage({
    action: "promptDetected", 
    data: impact
  });
}

// Update the calculatePartialImpact function

// Calculate impact based on input tokens only, without response estimation
function calculatePartialImpact(responseTokens, inputTokens, model) {
  const modelConfig = AI_MODELS[model] || AI_MODELS.default;
  
  // Calculate input energy in kWh, then convert to Joules
  const inputEnergyKWh = modelConfig.energyPerToken * inputTokens * 0.3; // Only count 30% for input phase
  const inputEnergyJoules = inputEnergyKWh * 3600000;
  
  // Calculate input cost using real pricing
  const inputCost = (inputTokens / 1000) * modelConfig.inputCost;
  
  return {
    waterUsage: 0, // Will be updated when response is captured
    carbonEmissions: 0, // Will be updated when response is captured
    energyConsumption: inputEnergyJoules,
    cost: inputCost, // Now uses actual API pricing
    inputTokenCount: inputTokens,
    responseTokenCount: 0, // Will be updated when response is captured
    model,
    site: state.currentSite
  };
}

// Update captureResponse function around line 535

function captureResponse(model, inputTokens, initialImpact) {
  // Set a flag to indicate we're expecting a response
  state.expectingResponse = true;
  state.lastPromptInputTokens = inputTokens;
  state.lastPromptInitialImpact = initialImpact;
  state.lastPromptModel = model;
  
  let responseCheckInterval;
  let timeoutId;
  let isProcessing = false;
  
  // Add a variable to track the last fully processed response
  let lastProcessedResponseText = '';
  let lastResponseLength = 0;
  let responseStableCount = 0;
  let responseTokenCount = 0; // Track token count of the response

  // Function to check existing responses on the page
  const checkForCompletedResponses = () => {
    if (isProcessing) return;
    
    // Only check for responses if we're expecting one from a prompt
    if (!state.expectingResponse) {
      return;
    }
    
    const responseElements = document.querySelectorAll(SELECTORS.responses.join(', '));
    if (!responseElements || responseElements.length === 0) return;
    
    // Focus on the most recent response element
    const latestResponse = responseElements[responseElements.length - 1];
    if (!latestResponse || !latestResponse.textContent) return;
    
    const responseText = latestResponse.textContent.trim();
    if (!responseText || responseText.length < 10) return;
    
    // Create a content prefix for comparing responses
    const contentPrefix = responseText.substring(0, 30).replace(/\s+/g, '');
    
    // Check if this is a continuation/update of an already processed response
    // by comparing the first 30 characters
    const isSameResponsePrefixButLonger = 
      lastProcessedResponseText && 
      contentPrefix === lastProcessedResponseText.substring(0, 30).replace(/\s+/g, '') &&
      responseText.length > lastProcessedResponseText.length;
      
    // Calculate tokens for the current response
    const currentTokenCount = estimateTokenCount(responseText);
    
    // If this is the same response but with more tokens, process it again and replace previous
    if (isSameResponsePrefixButLonger && currentTokenCount > responseTokenCount) {
      debugLog(`Found longer version of same response: ${currentTokenCount} > ${responseTokenCount} tokens`);
      
      // Update tracking variables
      lastProcessedResponseText = responseText;
      lastResponseLength = responseText.length;
      responseTokenCount = currentTokenCount;
      responseStableCount = 0; // Reset stability to make sure it's fully generated
      
      // Continue checking - don't process yet until it stabilizes
      return;
    }
    
    // For completely new responses that don't match our prefix
    if (responseText !== lastProcessedResponseText && 
        (!lastProcessedResponseText || 
         contentPrefix !== lastProcessedResponseText.substring(0, 30).replace(/\s+/g, ''))) {
      
      // Update tracking for this new response
      lastProcessedResponseText = responseText;
      lastResponseLength = responseText.length;
      responseStableCount = 0;
      responseTokenCount = estimateTokenCount(responseText);
      return; // Don't process yet, wait for stability
    }
    
    // Check if the response is still growing
    const isStillGrowing = responseText.length > lastResponseLength;
    lastResponseLength = responseText.length;
    
    if (isStillGrowing) {
      // Reset stability counter if still growing
      responseStableCount = 0;
      return; // Skip processing - wait for generation to complete
    } else {
      // Increment stability counter when response stops changing
      responseStableCount++;
      
      // Only process after response has been stable for a few checks
      if (responseStableCount >= 3) {
        // Create a unique response ID that incorporates more specific identifiers
        const contentFingerprint = responseText.substring(0, 30).replace(/\s+/g, '') + 
                                responseText.substring(responseText.length - 30).replace(/\s+/g, '');
        const sessionKey = sessionStorage.getItem('awSessionKey') || 
                          (sessionStorage.setItem('awSessionKey', Date.now().toString(36)), 
                          sessionStorage.getItem('awSessionKey'));
        const responseId = `${model}-${sessionKey}-${responseText.length}-${contentFingerprint}`;
        
        // Store the token count with the response ID in processed responses
        if (!state.processedResponses) {
          state.processedResponses = {};
        }
        
        // Check if we've already processed this response prefix but with fewer tokens
        let shouldReprocess = false;
        
        // Check for matching prefixes in our processed responses
        Object.keys(state.processedResponses).forEach(id => {
          if (id.includes(contentPrefix) && 
              state.processedResponses[id].tokenCount < currentTokenCount) {
            // We found a shorter version of this same response
            debugLog(`Found better version of response: ${currentTokenCount} vs ${state.processedResponses[id].tokenCount} tokens`);
            
            // Adjust stats by removing the earlier contribution and adding the new one
            if (state.processedResponses[id].statsContribution) {
              // Subtract previous contribution from totals
              Object.keys(state.processedResponses[id].statsContribution).forEach(key => {
                if (typeof state.processedResponses[id].statsContribution[key] === 'number' && 
                    state.totalStats.hasOwnProperty(key)) {
                  state.totalStats[key] -= state.processedResponses[id].statsContribution[key];
                }
              });
            }
            
            // Delete the old record to replace with this better one
            delete state.processedResponses[id];
            shouldReprocess = true;
          }
        });
        
        // Skip if already processed this exact response and it's not better than a previous version
        if (state.processedResponses[responseId] && !shouldReprocess) {
          return;
        }
        
        processCompletedResponse(responseText, responseId, currentTokenCount);
      }
    }
  };

  // Modified to accept token count parameter
  const processCompletedResponse = (responseText, responseId, responseTokens) => {
    if (isProcessing) return;
    
    // Add cooldown check
    const now = Date.now();
    if (now - state.lastResponseProcessTime < state.responseProcessCooldown) {
      debugLog(`Response processing in cooldown (${(now - state.lastResponseProcessTime)}ms < ${state.responseProcessCooldown}ms)`);
      return;
    }
    
    isProcessing = true;
    state.lastResponseProcessTime = now;
    
    // Clear the interval and timeout since we found a response
    clearInterval(responseCheckInterval);
    clearTimeout(timeoutId);
    
    debugLog(`Processing completed response (length: ${responseText.length}, tokens: ${responseTokens})`);
    
    // Calculate full impact with real response tokens
    const fullImpact = calculateImpact(responseTokens, inputTokens, model);
    
    // Calculate delta (just the response portion)
    const deltaImpact = {
      waterUsage: fullImpact.waterUsage - (initialImpact.waterUsage || 0),
      carbonEmissions: fullImpact.carbonEmissions - (initialImpact.carbonEmissions || 0),
      energyConsumption: fullImpact.energyConsumption - initialImpact.energyConsumption,
      cost: fullImpact.cost - (initialImpact.cost || 0),
      tokenCount: responseTokens,
      inputTokenCount: inputTokens, // Add input tokens for history tracking
      model,
      site: state.currentSite,
      text: responseText.substring(0, 100) + (responseText.length > 100 ? "..." : "") // Store preview of response
    };
    
    // Save the contribution this response made to the stats, so we can undo it if needed
    state.processedResponses[responseId] = {
      tokenCount: responseTokens,
      statsContribution: { ...deltaImpact },
      timestamp: now
    };
    
    // Update totals with the response contribution
    Object.keys(deltaImpact).forEach(key => {
      if (typeof deltaImpact[key] === 'number' && state.totalStats.hasOwnProperty(key)) {
        state.totalStats[key] += deltaImpact[key];
      }
    });
    
    // Update UI immediately
    updateLivePreview(state.totalStats);
    
    // Send the updated impact data to be recorded in history immediately
    safeSendMessage({
      action: "responseDetected",
      data: deltaImpact
    }).catch(err => {
      debugLog("Error sending response data", err);
    });
    
    // Also broadcast the updated stats
    broadcastStatsToExtension(state.totalStats);
    
    debugLog("Response recorded in history");
    
    // Clear the expecting response flag once we've processed a response
    state.expectingResponse = false;
    isProcessing = false;
  };

  // Rest of captureResponse function remains the same...
  
  // Start the polling interval to check for completed responses
  responseCheckInterval = setInterval(checkForCompletedResponses, 1000);
  
  // Start observing DOM changes to catch new responses
  const responseObserver = new MutationObserver((mutations) => {
    // Only look for responses if we're expecting one from a prompt
    if (!state.expectingResponse) return;

    let newResponseFound = false;
    
    // Look for newly added responses
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        
        // Check if this is a response node or contains one
        const isResponseNode = SELECTORS.responses.some(selector => 
          (node.matches && node.matches(selector)) || 
          (node.querySelector && node.querySelector(selector))
        );
        
        if (isResponseNode) {
          newResponseFound = true;
          break;
        }
      }
      
      if (newResponseFound) break;
    }
    
    // If we detect a new response was added, check it
    if (newResponseFound) {
      checkForCompletedResponses();
    }
  });
  
  responseObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  // Set a timeout to clean up
  timeoutId = setTimeout(() => {
    debugLog("Response observation timed out");
    clearInterval(responseCheckInterval);
    responseObserver.disconnect();
    
    // Rest of timeout handling...
  }, 45000); // 45 second timeout
}

// Fix the UI update function to properly display the actual values
function updateLivePreview(stats) {
  if (!state.livePreviewElement) return;
  
  const statsContainer = document.getElementById('ai-waste-stats');
  if (!statsContainer) return;
  
  // Calculate watt-hours (convert joules to watt-hours)
  const energyInWattHours = stats.energyConsumption / 3600;
  
  // Format numbers for better display
  const formatCost = (cost) => {
    return cost < 0.01 
      ? `$${cost.toFixed(5)}` 
      : `$${cost.toFixed(4)}`;
  };
  
  const formatEnergy = (energy) => {
    if (energy < 0.001) {
      return `${(energy * 1000).toFixed(2)} mWh`;
    } else if (energy < 1) {
      return `${energy.toFixed(3)} Wh`;
    } else if (energy < 1000) {
      return `${energy.toFixed(1)} Wh`;
    } else {
      return `${(energy / 1000).toFixed(2)} kWh`;
    }
  };
  
  const formatWater = (ml) => {
    if (ml < 1) {
      return `${(ml * 1000).toFixed(1)} μL`;
    } else if (ml < 1000) {
      return `${ml.toFixed(1)} mL`;
    } else {
      return `${(ml / 1000).toFixed(3)} L`;
    }
  };
  
  const formatCarbon = (g) => {
    if (g < 1) {
      return `${(g * 1000).toFixed(1)} mg`;
    } else if (g < 1000) {
      return `${g.toFixed(2)} g`;
    } else {
      return `${(g / 1000).toFixed(3)} kg`;
    }
  };
  
  statsContainer.innerHTML = `
    <div>
      <div style="font-weight: bold; color: #d8b4fe;">Total Cost:</div>
      <div>${formatCost(stats.cost)}</div>
    </div>
    <div>
      <div style="font-weight: bold; color: #fcd34d;">Total Energy:</div>
      <div>${formatEnergy(energyInWattHours)}</div>
    </div>
    <div>
      <div style="font-weight: bold; color: #93c5fd;">Total Water:</div>
      <div>${formatWater(stats.waterUsage)}</div>
    </div>
    <div>
      <div style="font-weight: bold; color: #86efac;">Total Carbon:</div>
      <div>${formatCarbon(stats.carbonEmissions)}</div>
    </div>
    <div style="grid-column: span 2; margin-top: 4px; font-size: 10px; text-align: center; color: #aaa;">
      Prompts analyzed: ${stats.promptCount}
    </div>
  `;
  
  // Debug info - add token counts if available
  if (state.lastCapturedText) {
    const debugInfo = document.createElement('div');
    debugInfo.style.cssText = `
      grid-column: span 2;
      margin-top: 8px;
      font-size: 9px;
      color: #888;
      border-top: 1px solid #444;
      padding-top: 6px;
    `;
    debugInfo.textContent = `Last prompt: ~${estimateTokenCount(state.lastCapturedText)} tokens`;
    statsContainer.appendChild(debugInfo);
  }
}

// ======= Site-Specific Detectors =======

// Create site-specific detectors, now much DRYer
function createSiteDetector(model, buttonSelector) {
  return function() {
    debugLog(`Setting up ${model} detection`);
    setupPromptHooks(model);
    
    // Add click event for button-based input
    if (buttonSelector) {
      document.addEventListener('click', function(e) {
        const sendButton = e.target.closest(buttonSelector);
        if (sendButton) {
          debugLog(`${model} send button clicked`);
          setTimeout(() => {
            const textareas = document.querySelectorAll('textarea');
            for (const textarea of textareas) {
              if (textarea._lastValue && textarea._lastValue.trim().length > 0) {
                processPrompt(textarea._lastValue, model);
                break;
              }
            }
          }, 100);
        }
      }, true);
    }
  };
}

// Define site-specific detectors using the factory function
detectors.detectChatGPT = createSiteDetector('gpt-4o', SELECTORS.buttons.chatgpt);
detectors.detectClaude = createSiteDetector('claude', SELECTORS.buttons.claude);
detectors.detectPerplexity = createSiteDetector('perplexity', SELECTORS.buttons.perplexity);
detectors.detectGoogleAI = createSiteDetector('gemini', SELECTORS.buttons.gemini);
detectors.detectHuggingFace = createSiteDetector('default', SELECTORS.buttons.huggingface);
detectors.detectGenericAI = createSiteDetector('default', SELECTORS.buttons.generic);

// ======= UI Management =======

function injectLivePreview() {
  if (state.livePreviewElement) {
    if (state.livePreviewElement.style.display === 'none') {
      state.livePreviewElement.style.display = 'block';
    }
    updateLivePreviewTitle(); // Update the title in case model changed
    return;
  }
  
  state.livePreviewElement = document.createElement('div');
  state.livePreviewElement.className = 'ai-waste-watcher-preview';
  state.livePreviewElement.style.cssText = `
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
  
  state.livePreviewElement.innerHTML = `
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
      <span id="ai-waste-title">wAIsted</span>
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
      <div style="grid-column: span 2; margin-top: 4px; font-size: 10px; text-align: center; color: #aaa;">
        Prompts analyzed: 0
      </div>
    </div>
    <div id="ai-waste-debug" style="margin-top: 8px; font-size: 10px; color: #aaa; display: none;">
      Status: Waiting for input...
    </div>
  `;
  
  // Add the element to the page (removed test button code)
  document.body.appendChild(state.livePreviewElement);
  
  // Update the title with current model
  updateLivePreviewTitle();
  
  // Add close button functionality
  document.getElementById('ai-waste-close').addEventListener('click', () => {
    state.livePreviewElement.style.display = 'none';
    sessionStorage.setItem('aiWasteWatcherHidden', 'true');
  });
  
  makeDraggable(state.livePreviewElement);
  
  // Restore previous position if available
  const savedX = sessionStorage.getItem('aiWasteWatcherPositionX');
  const savedY = sessionStorage.getItem('aiWasteWatcherPositionY');
  
  if (savedX && savedY) {
    state.livePreviewElement.style.left = savedX;
    state.livePreviewElement.style.top = savedY;
  } else {
    state.livePreviewElement.style.left = '20px';
    state.livePreviewElement.style.top = '20px';
  }
}

// Add this new function to update the title
function updateLivePreviewTitle() {
  const titleElement = document.getElementById('ai-waste-title');
  if (!titleElement) return;
  
  let modelName = 'Unknown';
  
  // Get a nice name for the current model
  if (state.currentSite) {
    const site = findSiteConfig(state.currentSite);
    if (site) {
      // Format model name nicely
      if (site.model === 'gpt-4o') modelName = 'GPT-4o';
      else if (site.model === 'gpt-4') modelName = 'GPT-4';
      else if (site.model === 'gpt-3.5') modelName = 'GPT-3.5';
      else if (site.model.includes('claude')) modelName = 'Claude';
      else if (site.model.includes('gemini')) modelName = 'Gemini';
      else if (site.model.includes('perplexity')) modelName = 'Perplexity';
      else modelName = site.model.charAt(0).toUpperCase() + site.model.slice(1);
    }
  }
  
  // Update title with model
  if (modelName !== 'Unknown') {
    titleElement.textContent = `wAIsted - ${modelName}`;
  } else {
    titleElement.textContent = 'wAIsted';
  }
}

function makeDraggable(element) {
  element.style.cursor = 'move';
  
  let isDragging = false;
  let offsetX = 0, offsetY = 0;
  
  // Handle mousedown to start dragging
  element.addEventListener('mousedown', e => {
    // Only handle dragging when clicking on the header area
    const target = e.target;
    const isHeader = target.closest('div') === element.firstElementChild;
    
    if (!isHeader) return;
    
    isDragging = true;
    // Calculate where inside the box we clicked
    offsetX = e.clientX - element.offsetLeft;
    offsetY = e.clientY - element.offsetTop;
    e.preventDefault();
  });
  
  // Handle mousemove to perform dragging
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    
    // Calculate new position ensuring it stays within viewport
    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;
    
    // Keep within viewport boundaries
    const maxX = window.innerWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;
    
    newLeft = Math.max(0, Math.min(maxX, newLeft));
    newTop = Math.max(0, Math.min(maxY, newTop));
    
    element.style.left = `${newLeft}px`;
    element.style.top = `${newTop}px`;
  });
  
  // Handle mouseup to stop dragging
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      
      // Save position in session storage
      sessionStorage.setItem('aiWasteWatcherPositionX', element.style.left);
      sessionStorage.setItem('aiWasteWatcherPositionY', element.style.top);
    }
  });
}

function showLivePreview() {
  if (state.livePreviewElement) {
    state.livePreviewElement.style.display = 'block';
    sessionStorage.removeItem('aiWasteWatcherHidden');
  } else {
    injectLivePreview();
  }
}

// Improved sync interval function with error recovery
function startStatsSyncInterval() {
  // Clear any existing interval
  if (state.syncIntervalId) {
    clearInterval(state.syncIntervalId);
    state.syncIntervalId = null;
  }
  
  // Create a function that can be self-referenced for removal
  const syncStats = async () => {
    try {
      // Check if runtime exists and is valid first
      if (chrome.runtime && chrome.runtime.id) {
        // Test with a simple API call first
        await chrome.storage.local.get('test').catch(() => {
          throw new Error('Extension context invalidated');
        });
        
        // If we made it here, the context is valid
        if (state.totalStats) {
          broadcastStatsToExtension(state.totalStats);
        }
      }
    } catch (e) {
      // If we get an extension context error, stop the interval
      if (e.message && (
          e.message.includes('Extension context invalidated') || 
          e.message.includes('Invalid extension context') ||
          !chrome.runtime || !chrome.runtime.id
      )) {
        console.log("Extension context invalidated, stopping sync interval");
        clearInterval(state.syncIntervalId);
        state.syncIntervalId = null;
      }
    }
  };
  
  state.syncIntervalId = setInterval(syncStats, 5000); // Sync every 5 seconds
  
  return state.syncIntervalId;
}

// Add cleanup for processed responses to avoid memory leaks
function cleanupProcessedResponses() {
  if (!state.processedResponses) return;
  
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  
  // If we have too many cached responses (>100) or they're old, clean up
  if (Object.keys(state.processedResponses).length > 100 || 
      state.lastProcessedResponseCleanup && now - state.lastProcessedResponseCleanup > maxAge) {
    state.processedResponses = {};
    state.lastProcessedResponseCleanup = now;
  }
}

// Add cleanup call to an interval
setInterval(cleanupProcessedResponses, 60000); // Clean up every minute

// ======= Initialization =======

window.addEventListener('load', () => {
  // Reset page load timestamp on every page load
  state.lastPageLoadTime = Date.now();
  state.hasRegisteredPrompt = false;
  
  debugLog("Content script loaded, sending ping to background script");
  
  safeSendMessage({action: "ping"}, function(response) {
    if (response && response.status === "pong") {
      debugLog("Connection with background script confirmed!");
      state.syncIntervalId = startStatsSyncInterval(); // Store the interval ID in state
    } else {
      debugLog("No response from background script, may need to reload extension");
    }
  });
  
  safeSendMessage({action: "checkCurrentSite"});
  
  // Fallback detection
  setTimeout(() => {
    if (!state.observingTextarea) {
      console.log("Fallback detection initialized");
      setupPromptDetection();
      injectLivePreview();
    }
  }, 3000);
});

// Add this utility function for safer message sending
function safeSendMessage(message, callback) {
  try {
    // First verify that chrome.runtime exists and has a valid ID
    if (!chrome.runtime || !chrome.runtime.id) {
      debugLog("Extension context unavailable");
      return Promise.reject(new Error("Extension context unavailable"));
    }
    
    const sendPromise = chrome.runtime.sendMessage(message);
    
    if (callback && typeof callback === 'function') {
      sendPromise.then(callback).catch(err => {
        // Silently fail for expected errors
        if (err.message !== "The message port closed before a response was received") {
          debugLog("Error sending message", err);
        }
      });
    }
    
    return sendPromise;
  } catch (err) {
    // Handle "Extension context invalidated" error gracefully
    if (err.message && (
        err.message.includes('Extension context invalidated') ||
        err.message.includes('Invalid extension context')
    )) {
      console.log("Extension has been reloaded or updated. Please refresh the page.");
    } else {
      debugLog("Error in message sending", err);
    }
    
    return Promise.reject(err);
  }
}

// Add page refresh detection

// Store a flag in session storage to detect page refreshes
window.addEventListener('load', () => {
  // Check if this is a page refresh
  const lastPageLoad = sessionStorage.getItem('aiWasteWatcherLastLoad');
  const now = Date.now();
  const isRefresh = lastPageLoad && (now - parseInt(lastPageLoad)) < 5000;
  
  // Update the last load timestamp
  sessionStorage.setItem('aiWasteWatcherLastLoad', now.toString());
  
  // Set a flag for this being a refresh
  state.isPageRefresh = isRefresh;
  
  if (isRefresh) {
    debugLog("Page refreshed - enabling extra duplicate protection");
  }
  
  // Rest of your initialization code...
});

// Update the sendPromptToBackground function to respect the refresh flag
const sendPromptToBackground = (text, impact) => {
  // If this is a page refresh and we just loaded, wait a bit 
  // or skip sending to avoid duplicates
  if (state.isPageRefresh) {
    const timeSinceRefresh = Date.now() - parseInt(sessionStorage.getItem('aiWasteWatcherLastLoad'));
    
    // If it's really quick after refresh, skip this prompt
    if (timeSinceRefresh < 1000) {
      debugLog("Skipping prompt detection immediately after page refresh");
      return;
    }
  }
  
  // Continue with normal processing...
  debugLog(`Sending prompt to background script (${text.length} chars)`);
  // ...rest of function...
};

// Update the performFullReset function

function performFullReset() {
  debugLog("Performing full stats reset");
  
  // Stop syncing while we clear everything
  if (state.syncIntervalId) {
    clearInterval(state.syncIntervalId);
    const syncIntervalId = state.syncIntervalId; // Store locally if needed
    state.syncIntervalId = null;
  }
  
  // Reset all state properties to initial values
  state.totalStats = {
    cost: 0,
    energyConsumption: 0,
    waterUsage: 0,
    carbonEmissions: 0,
    promptCount: 0
  };
  
  // Clear ALL tracking data
  state.processedResponses = {};
  state.lastCapturedText = '';
  state.lastPromptText = '';
  state.lastResponseText = '';
  state.hasRegisteredPrompt = false;
  state.expectingResponse = false;
  state.lastPromptInputTokens = 0;
  state.lastPromptInitialImpact = {};
  state.lastPromptModel = '';
  
  // Update the session storage as well
  sessionStorage.removeItem('aiWasteWatcherLastPrompt');
  sessionStorage.removeItem('aiWasteWatcherLastResponseId');
  
  // Force reset the dataset attributes on any elements that might have them
  document.querySelectorAll('[data-aw-stable-checks]').forEach(el => {
    el.removeAttribute('data-aw-stable-checks');
  });
  
  // Immediately update the UI to show reset state
  updateLivePreview(state.totalStats);
  updateLivePreviewTitle();
  
  // Force the background script to reset its copy of the stats too
  safeSendMessage({
    action: "statsReset",
    data: state.totalStats
  })
  .then(() => {
    debugLog("Background storage reset confirmed");
    
    // Restart stats sync interval only after reset is complete
    if (syncIntervalId) {
      state.syncIntervalId = startStatsSyncInterval();
    }
  })
  .catch(err => {
    debugLog("Error resetting background storage:", err);
    
    // Try direct storage reset as a fallback
    try {
      chrome.storage.local.set({
        totalStats: state.totalStats,
        prompts: []
      }, () => {
        debugLog("Direct storage reset completed");
        
        // Restart sync interval after direct reset
        if (syncIntervalId) {
          state.syncIntervalId = startStatsSyncInterval();
        }
      });
    } catch (directErr) {
      debugLog("Direct storage reset failed:", directErr);
      
      // Restart sync interval even if direct reset failed
      if (syncIntervalId) {
        state.syncIntervalId = startStatsSyncInterval();
      }
    }
  });
  
  // Also add a visible notification in the live preview
  const statsContainer = document.getElementById('ai-waste-stats');
  if (statsContainer) {
    const resetNotice = document.createElement('div');
    resetNotice.style.cssText = `
      grid-column: span 2;
      margin-top: 8px;
      padding: 4px;
      background: rgba(59, 130, 246, 0.15);
      border-radius: 4px;
      font-size: 10px;
      text-align: center;
      color: #93c5fd;
    `;
    resetNotice.textContent = 'Statistics have been reset';
    statsContainer.appendChild(resetNotice);
    
    // Remove the notification after 3 seconds
    setTimeout(() => {
      if (resetNotice.parentNode === statsContainer) {
        statsContainer.removeChild(resetNotice);
      }
    }, 3000);
  }
  
  debugLog("Full stats reset completed");
}

// ======= Utility Functions =======

// Estimate token count from text
function estimateTokenCount(text) {
  if (!text) return 0;
  
  const tokenFactors = [
    { pattern: /\s+/, weight: 1.3, process: text => text.trim().split(/\s+/).length },
    { pattern: /[.,!?;:(){}\[\]"'`~@#$%^&*_\-+=|\\/<>]/g, weight: 0.5, process: text => (text.match(/[.,!?;:(){}\[\]"'`~@#$%^&*_\-+=|\\/<>]/g) || []).length },
    { pattern: /\d+/g, weight: 0.5, process: text => (text.match(/\d+/g) || []).join('').length },
    { pattern: /```[\s\S]*?```/g, weight: 0.5, process: text => (text.match(/```[\s\S]*?```/g) || []).reduce((acc, block) => acc + block.length, 0) }
  ];
  
  let estimatedTokens = 0;
  
  // Process each token factor
  for (const factor of tokenFactors) {
    estimatedTokens += factor.process(text) * factor.weight;
  }
  
  return Math.ceil(estimatedTokens);
}

// Calculate environmental impact
function calculateImpact(responseTokens, inputTokens, model) {
  const modelConfig = AI_MODELS[model] || AI_MODELS.default;
  
  // Base energy calculation (in kWh)
  const averageTokens = 500; // Average tokens per query from empirical studies
  const scaleFactor = ((inputTokens + responseTokens) / averageTokens);
  
  // Calculate energy consumption - scale based on total tokens vs average query
  const energyInKWh = modelConfig.energyPerToken * (inputTokens + responseTokens);
  const energyInJoules = energyInKWh * 3600000; // Convert kWh to Joules
  
  // Calculate water usage - use empirical values scaled by token count
  const waterUsage = modelConfig.waterPerToken * responseTokens * scaleFactor;
  
  // Calculate carbon emissions - use empirical values scaled by token count
  const carbonEmissions = modelConfig.carbonPerToken * (inputTokens + responseTokens);
  
  // Calculate actual API costs using real pricing
  const inputCost = (inputTokens / 1000) * modelConfig.inputCost;  // Cost per 1K tokens
  const outputCost = (responseTokens / 1000) * modelConfig.outputCost;  // Cost per 1K tokens
  const totalCost = inputCost + outputCost;
  
  return {
    waterUsage,
    carbonEmissions,
    energyConsumption: energyInJoules,
    cost: totalCost,
    tokenCount: responseTokens,
    inputTokenCount: inputTokens,
    responseTokens: responseTokens,
    model,
    site: state.currentSite
  };
}

function debugLog(message, data = null) {
  const timestamp = new Date().toISOString().substring(11, 19);
  if (data) {
    console.log(`[wAIsted ${timestamp}]`, message, data);
  } else {
    console.log(`[wAIsted ${timestamp}]`, message);
  }
  
  // Also update debug panel if it exists
  const debugPanel = document.getElementById('ai-waste-debug');
  if (debugPanel) {
    debugPanel.style.display = 'block';
    debugPanel.textContent = `Status: ${message} (${timestamp})`;
  }
}

// Replace broadcastStatsToExtension implementation

function broadcastStatsToExtension(stats) {
  safeSendMessage({
    action: "statsUpdated",
    data: {
      cost: stats.cost,
      energyConsumption: stats.energyConsumption,
      waterUsage: stats.waterUsage,
      carbonEmissions: stats.carbonEmissions,
      promptCount: stats.promptCount
    }
  });
}

// Replace your existing message listener with this version that properly handles invalid contexts
chrome.runtime.onMessage.addListener(function messageHandler(message, sender, sendResponse) {
  try {
    if (message.action === "getCurrentStats") {
      debugLog("Stats requested by popup");
      sendResponse({
        status: "success",
        data: state.totalStats || {
          cost: 0,
          energyConsumption: 0,
          waterUsage: 0,
          carbonEmissions: 0,
          promptCount: 0
        }
      });
      return true; // Keep the message channel open for async response
    }
    return false; // Let other listeners handle other messages
  } catch (err) {
    // Handle the extension context invalidated error gracefully
    if (err.message && err.message.includes('Extension context invalidated')) {
      console.log("Extension context has been invalidated. Please refresh the page.");
      
      // Remove this message listener to prevent further errors
      try {
        chrome.runtime.onMessage.removeListener(messageHandler);
      } catch (e) {
        // Ignore errors during cleanup
      }
    } else {
      console.error("Error handling message:", err);
    }
    return false;
  }
});

// Also add a message listener for requesting current stats from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getCurrentStats") {
    debugLog("Stats requested by popup");
    sendResponse({
      status: "success",
      data: state.totalStats
    });
    return true;
  }
  return false; // Let other listeners handle other messages
});

// Add this function to manage conversation sessions
function startNewConversation() {
  // Generate a new conversation ID
  const conversationId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  state.currentConversation = {
    id: conversationId,
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
    responses: {}
  };
  
  // Store in session storage to persist across page reloads
  try {
    sessionStorage.setItem('aiWasteWatcher_currentConversation', JSON.stringify(state.currentConversation));
  } catch (e) {
    // Ignore storage errors
  }
  
  return conversationId;
}

// Modify the processCompletedResponse function to track by conversation
const processCompletedResponse = (responseText, responseId) => {
  if (isProcessing) return;
  
  // Add cooldown check
  const now = Date.now();
  if (now - state.lastResponseProcessTime < state.responseProcessCooldown) {
    debugLog(`Response processing in cooldown (${(now - state.lastResponseProcessTime)}ms < ${state.responseProcessCooldown}ms)`);
    return;
  }
  
  isProcessing = true;
  state.lastResponseProcessTime = now;
  
  // Check if this response is part of the current conversation
  if (state.currentConversation.id && 
      state.currentConversation.responses[responseId]) {
    debugLog("This response was already processed in the current conversation");
    isProcessing = false;
    return;
  }
  
  // Mark this response as processed in this conversation
  if (state.currentConversation.id) {
    state.currentConversation.responses[responseId] = {
      timestamp: Date.now(),
      length: responseText.length
    };
    
    // Update session storage
    try {
      sessionStorage.setItem('aiWasteWatcher_currentConversation', 
                            JSON.stringify(state.currentConversation));
    } catch (e) {
      // Ignore storage errors
    }
  }
  
  // Rest of processing remains the same...
}
