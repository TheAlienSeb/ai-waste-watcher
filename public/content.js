// Content script for AI Waste Watcher - Monitors AI sites for prompts

// ======= Configuration Constants =======

const IMPACT_FACTORS = {
  waterPerToken: 0.5,    // Water usage in ml per token
  carbonPerToken: 0.2,   // Carbon in grams of CO2 per token
  energyPerToken: 0.3,   // Energy in joules per token
  costPerToken: 0.0001   // Cost in cents per token
};

// Model-specific configuration
const AI_MODELS = {
  'gpt-4o': { factor: 3.5, parameters: 100, verbosity: 1.2 },
  'gpt-4': { factor: 3.0, parameters: 80, verbosity: 1.2 },
  'gpt-3.5': { factor: 1.0, parameters: 20, verbosity: 1.0 },
  'claude': { factor: 2.0, parameters: 70, verbosity: 1.3 },
  'perplexity': { factor: 1.5, parameters: 40, verbosity: 1.0 },
  'gemini': { factor: 2.0, parameters: 60, verbosity: 1.0 },
  'default': { factor: 1.0, parameters: 50, verbosity: 1.0 }
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
  lastProcessedResponseCleanup: 0
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
      sendResponse({status: "Statistics reset"});
    }
  };
  
  if (handlers[message.action]) {
    handlers[message.action]();
  }
  
  return true; // Keep the message channel open for async responses
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
  
  // Calculate input tokens
  const inputTokens = estimateTokenCount(text);
  
  // Instead of estimating, we'll capture responses and calculate real tokens
  const modelConfig = AI_MODELS[model] || AI_MODELS.default;
  
  // Create an initial impact with just input tokens
  const initialImpact = calculatePartialImpact(0, inputTokens, model);
  
  // Update stats UI immediately with just the input contribution
  updateStatsWithPrompt(initialImpact);
  
  // Set up a response observer to capture and calculate the actual response
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

// Calculate impact based on input tokens only, without response estimation
function calculatePartialImpact(responseTokens, inputTokens, model) {
  const modelConfig = AI_MODELS[model] || AI_MODELS.default;
  
  // Calculate input processing energy
  const inputEnergyJoules = inputTokens <= 10000
    ? (2.5 * 3600) * (inputTokens / 10000)
    : (40 * 3600) * (inputTokens / 100000);
  
  return {
    waterUsage: 0, // Will be updated when response is captured
    carbonEmissions: 0, // Will be updated when response is captured
    energyConsumption: inputEnergyJoules,
    cost: 0, // Will be updated when response is captured
    inputTokenCount: inputTokens,
    responseTokenCount: 0, // Will be updated when response is captured
    model,
    site: state.currentSite
  };
}

