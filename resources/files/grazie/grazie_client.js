/**
 * @fileoverview JavaScript port of the Python GrazieClient for BrowserOS integration
 * Provides unified access to AI providers through JetBrains' Grazie platform
 */

class GrazieClient {
  static CONFIG_URLS = {
    production: 'https://www.jetbrains.com/config/JetBrainsAIPlatform.json',
    staging: 'https://config.stgn.jetbrains.ai'
  };

  static FALLBACK_ENDPOINTS = {
    production: 'https://api.jetbrains.ai',
    staging: 'https://api.app.stgn.grazie.aws.intellij.net'
  };

  static CHAT_ENDPOINTS = {
    staging: '/user/v5/llm/chat/stream/v8',
    production: '/user/v5/llm/chat/stream/v8'
  };

  constructor(jwtToken = null, environment = 'staging') {
    this.jwtToken = jwtToken;
    this.environment = environment;
    this.baseUrl = null;
    this.profiles = {};
    this.modelCapabilities = {};
    this.chatAvailable = false;
    this.initialized = false;

    if (!this.jwtToken) {
      throw new Error('JWT token required');
    }
  }

  /**
   * Initialize the client - validates token and loads profiles
   */
  async init() {
    if (this.initialized) return;

    try {
      this.baseUrl = await this._discoverEndpoint();
      await this._validateToken();
      await this._loadProfiles();
      await this._testChatAvailability();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Grazie client:', error);
      throw error;
    }
  }

  /**
   * Discover the API endpoint from configuration
   */
  async _discoverEndpoint() {
    const configUrl = GrazieClient.CONFIG_URLS[this.environment];
    if (!configUrl) {
      return GrazieClient.FALLBACK_ENDPOINTS[this.environment] || 
             GrazieClient.FALLBACK_ENDPOINTS.staging;
    }

    try {
      const response = await fetch(configUrl, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache'
      });

      if (!response.ok) {
        throw new Error(`Config fetch failed: ${response.status}`);
      }

      const config = await response.json();

      if (config.urls && Array.isArray(config.urls)) {
        // Prefer deprecated endpoints (they work better according to Python code)
        const deprecatedUrl = config.urls.find(endpoint => 
          endpoint.url && (
            endpoint.url.includes('app.stgn.grazie.aws.intellij.net') ||
            endpoint.url.includes('app.prod.grazie.aws.intellij.net')
          )
        );

        if (deprecatedUrl) {
          return deprecatedUrl.url.replace(/\/$/, '');
        }

        // Fallback to first available non-deprecated
        const availableUrls = config.urls.filter(ep => !ep.deprecated);
        if (availableUrls.length > 0) {
          return availableUrls[0].url.replace(/\/$/, '');
        }

        // Last resort: any endpoint
        const sortedUrls = config.urls.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        if (sortedUrls.length > 0) {
          return sortedUrls[0].url.replace(/\/$/, '');
        }
      }
    } catch (error) {
      console.warn('Failed to discover endpoint:', error);
    }