// Capture the actual AI response and update calculations
function captureResponse(model, inputTokens, initialImpact) {
  let responseCheckInterval;
  let timeoutId;
  let isProcessing = false;
  
  // Function to check existing responses on the page
  const checkForCompletedResponses = () => {
    if (isProcessing) return;
    
    const responseElements = document.querySelectorAll(SELECTORS.responses.join(', '));
    if (!responseElements || responseElements.length === 0) return;
    
    // Focus on the most recent response element
    const latestResponse = responseElements[responseElements.length - 1];
    if (!latestResponse || !latestResponse.textContent) return;
    
    const responseText = latestResponse.textContent.trim();
    if (!responseText || responseText.length < 10) return;
    
    // Important: Create a unique response ID based on content
    const responseId = `${model}-${responseText.length}-${responseText.substring(0, 20)}`;
    
    // Check if we've already processed this exact response
    if (state.processedResponses && state.processedResponses[responseId]) {
      return; // Skip if already processed this exact response
    }
    
    // Detect if the response has stopped changing
    if (responseText === state.lastResponseText) {
      // We've seen this text before, but let's make sure it's stable
      if (!latestResponse.dataset.awStableChecks) {
        latestResponse.dataset.awStableChecks = '1';
      } else {
        const stableChecks = parseInt(latestResponse.dataset.awStableChecks) + 1;
        latestResponse.dataset.awStableChecks = stableChecks.toString();
        
        // After 3 consecutive checks with the same content, consider it complete
        if (stableChecks >= 3) {
          processCompletedResponse(responseText, responseId);
        }
      }
    } else {
      // Response is still changing, update our last seen text
      state.lastResponseText = responseText;
      latestResponse.dataset.awStableChecks = '0';
    }
  };

  // Process the completed response
  const processCompletedResponse = (responseText, responseId) => {
    if (isProcessing) return;
    isProcessing = true;
    
    // Initialize processed responses tracking if needed
    if (!state.processedResponses) {
      state.processedResponses = {};
    }
    
    // Mark this response as processed
    state.processedResponses[responseId] = true;
    
    // Clear the interval and timeout since we found a response
    clearInterval(responseCheckInterval);
    clearTimeout(timeoutId);
    
    debugLog(`Processing completed response (length: ${responseText.length})`);
    
    // Calculate actual tokens in the response
    const responseTokens = estimateTokenCount(responseText);
    debugLog(`Response captured with ${responseTokens} tokens`);
    
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
    
    // Update totals with the response contribution
    Object.keys(deltaImpact).forEach(key => {
      if (typeof deltaImpact[key] === 'number' && state.totalStats.hasOwnProperty(key)) {
        state.totalStats[key] += deltaImpact[key];
      }
    });
    
    // Update UI immediately
    updateLivePreview(state.totalStats);
    
    // Send the updated impact data
    safeSendMessage({
      action: "responseDetected",
      data: deltaImpact
    });
    
    // Broadcast updated stats to extension popup
    broadcastStatsToExtension(state.totalStats);
  };

  // Also set up a MutationObserver to catch new responses being added
  const responseObserver = new MutationObserver((mutations) => {
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
  
  // Start the polling interval to check for completed responses
  responseCheckInterval = setInterval(checkForCompletedResponses, 1000);
  
  // Start observing DOM changes to catch new responses
  responseObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  // Set a timeout to clean up if we don't get a response
  timeoutId = setTimeout(() => {
    debugLog("Response observation timed out");
    clearInterval(responseCheckInterval);
    responseObserver.disconnect();
    
    // Check if we already processed a response
    if (!isProcessing) {
      debugLog("No response detected within timeout period");
      
      // Try one final check for any response content
      checkForCompletedResponses();
      
      // If still no response, we'll use a conservative approach
      // but we won't estimate anything - just report what we observed
      if (!isProcessing) {
        debugLog("Using zero impact for response due to detection failure");
        
        // Update UI to show just the input impact
        updateLivePreview(state.totalStats);
      }
    }
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

function resetStats() {
  // Reset all stats in one go
  Object.keys(state.totalStats).forEach(key => {
    state.totalStats[key] = 0;
  });
  
  // Update the UI
  updateLivePreview(state.totalStats);
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
  
  // Based on research: 2 FLOP per active parameter per token
  const responseFlop = responseTokens * 2 * modelConfig.parameters * 1e9;
  
  // H100 GPU parameters
  const h100FlopPerSecond = 9.89e14;
  const utilizationFactor = 0.1;
  const powerUtilization = 0.7;
  const gpuPower = 1500; // Watts
  
  // Calculate H100 time needed in seconds
  const h100Time = (responseFlop / h100FlopPerSecond) / utilizationFactor;
  
  // Calculate energy in joules (watt-seconds)
  const energyJoules = h100Time * gpuPower * powerUtilization;
  
  // Additional energy for input processing with progressive scaling
  const inputEnergyJoules = inputTokens <= 10000
    ? (2.5 * 3600) * (inputTokens / 10000)
    : (40 * 3600) * (inputTokens / 100000);
  
  const totalEnergyJoules = energyJoules + inputEnergyJoules;
  
  // Calculate other impacts
  const waterUsage = responseTokens * IMPACT_FACTORS.waterPerToken * modelConfig.factor;
  const carbonEmissions = responseTokens * IMPACT_FACTORS.carbonPerToken * modelConfig.factor;
  const cost = responseTokens * IMPACT_FACTORS.costPerToken * modelConfig.factor;
  
  return {
    waterUsage,
    carbonEmissions,
    energyConsumption: totalEnergyJoules,
    cost,
    tokenCount: responseTokens,
    model,
    site: state.currentSite
  };
}

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

// Improved sync interval function with error recovery
function startStatsSyncInterval() {
  let syncIntervalId = null;
  
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
        clearInterval(syncIntervalId);
        syncIntervalId = null;
      }
    }
  };
  
  syncIntervalId = setInterval(syncStats, 5000); // Sync every 5 seconds
  return syncIntervalId;
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
  debugLog("Content script loaded, sending ping to background script");
  
  safeSendMessage({action: "ping"}, function(response) {
    if (response && response.status === "pong") {
      debugLog("Connection with background script confirmed!");
      startStatsSyncInterval(); // Start syncing stats
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