    return GrazieClient.FALLBACK_ENDPOINTS[this.environment] || 
           GrazieClient.FALLBACK_ENDPOINTS.staging;
  }

  /**
   * Validate the JWT token
   */
  async _validateToken() {
    try {
      const response = await fetch(`${this.baseUrl}/user/v5/llm/profiles`, {
        method: 'GET',
        headers: this._getHeaders(),
        cache: 'no-cache'
      });

      if (response.status === 401) {
        throw new Error('Invalid or expired JWT token');
      }

      if (!response.ok) {
        throw new Error(`Token validation failed: ${response.statusText}`);
      }
    } catch (error) {
      if (error.message.includes('401') || error.message.includes('Invalid')) {
        throw new Error('Invalid or expired JWT token');
      }
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * Load available LLM profiles
   */
  async _loadProfiles() {
    try {
      const response = await fetch(`${this.baseUrl}/user/v5/llm/profiles`, {
        method: 'GET',
        headers: this._getHeaders(),
        cache: 'no-cache'
      });

      if (!response.ok) {
        throw new Error(`Failed to load profiles: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Handle both direct list and {"profiles": [...]} formats
      let profilesData;
      if (Array.isArray(data)) {
        profilesData = data;
      } else if (data && typeof data === 'object' && data.profiles) {
        profilesData = data.profiles;
      } else {
        throw new Error(`Unexpected profiles response format: ${typeof data}`);
      }

      // Clear existing profiles
      this.profiles = {};
      this.modelCapabilities = {};

      // Process each profile
      for (const profile of profilesData) {
        const profileId = profile.id;
        if (profileId) {
          this.profiles[profileId] = profile;
          this.modelCapabilities[profileId] = {
            features: profile.features || [],
            contextLimit: profile.contextLimit || 0,
            maxOutputTokens: profile.maxOutputTokens || 0,
            provider: profile.provider || '',
            deprecated: profile.deprecated || false
          };
        }
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
      throw error;
    }
  }

  /**
   * Test if chat functionality is available
   */
  async _testChatAvailability() {
    try {
      const chatEndpoint = GrazieClient.CHAT_ENDPOINTS[this.environment] || 
                          '/user/v5/llm/chat/stream';
      
      const testPayload = {
        profile: 'openai-gpt-4o',
        chat: {
          messages: [{ type: 'user_message', content: 'test' }]
        }
      };

      const response = await fetch(`${this.baseUrl}${chatEndpoint}`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      this.chatAvailable = response.ok;
      
      // Cancel the stream if it was successful
      if (response.body && response.body.cancel) {
        response.body.cancel();
      }
    } catch (error) {
      console.warn('Chat availability test failed:', error);
      this.chatAvailable = false;
    }
  }

  /**
   * Get HTTP headers for API requests
   */
  _getHeaders() {
    if (!this.jwtToken) {
      throw new Error('JWT token required');
    }

    return {
      'Content-Type': 'application/json',
      'Grazie-Agent': JSON.stringify({ name: 'browseros-client', version: '1.0' }),
      'Grazie-Authenticate-JWT': this.jwtToken
    };
  }

  /**
   * Get list of available models (non-deprecated)
   */
  getAvailableModels() {
    return Object.keys(this.modelCapabilities)
      .filter(modelId => !this.modelCapabilities[modelId].deprecated)
      .map(modelId => ({
        id: modelId,
        displayName: this._formatModelName(modelId),
        provider: this.modelCapabilities[modelId].provider,
        features: this.modelCapabilities[modelId].features,
        contextLimit: this.modelCapabilities[modelId].contextLimit,
        maxOutputTokens: this.modelCapabilities[modelId].maxOutputTokens,
        deprecated: this.modelCapabilities[modelId].deprecated
      }));
  }

  /**
   * Format model name for display
   */
  _formatModelName(modelId) {
    return modelId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Get capabilities for a specific model
   */
  getModelCapabilities(profile) {
    if (!this.modelCapabilities[profile]) {
      throw new Error(`Model '${profile}' not available`);
    }
    return this.modelCapabilities[profile];
  }

  /**
   * Check if a model supports chat
   */
  validateModelForChat(profile) {
    const capabilities = this.getModelCapabilities(profile);
    return capabilities.features.includes('Chat');
  }

  /**
   * Check if chat is available
   */
  isChatAvailable() {
    return this.chatAvailable;
  }

  /**
   * Stream chat completion
   */
  async *chatStream(messages, profile = 'openai-gpt-4o', parameters = null, prompt = null) {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.chatAvailable) {
      throw new Error('Chat functionality is not available in this environment');
    }

    if (!this.validateModelForChat(profile)) {
      throw new Error(`Model '${profile}' does not support chat`);
    }

    const chatEndpoint = GrazieClient.CHAT_ENDPOINTS[this.environment] || 
                        '/user/v5/llm/chat/stream/v8';
    const url = `${this.baseUrl}${chatEndpoint}`;

    const payload = {
      profile: profile,
      chat: { messages: messages }
    };

    // Add prompt if provided
    if (prompt) {
      payload.prompt = prompt;
    }

    // Add parameters if provided
    const paramsData = this._createParametersData(parameters);
    if (paramsData) {
      payload.parameters = paramsData;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this._getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
    }

    // Parse streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr.trim() === 'end') {
              return;
            }
            
            try {
              const chunk = JSON.parse(dataStr);
              yield chunk;
              
              // Check for finish condition
              if (chunk.type === 'FinishMetadata') {
                return;
              }
            } catch (e) {
              // Skip invalid JSON
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Complete chat (non-streaming)
   */
  async chatComplete(messages, profile = 'openai-gpt-4o', parameters = null, prompt = null) {
    const contentParts = [];
    
    for await (const chunk of this.chatStream(messages, profile, parameters, prompt)) {
      if (chunk.type === 'Content') {
        contentParts.push(chunk.content || '');
      }
    }
    
    return contentParts.join('');
  }

  /**
   * Simple chat helper
   */
  async simpleChat(userMessage, systemMessage = null, profile = 'openai-gpt-4o', parameters = null, prompt = null) {
    const messages = [];
    
    if (systemMessage) {
      messages.push({ type: 'system_message', content: systemMessage });
    }
    
    messages.push({ type: 'user_message', content: userMessage });
    
    return await this.chatComplete(messages, profile, parameters, prompt);
  }

  /**
   * Create parameters data for API
   */
  _createParametersData(parameters) {
    if (!parameters) return null;

    const data = [];
    const paramMapping = {
      temperature: ['llm.parameters.temperature', 'double'],
      top_p: ['llm.parameters.top-p', 'double'],
      top_k: ['llm.parameters.top-k', 'int'],
      length: ['llm.parameters.length', 'int'],
      max_tokens: ['llm.parameters.length', 'int'], // Alias for length
      stop_token: ['llm.parameters.stop-token', 'text'],
      seed: ['llm.parameters.seed', 'int'],
      dimension: ['llm.parameters.dimension', 'int']
    };

    for (const [key, value] of Object.entries(parameters)) {
      const mapping = paramMapping[key];
      if (mapping) {
        const [fqdn, type] = mapping;
        data.push({
          fqdn: fqdn,
          type: type,
          value: value
        });
      }
    }

    return data.length > 0 ? { data } : null;
  }

  /**
   * Create deterministic parameters
   */
  createDeterministicParams(seed = 42) {
    return {
      temperature: 0.1,
      top_p: 0.1,
      seed: seed
    };
  }

  /**
   * Create creative parameters
   */
  createCreativeParams(creativityLevel = 'medium') {
    const levels = {
      low: { temperature: 0.7, top_p: 0.8 },
      medium: { temperature: 1.0, top_p: 0.9 },
      high: { temperature: 1.3, top_p: 0.95 },
      very_high: { temperature: 1.5, top_p: 0.98 }
    };

    return levels[creativityLevel] || levels.medium;
  }

  /**
   * Create focused parameters
   */
  createFocusedParams(focusLevel = 'medium') {
    const levels = {
      low: { temperature: 0.8, top_p: 0.9 },
      medium: { temperature: 0.5, top_p: 0.7 },
      high: { temperature: 0.3, top_p: 0.5 },
      very_high: { temperature: 0.1, top_p: 0.3 }
    };

    return levels[focusLevel] || levels.medium;
  }

  /**
   * Create JSON response parameters
   */
  createJsonResponseParams() {
    return {
      temperature: 0.1,
      top_p: 0.1
    };
  }

  /**
   * Extract response metadata from stream chunks
   */
  extractResponseMetadata(streamChunks) {
    const metadata = {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      finishReason: null,
      model: null,
      provider: null
    };

    for (const chunk of streamChunks) {
      if (chunk.type === 'FinishMetadata') {
        const meta = chunk.metadata || {};
        metadata.totalTokens = meta.totalTokens || 0;
        metadata.inputTokens = meta.inputTokens || 0;
        metadata.outputTokens = meta.outputTokens || 0;
        metadata.finishReason = meta.finishReason || null;
        metadata.model = meta.model || null;
        metadata.provider = meta.provider || null;
        break;
      }
    }

    return metadata;
  }

  /**
   * Chat with metadata extraction
   */
  async chatStreamWithMetadata(messages, profile = 'openai-gpt-4o', parameters = null, prompt = null) {
    const chunks = [];
    const contentParts = [];

    for await (const chunk of this.chatStream(messages, profile, parameters, prompt)) {
      chunks.push(chunk);
      if (chunk.type === 'Content') {
        contentParts.push(chunk.content || '');
      }
    }

    const content = contentParts.join('');
    const metadata = this.extractResponseMetadata(chunks);

    return [content, metadata];
  }
}

// Export for use in different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GrazieClient;
}

if (typeof window !== 'undefined') {
  window.GrazieClient = GrazieClient;
} 